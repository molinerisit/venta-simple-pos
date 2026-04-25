'use strict';

/**
 * Heartbeat inteligente — pinga el backend solo dentro del horario comercial.
 * Secuencia: apertura+5min → cada 60min → cierre+5min → stop hasta mañana.
 */

const { CLOUD_API_URL } = require('./config');

let _token      = null;
let _timer      = null;
let _hours      = [];  // [{day,open_time,close_time,is_open}] del backend
let _initialized = false;

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function setToken(token) { _token = token; }

function stop() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
}

async function ping() {
  if (!_token) return;
  try {
    const executor = require('./command-executor');
    const metrics  = await executor.buildPingPayload(_token);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    await fetch(`${CLOUD_API_URL}/api/tenants/me/ping`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${_token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(metrics),
      signal:  ctrl.signal,
    });
    clearTimeout(t);
  } catch { /* silencioso */ }
}

function timeToMinutes(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function msTill(targetMinutes) {
  const diff = targetMinutes - nowMinutes();
  return diff > 0 ? diff * 60 * 1000 : null;
}

function scheduleNext() {
  stop();
  if (!_token || !_hours.length) return;

  // js getDay(): 0=dom,1=lun…6=sab → backend: 0=lun…6=dom
  const jsDay   = new Date().getDay();
  const backDay = jsDay === 0 ? 6 : jsDay - 1;
  const today   = _hours.find(h => h.day === backDay);

  if (!today || !today.is_open) return; // cerrado hoy

  const open  = timeToMinutes(today.open_time)  + 5;  // apertura + 5 min
  const close = timeToMinutes(today.close_time) + 5;  // cierre + 5 min
  const now   = nowMinutes();

  if (now > close) return; // ya terminó el horario

  // Determinar el próximo momento de ping
  let nextMinutes;
  if (now < open) {
    nextMinutes = open;
  } else {
    // siguiente hora exacta + 5 min
    const nextHour = Math.ceil((now - 4) / 60) * 60 + 5;
    nextMinutes = Math.min(nextHour, close);
  }

  const ms = msTill(nextMinutes);
  if (ms === null || ms < 0) return;

  _timer = setTimeout(async () => {
    await ping();
    scheduleNext(); // reprogramar para el siguiente
  }, ms);
}

async function loadHoursAndStart(token) {
  _token = token;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${CLOUD_API_URL}/api/tenants/me/hours`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      _hours = await res.json();
      _initialized = true;
      scheduleNext();
    }
  } catch { /* sin horarios configurados, no pinga */ }
}

function refreshSchedule() {
  if (_initialized) scheduleNext();
}

module.exports = { loadHoursAndStart, setToken, stop, refreshSchedule };
