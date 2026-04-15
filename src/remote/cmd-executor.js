// src/remote/cmd-executor.js
// Executes a strict WHITELIST of system commands. No shell, no arbitrary input.
// Uses execFile() so arguments are never passed to a shell interpreter.
'use strict';

const { execFile } = require('child_process');
const path = require('path');

const WIN = process.platform === 'win32';
const SYS = WIN ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') : '/usr/bin';

// Each entry: { bin, args, desc, timeout? }
const WHITELIST = {
  // ── Disco ──────────────────────────────────────────────────
  'disk-info': {
    bin:  WIN ? path.join(SYS, 'wbem', 'wmic.exe') : 'df',
    args: WIN ? ['logicaldisk', 'get', 'size,freespace,caption,filesystem'] : ['-h'],
    desc: 'Información de particiones',
  },
  'disk-decompress': {
    bin:  WIN ? path.join(SYS, 'compact.exe') : 'echo',
    args: WIN ? ['/CompactOs:never'] : ['no-op: solo Windows'],
    desc: 'Desactivar compresión de disco (CompactOS)',
    timeout: 60000,
  },
  'disk-compress': {
    bin:  WIN ? path.join(SYS, 'compact.exe') : 'echo',
    args: WIN ? ['/CompactOs:always'] : ['no-op: solo Windows'],
    desc: 'Activar compresión de disco (CompactOS)',
    timeout: 60000,
  },
  'chkdsk': {
    bin:  WIN ? path.join(SYS, 'chkdsk.exe') : 'fsck',
    args: WIN ? ['C:', '/scan'] : ['-n'],
    desc: 'Verificar integridad del disco (solo lectura)',
    timeout: 120000,
  },
  'defrag-analyze': {
    bin:  WIN ? path.join(SYS, 'defrag.exe') : 'echo',
    args: WIN ? ['C:', '/A', '/U'] : ['no-op: solo Windows'],
    desc: 'Analizar fragmentación (sin desfragmentar)',
    timeout: 60000,
  },
  'clear-temp': {
    bin:  WIN ? path.join(SYS, 'cmd.exe') : 'rm',
    args: WIN
      ? ['/C', `del /F /Q /S "${process.env.TEMP || 'C:\\Windows\\Temp'}\\*"`]
      : ['-rf', '/tmp/*'],
    desc: 'Limpiar archivos temporales',
    timeout: 30000,
  },

  // ── Sistema ────────────────────────────────────────────────
  'system-info': {
    bin:  WIN ? path.join(SYS, 'systeminfo.exe') : 'uname',
    args: WIN ? [] : ['-a'],
    desc: 'Información del sistema operativo',
    timeout: 20000,
  },
  'processes': {
    bin:  WIN ? path.join(SYS, 'tasklist.exe') : 'ps',
    args: WIN ? ['/fo', 'csv', '/nh'] : ['aux'],
    desc: 'Lista de procesos activos',
  },
  'network-info': {
    bin:  WIN ? path.join(SYS, 'ipconfig.exe') : 'ip',
    args: WIN ? ['/all'] : ['addr'],
    desc: 'Información de red',
  },
  'sfc-scan': {
    bin:  WIN ? path.join(SYS, 'sfc.exe') : 'echo',
    args: WIN ? ['/scannow'] : ['no-op: solo Windows'],
    desc: 'Verificar archivos del sistema (requiere admin)',
    timeout: 300000,
  },
  'ping-gateway': {
    bin:  WIN ? path.join(SYS, 'ping.exe') : 'ping',
    args: WIN ? ['-n', '4', '8.8.8.8'] : ['-c', '4', '8.8.8.8'],
    desc: 'Ping a DNS de Google (prueba de red)',
    timeout: 15000,
  },
  'uptime': {
    bin:  WIN ? path.join(SYS, 'cmd.exe') : 'uptime',
    args: WIN ? ['/C', 'net statistics workstation | find "since"'] : [],
    desc: 'Tiempo de actividad del sistema',
  },
};

/**
 * Execute a whitelisted command.
 * @param {string} cmdKey - key from WHITELIST
 * @returns {Promise<{success, output, exitCode, duration}>}
 */
function execute(cmdKey) {
  const entry = WHITELIST[cmdKey];
  if (!entry) {
    return Promise.resolve({
      success: false,
      output: `Comando desconocido: "${cmdKey}". Comandos disponibles: ${Object.keys(WHITELIST).join(', ')}`,
      exitCode: 1,
    });
  }

  const timeout = entry.timeout || 10000;
  const start   = Date.now();

  return new Promise((resolve) => {
    execFile(entry.bin, entry.args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        success:  !err || err.code === 0,
        output:   (stdout || '') + (stderr || ''),
        exitCode: err?.code ?? 0,
        duration: Date.now() - start,
        cmd:      cmdKey,
        desc:     entry.desc,
      });
    });
  });
}

/** List all available commands with their descriptions */
function listCommands() {
  return Object.entries(WHITELIST).map(([key, v]) => ({
    key,
    desc: v.desc,
    timeout: v.timeout || 10000,
  }));
}

module.exports = { execute, listCommands };
