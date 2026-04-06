const net = require("net");

async function sendViaTCP({ ip, port, timeoutMs }, payloadBuffer) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let resolved = false;
    const to = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { client.destroy(); } catch {}
        reject(new Error("Timeout TCP"));
      }
    }, timeoutMs || 4000);

    client.connect(port, ip, () => {
      client.write(payloadBuffer);
    });

    client.on("data", (data) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(to);
      client.end();
      resolve(data);
    });

    client.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(to);
      reject(err);
    });

    client.on("close", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(to);
        resolve(Buffer.from("")); // algunas balanzas no responden
      }
    });
  });
}

// Bluetooth Serial (SPP)
async function sendViaBT({ btAddress, timeoutMs }, payloadBuffer) {
  const { BluetoothSerialPort } = require("bluetooth-serial-port"); // npm i bluetooth-serial-port
  return new Promise((resolve, reject) => {
    const bt = new BluetoothSerialPort();
    let resolved = false;

    const to = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { bt.close(); } catch {}
        reject(new Error("Timeout BT"));
      }
    }, timeoutMs || 5000);

    bt.findSerialPortChannel(btAddress, (channel) => {
      bt.connect(btAddress, channel, () => {
        bt.write(payloadBuffer, (err) => {
          if (err && !resolved) {
            resolved = true; clearTimeout(to);
            return reject(err);
          }
          // algunas balanzas no devuelven nada; escuchamos un rato
          bt.on("data", (buffer) => {
            if (resolved) return;
            resolved = true; clearTimeout(to);
            try { bt.close(); } catch {}
            resolve(buffer);
          });
          // si no llega nada, resolvemos al cerrar por timeout
        });
      }, (err) => {
        if (!resolved) {
          resolved = true; clearTimeout(to);
          reject(err || new Error("No se pudo conectar a BT"));
        }
      });
    }, (err) => {
      if (!resolved) {
        resolved = true; clearTimeout(to);
        reject(err || new Error("No se encontró canal SPP"));
      }
    });
  });
}

module.exports = { sendViaTCP, sendViaBT };
