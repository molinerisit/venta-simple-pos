'use strict';

/**
 * Patches Node's module loader BEFORE any handler file is required.
 * Any require('electron') call will receive this mock instead of the real module.
 *
 * Must be required as the very first thing in the test runner.
 */

const Module = require('module');
const os = require('os');

const registeredHandlers = {};

const mockIpcMain = {
  handle: (channel, fn) => { registeredHandlers[channel] = fn; },
  on:    () => {},
  once:  () => {},
  removeHandler:     () => {},
  removeAllListeners: () => {},
};

const mockApp = {
  getPath: () => os.tmpdir(),
  isPackaged: false,
};

const mockDialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showSaveDialog: async () => ({ canceled: true, filePath: null }),
};

class MockBrowserWindow {
  static getAllWindows() { return []; }
  static fromWebContents() { return null; }
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcMain: mockIpcMain,
      app: mockApp,
      dialog: mockDialog,
      BrowserWindow: MockBrowserWindow,
    };
  }
  return originalLoad.apply(this, arguments);
};

/**
 * Calls a registered IPC handler as if it were invoked from the renderer.
 * @param {string} channel
 * @param {any} data
 */
function invoke(channel, data) {
  const fn = registeredHandlers[channel];
  if (!fn) throw new Error(`No handler registered for channel: "${channel}"`);
  return fn(null, data);
}

module.exports = { registeredHandlers, invoke };
