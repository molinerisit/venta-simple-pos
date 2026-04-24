const { ipcMain } = require('electron');
const fetch = require('node-fetch');
const crypto = require('crypto');

const { CLOUD_API_URL } = require('../config');
const CACHE_TTL_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days — catalog data doesn't change often
const MISS_TTL_MS   = 24 * 60 * 60 * 1000;      // re-check 404s after 1 day

function registerCatalogHandlers(models) {
  const { CatalogCache, Usuario } = models;

  // ── buscar-en-catalogo ────────────────────────────────────────────────────
  // 1. Check local cache (CatalogCache table)
  // 2. On miss or stale: query API, persist result
  // Returns catalog entry object or null
  ipcMain.handle('buscar-en-catalogo', async (_event, barcode) => {
    if (!barcode || typeof barcode !== 'string') return null;
    const bc = barcode.trim();
    if (!bc || bc.length > 60) return null;

    // Local cache lookup
    const cached = await CatalogCache.findByPk(bc);
    if (cached) {
      const age = Date.now() - new Date(cached.cached_at).getTime();
      if (cached.miss && age < MISS_TTL_MS) return null;
      if (!cached.miss && age < CACHE_TTL_MS) return cached.toJSON();
    }

    // API query
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        `${CLOUD_API_URL}/api/catalog/barcode/${encodeURIComponent(bc)}`,
        { signal: controller.signal }
      );
      clearTimeout(timer);

      if (res.status === 404) {
        await CatalogCache.upsert({ barcode: bc, miss: true, cached_at: new Date() });
        return null;
      }
      if (!res.ok) return null;

      const data = await res.json();
      await CatalogCache.upsert({
        barcode:        bc,
        canonical_name: data.canonical_name || '',
        department:     data.department     || null,
        family:         data.family         || null,
        brand:          data.brand          || null,
        unit:           data.unit           || null,
        size:           data.size           || null,
        confidence:     data.confidence     || 0,
        sources_count:  data.sources_count  || 1,
        miss:           false,
        cached_at:      new Date(),
      });
      return data;
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('[CATALOG] API unavailable:', e.message);
      return null;
    }
  });

  // ── enviar-observacion-catalogo ───────────────────────────────────────────
  // Called after a product is saved locally. Fire-and-forget — never blocks UI.
  // Sends: barcode, raw_name, raw_department, raw_family, and geo derived from
  // the admin's configured address. Does NOT send prices unless obs.sale_price
  // is explicitly provided (Phase 2 will wire this).
  ipcMain.handle('enviar-observacion-catalogo', async (_event, obs) => {
    if (!obs?.barcode) return { ok: false };
    try {
      const admin = await Usuario.findOne({
        where: { rol: 'administrador' },
        attributes: ['id', 'direccion_negocio'],
        raw: true,
      });
      const geo = _extractGeo(admin?.direccion_negocio || '');
      // Anonymize source: hash the admin UUID so the server can de-duplicate
      // without knowing which business sent the observation.
      const source_hash = admin?.id
        ? crypto.createHash('sha256').update(admin.id).digest('hex').slice(0, 16)
        : null;

      const payload = {
        barcode:        obs.barcode.trim(),
        raw_name:       obs.raw_name        || null,
        raw_department: obs.raw_department  || null,
        raw_family:     obs.raw_family      || null,
        sale_price:     null, // prices are Phase 4
        source_hash,
        ...geo,
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      await fetch(`${CLOUD_API_URL}/api/catalog/observations`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  controller.signal,
      });
      clearTimeout(timer);
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('[CATALOG] Observation not sent:', e.message);
    }
    return { ok: true };
  });
}

// Extracts approximate geo from a free-text address.
// "Av. Mitre 1234, Rosario Norte, Rosario, Santa Fe, Argentina"
// → { country, province, city, geo_bucket }
// We only use the last comma-separated parts; we never send street/number.
function _extractGeo(direccion) {
  if (!direccion) return {};
  const parts = direccion.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return {};
  const country  = parts.length >= 1 ? parts[parts.length - 1] : null;
  const province = parts.length >= 2 ? parts[parts.length - 2] : null;
  const city     = parts.length >= 3 ? parts[parts.length - 3] : null;
  const geo_bucket = city
    ? city.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_')
    : null;
  return { country, province, city, geo_bucket };
}

module.exports = { registerCatalogHandlers };
