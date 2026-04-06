// src/ipc-handlers/scale-handlers.js
const { ipcMain } = require("electron");
const { getScaleManager } = require("../scale/scale-manager");

// ===== Utilidades código de barras =====
function luhnMod10(numStr) {
  let sum = 0, dbl = false;
  for (let i = numStr.length - 1; i >= 0; i--) {
    let d = parseInt(numStr[i], 10);
    if (Number.isNaN(d)) d = 0;
    if (dbl) { d = d * 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  const mod = sum % 10;
  return (mod === 0 ? 0 : (10 - mod)).toString();
}

function buildBarcodeFromConfig(cfg, { plu, priceCent = 0, weightGr = 0 }) {
  const prefijo = String(cfg.prefijo || "20");
  const pluLen = parseInt(cfg.codigo_longitud || 5, 10);
  const valLen = parseInt(cfg.valor_longitud || 5, 10);

  const pluStr = String(plu).padStart(pluLen, "0");
  let valorStr;
  if (cfg.tipo_valor === "peso") {
    const scaled = Math.round(weightGr || 0); // gramos
    valorStr = String(scaled).padStart(valLen, "0");
  } else {
    const scaled = Math.round(priceCent || 0); // centavos
    valorStr = String(scaled).padStart(valLen, "0");
  }

  const base = `${prefijo}${pluStr}${valorStr}`;
  const check = luhnMod10(base);
  return `${base}${check}`;
}

function registerScaleHandlers(models) {
  const { Usuario, Producto } = models;

  // -----------------------------
  // UPSERT PLU
  // -----------------------------
  ipcMain.handle("scale-upsert-plu", async (_e, payload) => {
    try {
      const mgr = await getScaleManager(models);

      const plu = parseInt(payload?.plu, 10);
      const name = String(payload?.name || "").trim().slice(0, 24);
      const priceCent = parseInt(payload?.price, 10); // UI te lo pasa en centavos
      const tare = parseInt(payload?.tare, 10) || 0;
      const autoBarcode = !!payload?.autoBarcode;
      let barcode = (payload?.barcode || "").trim() || null;

      if (!plu || !name || !Number.isFinite(priceCent)) {
        return { success: false, message: "PLU, nombre y precio (centavos) son obligatorios." };
      }

      if (autoBarcode && !barcode) {
        // Tomamos formato global del admin
        const admin = await Usuario.findOne({ where: { rol: "administrador" }, raw: true });
        const cfg = admin?.config_balanza || {
          prefijo: "20",
          tipo_valor: "peso",
          valor_divisor: 1000,
          codigo_longitud: 5,
          valor_longitud: 5,
        };
        barcode = buildBarcodeFromConfig(cfg, {
          plu,
          priceCent: cfg.tipo_valor === "precio" ? priceCent : 0,
          weightGr:  cfg.tipo_valor === "peso"   ? 1000 : 0, // 1kg por defecto
        });
      }

      // Mandamos ambas variantes de campos para máxima compatibilidad con tu manager
      const res = await mgr.upsertPLU({
        plu,
        name,
        price: priceCent,         // por si tu manager espera 'price'
        price_cent: priceCent,    // por si espera 'price_cent'
        tare,
        tare_gr: tare,            // por si espera 'tare_gr'
        barcode: barcode || undefined,
      });

      return { success: true, message: res || "OK" };
    } catch (e) {
      console.error("[SCALE][UPSERT] Error:", e);
      return { success: false, message: e.message || "Error" };
    }
  });

  // -----------------------------
  // DELETE PLU
  // -----------------------------
  ipcMain.handle("scale-delete-plu", async (_e, { plu }) => {
    try {
      const mgr = await getScaleManager(models);
      const num = parseInt(plu, 10);
      if (!num) return { success: false, message: "PLU inválido." };
      const res = await mgr.deletePLU(num);
      return { success: !!res, message: res || "OK" };
    } catch (e) {
      console.error("[SCALE][DELETE] Error:", e);
      return { success: false, message: e.message || "Error" };
    }
  });

  // -----------------------------
  // SYNC ALL PESABLES
  // -----------------------------
  ipcMain.handle("scale-sync-all-plu", async () => {
    try {
      const mgr = await getScaleManager(models);

      // Leemos formato global para autogenerar barcodes si faltan
      const admin = await Usuario.findOne({ where: { rol: "administrador" }, raw: true });
      const cfg = admin?.config_balanza || {
        prefijo: "20",
        tipo_valor: "peso",
        valor_divisor: 1000,
        codigo_longitud: 5,
        valor_longitud: 5,
      };

      // Traemos muchos campos para ser elásticos
      const rows = await Producto.findAll({
        attributes: ["id", "plu", "nombre", "precio", "unidad", "pesable", "esPesable", "tara", "barcode", "codigoBarras"],
        raw: true,
      });

      // Heurística: pesable==true OR esPesable==true OR unidad === 'kg'
      const pesables = (rows || []).filter((p) => {
        const flag = p.pesable === true || p.esPesable === true;
        const byUnidad = String(p.unidad || "").toLowerCase() === "kg";
        return flag || byUnidad;
      });

      if (!pesables.length) {
        return { success: true, message: "No hay productos pesables que sincronizar." };
      }

      for (const p of pesables) {
        const plu = parseInt(p.plu || p.id, 10);
        if (!plu) continue;
        const name = String(p.nombre || "").trim().slice(0, 24);
        const priceCent = Math.round((+p.precio || 0) * 100);
        const tare = parseInt(p.tara, 10) || 0;

        // Soportamos ambas columnas: barcode / codigoBarras
        let bc = (p.barcode || p.codigoBarras || "").trim() || null;
        if (!bc) {
          bc = buildBarcodeFromConfig(cfg, {
            plu,
            priceCent: cfg.tipo_valor === "precio" ? priceCent : 0,
            weightGr:  cfg.tipo_valor === "peso"   ? 1000 : 0,
          });
        }

        await mgr.upsertPLU({
          plu,
          name,
          price: priceCent,
          price_cent: priceCent,
          tare,
          tare_gr: tare,
          barcode: bc,
        });
      }

      return { success: true, message: `Catálogo pesable sincronizado (${pesables.length}).` };
    } catch (e) {
      console.error("[SCALE][SYNC-ALL] Error:", e);
      return { success: false, message: e.message || "Error" };
    }
  });
}

module.exports = { registerScaleHandlers };
