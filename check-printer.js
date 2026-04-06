const { PosPrinter } = require("electron-pos-printer");

async function imprimirTicketPrueba() {
  const nombreImpresora = "58mm Series Printer(1)"; // Asegurate que coincida exactamente

  const textoPrueba = `
MI NEGOCIO
--------------------------------
TICKET DE PRUEBA
FECHA: ${new Date().toLocaleString("es-AR")}
CAJERO: TEST
--------------------------------
ITEM 1       1 x $100 = $100
ITEM 2       2 x $50 = $100
--------------------------------
TOTAL: $200
METODO PAGO: EFECTIVO
¡Gracias por su compra!
`;

  const dataToPrint = [
    {
      type: "text",
      value: textoPrueba,
      style: { 
        fontSize: 12, 
        fontFamily: "Arial", 
        bold: true, 
        align: "left" 
      },
    },
  ];

  const options = {
    preview: false,       // No abrir ventana de selección
    silent: true,         // Imprime directo
    printerName: nombreImpresora,
  };

  try {
    await PosPrinter.print(dataToPrint, options);
    console.log("✅ Ticket de prueba enviado correctamente");
  } catch (error) {
    console.error("❌ Error al imprimir ticket de prueba:", error);
  }
}

// Llamá a la función
imprimirTicketPrueba();
