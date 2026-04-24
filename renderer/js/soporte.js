'use strict';

const api = window.electronAPI;
let lastDiagnostics = null;

const chat = {
  conversationId: null,
  lastTimestamp:  null,
  pollTimer:      null,
  initialized:    false,
  sending:        false,
  renderedIds:    new Set(),
};

// ── Diagnostics ───────────────────────────────────────────────────────────────

function setStatus(key, result) {
  const dot = document.getElementById(`dot-${key}`);
  const msg = document.getElementById(`msg-${key}`);
  if (!dot || !msg) return;
  dot.className = 'dot ' + (result.ok ? 'ok' : 'error');
  msg.textContent = result.msg;
}

function fillSysInfo(sys) {
  document.getElementById('inf-version').textContent = sys.version  || '–';
  document.getElementById('inf-os').textContent      = sys.os       || '–';
  document.getElementById('inf-host').textContent    = sys.hostname || '–';
  document.getElementById('inf-mem').textContent     = sys.memory   || '–';
}

function buildReport(diag) {
  if (!diag) return 'Sin datos de diagnóstico.';
  const { internet, backend, db, disk, sys } = diag;
  const ts = new Date().toLocaleString('es-AR');
  return [
    `=== Reporte Técnico VentaSimple ===`,
    `Fecha: ${ts}`,
    ``,
    `SISTEMA`,
    `Versión: ${sys.version}`,
    `OS: ${sys.os}`,
    `Equipo: ${sys.hostname}`,
    `Memoria: ${sys.memory}`,
    ``,
    `DIAGNÓSTICO`,
    `Internet: ${internet.ok ? 'OK' : 'ERROR'} · ${internet.msg}`,
    `Servidor: ${backend.ok ? 'OK' : 'ERROR'} · ${backend.msg}`,
    `Base de datos: ${db.ok ? 'OK' : 'ERROR'} · ${db.msg}`,
    `Disco: ${disk.ok ? 'OK' : 'ALERTA'} · ${disk.msg}`,
  ].join('\n');
}

function showToast(msg, duration = 2000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

async function runDiagnostics() {
  ['internet', 'backend', 'db', 'disk'].forEach(k => {
    const dot = document.getElementById(`dot-${k}`);
    const msg = document.getElementById(`msg-${k}`);
    if (dot) dot.className = 'dot loading';
    if (msg) msg.textContent = 'Verificando…';
  });
  try {
    const data = await api.invoke('soporte-diagnostics');
    lastDiagnostics = data;
    setStatus('internet', data.internet);
    setStatus('backend',  data.backend);
    setStatus('db',       data.db);
    setStatus('disk',     data.disk);
    fillSysInfo(data.sys);
  } catch (e) {
    console.error('soporte-diagnostics:', e);
    showToast('Error al obtener diagnóstico');
  }
}

// ── Chat ──────────────────────────────────────────────────────────────────────

function scrollToBottom() {
  const el = document.getElementById('chat-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

function appendBubble({ sender, text, id }) {
  const container = document.getElementById('chat-messages');
  const empty     = document.getElementById('chat-empty');
  if (empty) empty.remove();

  if (id !== undefined) {
    const key = String(id);
    if (chat.renderedIds.has(key)) return;
    chat.renderedIds.add(key);
  }

  const wrap   = document.createElement('div');
  wrap.className = `bubble-wrap ${sender}`;

  const bubble = document.createElement('div');
  bubble.className  = 'bubble';
  bubble.textContent = text;

  wrap.appendChild(bubble);
  container.appendChild(wrap);
  scrollToBottom();
}

function buildClientContext(diag) {
  if (!diag) return {};
  return {
    os:       diag.sys.os,
    hostname: diag.sys.hostname,
    internet: `${diag.internet.ok ? 'OK' : 'Error'} · ${diag.internet.msg}`,
    db:       `${diag.db.ok ? 'OK' : 'Error'} · ${diag.db.msg}`,
    disk:     `${diag.disk.ok ? 'OK' : 'Error'} · ${diag.disk.msg}`,
  };
}

async function initChat() {
  if (chat.initialized) return;

  const result = await api.invoke('soporte-chat-init', {
    business_name: 'Usuario VentaSimple',
    context: buildClientContext(lastDiagnostics),
  });

  if (!result.ok) {
    appendBubble({ sender: 'system', text: 'No se pudo conectar con soporte. Verificá tu conexión a internet.' });
    return;
  }

  chat.conversationId = result.conversation_id;
  chat.lastTimestamp  = new Date().toISOString();
  chat.initialized    = true;

  appendBubble({ sender: 'system', text: 'Conversación iniciada. Pronto vas a recibir una respuesta.' });

  startPolling();
}

async function pollMessages() {
  if (!chat.conversationId) return;
  try {
    const result = await api.invoke('soporte-chat-poll', {
      conversation_id: chat.conversationId,
      since:           chat.lastTimestamp,
    });
    if (!result.ok || !result.messages?.length) return;

    for (const msg of result.messages) {
      if (msg.sender === 'user' || msg.sender === 'system') continue;
      appendBubble({ sender: msg.sender, text: msg.text, id: msg.id });
      chat.lastTimestamp = msg.created_at;
    }
  } catch (e) {
    console.error('chat poll error:', e);
  }
}

function startPolling() {
  stopPolling();
  chat.pollTimer = setInterval(pollMessages, 3000);
}

function stopPolling() {
  if (chat.pollTimer) { clearInterval(chat.pollTimer); chat.pollTimer = null; }
}

async function sendMessage() {
  if (chat.sending || !chat.conversationId) return;
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  chat.sending = true;
  input.value  = '';
  input.style.height = 'auto';
  document.getElementById('btn-chat-send').disabled = true;

  appendBubble({ sender: 'user', text });

  try {
    const result = await api.invoke('soporte-chat-send', {
      conversation_id: chat.conversationId,
      text,
    });
    if (result.ok && result.created_at) {
      chat.lastTimestamp = result.created_at;
    }
  } catch (e) {
    showToast('Error al enviar mensaje');
  }

  chat.sending = false;
  document.getElementById('btn-chat-send').disabled = false;
  input.focus();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const tab = btn.dataset.tab;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));

    btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.remove('hidden');

    if (tab === 'chat') {
      if (!lastDiagnostics) await runDiagnostics();
      await initChat();
      document.getElementById('chat-input').focus();
    } else {
      stopPolling();
    }
  });
});

// ── Chat input ────────────────────────────────────────────────────────────────

document.getElementById('btn-chat-send').addEventListener('click', sendMessage);

document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

document.getElementById('chat-input').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});

// ── Status tab ────────────────────────────────────────────────────────────────

document.getElementById('btn-refresh').addEventListener('click', runDiagnostics);

document.getElementById('btn-wa').addEventListener('click', async () => {
  const report = buildReport(lastDiagnostics);
  const msg = `Hola, necesito soporte con VentaSimple.\n\n${report}`;
  await api.invoke('soporte-open-whatsapp', msg);
});

document.getElementById('btn-copy').addEventListener('click', async () => {
  const report = buildReport(lastDiagnostics);
  await api.invoke('soporte-copy-report', report);
  showToast('Reporte copiado al portapapeles');
});

document.getElementById('btn-rustdesk').addEventListener('click', async () => {
  const result = await api.invoke('soporte-launch-rustdesk');
  if (result.ok) {
    document.getElementById('rustdesk-guide').style.display = 'block';
    document.getElementById('rustdesk-error').style.display = 'none';
  } else {
    document.getElementById('rustdesk-error').textContent  = result.msg;
    document.getElementById('rustdesk-error').style.display = 'block';
    document.getElementById('rustdesk-guide').style.display = 'none';
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

runDiagnostics();
