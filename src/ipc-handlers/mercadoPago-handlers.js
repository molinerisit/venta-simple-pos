// src/ipc-handlers/mercadoPago-handlers.js
const fetch = require("node-fetch");
const { ipcMain } = require("electron");

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
      attributes: ["mp_access_token", "mp_user_id", "mp_pos_id"],
      raw: true,
    });
    if (!admin) {
      return { ok: false, error: "No se encontró un usuario administrador." };
    }
    return {
      ok: true,
      ctx: {
        accessToken: admin.mp_access_token || null,
        userId: admin.mp_user_id || null,
        posId: admin.mp_pos_id || null,
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
  ipcMain.handle("create-mp-order", async (_evt, { title, description, external_reference, notification_url, total_amount, items }) => {
    try {
      const res = await resolveActiveMpContext(models);
      if (!res.ok) return { ok: false, error: res.error };

      const { accessToken, userId, posId } = res.ctx;

      if (!accessToken) return { ok: false, error: "Access Token no configurado." };
      if (!userId)      return { ok: false, error: "Falta mp_user_id en la configuración del administrador." };
      if (!posId)       return { ok: false, error: "No hay POS (caja) configurado en el administrador." };

      const numericAmount = Number(total_amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        return { ok: false, error: `Monto inválido: ${total_amount}. Debe ser un número mayor a 0.` };
      }

      const url = `https://api.mercadopago.com/instore/orders/qr/seller/collectors/${encodeURIComponent(userId)}/pos/${encodeURIComponent(posId)}/qrs`;

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

      const apiResponse = await doFetch(url, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify(body),
      });

      if (!apiResponse.ok) {
        console.error("[create-mp-order] MP API error:", apiResponse.error);
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
}

module.exports = { registerMercadoPagoHandlers };