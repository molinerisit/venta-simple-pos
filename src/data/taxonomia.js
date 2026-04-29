// Taxonomía estándar para comercios minoristas argentinos (carnicerías, fiambrerías, supermercados, kioscos)
// Estructura: Departamentos → Familias, con keywords para auto-clasificación

const TAXONOMIA = [
  {
    nombre: "Carnes y Aves",
    familias: [
      {
        nombre: "Vacuno",
        keywords: ["asado", "bife", "lomo", "cuadril", "peceto", "nalga", "paleta", "marucha", "vacío", "tapa de asado", "costilla", "matambre", "osobuco", "carne picada", "hamburguesa", "carne vacuna", "novillo", "ternera", "bola de lomo", "cuadrada"],
      },
      {
        nombre: "Cerdo",
        keywords: ["cerdo", "bondiola", "pechito de cerdo", "carré", "costeleta", "jamón crudo", "jamón cocido", "solomillo", "panceta", "chicharrón", "chinchulín cerdo"],
      },
      {
        nombre: "Pollo y Aves",
        keywords: ["pollo", "pechuga", "muslo", "pata", "alita", "pollo entero", "pollo trozado", "pavita", "pavo", "codorniz", "pato", "gallina"],
      },
      {
        nombre: "Cordero y Cabrito",
        keywords: ["cordero", "cabrito", "chivito", "pierna cordero", "costillar cordero", "paleta cordero"],
      },
      {
        nombre: "Achuras y Menudencias",
        keywords: ["achura", "riñón", "hígado", "mondongo", "chinchulines", "mollejas", "corazón", "lengua", "sesos", "tripa", "morcilla", "chorizo", "salchicha"],
      },
      {
        nombre: "Carne Molida y Preparados",
        keywords: ["carne molida", "hamburguesa", "albóndiga", "milanesa", "milanesa de pollo", "nuggets", "suprema", "pechuguita", "arrollado"],
      },
    ],
  },
  {
    nombre: "Fiambrería y Embutidos",
    familias: [
      {
        nombre: "Jamones",
        keywords: ["jamón", "jamón cocido", "jamón crudo", "jamón serrano", "jamón york", "paleta cocida", "paleta", "prosciutto"],
      },
      {
        nombre: "Salames y Salamines",
        keywords: ["salame", "salamín", "soppressata", "longaniza", "pepperoni", "chorizo colorado", "chorizo seco"],
      },
      {
        nombre: "Mortadela y Fiambres Cocidos",
        keywords: ["mortadela", "leberwurst", "queso de cerdo", "queso de cabeza", "matambre arrollado", "fiambre cocido", "butifarra"],
      },
      {
        nombre: "Embutidos Frescos",
        keywords: ["chorizo fresco", "salchicha fresca", "morcilla", "butifarra fresca", "longaniza fresca"],
      },
      {
        nombre: "Salchichas y Frankfurt",
        keywords: ["salchicha", "frankfurt", "hot dog", "viena", "perrito", "salchichón"],
      },
      {
        nombre: "Fiambres en Lata y Envasados",
        keywords: ["paté", "paté de hígado", "picadillo", "cabeza de cerdo", "rillette", "fiambre envasado", "lata fiambre"],
      },
    ],
  },
  {
    nombre: "Lácteos y Huevos",
    familias: [
      {
        nombre: "Quesos",
        keywords: ["queso", "queso cremoso", "queso cuartirolo", "queso mozzarella", "queso brie", "queso roquefort", "queso parmesano", "queso sardo", "queso gruyere", "queso provolone", "queso de cabra", "queso port salut", "queso reggianito", "queso untable", "ricota"],
      },
      {
        nombre: "Leche",
        keywords: ["leche", "leche entera", "leche descremada", "leche semidescremada", "leche larga vida", "leche en polvo", "leche condensada", "leche evaporada", "leche chocolatada"],
      },
      {
        nombre: "Yogur",
        keywords: ["yogur", "yogurt", "yogur natural", "yogur griego", "yogur con cereales", "yogur bebible", "bebida láctea"],
      },
      {
        nombre: "Manteca y Crema",
        keywords: ["manteca", "mantequilla", "crema", "crema de leche", "nata", "crema chantilly", "crema para cocinar", "crema ácida", "sour cream"],
      },
      {
        nombre: "Huevos",
        keywords: ["huevo", "huevos", "huevo de gallina", "huevo de codorniz", "media docena", "docena de huevos", "cartón de huevos"],
      },
      {
        nombre: "Postres y Dulce de Leche",
        keywords: ["dulce de leche", "mousse", "flan", "postre", "gelatina", "budín de leche", "natilla", "arroz con leche"],
      },
    ],
  },
  {
    nombre: "Verduras y Frutas",
    familias: [
      {
        nombre: "Verduras de Hoja",
        keywords: ["lechuga", "espinaca", "acelga", "rúcula", "radicheta", "repollo", "col", "endivia", "berro", "kale"],
      },
      {
        nombre: "Verduras de Raíz y Tubérculos",
        keywords: ["papa", "batata", "zanahoria", "remolacha", "nabo", "rabanito", "cebolla", "ajo", "puerro", "jengibre"],
      },
      {
        nombre: "Tomates y Pepinos",
        keywords: ["tomate", "tomate cherry", "pepino", "berenjena", "calabaza", "zapallo", "zuchini", "zapallito"],
      },
      {
        nombre: "Verduras Varias",
        keywords: ["morrón", "pimiento", "choclo", "chaucha", "arveja", "habas", "brócoli", "coliflor", "apio", "hinojo", "alcaucil"],
      },
      {
        nombre: "Frutas de Estación",
        keywords: ["manzana", "pera", "durazno", "ciruela", "damasco", "cereza", "frutilla", "arándano", "mora", "frambuesa", "uva", "melón", "sandía", "ananá", "banana", "mandarina", "naranja", "limón", "pomelo", "kiwi", "mango", "maracuyá"],
      },
      {
        nombre: "Frutas Secas y Semillas",
        keywords: ["nuez", "almendra", "maní", "castañas de cajú", "pistacho", "avellana", "semillas de chía", "semillas de lino", "semillas de girasol", "semillas de zapallo", "pasas de uva", "dátil", "higo seco"],
      },
    ],
  },
  {
    nombre: "Almacén",
    familias: [
      {
        nombre: "Arroz y Cereales",
        keywords: ["arroz", "arroz largo fino", "arroz integral", "arroz yamaní", "sémola", "polenta", "avena", "cebada", "trigo burgol", "maíz", "quinoa"],
      },
      {
        nombre: "Harinas y Féculas",
        keywords: ["harina", "harina 0000", "harina 000", "harina integral", "harina de maíz", "fécula de maíz", "maicena", "almidón", "harina de garbanzos", "harina de trigo"],
      },
      {
        nombre: "Pastas Secas",
        keywords: ["fideos", "tallarines", "spaghetti", "penne", "moñito", "rigatoni", "lasagna", "ñoquis secos", "macarrones", "pasta seca"],
      },
      {
        nombre: "Legumbres",
        keywords: ["lenteja", "garbanzo", "poroto", "porotos negros", "porotos colorados", "arvejas secas", "habas secas", "soja"],
      },
      {
        nombre: "Aceites y Vinagres",
        keywords: ["aceite", "aceite de girasol", "aceite de oliva", "aceite de maíz", "vinagre", "vinagre de manzana", "vinagre balsámico", "aceto"],
      },
      {
        nombre: "Conservas y Enlatados",
        keywords: ["lata", "atún", "sardina", "caballa", "tomate en lata", "choclo en lata", "arvejas en lata", "lentejas en lata", "palmito", "aceitunas", "alcaparras", "anchoas"],
      },
      {
        nombre: "Salsas y Condimentos",
        keywords: ["salsa", "salsa de tomate", "ketchup", "mayonesa", "mostaza", "aderezo", "salsa golf", "chimichurri", "salsa soja", "tabasco", "worcestershire", "caldo"],
      },
      {
        nombre: "Especias y Hierbas",
        keywords: ["sal", "pimienta", "comino", "orégano", "tomillo", "romero", "laurel", "ají molido", "pimentón", "cúrcuma", "curry", "azafrán", "nuez moscada", "canela", "clavo de olor", "hierbas"],
      },
      {
        nombre: "Azúcar y Edulcorantes",
        keywords: ["azúcar", "azúcar blanca", "azúcar rubio", "azúcar impalpable", "edulcorante", "stevia", "miel", "jarabe"],
      },
    ],
  },
  {
    nombre: "Panadería y Repostería",
    familias: [
      {
        nombre: "Pan",
        keywords: ["pan", "pan de molde", "pan lactal", "pan integral", "pan de campo", "pan baguette", "pan árabe", "pan de salvado", "pan de semillas", "pan rallado", "tostadas"],
      },
      {
        nombre: "Facturas y Masas",
        keywords: ["factura", "medialunas", "croissant", "vigilantes", "berlinesas", "bolas de fraile", "churros", "palmeritas", "masa hojaldrada"],
      },
      {
        nombre: "Galletitas y Crackers",
        keywords: ["galletitas", "crackers", "galletas", "galletitas de agua", "galletitas saladas", "galletitas dulces", "vainillas", "bizcochos", "tostadas melba"],
      },
      {
        nombre: "Tortas y Budines",
        keywords: ["torta", "budín", "muffin", "cupcake", "brownie", "cheesecake", "lemon pie", "pionono", "selva negra"],
      },
      {
        nombre: "Pastelería Seca",
        keywords: ["alfajor", "masitas", "pepas", "suspiros", "merengues", "biscochitos", "pastelería", "mini torta"],
      },
      {
        nombre: "Mezclas y Premezclas",
        keywords: ["premezcla", "mix para torta", "mix para panqueques", "levadura", "polvo de hornear", "bicarbonato", "esencia de vainilla", "cacao en polvo", "chocolate cobertura"],
      },
    ],
  },
  {
    nombre: "Bebidas",
    familias: [
      {
        nombre: "Agua",
        keywords: ["agua", "agua mineral", "agua con gas", "agua sin gas", "agua saborizada", "agua tónica", "soda"],
      },
      {
        nombre: "Gaseosas",
        keywords: ["gaseosa", "coca cola", "pepsi", "sprite", "fanta", "7up", "manaos", "paso de los toros", "schweppes", "mirinda", "naranja", "pomelo gaseosa", "cola"],
      },
      {
        nombre: "Jugos y Néctares",
        keywords: ["jugo", "néctar", "jugo de naranja", "jugo de manzana", "jugo de durazno", "jugo multifrutas", "cepita", "ades", "citric"],
      },
      {
        nombre: "Energizantes e Isotónicas",
        keywords: ["red bull", "monster", "volt", "energizante", "gatorade", "powerade", "isotónica", "electrolit"],
      },
      {
        nombre: "Cervezas",
        keywords: ["cerveza", "quilmes", "stella artois", "corona", "budweiser", "heineken", "schneider", "palermo", "rubia", "negra", "artesanal", "porter", "stout", "ipa", "lager"],
      },
      {
        nombre: "Vinos y Espumantes",
        keywords: ["vino", "malbec", "cabernet", "chardonnay", "torrontés", "merlot", "syrah", "rosé", "vino blanco", "vino tinto", "espumante", "champagne", "sidra", "sangría"],
      },
      {
        nombre: "Licores y Espirituosas",
        keywords: ["fernet", "campari", "aperol", "gin", "vodka", "whisky", "ron", "tequila", "vermouth", "cynar", "amargo", "licor", "baileys", "amaretto"],
      },
      {
        nombre: "Yerba e Infusiones",
        keywords: ["yerba", "mate", "té", "tilo", "manzanilla", "poleo", "boldo", "cedrón", "jengibre té", "yerba compuesta", "café", "café molido", "café instantáneo", "cacao"],
      },
    ],
  },
  {
    nombre: "Congelados",
    familias: [
      {
        nombre: "Carnes Congeladas",
        keywords: ["carne congelada", "pollo congelado", "hamburguesa congelada", "milanesa congelada", "empanadas congeladas", "nuggets", "rebozados"],
      },
      {
        nombre: "Verduras Congeladas",
        keywords: ["espinaca congelada", "choclo congelado", "arveja congelada", "mix verduras congeladas", "brócoli congelado", "papa congelada", "papa pre-frita"],
      },
      {
        nombre: "Pastas y Comidas Listas",
        keywords: ["pizza congelada", "lasagna congelada", "ravioles congelados", "pasta congelada", "tarta congelada", "empanada congelada", "listo para calentar"],
      },
      {
        nombre: "Helados",
        keywords: ["helado", "paleta", "helado en pote", "helado a granel", "helado artesanal", "sorbete", "sundae", "ice cream"],
      },
    ],
  },
  {
    nombre: "Limpieza y Hogar",
    familias: [
      {
        nombre: "Limpieza de Ropa",
        keywords: ["detergente ropa", "jabón en polvo", "suavizante", "quitamanchas", "blanqueador", "lavandina para ropa", "jabón ropa", "skip", "ala", "ariel", "drive", "rinso"],
      },
      {
        nombre: "Limpieza del Hogar",
        keywords: ["limpiador", "lavandina", "desinfectante", "multiuso", "limpiador de pisos", "cif", "ajax", "mr muscle", "flash", "lysoform", "pinesol"],
      },
      {
        nombre: "Lavavajillas",
        keywords: ["lavavajillas", "lavaplatos", "jabón vajilla", "fairy", "magistral", "detergente vajilla"],
      },
      {
        nombre: "Papel y Descartables",
        keywords: ["papel higiénico", "papel de cocina", "servilletas", "pañuelos descartables", "rollos de cocina", "papel aluminio", "papel film", "bolsas", "bolsa de basura", "basura bolsas"],
      },
      {
        nombre: "Artículos de Limpieza",
        keywords: ["escoba", "trapo", "pala", "lavette", "esponja", "cepillo", "balde", "trapeador", "plumero"],
      },
      {
        nombre: "Insecticidas y Raticidas",
        keywords: ["insecticida", "raid", "baygon", "pif paf", "repelente", "mata mosquitos", "raticida", "mata cucarachas", "trampa ratón"],
      },
    ],
  },
  {
    nombre: "Higiene y Cuidado Personal",
    familias: [
      {
        nombre: "Jabones y Shampoo",
        keywords: ["jabón", "jabón de tocador", "shampoo", "acondicionador", "gel de baño", "jabón líquido", "dove", "palmolive", "lux", "sedal", "head shoulders"],
      },
      {
        nombre: "Desodorantes",
        keywords: ["desodorante", "antitranspirante", "desodorante roll-on", "desodorante spray", "axilas", "rexona", "nivea", "axe", "dove desodorante"],
      },
      {
        nombre: "Higiene Bucal",
        keywords: ["pasta dental", "cepillo de dientes", "enjuague bucal", "hilo dental", "blanqueador dental", "colgate", "oral b", "listerine"],
      },
      {
        nombre: "Higiene Femenina",
        keywords: ["toalla femenina", "tampón", "copa menstrual", "protector", "siempre libre", "nosotras", "ob", "tampax"],
      },
      {
        nombre: "Pañales y Toallitas",
        keywords: ["pañal", "pañales", "toallitas húmedas", "huggies", "pampers", "newborn", "reci nacido pañal"],
      },
      {
        nombre: "Afeitado y Depilación",
        keywords: ["afeitadora", "gillette", "mach3", "cuchilla", "espuma de afeitar", "gel de afeitar", "crema depilatoria", "cera depilatoria"],
      },
      {
        nombre: "Cosméticos y Perfumería",
        keywords: ["perfume", "colonia", "crema hidratante", "protector solar", "base de maquillaje", "labial", "rímel", "sombra"],
      },
    ],
  },
  {
    nombre: "Kiosko y Golosinas",
    familias: [
      {
        nombre: "Chocolates",
        keywords: ["chocolate", "milka", "toblerone", "cadbury", "bon o bon", "mantecol", "garoto", "suflair", "cofler", "shot", "bubaloo", "rhodesia"],
      },
      {
        nombre: "Caramelos y Chicles",
        keywords: ["caramelo", "chicle", "masticable", "pastilla", "mentitas", "halls", "trident", "bazooka", "palito", "chupetín", "piruleta", "tic tac"],
      },
      {
        nombre: "Alfajores",
        keywords: ["alfajor", "oreo", "jorgito", "cabsha", "havanna", "guaymallén", "triángulo", "submarino alfajor", "fantoche"],
      },
      {
        nombre: "Snacks Salados",
        keywords: ["papa frita", "snack", "doritos", "cheetos", "ruffles", "lays", "palomitas", "popcorn", "palitos salados", "cubanitos", "criollitas"],
      },
      {
        nombre: "Barras de Cereal y Granolas",
        keywords: ["barra de cereal", "granola", "barra de chocolate", "barra de maní", "quaker barra", "cereal barra"],
      },
      {
        nombre: "Tarjetas y Carga",
        keywords: ["recarga", "carga celular", "tarjeta regalo", "gift card", "tarjeta", "pin", "código recarga"],
      },
    ],
  },
  {
    nombre: "Cigarrillos y Tabaco",
    familias: [
      {
        nombre: "Cigarrillos",
        keywords: ["cigarrillo", "marlboro", "lucky strike", "camel", "philip morris", "jockey club", "paso", "derby", "atados"],
      },
      {
        nombre: "Tabaco y Accesorios",
        keywords: ["tabaco", "pipa", "papel de armar", "filtro", "encendedor", "fósforos", "cerillas"],
      },
      {
        nombre: "Cigarros",
        keywords: ["cigarro", "puro", "habano"],
      },
    ],
  },
  {
    nombre: "Varios y Misceláneos",
    familias: [
      {
        nombre: "Artículos de Librería",
        keywords: ["cuaderno", "lapicera", "bolígrafo", "lápiz", "goma", "tijera", "pegamento", "cinta adhesiva", "marcador", "resaltador"],
      },
      {
        nombre: "Pilas y Electricidad",
        keywords: ["pila", "batería", "duracell", "energizer", "cargador", "foco", "lamparita", "led"],
      },
      {
        nombre: "Medicamentos y Farmacia",
        keywords: ["ibuprofeno", "paracetamol", "aspirina", "analgésico", "antiinflamatorio", "pastilla", "comprimido", "jarabe", "vitamina"],
      },
      {
        nombre: "Mascotas",
        keywords: ["alimento perro", "alimento gato", "croquetas", "purina", "pedigree", "royal canin", "whiskas", "snack mascota", "collar", "correa"],
      },
      {
        nombre: "Productos sin Clasificar",
        keywords: [],
      },
    ],
  },
];

/**
 * Auto-classification algorithm.
 * Given a product name, returns the best matching { departamento, familia } from the taxonomy.
 * Uses keyword matching with basic normalization (lowercase, remove accents).
 */
function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
}

function sugerirClasificacion(nombreProducto) {
  if (!nombreProducto || nombreProducto.trim().length < 2) return null;

  const normalizado = normalizarTexto(nombreProducto);
  const palabras = normalizado.split(/\s+/);

  let mejorPuntaje = 0;
  let mejorDepto = null;
  let mejorFamilia = null;

  for (const depto of TAXONOMIA) {
    for (const familia of depto.familias) {
      let puntaje = 0;
      for (const kw of familia.keywords) {
        const kwNorm = normalizarTexto(kw);
        // Full phrase match scores higher
        if (normalizado.includes(kwNorm)) {
          puntaje += kwNorm.split(/\s+/).length * 2;
        } else {
          // Partial word match
          const kwWords = kwNorm.split(/\s+/);
          for (const kwWord of kwWords) {
            if (kwWord.length >= 3 && palabras.some((p) => p.startsWith(kwWord) || kwWord.startsWith(p))) {
              puntaje += 1;
            }
          }
        }
      }
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejorDepto = depto.nombre;
        mejorFamilia = familia.nombre;
      }
    }
  }

  if (mejorPuntaje === 0) return null;
  return { departamento: mejorDepto, familia: mejorFamilia, puntaje: mejorPuntaje };
}

module.exports = { TAXONOMIA, sugerirClasificacion };
