'use strict';

const api = window.electronAPI;
let lastDiagnostics = null;

function setStatus(key, result) {
  const dot = document.getElementById(`dot-${key}`);
  const msg = document.getElementById(`msg-${key}`);
  if (!dot || !msg) return;
  dot.className = 'dot ' + (result.ok ? 'ok' : 'error');
  msg.textContent = result.msg;
}

function fillSysInfo(sys) {
  document.getElementById('inf-version').textContent = sys.version || '–';
  document.getElementById('inf-os').textContent      = sys.os      || '–';
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
    document.getElementById('rustdesk-error').textContent = result.msg;
    document.getElementById('rustdesk-error').style.display = 'block';
    document.getElementById('rustdesk-guide').style.display = 'none';
  }
});

runDiagnostics();
