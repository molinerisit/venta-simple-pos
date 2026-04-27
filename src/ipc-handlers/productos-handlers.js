// En: src/ipc-handlers/productos-handlers.js (CORREGIDO Y COMPLETO)
const { ipcMain, app, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const Papa = require("papaparse"); 

function registerProductosHandlers(models, sequelize) {
  const { Producto, ProductoDepartamento, ProductoFamilia } = models;

  // SKU automatico
  ipcMain.handle('get-next-sku', async () => {
    try {
      const total = await Producto.count({ paranoid: false });
      return 'SKU-' + String(total + 1).padStart(4, '0');
    } catch (e) {
      console.error('Error en get-next-sku:', e);
      return 'SKU-' + Date.now();
    }
  });

  // Lista de productos
  ipcMain.handle("get-productos", async (_event, opts) => {
    // M-1: supports optional limit/offset pagination + filtroActivo
    const { limit, offset, filtroActivo } = opts || {};
    const where = {};
    if (filtroActivo === 'activo')   where.activo = true;
    if (filtroActivo === 'inactivo') where.activo = false;
    try {
      const productos = await Producto.findAll({
        where,
        include: [
          {
            model: ProductoFamilia,
            as: "familia",
            required: false,
            include: [
              {
                model: ProductoDepartamento,
                as: "departamento",
                required: false,
              },
            ],
          },
          {
            model: ProductoDepartamento,
            as: "departamento",
            required: false,
          }
        ],
        order: [
          [{ model: ProductoFamilia, as: "familia" }, "nombre", "ASC"],
          ["nombre", "ASC"],
        ],
        ...(limit != null && { limit: Number(limit) }),
        ...(offset != null && { offset: Number(offset) }),
      });
      return productos.map((p) => p.toJSON());
    } catch (error) {
      console.error("Error en get-productos:", error);
      return [];
    }
  });

    // Productos de acceso rápido (para la barra de la caja)
  ipcMain.handle('get-quick-access-products', async () => {
    try {
      const productos = await Producto.findAll({
        where: { acceso_rapido: true, activo: true },
        attributes: ['id', 'nombre', 'precioVenta', 'stock', 'unidad', 'codigo_barras', 'codigo'],
        order: [['nombre', 'ASC']],
        raw: true,
      });
      return productos;
    } catch (error) {
      console.error('Error en get-quick-access-products:', error);
      return [];
    }
  });

// Obtener un producto por ID
  ipcMain.handle("get-producto-by-id", async (_event, productoId) => {
    try {
      const producto = await Producto.findByPk(productoId, {
        include: [
          {
            model: ProductoFamilia,
            as: "familia",
            required: false,
            include: [
              {
                model: ProductoDepartamento,
                as: "departamento",
                required: false,
              },
            ],
          },
          {
            model: ProductoDepartamento,
            as: "departamento",
            required: false,
          }
        ],
      });
      return producto ? producto.toJSON() : null;
    } catch (error) {
      console.error("Error en get-producto-by-id:", error);
      return null;
    }
  });

  // Catálogo (departamentos + familias)
  ipcMain.handle("get-clasificaciones", async () => {
    try {
      const [departamentos, familias] = await Promise.all([
        ProductoDepartamento.findAll({ order: [["nombre", "ASC"]], raw: true }),
        ProductoFamilia.findAll({ order: [["nombre", "ASC"]], raw: true }),
      ]);
      return { departamentos, familias };
    } catch (error) {
      console.error("Error en get-clasificaciones:", error);
      return { departamentos: [], familias: [] };
    }
  });

  // Crear/editar producto (con imagen opcional en base64)
  // ESTA ES LA FUNCIÓN REAL DE GUARDADO (LA QUE ARREGLAMOS)
  ipcMain.handle("guardar-producto", async (_event, productoData) => {
    const t = await sequelize.transaction();
    try {
      // M-7: explicit allowlist — renderer cannot inject arbitrary fields.
      const ALLOWED_FIELDS = [
        'id', 'nombre', 'codigo', 'codigo_barras', 'plu',
        'stock', 'precioCompra', 'precioVenta', 'precio_oferta',
        'unidad', 'pesable', 'activo', 'acceso_rapido',
        'imagen_base64', 'imagen_url', 'fecha_fin_oferta', 'fecha_vencimiento',
        'DepartamentoId', 'FamiliaId', 'maneja_lotes',
      ];
      const payload = Object.fromEntries(
        Object.entries(productoData || {}).filter(([k]) => ALLOWED_FIELDS.includes(k))
      );
      payload.nombre = String(payload.nombre || "").trim();
      // L-8: Reject empty nombre early — gives a clearer error than ORM notEmpty.
      if (!payload.nombre) {
        throw new Error("El nombre del producto es obligatorio.");
      }
      
      payload.codigo = String(payload.codigo || "").trim() || null;
      
      payload.codigo_barras = String(payload.codigo_barras || "").trim() || null;
      payload.plu = String(payload.plu || "").trim() || null;

      ["stock", "precioCompra", "precioVenta", "precio_oferta"].forEach((k) => {
        if (payload[k] != null && payload[k] !== "") {
          payload[k] = parseFloat(String(payload[k]).replace(",", ".")) || 0;
          if (!Number.isFinite(payload[k]) || payload[k] < 0) payload[k] = 0;
        } else {
          payload[k] = (k === 'precio_oferta' && payload[k] === null) ? null : 0;
        }
      });
      
      if (!payload.fecha_fin_oferta) payload.fecha_fin_oferta = null;
      if (!payload.fecha_vencimiento) payload.fecha_vencimiento = null;
      // Auto-set activo based on price: products with no price are inactive
      payload.activo = (payload.precioVenta > 0);


      // L-2: precio_oferta must be strictly less than precioVenta when both are positive.
      if (payload.precio_oferta != null && payload.precio_oferta > 0 && payload.precioVenta > 0 && payload.precio_oferta >= payload.precioVenta) {
        throw new Error("El precio de oferta debe ser menor que el precio de venta regular.");
      }

      if (payload.imagen_base64) {
        const b64 = String(payload.imagen_base64).replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(b64, "base64");
        const filename = `producto_${Date.now()}.png`;
        const imageDir = path.join(app.getPath("userData"), "images", "productos");
        
        await fsPromises.mkdir(imageDir, { recursive: true });
        const imagePath = path.join(imageDir, filename);
        await fsPromises.writeFile(imagePath, imageBuffer);
        
        payload.imagen_url = path.join("images", "productos", filename);
      }
      delete payload.imagen_base64;

      // ==========================================================
      // 🟢 INICIO DE LA CORRECCIÓN
      // Esta lógica diferencia explícitamente entre ACTUALIZAR (update) y CREAR (create).
      // ==========================================================
      const productoId = payload.id;
      
      // Si el ID existe (no es null ni undefined), es un UPDATE
      if (productoId) {
        // Quitamos el ID del payload para evitar que se intente actualizar
        delete payload.id; 
        // H-8: Capture affected row count. If 0, the productoId does not exist.
        const [affectedRows] = await models.Producto.update(payload, {
          where: { id: productoId },
          transaction: t,
        });
        if (affectedRows === 0) {
          throw new Error(`Producto con id ${productoId} no encontrado.`);
        }
      } 
      // Si el ID NO existe, es un CREATE
      else {
        await models.Producto.create(payload, { transaction: t });
      }
      // ==========================================================
      // 🟢 FIN DE LA CORRECCIÓN
      // ==========================================================

      await t.commit();
      return { success: true };
    } catch (error) {
      await t.rollback();
      if (error.name === "SequelizeUniqueConstraintError") {
        const campo = Object.keys(error.fields || {})[0];
        if (campo === "codigo") {
          return { success: false, message: "El 'Código' ya está en uso. Debe ser único." , error: true };
        }
      }
      console.error("Error al guardar producto:", error);
      return { success: false, message: error.message || "Ocurrió un error inesperado al guardar." , error: true };
    }
  });

  // Eliminar (manejo de FK)
  ipcMain.handle("eliminar-producto", async (_event, productoId) => {
    try {
      const res = await Producto.destroy({ where: { id: productoId } });
      return res > 0
        ? { success: true }
        : { success: false, message: "Producto no encontrado." };
    } catch (error) {
      if (error.name === "SequelizeForeignKeyConstraintError") {
        return { success: false, message: "No se puede eliminar: tiene ventas/compras asociadas." , error: true };
      }
      return { success: false, message: error.message , error: true };
    }
  });

  // Toggle Activo
  ipcMain.handle("toggle-producto-activo", async (_event, productoId) => {
    try {
      // L-4: Single-query toggle — eliminates the SELECT+UPDATE round-trip.
      const [affectedRows] = await Producto.update(
        { activo: sequelize.literal("CASE WHEN activo = 1 THEN 0 ELSE 1 END") },
        { where: { id: productoId } }
      );
      if (affectedRows === 0) {
        return { success: false, message: "Producto no encontrado." };
      }
      return { success: true };
    } catch (error) {
      console.error("Error en toggle-producto-activo:", error);
      return { success: false, message: error.message , error: true };
    }
  });

  // Departamento
  ipcMain.handle("guardar-departamento", async (_event, data) => {
    try {
      const nombre = String(data?.nombre || "").trim();
      if (!nombre) return { success: false, message: "El nombre es obligatorio." };

      const [nuevoDepto, created] = await ProductoDepartamento.findOrCreate({
        where: { nombre },
        defaults: { nombre },
      });
      if (!created) return { success: false, message: "El departamento ya existe." };
      return { success: true, data: nuevoDepto.toJSON() };
    } catch (error) {
      console.error("Error en guardar-departamento:", error);
      return { success: false, message: "Error al guardar el departamento." , error: true };
    }
  });

  // Familia
  ipcMain.handle("guardar-familia", async (_event, data) => {
    try {
      const nombre = String(data?.nombre || "").trim();
      const DepartamentoId = data?.DepartamentoId;
      if (!nombre || !DepartamentoId) {
        return { success: false, message: "Faltan datos obligatorios." , error: true };
      }
      // M-12: Validate DepartamentoId exists before creating the family.
      // Without this check, findOrCreate would silently create a family with a
      // dangling foreign key (SQLite FK enforcement is on, but the error message
      // would be cryptic). Fail-fast with a clear business error instead.
      const deptoExiste = await ProductoDepartamento.findByPk(DepartamentoId);
      if (!deptoExiste) {
        return { success: false, message: "El departamento no existe." , error: true };
      }
      const [nuevaFamilia, created] = await ProductoFamilia.findOrCreate({
        where: { nombre, DepartamentoId },
        defaults: { nombre, DepartamentoId },
      });
      if (!created) {
        return { success: false, message: "La familia ya existe en este departamento." , error: true };
      }
      return { success: true, data: nuevaFamilia.toJSON() };
    } catch (error)
    {
      console.error("Error en guardar-familia:", error);
      return { success: false, message: "Error al guardar la familia." , error: true };
    }
  });

  // ==========================================================
  // INICIO: FUNCIONES DE CSV
  // ==========================================================

    // H-5b: "show-open-dialog" removed — renderer-controlled generic dialog is an
  // attack surface. Each handler that needs a dialog opens it internally.

  ipcMain.handle("export-productos-csv", async () => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Guardar Plantilla de Productos",
        defaultPath: "plantilla_productos.csv",
        filters: [{ name: "Archivos CSV", extensions: ["csv"] }]
      });

      if (canceled || !filePath) {
        return { success: false, message: "Exportación cancelada." , error: true };
      }

      const productos = await Producto.findAll({
        include: [
          { model: ProductoDepartamento, as: 'departamento', attributes: ['nombre'] },
          { model: ProductoFamilia, as: 'familia', attributes: ['nombre'] }
        ],
        raw: true,
        nest: true,
      });

      const dataParaCSV = productos.map(p => ({
        codigo: p.codigo,
        nombre: p.nombre,
        precioCompra: p.precioCompra,
        precioVenta: p.precioVenta,
        stock: p.stock,
        unidad: p.unidad,
        pesable: p.pesable ? 'SI' : 'NO',
        departamento: p.departamento?.nombre || '',
        familia: p.familia?.nombre || '',
        plu: p.plu || '',
        codigo_barras: p.codigo_barras || '',
      }));

      const csv = Papa.unparse(dataParaCSV, {
        header: true,
        delimiter: ",",
        columns: [
          "codigo", "nombre", "precioCompra", "precioVenta", "stock", 
          "unidad", "pesable", "departamento", "familia", "plu", "codigo_barras"
        ]
      });
      
      await fsPromises.writeFile(filePath, csv, 'utf-8');
      
      return { success: true, message: `Plantilla exportada en ${filePath}` };

    } catch (error) {
      console.error("Error al exportar CSV:", error);
      return { success: false, message: error.message , error: true };
    }
  });

  ipcMain.handle("import-productos-csv", async () => {
    // H-5b: file path never crosses IPC boundary. Main opens the dialog itself.
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Seleccionar archivo CSV para importar",
        properties: ["openFile"],
        filters: [{ name: "Archivos CSV", extensions: ["csv"] }],
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, message: "Importación cancelada." , error: true };
      }

      const fileContent = await fsPromises.readFile(filePaths[0], 'utf-8');
      
      const parseResult = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false, 
      });
      
      const productosCSV = parseResult.data;
      if (!productosCSV || productosCSV.length === 0) {
        return { success: false, message: "El archivo CSV está vacío o tiene un formato incorrecto." , error: true };
      }

      // M-11: Reject oversized imports to prevent memory exhaustion.
      if (productosCSV.length > 10000) {
        return { success: false, message: `El CSV tiene ${productosCSV.length} filas. El límite es 10.000 por lote.`, error: true };
      }
      // H-7: Fully atomic — all findOrCreate (depts/families) and bulkCreate
      // run inside ONE transaction. A failure at any step rolls back everything,
      // preventing orphaned department/family records.
      let procesados = 0;
      await sequelize.transaction(async (t) => {
        const deptoCache = new Map();
        const familiaCache = new Map();
        const productosParaGuardar = [];

        for (const prod of productosCSV) {
          if (!prod.codigo || !prod.nombre) {
            console.warn("Omitiendo fila por falta de 'codigo' o 'nombre':", prod);
            continue;
          }

          let deptoId = null;
          let familiaId = null;

          if (prod.departamento) {
            const nombreDepto = prod.departamento.trim();
            if (nombreDepto) {
              if (!deptoCache.has(nombreDepto)) {
                const [depto] = await ProductoDepartamento.findOrCreate({
                  where: { nombre: nombreDepto },
                  defaults: { nombre: nombreDepto },
                  transaction: t,
                });
                deptoCache.set(nombreDepto, depto.id);
              }
              deptoId = deptoCache.get(nombreDepto);
            }
          }

          if (deptoId && prod.familia) {
            const nombreFamilia = prod.familia.trim();
            if (nombreFamilia) {
              const cacheKey = `${deptoId}-${nombreFamilia}`;
              if (!familiaCache.has(cacheKey)) {
                const [familia] = await ProductoFamilia.findOrCreate({
                  where: { nombre: nombreFamilia, DepartamentoId: deptoId },
                  defaults: { nombre: nombreFamilia, DepartamentoId: deptoId },
                  transaction: t,
                });
                familiaCache.set(cacheKey, familia.id);
              }
              familiaId = familiaCache.get(cacheKey);
            }
          }

          const parseFloatOrZero = (val) => {
            if (val === null || val === undefined || val === '') return 0;
            return parseFloat(String(val).replace(",", ".")) || 0;
          };

          productosParaGuardar.push({
            codigo: String(prod.codigo).trim(),
            nombre: prod.nombre.trim(),
            precioCompra: parseFloatOrZero(prod.precioCompra),
            precioVenta: parseFloatOrZero(prod.precioVenta),
            stock: parseFloatOrZero(prod.stock),
            unidad: prod.unidad || 'unidad',
            pesable: String(prod.pesable).toUpperCase() === 'SI',
            plu: prod.plu || null,
            codigo_barras: prod.codigo_barras || null,
            DepartamentoId: deptoId,
            FamiliaId: familiaId,
            activo: true,
          });
        }

        await Producto.bulkCreate(productosParaGuardar, {
          // H-6: 'stock' excluded — CSV import must not overwrite existing stock.
          updateOnDuplicate: [
            'nombre', 'precioCompra', 'precioVenta', 'unidad',
            'pesable', 'plu', 'codigo_barras', 'DepartamentoId', 'FamiliaId', 'activo',
          ],
          conflictAttributes: ['codigo'],
          transaction: t,
        });
        procesados = productosParaGuardar.length;
      });


      return { success: true, message: `Se procesaron ${procesados} productos.` };

    } catch (error) {
      console.error("Error al importar CSV:", error);
      if (error.name === 'SequelizeUniqueConstraintError') {
        return { success: false, message: `Error de duplicado: ${error.errors[0].message}` , error: true };
      }
      return { success: false, message: error.message , error: true };
    }
  });
  // ==========================================================
  // FIN: NUEVAS FUNCIONES DE CSV
  // ==========================================================
}

module.exports = { registerProductosHandlers };