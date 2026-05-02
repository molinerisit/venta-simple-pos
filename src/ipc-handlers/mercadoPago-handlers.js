// src/ipc-handlers/mercadoPago-handlers.js
const fetch = require("node-fetch");
const { ipcMain, shell } = require("electron");
const { readLicense } = require("./license-handlers");
const { getActiveToken } = require("./session-handlers");
const { CLOUD_API_URL: CLOUD_API } = require("../config");

// B-6: global request timeout for all MP API calls
const MP_FETCH_TIMEOUT_MS = 15_000;

// ===================================================================
// INICIO DEL REGISTRO DE HANDLERS
// ===================================================================

function registerMercadoPagoHandlers(models) {
  
  // 🟢 INICIO: FUNCIONES DE AYUDA (MOVIDAS DENTRO)
  // Al estar aquí adentro, nos aseguramos de que siempre existan.

  const { Usuario } = models; // Necesario para la función de abajo

  /** Utilidad: arma headers con bearer */
  function authHeaders(token, extra = {}) {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  /** Utilidad: hace fetch y devuelve { ok, data|error } uniforme.
   *  B-6: includes AbortController-based timeout (MP_FETCH_TIMEOUT_MS). */
  async function doFetch(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MP_FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (r.status === 204 && init?.method === 'DELETE') {
        return { ok: true, data: { deleted: true } };
      }
      const data = await r.json().catch(() => ({}));
      return r.ok ? { ok: true, data } : { ok: false, error: data?.message || data?.error || `HTTP ${r.status}` };
    } catch(e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        return { ok: false, error: "Timeout: MP API no respondió." };
      }
      console.error("Error en doFetch:", e);
      return { ok: false, error: e.message || "Error de red" };
    }
  }

  /**
   * Resuelve el contexto MP activo (NUEVA VERSIÓN LOCAL)
   */
  async function resolveActiveMpContext(models) {
    const admin = await Usuario.findOne({
      where: { rol: "administrador" },
      attributes: ["mp_access_token", "mp_user_id", "mp_pos_id", "mp_payment_config"],
      raw: true,
    });
    if (!admin) {
      return { ok: false, error: "No se encontró un usuario administrador." };
    }
    const cfg = typeof admin.mp_payment_config === "string"
      ? JSON.parse(admin.mp_payment_config)
      : (admin.mp_payment_config || {});
    return {
      ok: true,
      ctx: {
        accessToken: admin.mp_access_token || null,
        userId: admin.mp_user_id || null,
        posId: admin.mp_pos_id || null,
        storeId: cfg.store_id || null,
      },
    };
  }

  // S-6: allowed query parameters for payment search
  const ALLOWED_PAYMENT_SEARCH_PARAMS = new Set([
    "status", "begin_date", "end_date", "external_reference",
    "sort", "criteria", "limit", "offset",
  ]);

  /**
   * Lógica central para buscar PAGOS en la API de MP.
   * S-6: only whitelisted query params are forwarded.
   */
  async function _internal_searchPayments(models, query = {}) {
    try {
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      // S-6: filter to allowlist
      const safeQuery = {};
      for (const key of Object.keys(query || {})) {
        if (ALLOWED_PAYMENT_SEARCH_PARAMS.has(key)) safeQuery[key] = query[key];
      }

      const params = new URLSearchParams(safeQuery);
      const url = `https://api.mercadopago.com/v1/payments/search?${params.toString()}`;
      return await doFetch(url, { headers: authHeaders(accessToken, { "Content-Type": undefined }) });
    } catch (e) {
      return { ok: false, error: e?.message || "Error buscando pagos" };
    }
  }
  
  /**
   * Lógica central para buscar ÓRDENES en la API de MP.
   */
  async function _internal_searchMerchantOrders(models, query = {}) {
    try {
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      const params = new URLSearchParams(query || {});
      const url = `https://api.mercadopago.com/merchant_orders/search?${params.toString()}`;
      return await doFetch(url, { headers: authHeaders(accessToken, { "Content-Type": undefined }) });
    } catch (e) {
      return { ok: false, error: e?.message || "Error buscando órdenes" };
    }
  }
  
  // 🟢 FIN: FUNCIONES DE AYUDA
  // ===================================================================

  /** --------- Estado de contexto (debug/UI) --------- */
  ipcMain.handle("mp:get-context", async () => {
    try {
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error, ctx: null };
      const { userId, posId, accessToken } = res.ctx;
      return { ok: true, ctx: { userId, posId, hasToken: !!accessToken } };
    } catch (e) {
      return { ok: false, error: e?.message || "Error al obtener contexto MP" };
    }
  });

  /** --------- Checkout Preferences --------- */
  ipcMain.handle("mp:create-preference", async (_evt, { preference }) => {
    try {
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      // S-5: reconstruct preference from explicit allowlist — never forward
      // renderer-controlled fields like notification_url, marketplace_fee, etc.
      const p = preference || {};
      const safePreference = {};
      if (p.title !== undefined)              safePreference.title = p.title;
      if (p.description !== undefined)        safePreference.description = p.description;
      if (p.items !== undefined)              safePreference.items = p.items;
      if (p.external_reference !== undefined) safePreference.external_reference = p.external_reference;
      if (p.total_amount !== undefined)       safePreference.total_amount = p.total_amount;

      const url = "https://api.mercadopago.com/checkout/preferences";
      return await doFetch(url, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify(safePreference),
      });
    } catch (e) {
      return { ok: false, error: e?.message || "Error creando preferencia" };
    }
  });

  /** --------- Pagos (v1) --------- */
  ipcMain.handle("mp:get-payment", async (_evt, { paymentId }) => {
    try {
      if (!paymentId) return { ok: false, error: "paymentId requerido" };
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
      return await doFetch(url, { headers: authHeaders(accessToken, { "Content-Type": undefined }) });
    } catch (e) {
      return { ok: false, error: e?.message || "Error consultando pago" };
    }
  });

  ipcMain.handle("mp:refund-payment", async (_evt, { paymentId, amount }) => {
    try {
      if (!paymentId) return { ok: false, error: "paymentId requerido" };

      // I-4: reject falsy/non-positive amount to prevent accidental full refund
      const numAmount = Number(amount);
      if (!amount || !Number.isFinite(numAmount) || numAmount <= 0) {
        return { ok: false, error: "amount must be a positive number" };
      }

      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      const url = `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`;
      return await doFetch(url, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify({ amount: numAmount }),
      });
    } catch (e) {
      return { ok: false, error: e?.message || "Error al reembolsar pago" };
    }
  });

  
  ipcMain.handle("mp:search-payments", async (_evt, { query } = {}) => {
    return await _internal_searchPayments(models, query);
  });

  /** --------- Merchant Orders --------- */
  ipcMain.handle("mp:get-merchant-order", async (_evt, { orderId }) => {
    try {
      if (!orderId) return { ok: false, error: "orderId requerido" };
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      const url = `https://api.mercadopago.com/merchant_orders/${orderId}`;
      return await doFetch(url, { headers: authHeaders(accessToken, { "Content-Type": undefined }) });
    } catch (e) {
      return { ok: false, error: e?.message || "Error consultando merchant order" };
    }
  });

  /** --------- POS (Cajas) --------- */
  ipcMain.handle("get-mp-pos-list", async () => {
    // S-4: always use stored credentials; renderer-supplied token is ignored
    try {
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { success: false, message: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { success: false, message: "Access Token no configurado." };

      const url = `https://api.mercadopago.com/pos?limit=50&offset=0`;
      const fetchRes = await doFetch(url, { headers: authHeaders(accessToken, { "Content-Type": undefined }) });

      if (!fetchRes.ok) {
        return { success: false, message: fetchRes.error || "Error al listar POS" };
      }
      const validCajas = (fetchRes.data?.results || []).filter(
        (pos) => pos.external_id
      );
      return { success: true, data: validCajas };
    } catch (e) {
      return { success: false, message: e?.message || "Error listando POS" };
    }
  });

  /** --------- Crear QR (Para la caja) --------- */
  // B-5: removed all console.log from hot path; only console.error on genuine failures
  ipcMain.handle("create-mp-order", async (_evt, { title, description, external_reference, notification_url, total_amount, items, method }) => {
    try {
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };

      const { accessToken, userId, posId, storeId } = res.ctx;

      if (!accessToken) return { ok: false, error: "Access Token no configurado." };
      if (!userId)      return { ok: false, error: "Falta mp_user_id en la configuración del administrador." };
      if (!posId)       return { ok: false, error: "No hay POS (caja) configurado en el administrador." };

      const numericAmount = Number(total_amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        return { ok: false, error: `Monto inválido: ${total_amount}. Debe ser un número mayor a 0.` };
      }

      // Endpoint nuevo (con store) cuando está disponible; fallback al endpoint legacy sin store
      const url = storeId
        ? `https://api.mercadopago.com/instore/qr/seller/collectors/${encodeURIComponent(userId)}/stores/${encodeURIComponent(storeId)}/pos/${encodeURIComponent(posId)}/orders`
        : `https://api.mercadopago.com/instore/orders/qr/seller/collectors/${encodeURIComponent(userId)}/pos/${encodeURIComponent(posId)}/qrs`;

      const processedItems = (items || []).map(item => ({
        title: item.title || "Producto",
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        total_amount: (item.quantity || 1) * (item.unit_price || 0),
        unit_measure: "unit",
      }));

      const body = {
        title: title || "Venta en tienda",
        description: description || "Cobro en mostrador",
        external_reference: external_reference || `local-${Date.now()}`,
        notification_url: notification_url || undefined,
        total_amount: numericAmount,
        items: processedItems,
        cash_out: { amount: 0 },
      };

      const httpMethod = method === "PUT" ? "PUT" : "POST";
      console.log(`[create-mp-order] ${httpMethod} → user=${userId} store=${storeId || "legacy"} pos=${posId} amount=${numericAmount}`);

      const apiResponse = await doFetch(url, {
        method: httpMethod,
        headers: authHeaders(accessToken),
        body: JSON.stringify(body),
      });

      if (!apiResponse.ok) {
        console.error("[create-mp-order] MP API error:", JSON.stringify(apiResponse.error));
      } else {
        const hasQr = !!apiResponse.data?.qr_data;
        console.log(`[create-mp-order] OK — qr_data presente: ${hasQr} | keys: ${Object.keys(apiResponse.data || {}).join(", ")}`);
      }
      return apiResponse;

    } catch (e) {
      console.error("[create-mp-order] Unexpected error:", e);
      return { ok: false, error: e?.message || "Error creando QR" };
    }
  });

  ipcMain.handle("mp:cancel-qr", async () => {
    try {
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken, userId, posId } = res.ctx;

      if (!accessToken) return { ok: false, error: "Access Token no configurado." };
      if (!userId) return { ok: false, error: "Falta mp_user_id en la configuración." };
      if (!posId) return { ok: false, error: "No hay POS (caja) configurado." };

      const url = `https://api.mercadopago.com/instore/orders/qr/seller/collectors/${encodeURIComponent(
        userId
      )}/pos/${encodeURIComponent(posId)}/qrs`;
      
      return await doFetch(url, {
        method: "DELETE",
        headers: authHeaders(accessToken, { "Content-Type": undefined }),
      });
    } catch (e) {
      return { ok: false, error: e?.message || "Error cancelando QR" };
    }
  });

  /** --------- Pago por external_reference --------- */
  ipcMain.handle("mp:get-payment-by-external", async (_evt, { external_reference }) => {
    try {
      if (!external_reference) return { ok: false, error: "external_reference requerido" };
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      const params = new URLSearchParams({ external_reference, sort: "date_created", criteria: "desc", limit: "1" });
      const url = `https://api.mercadopago.com/v1/payments/search?${params.toString()}`;
      const srch = await doFetch(url, { headers: authHeaders(accessToken, { "Content-Type": undefined }) });
      if (!srch.ok) return srch;

      const results = srch.data?.results || [];
      if (!results.length) return { ok: false, error: "No se encontraron pagos para esa referencia." };
      return { ok: true, data: results[0] };
    } catch (e) {
      return { ok: false, error: e?.message || "Error buscando por external_reference" };
    }
  });

  /** --------- Guardar Config MP --------- */
  ipcMain.handle("save-mp-config", async (_event, data) => {
    try {
      // B-8h: target specific admin UUID rather than all rows with rol=administrador
      const admin = await Usuario.findOne({ where: { rol: "administrador" }, attributes: ["id"] });
      if (!admin) return { success: false, message: "No se encontró usuario administrador." };
      await models.Usuario.update(
        {
          mp_access_token: data?.accessToken || null,
          mp_user_id: data?.userId || null,
          mp_pos_id: data?.posId || null,
        },
        { where: { id: admin.id } }
      );
      return { success: true };
    } catch (error) {
      console.error("[CONFIG][MP] Error:", error);
      return { success: false, message: "Error al guardar config de MP." };
    }
  });

  /** --------- Obtener Transacciones (Para la tabla) --------- */
  ipcMain.handle("get-mp-transactions", async (_event, filters) => {
    try {
      console.log("[MP] Buscando transacciones con filtros:", filters);
      
      // B-8i: limit as integer (was "400" string), capped at MP-documented max 300
      const params = {
        sort: "date_created",
        criteria: "desc",
        limit: 300,
      };

      if (filters?.status) params.status = filters.status;
      if (filters?.dateFrom) params.begin_date = filters.dateFrom;
      if (filters?.dateTo) params.end_date = filters.dateTo;

      const fetchRes = await _internal_searchPayments(models, params); 

      if (!fetchRes.ok) {
        return { success: false, message: fetchRes.error || "Error al buscar pagos." };
      }
      
      return { success: true, data: fetchRes.data?.results || [] };

    } catch (error) {
      console.error("[MP] Error en 'get-mp-transactions':", error);
      return { success: false, message: error.message || "Error interno." };
    }
  });

  /** --------- Verificar Estado del Pago (Para el modal QR) --------- */
  ipcMain.handle("check-mp-payment-status", async (_evt, { externalReference }) => {
    try {
      if (!externalReference) {
        return { ok: false, error: "No se proveyó externalReference" };
      }
      
      console.log(`[check-mp-payment-status] Verificando estado de QR con ref: ${externalReference}`);

      const query = {
        external_reference: externalReference,
        sort: "date_created",
        criteria: "desc",
        limit: "1"
      };
      
      const fetchRes = await _internal_searchMerchantOrders(models, query);

      if (!fetchRes.ok) {
        console.error("[check-mp-payment-status] Error al buscar MerchantOrder:", fetchRes.error);
        return { ok: false, error: fetchRes.error || "Fallo al buscar la orden" };
      }

      const order = fetchRes.data?.elements?.[0]; 

      if (!order) {
        console.log("[check-mp-payment-status] Orden no encontrada, reintentando...");
        return { ok: true, data: { status: "pending", paymentData: null } }; 
      }
      
      const payments = order.payments || [];
      const approvedPayment = payments.find(p => p.status === 'approved');

      if (approvedPayment) {
        console.log(`[check-mp-payment-status] ¡Pago APROBADO! ID: ${approvedPayment.id}`);
        return { ok: true, data: { status: 'approved', paymentData: approvedPayment } }; 
      }

      if (payments.length > 0) {
        const lastPaymentStatus = payments[payments.length - 1].status;
        console.log(`[check-mp-payment-status] Orden encontrada, último pago está: ${lastPaymentStatus}`);
        return { ok: true, data: { status: lastPaymentStatus, paymentData: null } };
      }

      console.log("[check-mp-payment-status] Orden encontrada, sin pagos. Sigue 'pending'.");
      return { ok: true, data: { status: "pending", paymentData: null } };

    } catch (e) {
      console.error("[check-mp-payment-status] Error:", e);
      return { ok: false, error: e.message };
    }
  });

  // ── OAuth (conectar/desconectar cuenta MP del negocio) ────────────────────

  ipcMain.handle("mp:connect-oauth", async () => {
    try {
      const lic = readLicense();
      let token = getActiveToken() || lic?.token;
      if (!token) return { ok: false, error: "Activá tu licencia primero." };

      const apiUrl = (lic?.api_url || CLOUD_API).replace(/\/$/, "");

      // Intento inicial
      let res = await fetch(`${apiUrl}/mercadopago/oauth/start?platform=desktop`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Si el token expiró → auto-refresh transparente y reintento
      if (res.status === 401) {
        const refreshRes = await fetch(`${apiUrl}/api/auth/refresh`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);

        if (refreshRes?.ok) {
          const { token: newToken } = await refreshRes.json();
          const { writeLicense } = require("./license-handlers");
          writeLicense({ ...lic, token: newToken });
          token = newToken;
          // Reintentar con token renovado
          res = await fetch(`${apiUrl}/mercadopago/oauth/start?platform=desktop`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: body?.detail || `Error ${res.status}` };
      }
      const { auth_url } = await res.json();
      if (!auth_url) return { ok: false, error: "No se recibió URL de autorización." };

      await shell.openExternal(auth_url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || "Error al iniciar OAuth" };
    }
  });

  ipcMain.handle("mp:disconnect-oauth", async () => {
    try {
      const lic = readLicense();
      const token = getActiveToken() || lic?.token;
      const apiUrl = (lic?.api_url || CLOUD_API).replace(/\/$/, "");

      if (token) {
        await fetch(`${apiUrl}/mercadopago/oauth/disconnect`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }

      const admin = await Usuario.findOne({ where: { rol: "administrador" }, attributes: ["id"] });
      if (admin) {
        await Usuario.update(
          { mp_access_token: null, mp_user_id: null, mp_pos_id: null },
          { where: { id: admin.id } }
        );
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || "Error al desconectar" };
    }
  });

  // ── Configuración de comportamiento por medio de pago ─────────────────────

  ipcMain.handle("get-mp-payment-config", async () => {
    try {
      const admin = await Usuario.findOne({
        where: { rol: "administrador" },
        attributes: ["mp_payment_config", "mp_pos_id"],
        raw: true,
      });
      const raw = admin?.mp_payment_config;
      const cfg = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
      return {
        qr_mode:        cfg.qr_mode        || "dinamico",
        debit_mode:     cfg.debit_mode     || "posnet",
        credit_mode:    cfg.credit_mode    || "posnet",
        point_device_id: cfg.point_device_id || null,
        pos_id:          cfg.pos_id || admin?.mp_pos_id || null,
        store_id:        cfg.store_id || null,
      };
    } catch (e) {
      return { qr_mode: "dinamico", debit_mode: "posnet", credit_mode: "posnet", point_device_id: null, pos_id: null, store_id: null };
    }
  });

  ipcMain.handle("save-mp-payment-config", async (_evt, data) => {
    try {
      const cfg = {
        qr_mode:        ["dinamico", "impreso", "none"].includes(data?.qr_mode)   ? data.qr_mode    : "dinamico",
        debit_mode:     ["posnet", "none"].includes(data?.debit_mode)             ? data.debit_mode  : "posnet",
        credit_mode:    ["posnet", "none"].includes(data?.credit_mode)            ? data.credit_mode : "posnet",
        point_device_id: data?.point_device_id || null,
        pos_id:          data?.pos_id || null,
        store_id:        data?.store_id || null,
      };
      await Usuario.update(
        { mp_payment_config: cfg },
        { where: { rol: "administrador" } }
      );

      // Si viene pos_id explícito, guardarlo en mp_pos_id directamente
      let posAutoSaved = null;
      if (cfg.pos_id) {
        await Usuario.update({ mp_pos_id: cfg.pos_id }, { where: { rol: "administrador" } });
      }

      // Siempre intentar rellenar store_id faltante cuando qr_mode está activo.
      // Esto corre aunque mp_pos_id ya estuviera guardado (bug anterior que impedía
      // que store_id se guardara en cuentas ya configuradas).
      if (cfg.qr_mode !== "none" && !cfg.store_id) {
        const admin = await Usuario.findOne({
          where: { rol: "administrador" },
          attributes: ["id", "mp_pos_id"],
          raw: true,
        });
        const ctxRes = await resolveActiveMpContext(models);
        if (ctxRes.ok && ctxRes.ctx.accessToken) {
          const posList = await doFetch(
            "https://api.mercadopago.com/pos?limit=50&offset=0",
            { headers: authHeaders(ctxRes.ctx.accessToken, { "Content-Type": undefined }) }
          );
          const results = posList.data?.results || [];
          // Preferir el POS que coincide con mp_pos_id ya guardado
          const currentPosId = admin?.mp_pos_id;
          const matchPos = currentPosId
            ? (results.find(p => p.external_id === currentPosId) || results.find(p => p.external_id))
            : results.find(p => p.external_id);
          if (matchPos) {
            if (!admin?.mp_pos_id) {
              await Usuario.update({ mp_pos_id: matchPos.external_id }, { where: { id: admin.id } });
              posAutoSaved = matchPos.external_id;
            }
            if (matchPos.external_store_id) {
              cfg.store_id = matchPos.external_store_id;
              await Usuario.update({ mp_payment_config: cfg }, { where: { id: admin.id } });
            }
          }
        }
      }

      return { success: true, posAutoSaved };
    } catch (e) {
      console.error("[MP][PAYMENT-CONFIG] Error:", e);
      return { success: false, message: e.message };
    }
  });

  // ── MP Point API (posnet físico) ──────────────────────────────────────────

  const POINT_BASE = "https://api.mercadopago.com/point/integration-api";

  ipcMain.handle("mp:point-list-devices", async () => {
    try {
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      const r = await doFetch(`${POINT_BASE}/devices`, {
        headers: authHeaders(accessToken, { "Content-Type": undefined }),
      });
      if (!r.ok) return { ok: false, error: r.error };

      // Solo dispositivos en Modo PDV (integración)
      const devices = (r.data?.devices || []).filter(d => d.operating_mode === "PDV");
      return { ok: true, devices };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("mp:point-create-intent", async (_evt, { deviceId, amount, externalReference, description, paymentType }) => {
    try {
      if (!deviceId) return { ok: false, error: "deviceId requerido" };
      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        return { ok: false, error: `Monto inválido: ${amount}` };
      }
      // MP Point Integration API espera el monto en centavos (entero sin decimales)
      const amountCents = Math.round(numAmount * 100);

      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      // Point Integration API: solo acepta amount y payment_mode en el body.
      // "payment", "description", "additional_info" son rechazados con 400.
      // El terminal determina crédito/débito cuando el cliente inserta la tarjeta.
      const body = {
        amount: amountCents,
        payment_mode: "card",
      };

      return await doFetch(
        `${POINT_BASE}/devices/${encodeURIComponent(deviceId)}/payment-intents`,
        { method: "POST", headers: authHeaders(accessToken), body: JSON.stringify(body) }
      );
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("mp:point-cancel-intent", async (_evt, { deviceId }) => {
    try {
      if (!deviceId) return { ok: false, error: "deviceId requerido" };
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      return await doFetch(
        `${POINT_BASE}/devices/${encodeURIComponent(deviceId)}/payment-intents`,
        { method: "DELETE", headers: authHeaders(accessToken, { "Content-Type": undefined }) }
      );
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("mp:point-intent-status", async (_evt, { intentId }) => {
    try {
      if (!intentId) return { ok: false, error: "intentId requerido" };
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      return await doFetch(
        `${POINT_BASE}/payment-intents/${encodeURIComponent(intentId)}`,
        { headers: authHeaders(accessToken, { "Content-Type": undefined }) }
      );
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Lista TODOS los terminales de la cuenta (incluyendo los que no están en modo PDV)
  ipcMain.handle("mp:point-list-all-terminals", async () => {
    try {
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      const r = await doFetch(`${POINT_BASE}/devices`, {
        headers: authHeaders(accessToken, { "Content-Type": undefined }),
      });
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, terminals: r.data?.devices || [] };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Activa Modo PDV en un terminal para que acepte payment intents via API
  ipcMain.handle("mp:point-activate-pdv", async (_evt, { terminalId }) => {
    try {
      if (!terminalId) return { ok: false, error: "terminalId requerido" };
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };
      const { accessToken } = res.ctx;
      if (!accessToken) return { ok: false, error: "Access Token no configurado." };

      return await doFetch(`${POINT_BASE}/devices/${encodeURIComponent(terminalId)}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: JSON.stringify({ operating_mode: "PDV" }),
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { registerMercadoPagoHandlers };