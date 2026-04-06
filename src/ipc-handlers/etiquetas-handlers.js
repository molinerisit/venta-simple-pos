// src/ipc-handlers/etiquetas.js
const { ipcMain, BrowserWindow } = require("electron");
const { Op } = require("sequelize");

function registerEtiquetasHandlers(models) {
  // Extraemos los modelos de forma segura
  const Producto = models.Producto;
  // Intentamos detectar los otros modelos, si no existen no pasa nada
  const Familia = models.ProductoFamilia || models.Familia || models.Rubro;
  const Departamento = models.ProductoDepartamento || models.Departamento || models.Categoria;

  // ==================================================================
  // 1. OBTENER DATOS (MODO "A PRUEBA DE BALAS")
  // ==================================================================
// ==================================================================
  // 1. OBTENER DATOS (CORREGIDO para FILTROS)
  // ==================================================================
  ipcMain.handle("get-data-for-seleccion", async () => {
    try {
      // 1. Traer TODOS los productos
      const productosRaw = await Producto.findAll({
        order: [["nombre", "ASC"]],
        include: [
          Familia ? { model: Familia, as: 'familia', required: false, 
            include: [Departamento ? { model: Departamento, as: 'departamento', required: false } : null].filter(Boolean) 
          } : null,
        ].filter(Boolean),
      });

      // 2. Traer departamentos y familias por separado
      let departamentos = [];
      let familias = []; 

      if (Departamento) {
        try {
          departamentos = await Departamento.findAll({ order: [["nombre", "ASC"]] });
        } catch (e) {
          console.warn("No se pudieron cargar departamentos (no crítico).");
        }
      }
      
      if (Familia) { 
        try {
          // CLAVE DE FILTROS: Aseguramos que se trae el DepartamentoId
          familias = await Familia.findAll({ 
            attributes: ['id', 'nombre', 'DepartamentoId'],// ¡Esta línea asegura el campo de enlace!
            order: [["nombre", "ASC"]] 
          });
        } catch (e) {
          console.warn("No se pudieron cargar familias (no crítico).");
        }
      }

      // 3. Mapeo manual
      const productos = productosRaw.map(p => {
        const item = p.toJSON();
        item.precioVenta = Number(item.precioVenta || item.precio_venta || item.precio || 0);
        if (!item.familia) {
          item.familia = {
            id: 0,
            nombre: "General",
            departamento: { id: 0, nombre: "General" }
          };
        }
        return item;
      });

      return {
        productos: productos,
        departamentos: departamentos.map(d => d.toJSON()),
        familias: familias.map(f => f.toJSON()), // Exportamos la lista de familias
      };

    } catch (error) {
      console.error("Error crítico en get-data-for-seleccion:", error);
      return { productos: [], departamentos: [], familias: [] };
    }
  });


  // ==================================================================
  // 2. GENERAR IMPRESIÓN (DISEÑO SUPERMERCADO PRO)
  // ==================================================================
  ipcMain.handle("generar-vista-impresion", async (_event, payload) => {
    try {
      const { productoIds, config } = payload || {};
      
      if (!Array.isArray(productoIds) || productoIds.length === 0) {
        return { success: false, message: "No se seleccionaron productos." };
      }

      // --- Lógica de búsqueda segura por ID ---
      const pk = Producto.primaryKeyAttribute || "id";
      // Limpiamos IDs duplicados
      const idsUnicos = [...new Set(productoIds)];
      
      // Buscamos los productos
      // Usamos los IDs tal cual vienen (string o number), Sequelize suele manejar la conversión
      const productos = await Producto.findAll({
        where: { [pk]: { [Op.in]: idsUnicos } },
      });

      if (!productos.length) {
        return { success: false, message: "No se encontraron productos en la base de datos." };
      }

      // --- Helpers ---
      const getPrecio = (p) => Number(p.precioVenta || p.precio_venta || p.precio || 0);
      const getCodigo = (p) => p.codigo_barras || p.codigoBarras || p.codigo || p.id || "";
      const fechaHoy = new Date().toLocaleDateString("es-AR", { day: '2-digit', month: '2-digit', year: '2-digit' });

      let contentHtml = "";

      // --- DISEÑO ETIQUETAS RETAIL ---
      if (config?.modo === "etiquetas") {
        
        const items = productos.map((p) => {
          const precio = getPrecio(p);
          // Formatear: 1.500,50
          const precioStr = precio.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const [entero, decimal] = precioStr.split(","); 

          const logoHtml = (config.logoSize > 0 && config.logoBase64)
              ? `<img src="${config.logoBase64}" class="img-logo">`
              : "";

          return `
            <div class="label-wrapper" style="width: ${config.ancho}cm; height: ${config.alto}cm;">
              <div class="label-content" style="background-color: ${config.colorFondo}; border: 1px dashed #ccc;">
                
                <div class="product-header">
                  <span class="product-name">${p.nombre || "PRODUCTO"}</span>
                </div>

                <div class="price-body">
                   <div class="currency-symbol">$</div>
                   <div class="price-integer">${entero}</div>
                   <div class="price-decimal">,${decimal}</div>
                </div>

                <div class="label-footer">
                    <div class="footer-left">
                        <span class="label-code">COD: ${getCodigo(p)}</span>
                        <span class="label-date">${fechaHoy}</span>
                    </div>
                    ${logoHtml ? `<div class="footer-right">${logoHtml}</div>` : ''}
                </div>

              </div>
            </div>`;
        });
        contentHtml = `<div class="label-grid">${items.join("")}</div>`;

      } 
      // --- DISEÑO LISTA ---
      else if (config?.modo === "lista") {
        const ths = `<th>Producto</th><th>Precio</th>` + 
                    (config.columnas?.includes('codigo_barras') ? `<th>Código</th>` : '') +
                    (config.columnas?.includes('stock') ? `<th>Stock</th>` : '');

        const trs = productos.map(p => {
             const precio = getPrecio(p).toLocaleString("es-AR", { style:"currency", currency:"ARS" });
             let extras = "";
             if(config.columnas?.includes('codigo_barras')) extras += `<td>${getCodigo(p)}</td>`;
             if(config.columnas?.includes('stock')) extras += `<td>${p.stock || 0}</td>`;
             return `<tr><td>${p.nombre}</td><td class="precio-lista">${precio}</td>${extras}</tr>`;
        }).join("");

        contentHtml = `
          <div class="list-container">
            <h1>${config.listaTitulo || "Lista de Precios"}</h1>
            <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
          </div>`;
      }

      // --- CSS ESTILO RETAIL ---
      const printCss = `
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Roboto+Condensed:wght@700&display=swap');
        
        body { margin: 0; background-color: #fff; -webkit-print-color-adjust: exact; font-family: 'Roboto Condensed', sans-serif; }
        .no-print { position: fixed; top: 10px; left: 10px; background: #222; color: #fff; padding: 8px 15px; border-radius: 4px; cursor: pointer; z-index: 9999; font-weight: bold; font-family: sans-serif; }
        @media print { .no-print { display: none; } }

        .label-grid { display: flex; flex-wrap: wrap; padding: 0.2cm; gap: 0; }
        .label-wrapper { box-sizing: border-box; padding: 1px; page-break-inside: avoid; }
        
        .label-content {
            width: 100%; height: 100%; display: flex; flex-direction: column;
            overflow: hidden; position: relative; box-sizing: border-box;
            border-radius: 4px;
        }

        /* HEADER */
        .product-header {
            flex: 0 0 28%; display: flex; align-items: center; justify-content: center;
            padding: 0 4px; text-align: center; border-bottom: 1px solid rgba(0,0,0,0.1);
        }
        .product-name {
            font-family: 'Roboto Condensed', sans-serif; font-weight: 700; font-size: 12pt;
            line-height: 1.1; text-transform: uppercase; color: #000;
            max-height: 100%; overflow: hidden;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }

        /* BODY (PRECIO) */
        .price-body {
            flex: 1; display: flex; align-items: baseline; justify-content: center;
            line-height: 1; font-family: 'Oswald', sans-serif; color: #000; padding-top: 2px;
        }
        .currency-symbol { font-size: 16pt; font-weight: 500; margin-right: 2px; align-self: center; margin-bottom: 15px; }
        .price-integer { font-size: 48pt; font-weight: 700; letter-spacing: -2px; }
        .price-decimal { font-size: 20pt; font-weight: 600; align-self: flex-start; margin-top: 8px; text-decoration: underline; }

        /* FOOTER */
        .label-footer {
            flex: 0 0 18%; display: flex; justify-content: space-between; align-items: center;
            padding: 0 6px; background-color: rgba(0,0,0,0.05); border-top: 1px solid rgba(0,0,0,0.1);
        }
        .footer-left { display: flex; flex-direction: column; justify-content: center; }
        .label-code { font-family: 'Courier New', monospace; font-weight: bold; font-size: 8pt; letter-spacing: -0.5px; }
        .label-date { font-size: 6pt; color: #555; line-height: 1; margin-top: 1px;}
        .footer-right { height: 90%; display: flex; align-items: center; }
        .img-logo { height: 100%; width: auto; max-width: 50px; filter: grayscale(100%); object-fit: contain; }

        /* LISTA */
        .list-container { padding: 20px; font-family: sans-serif; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; }
        th { background-color: #eee; text-align: left; }
        .precio-lista { text-align: right; font-weight: bold; font-family: monospace; }
      `;

      const finalHtml = `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><title>Impresión</title><style>${printCss}</style></head>
          <body>
            <div class="no-print"><button onclick="window.print()">🖨️ IMPRIMIR (Ctrl+P)</button></div>
            ${contentHtml}
          </body>
        </html>
      `;

      const win = new BrowserWindow({ width: 1000, height: 800, show: true, autoHideMenuBar: true });
      win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(finalHtml));
      return { success: true };

    } catch (error) {
      console.error("Error generando vista:", error);
      return { success: false, message: error.message };
    }
  });
}

module.exports = { registerEtiquetasHandlers };