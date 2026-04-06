// src/scale/scale-manager.js
// Gestor de conexión y comandos Report NX (R30) para balanzas Kretz.
// - Singleton por proceso (getScaleManager(models))
// - Carga/recarga de config desde Usuario.config_balanza_conexion
// - TCP (Wi-Fi/Ethernet) listo. BT queda como TODO (requiere lib RFCOMM).
// - Framing STX/ETX + checksum ASCII de 2 dígitos (R30)
// - testConnection() envía PING
// - Stubs para upsertPLU/deletePLU/syncAll (esperan layout de DATA del manual)

const net = require("net");

const STX = 0x02; // Start of Text
const ETX = 0x03; // End of Text

/**
 * Cálculo de checksum (R30 - Report NX):
 * Suma de todos los bytes del frame EXCEPTO los dos chars de checksum y ETX.
 * Se toma el byte menos significativo (mod 256) y se lo representa en 2 dígitos ASCII hex (00..FF).
 * Ej: suma = 0x167 -> 0x67 -> "67" (ASCII '6','7')
 */
function checksumAscii2(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum = (sum + buf[i]) & 0xff;
  const hex = sum.toString(16).toUpperCase().padStart(2, "0");
  return Buffer.from(hex, "ascii"); // 2 bytes ASCII
}

/**
 * Arma el frame: [STX] + BODY + [CSHi, CSLo] + [ETX]
 * BODY debe venir ya en ASCII.
 */
function frame(bodyAscii) {
  const body = Buffer.isBuffer(bodyAscii)
    ? bodyAscii
    : Buffer.from(String(bodyAscii), "ascii");
  const prefix = Buffer.from([STX]);
  const tmp = Buffer.concat([prefix, body]); // para calcular checksum incluyendo STX
  const cs = checksumAscii2(tmp);
  return Buffer.concat([prefix, body, cs, Buffer.from([ETX])]);
}

/**
 * Construye el "BODY" base Report NX: "C" + "01" + <CMDID de 4 dígitos> + <DATA (ASCII)>
 * - ID equipo "01" usado típicamente en TCP/IP.
 * - DATA puede ser vacío ("").
 */
function buildBody(cmd4, dataAscii = "") {
  const cmd = String(cmd4).padStart(4, "0");
  return `C01${cmd}${dataAscii || ""}`;
}

/**
 * Conexión TCP helper
 */
async function sendTcp({ ip, port, timeoutMs }, bodyAscii) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let resolved = false;

    const onError = (err) => {
      if (!resolved) {
        resolved = true;
        try {
          client.destroy();
        } catch {}
        reject(err);
      }
    };

    const onTimeout = () => {
      onError(new Error("Timeout de conexión/lectura con la balanza."));
    };

    client.setTimeout(timeoutMs || 4000, onTimeout);

    client.connect(port, ip, () => {
      const pkt = frame(bodyAscii);
      client.write(pkt);
      // Muchos comandos no devuelven payload “útil”; escuchamos un corto y cerramos.
      // Si el protocolo devuelve ACK/NACK, se podría parsear acá.
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            client.end();
            client.destroy();
          } catch {}
          resolve(true);
        }
      }, 300); // pequeña espera
    });

    client.on("error", onError);
    client.on("close", () => {
      // si llega acá primero, ya habremos resuelto en la espera
    });
  });
}

/**
 * Utilidad para generar códigos de barras con el formato actual de tu UI.
 * (Usada por admin.js y tus handlers; la traemos acá para centralizar.)
 */
function luhnMod10(numStr) {
  let sum = 0,
    dbl = false;
  for (let i = numStr.length - 1; i >= 0; i--) {
    let d = parseInt(numStr[i], 10);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  const mod = sum % 10;
  return (mod === 0 ? 0 : 10 - mod).toString();
}

function buildBarcodeFromConfig(cfg, { plu, priceCent = 0, weightGr = 0 }) {
  const prefijo = String(cfg.prefijo || "20");
  const codigoLong = parseInt(cfg.codigo_longitud || 5);
  const valorLong = parseInt(cfg.valor_longitud || 5);
  const pluStr = String(plu).padStart(codigoLong, "0");
  let valorStr;
  if (cfg.tipo_valor === "peso") {
    const scaled = Math.round(weightGr || 0); // gramos
    valorStr = String(scaled).padStart(valorLong, "0");
  } else {
    const scaled = Math.round(priceCent || 0); // centavos
    valorStr = String(scaled).padStart(valorLong, "0");
  }
  const base = `${prefijo}${pluStr}${valorStr}`;
  const check = luhnMod10(base);
  return `${base}${check}`;
}

/**
 * ScaleManager
 */
class ScaleManager {
  constructor(models) {
    this.models = models;
    this.cfg = null; // { transport, ip, port, btAddress, protocol, timeoutMs }
  }

  async reloadConfig() {
    const { Usuario } = this.models;
    const admin = await Usuario.findOne({
      where: { rol: "administrador" },
      raw: true,
    });
    this.cfg = admin?.config_balanza_conexion || {
      transport: "tcp",
      ip: "",
      port: 8000,
      protocol: "kretz-report",
      timeoutMs: 4000,
    };
  }

  async ensureConfig() {
    if (!this.cfg) await this.reloadConfig();
    if (!this.cfg) throw new Error("Sin configuración de balanza.");
  }

  /**
   * Envía un body (“C01<cmd><data>”) según transporte.
   */
  async send(bodyAscii) {
    await this.ensureConfig();
    const t = (this.cfg.transport || "tcp").toLowerCase();
    if (t === "tcp") {
      const ip = this.cfg.ip;
      const port = parseInt(this.cfg.port || 8000);
      if (!ip || !port) throw new Error("Config TCP incompleta (IP/puerto).");
      return sendTcp(
        { ip, port, timeoutMs: this.cfg.timeoutMs || 4000 },
        bodyAscii
      );
    }
    if (t === "bt") {
      // TODO: implementar RFCOMM (Bluetooth SPP) con lib dedicada (p.ej. bluetooth-serial-port).
      throw new Error(
        "Transporte Bluetooth aún no implementado en el manager."
      );
    }
    throw new Error(`Transporte no soportado: ${t}`);
  }

  /**
   * PING / Test de conexión.
   * CMD hipotético de diagnóstico: 0001 (confirmar en tabla del manual).
   */
  async testConnection() {
    const body = buildBody("0001", ""); // sin DATA
    await this.send(body);
    return "Conexión OK (PING enviado).";
  }

  /**
   * Alta/edición PLU (stub).
   * payload: { plu, name, price, tare, barcode, autoBarcode }
   * - price en centavos
   * - name máx 24 chars (tu UI ya limita)
   *
   * ⚠️ IMPORTANTE:
   * Falta confirmar el layout exacto de DATA para CMD 2005 (Report NX R30).
   * Dejamos el armado del frame listo; cuando tengamos el layout, completar el `dataStr`.
   */
  async upsertPLU(payload) {
    if (!payload || !payload.plu) throw new Error("PLU inválido.");
    const name24 = String(payload.name || "").slice(0, 24);
    if (!name24) throw new Error("Nombre requerido.");
    const priceCent = parseInt(payload.price || 0); // centavos
    if (!Number.isFinite(priceCent) || priceCent <= 0)
      throw new Error("Precio inválido.");
    const tare = parseInt(payload.tare || 0);

    // barcode opcional (si autoBarcode → generamos con el formato de balanza guardado)
    let barcode = (payload.barcode || "").trim();
    if (!barcode && payload.autoBarcode) {
      const { Usuario } = this.models;
      const admin = await Usuario.findOne({
        where: { rol: "administrador" },
        raw: true,
      });
      const bc = admin?.config_balanza || null;
      if (bc) {
        barcode = buildBarcodeFromConfig(bc, {
          plu: payload.plu,
          priceCent: bc.tipo_valor === "precio" ? priceCent : 0,
          weightGr: bc.tipo_valor === "peso" ? 1000 : 0,
        });
      }
    }

    // TODO: Reemplazar por el layout real del DATA (posiciones fijas / campos separados).
    // Ejemplo PROVISORIO (NO OFICIAL): "PLU|NAME|PRICECENT|TARE|BARCODE"
    const dataStr = `${String(payload.plu).padStart(
      5,
      "0"
    )}|${name24}|${priceCent}|${tare}|${barcode || ""}`;

    const body = buildBody("2005", dataStr);
    await this.send(body);
    return "PLU enviado (formato DATA provisorio).";
  }

  /**
   * Baja de PLU (stub).
   * ⚠️ Completar formato de DATA real apenas confirmemos la tabla del manual.
   */
  async deletePLU(plu) {
    const p = parseInt(plu);
    if (!p) throw new Error("PLU inválido.");
    // PROVISORIO: enviamos sólo el PLU con padding
    const dataStr = String(p).padStart(5, "0");
    const body = buildBody("3005", dataStr);
    await this.send(body);
    return "PLU eliminado (formato DATA provisorio).";
  }

  /**
   * Sync masivo: recibe un array de { plu, name, price, tare, barcode }
   * y los envía secuencialmente (simple). Puedes paralelizar si la balanza lo permite.
   */
  async syncAll(items = []) {
    let ok = 0,
      fail = 0;
    for (const it of items) {
      try {
        await this.upsertPLU(it);
        ok++;
      } catch (e) {
        // Logueamos y seguimos
        console.warn(
          "[SCALE][syncAll] Falla con PLU",
          it?.plu,
          e?.message || e
        );
        fail++;
      }
    }
    return `Sync completado. OK=${ok}, FAIL=${fail}`;
  }
}

let _instance = null;

/**
 * Singleton público
 */
async function getScaleManager(models) {
  if (!_instance) {
    _instance = new ScaleManager(models);
    await _instance.reloadConfig();
  }
  return _instance;
}

module.exports = {
  getScaleManager,
  // exportamos util por si lo usan otros módulos (ya lo usa admin.js/handlers)
  buildBarcodeFromConfig,
};
