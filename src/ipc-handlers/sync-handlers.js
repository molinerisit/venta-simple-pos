'use strict';

const { ipcMain, app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { readLicense } = require('./license-handlers');
const { getActiveUserId, getActiveToken } = require('./session-handlers');
const { CLOUD_API_URL } = require('../config');

// Referencia al doSync una vez que registerSyncHandlers haya sido llamado
let _doSync = null;

const SYNC_STATE_PATH = path.join(app.getPath('userData'), 'vs-sync.json');

function readSyncState() {
  try {
    if (fs.existsSync(SYNC_STATE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(SYNC_STATE_PATH, 'utf8'));
      // enabled es true por defecto si no existe el campo
      if (parsed.enabled === undefined) parsed.enabled = true;
      return parsed;
    }
  } catch {}
  return { last_sync_at: null, enabled: true };
}

function writeSyncState(state) {
  fs.writeFileSync(SYNC_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function _request(method, url, token, body) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = mod.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(Object.assign(new Error(`HTTP ${res.statusCode}: ${data}`), { statusCode: res.statusCode }));
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Timeout de red al sincronizar')));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Intenta renovar el token de sesión contra el endpoint /api/auth/refresh.
// Devuelve el nuevo token si fue exitoso, o null si falló.
function _tryRefreshToken(apiUrl, expiredToken) {
  return new Promise((resolve) => {
    const mod = apiUrl.startsWith('https') ? https : http;
    const headers = { Authorization: `Bearer ${expiredToken}`, 'Content-Length': '0' };
    const req = mod.request(`${apiUrl}/api/auth/refresh`, { method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(res.statusCode === 200 && json.token ? json.token : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ─── Mapeo de campos desktop → cloud ──────────────────────────────────────────

function mapProductoToCloud(p) {
  return {
    nombre: p.nombre,
    codigo: p.codigo || null,
    precio: p.precioVenta || 0,
    precio_costo: p.precioCompra || 0,
    stock: p.stock || 0,
    unidad: p.unidad || 'unidad',
    codigo_barras: p.codigo_barras || null,
    plu: p.plu || null,
    pesable: !!p.pesable,
    acceso_rapido: !!p.acceso_rapido,
    maneja_lotes: !!p.maneja_lotes,
    activo: p.activo !== false,
  };
}

function mapProductoFromCloud(datos) {
  return {
    nombre: datos.nombre,
    codigo: datos.codigo || null,
    precioVenta: datos.precio || 0,
    precioCompra: datos.precio_costo || 0,
    stock: datos.stock || 0,
    unidad: datos.unidad || 'unidad',
    codigo_barras: datos.codigo_barras || null,
    plu: datos.plu || null,
    pesable: !!datos.pesable,
    acceso_rapido: !!datos.acceso_rapido,
    maneja_lotes: !!datos.maneja_lotes,
    activo: datos.activo !== false,
  };
}

function mapProveedorToCloud(p) {
  const notas = [
    p.nombreRepartidor ? `Repartidor: ${p.nombreRepartidor}` : null,
    p.diasReparto ? `Días reparto: ${p.diasReparto}` : null,
    p.limitePedido ? `Límite pedido: ${p.limitePedido}` : null,
  ].filter(Boolean).join(' | ') || null;

  return {
    nombre: p.nombreEmpresa,
    telefono: p.telefono || null,
    notas,
  };
}

function mapProveedorFromCloud(datos) {
  return {
    nombreEmpresa: datos.nombre,
    telefono: datos.telefono || null,
  };
}

// ─── Handlers IPC ──────────────────────────────────────────────────────────────

function registerSyncHandlers(models) {
  const { Producto, Proveedor } = models;
  const { Op } = require('sequelize');

  ipcMain.handle('get-sync-status', () => {
    const state = readSyncState();
    return { last_sync_at: state.last_sync_at || null, enabled: state.enabled !== false };
  });

  // get-sync-config: estado completo para la UI
  ipcMain.handle('get-sync-config', () => {
    const state = readSyncState();
    return { enabled: state.enabled !== false, last_sync_at: state.last_sync_at || null };
  });

  // set-sync-enabled: requiere contraseña del usuario logueado para deshabilitar
  ipcMain.handle('set-sync-enabled', async (_e, { enabled, password }) => {
    if (enabled) {
      // Activar no requiere contraseña
      const state = readSyncState();
      writeSyncState({ ...state, enabled: true });
      return { success: true };
    }
    // Para deshabilitar, verificar contraseña del usuario activo
    try {
      const bcrypt = require('bcryptjs');
      const userId = getActiveUserId();
      if (!userId) return { success: false, message: 'No hay sesión activa.' };
      const user = await models.Usuario.findByPk(userId, { attributes: ['id', 'password'] });
      if (!user?.password) return { success: false, message: 'No se pudo verificar el usuario.' };
      const ok = await bcrypt.compare(String(password || '').trim(), user.password);
      if (!ok) return { success: false, message: 'Contraseña incorrecta.' };
      const state = readSyncState();
      writeSyncState({ ...state, enabled: false });
      return { success: true };
    } catch (e) {
      console.error('[Sync] set-sync-enabled:', e.message);
      return { success: false, message: 'Error al verificar contraseña.' };
    }
  });

  const doSync = async () => {
    const state = readSyncState();
    if (state.enabled === false) return { ok: false, error: 'sync-disabled' };
    const lic = readLicense();
    if (!lic?.token) {
      return { ok: false, error: 'No hay licencia activa. Activá tu cuenta desde Config.' };
    }

    const apiUrl = (lic.api_url || CLOUD_API_URL).replace(/\/$/, '');
    let token = getActiveToken() || lic.token;
    const plan = lic.plan || 'FREE';
    const sinceDate = state.last_sync_at ? new Date(state.last_sync_at) : new Date(0);
    const syncStart = new Date().toISOString();

    // Helper: ejecuta fn(token); si devuelve 401 renueva el token y reintenta una vez
    const withRefresh = async (fn) => {
      try {
        return await fn(token);
      } catch (e) {
        if (e.statusCode === 401) {
          const newToken = await _tryRefreshToken(apiUrl, token);
          if (newToken) {
            const { writeLicense } = require('./license-handlers');
            writeLicense({ ...lic, token: newToken });
            token = newToken;
            return await fn(token);
          }
        }
        throw e;
      }
    };

    try {
      // ── 1. Construir lote PUSH ──────────────────────────────────────────────
      const batch = [];

      const productos = await Producto.findAll({
        where: { updatedAt: { [Op.gt]: sinceDate } },
        raw: true,
      });

      for (const p of productos) {
        const datos = mapProductoToCloud(p);
        if (p.cloud_id) {
          batch.push({ tabla: 'productos', operacion: 'UPDATE', server_id: p.cloud_id, local_id: p.id, datos });
        } else {
          batch.push({ tabla: 'productos', operacion: 'INSERT', local_id: p.id, datos });
        }
      }

      // Proveedores solo en planes pagos
      let proveedores = [];
      if (plan !== 'FREE') {
        proveedores = await Proveedor.findAll({
          where: { updatedAt: { [Op.gt]: sinceDate } },
          raw: true,
        });
        for (const pv of proveedores) {
          const datos = mapProveedorToCloud(pv);
          if (pv.cloud_id) {
            batch.push({ tabla: 'proveedores', operacion: 'UPDATE', server_id: pv.cloud_id, local_id: pv.id, datos });
          } else {
            batch.push({ tabla: 'proveedores', operacion: 'INSERT', local_id: pv.id, datos });
          }
        }
      }

      let pushResults = { results: [], processed: 0 };
      if (batch.length > 0) {
        pushResults = await withRefresh(t => _request('POST', `${apiUrl}/api/sync/push`, t, { batch }));

        // Guardar server_ids devueltos por la nube
        for (const result of pushResults.results || []) {
          if (!result.error && result.server_id && result.local_id) {
            const isProd = productos.some(p => p.id === result.local_id);
            if (isProd) {
              await Producto.update({ cloud_id: result.server_id }, { where: { id: result.local_id } });
            } else {
              await Proveedor.update({ cloud_id: result.server_id }, { where: { id: result.local_id } });
            }
          }
        }
      }

      // ── 2. PULL: traer cambios del panel web ────────────────────────────────
      const pullUrl = `${apiUrl}/api/sync/pull?since=${encodeURIComponent(sinceDate.toISOString())}`;
      const pullData = await withRefresh(t => _request('GET', pullUrl, t, null));
      const changes = Array.isArray(pullData) ? pullData : [];

      let pulled = 0;
      for (const change of changes) {
        try {
          const { tabla, registro_id, local_id, operacion } = change;
          const datos = typeof change.datos === 'string' ? JSON.parse(change.datos) : (change.datos || {});

          if (tabla === 'productos') {
            if (operacion === 'DELETE') {
              if (registro_id) await Producto.destroy({ where: { cloud_id: registro_id } });
            } else if (operacion === 'UPDATE' && registro_id) {
              const mapped = mapProductoFromCloud(datos);
              // Actualizar solo si ya existe localmente
              await Producto.update(mapped, { where: { cloud_id: registro_id } });
            } else if (operacion === 'INSERT') {
              // Si ya lo tenemos por cloud_id, ignorar
              const exists = registro_id
                ? await Producto.findOne({ where: { cloud_id: registro_id } })
                : null;
              if (!exists) {
                const mapped = mapProductoFromCloud(datos);
                // Evitar duplicado por código
                const byCodigo = mapped.codigo
                  ? await Producto.findOne({ where: { codigo: mapped.codigo } })
                  : null;
                if (byCodigo) {
                  // Actualizar el registro existente con el cloud_id
                  await Producto.update({ ...mapped, cloud_id: registro_id }, { where: { id: byCodigo.id } });
                } else {
                  await Producto.create({ ...mapped, cloud_id: registro_id });
                }
              }
            }
          } else if (tabla === 'proveedores' && plan !== 'FREE') {
            if (operacion === 'DELETE') {
              if (registro_id) await Proveedor.destroy({ where: { cloud_id: registro_id } });
            } else if (operacion === 'UPDATE' && registro_id) {
              const mapped = mapProveedorFromCloud(datos);
              await Proveedor.update(mapped, { where: { cloud_id: registro_id } });
            } else if (operacion === 'INSERT') {
              const exists = registro_id
                ? await Proveedor.findOne({ where: { cloud_id: registro_id } })
                : null;
              if (!exists) {
                const mapped = mapProveedorFromCloud(datos);
                const byNombre = await Proveedor.findOne({ where: { nombreEmpresa: mapped.nombreEmpresa } });
                if (byNombre) {
                  await Proveedor.update({ ...mapped, cloud_id: registro_id }, { where: { id: byNombre.id } });
                } else {
                  await Proveedor.create({ ...mapped, cloud_id: registro_id });
                }
              }
            }
          }
          pulled++;
        } catch (changeErr) {
          console.error('[Sync] Error al aplicar cambio de la nube:', changeErr.message);
        }
      }

      // ── 3. Guardar timestamp del sync ───────────────────────────────────────
      writeSyncState({ ...state, last_sync_at: syncStart });

      return {
        ok: true,
        pushed: pushResults.processed || batch.length,
        pulled,
        last_sync_at: syncStart,
      };
    } catch (err) {
      console.error('[Sync] Error:', err.message);
      return { ok: false, error: err.message };
    }
  };

  _doSync = doSync;

  ipcMain.handle('run-cloud-sync', doSync);
  ipcMain.handle('run-manual-sync', doSync);

  // force-sync-now: invocado desde la UI, emite toast al terminar
  ipcMain.handle('force-sync-now', async () => {
    const result = await doSync();
    const wins = BrowserWindow.getAllWindows();
    if (result.ok) {
      const msg = result.pushed + result.pulled > 0
        ? `Sincronización completa — ${result.pushed} enviados, ${result.pulled} recibidos`
        : 'Ya estás al día con la nube';
      wins.forEach(w => w.webContents.send('show-toast', { msg, type: 'success' }));
    } else {
      wins.forEach(w => w.webContents.send('show-toast', { msg: result.error || 'Error al sincronizar', type: 'error' }));
    }
    return result;
  });
}

// Llamable desde main.js para auto-sync periódico
async function runSync() {
  if (!_doSync) return { ok: false, error: 'Sync no inicializado' };
  const result = await _doSync();
  if (result.ok && result.pulled > 0) {
    const wins = BrowserWindow.getAllWindows();
    wins.forEach(w =>
      w.webContents.send('show-toast', {
        msg: `Sync automático: ${result.pulled} cambios recibidos de la nube`,
        type: 'info',
      })
    );
  }
  return result;
}

module.exports = { registerSyncHandlers, runSync };
