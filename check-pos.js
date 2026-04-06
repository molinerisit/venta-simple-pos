const axios = require("axios");

// Tu Access Token de producción
const ACCESS_TOKEN = "APP_USR-3574563421170890-082211-712b8f955e7bcfae63d92c5105333428-447541514";

async function listPOS() {
  try {
    const url = "https://api.mercadopago.com/pos";
    const headers = { Authorization: `Bearer ${ACCESS_TOKEN}` };

    const response = await axios.get(url, { headers });

    console.log("===== RESPUESTA COMPLETA =====");
    console.log(JSON.stringify(response.data, null, 2));
    console.log("===== FIN RESPUESTA =====");

    // Intentar acceder a un array llamado 'results' si existe
    const posArray = Array.isArray(response.data) ? response.data : response.data.results;
    if (!posArray || posArray.length === 0) {
      console.log("No se encontraron POS activos.");
      return;
    }

    console.log("POS activos encontrados:");
    posArray.forEach(pos => {
      console.log(`- POS ID: ${pos.id}, Nombre: ${pos.name || "N/A"}, Tipo: ${pos.type || "N/A"}`);
    });

  } catch (error) {
    console.error("Error al listar POS:", error.response?.data || error.message);
  }
}

listPOS();
