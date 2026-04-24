'use strict';

// URL del backend cloud. Para desarrollo local, definir la variable de entorno:
//   set VENTASIMPLE_API_URL=http://localhost:8000
const CLOUD_API_URL =
  process.env.VENTASIMPLE_API_URL || 'https://api.ventasimple.cloud';

module.exports = { CLOUD_API_URL };
