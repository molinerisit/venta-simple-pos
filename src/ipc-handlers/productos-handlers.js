// En: src/ipc-handlers/productos-handlers.js (CORREGIDO Y COMPLETO)
const { ipcMain, app, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const Papa = require("papaparse"); 

function registerProductosHandlers(models, sequelize) {
  const { Producto, ProductoDepartamento, ProductoFamilia } = models;

  // Lista de productos
  ipcMain.handle("get-productos", async () => {
    try {
      const productos = await Producto.findAll({
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
      });
      return productos.map((p) => p.toJSON());
    } catch (error) {
      console.error("Error en get-productos:", error);
      return [];
    }
  });

  // Obtener un producto por ID
  ipcMain.handle("get-producto-by-id", async (_event, productoId) => {
    console.log(`[HANDLER: get-producto-by-id] Buscando producto con ID: ${productoId} (Tipo: ${typeof productoId})`);
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
      console.log("[HANDLER: get-producto-by-id] Resultado de findByPk:", JSON.stringify(producto, null, 2));
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
      const payload = { ...productoData };
      payload.nombre = String(payload.nombre || "").trim();
      
      payload.codigo = String(payload.codigo || "").trim() || null;
      if (!payload.codigo) {
        throw new Error("El campo 'código' es obligatorio.");
      }
      
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
        await models.Producto.update(payload, { 
          where: { id: productoId }, 
          transaction: t 
        });
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
          return { success: false, message: "El 'Código' ya está en uso. Debe ser único." };
        }
      }
      console.error("Error al guardar producto:", error);
      return { success: false, message: error.message || "Ocurrió un error inesperado al guardar." };
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
        return { success: false, message: "No se puede eliminar: tiene ventas/compras asociadas." };
      }
      return { success: false, message: error.message };
    }
  });

  // Toggle Activo
  ipcMain.handle("toggle-producto-activo", async (_event, productoId) => {
    console.log(`[HANDLER: toggle-producto-activo] Toggle estado para ID: ${productoId} (Tipo: ${typeof productoId})`);
    try {
      const producto = await Producto.findByPk(productoId);
      if (producto) {
        console.log("[HANDLER: toggle-producto-activo] Producto encontrado. Actualizando estado.");
        producto.activo = !producto.activo;
        await producto.save();
        return { success: true }; 
      } else {
        console.log("[HANDLER: toggle-producto-activo] ERROR: Producto NO encontrado con ese ID.");
        return { success: false, message: "Producto no encontrado" };
      }
    } catch (error) {
      console.error("Error en toggle-producto-activo:", error);
      return { success: false, message: error.message };
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
      return { success: false, message: "Error al guardar el departamento." };
    }
  });

  // Familia
  ipcMain.handle("guardar-familia", async (_event, data) => {
    try {
      const nombre = String(data?.nombre || "").trim();
      const DepartamentoId = data?.DepartamentoId;
      if (!nombre || !DepartamentoId) {
        return { success: false, message: "Faltan datos obligatorios." };
      }
      const [nuevaFamilia, created] = await ProductoFamilia.findOrCreate({
        where: { nombre, DepartamentoId },
        defaults: { nombre, DepartamentoId },
      });
      if (!created) {
        return { success: false, message: "La familia ya existe en este departamento." };
      }
      return { success: true, data: nuevaFamilia.toJSON() };
    } catch (error)
    {
      console.error("Error en guardar-familia:", error);
      return { success: false, message: "Error al guardar la familia." };
    }
  });

  // ==========================================================
  // INICIO: FUNCIONES DE CSV
  // ==========================================================

  ipcMain.handle("show-open-dialog", async (event, options) => {
    return await dialog.showOpenDialog(options);
  });

  ipcMain.handle("export-productos-csv", async () => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Guardar Plantilla de Productos",
        defaultPath: "plantilla_productos.csv",
        filters: [{ name: "Archivos CSV", extensions: ["csv"] }]
      });

      if (canceled || !filePath) {
        return { success: false, message: "Exportación cancelada." };
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
      
      fs.writeFileSync(filePath, csv, 'utf-8');
      
      return { success: true, message: `Plantilla exportada en ${filePath}` };

    } catch (error) {
      console.error("Error al exportar CSV:", error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("import-productos-csv", async (_event, filePath) => {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      
      const parseResult = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false, 
      });
      
      const productosCSV = parseResult.data;
      if (!productosCSV || productosCSV.length === 0) {
        return { success: false, message: "El archivo CSV está vacío o tiene un formato incorrecto." };
      }

      const productosParaGuardar = [];
      const deptoCache = new Map();
      const familiaCache = new Map();

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
section: "Clasificación (Opcional)",
                 defaults: { nombre: nombreDepto },
                 transaction: null 
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
                transaction: null
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
          activo: true
        });
      }

      await sequelize.transaction(async (t) => {
        await Producto.bulkCreate(productosParaGuardar, {
          updateOnDuplicate: [
            'nombre', 'precioCompra', 'precioVenta', 'stock', 'unidad', 
            'pesable', 'plu', 'codigo_barras', 'DepartamentoId', 'FamiliaId', 'activo'
          ],
          conflictAttributes: ['codigo'], 
          transaction: t
        });
      });

      return { success: true, message: `Se procesaron ${productosParaGuardar.length} productos.` };

    } catch (error) {
      console.error("Error al importar CSV:", error);
      if (error.name === 'SequelizeUniqueConstraintError') {
        return { success: false, message: `Error de duplicado: ${error.errors[0].message}` };
      }
      return { success: false, message: error.message };
    }
  });
  // ==========================================================
  // FIN: NUEVAS FUNCIONES DE CSV
  // ==========================================================
}

module.exports = { registerProductosHandlers };