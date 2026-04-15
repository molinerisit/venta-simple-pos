// src/remote/metrics.js
// System metrics using systeminformation + built-in os module.
'use strict';

const os = require('os');

let si;
try { si = require('systeminformation'); } catch (_) { si = null; }

// CPU usage: poll twice 500ms apart and calculate delta
async function getCpuUsage() {
  if (!si) return null;
  try {
    const load = await si.currentLoad();
    return Math.round(load.currentLoad);
  } catch { return null; }
}

async function getCpuTemp() {
  if (!si) return null;
  try {
    const temp = await si.cpuTemperature();
    return temp.main > 0 ? Math.round(temp.main) : null;
  } catch { return null; }
}

async function getDiskInfo() {
  if (!si) return [];
  try {
    const drives = await si.fsSize();
    return drives.map(d => ({
      fs:    d.fs,
      mount: d.mount,
      size:  d.size,
      used:  d.used,
      free:  d.available,
      usePct: d.use,
    }));
  } catch { return []; }
}

async function getNetworkInfo() {
  if (!si) return [];
  try {
    const ifaces = await si.networkInterfaces();
    return ifaces
      .filter(i => !i.internal)
      .map(i => ({ iface: i.iface, ip4: i.ip4, ip6: i.ip6, mac: i.mac }));
  } catch { return []; }
}

async function getMetrics() {
  const totalMem = os.totalmem();
  const freeMem  = os.freemem();
  const usedMem  = totalMem - freeMem;

  const [cpuLoad, cpuTemp, disks, network] = await Promise.all([
    getCpuUsage(),
    getCpuTemp(),
    getDiskInfo(),
    getNetworkInfo(),
  ]);

  return {
    timestamp: new Date().toISOString(),
    os: {
      platform: os.platform(),
      version:  os.version ? os.version() : os.release(),
      hostname: os.hostname(),
      uptime:   Math.floor(os.uptime()),
    },
    cpu: {
      model:    os.cpus()[0]?.model || 'unknown',
      cores:    os.cpus().length,
      loadPct:  cpuLoad,
      tempC:    cpuTemp,
    },
    ram: {
      total:   totalMem,
      used:    usedMem,
      free:    freeMem,
      usePct:  Math.round((usedMem / totalMem) * 100),
    },
    disks,
    network,
  };
}

module.exports = { getMetrics };
