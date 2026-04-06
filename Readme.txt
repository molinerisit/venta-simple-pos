Antes de ejecutar el bat hacer:
1. Npm install
2. npx electron-rebuild -f -w sqlite3
3. Ejecutar el bat









El servidor-api se sube a Railway junto con la creacion de la base de datos postgreeslq
Documentación del Sistema de Sincronización Híbrida
Parte 1: Guía de Usuario y Puesta en Marcha
Este manual explica cómo funciona el sistema a nivel de usuario y los pasos necesarios para instalar y sincronizar una nueva computadora (un nuevo "puesto" o "sucursal").
1.1. ¿Cómo Funciona el Sistema? (Concepto "Offline-First")
Nuestra aplicación de gestión utiliza una arquitectura híbrida diseñada para ser rápida, confiable y funcional incluso sin conexión a internet.
Base de Datos Local: Cada computadora que ejecuta la aplicación tiene su propia base de datos interna (SQLite). Esto permite que todas las operaciones (crear un proveedor, registrar una venta) sean instantáneas, ya que se guardan directamente en el PC.
Base de Datos en la Nube: Todos los datos se respaldan y centralizan en una base de datos segura en la nube (PostgreSQL en Railway). Esta base de datos es la "fuente de la verdad" que contiene la información de todos los puestos.
Sincronización Automática: Cada vez que la aplicación se inicia, un "motor de sincronización" se activa automáticamente. Este proceso realiza dos tareas clave:
Envía (Push): Busca todos los cambios que se hicieron localmente desde la última conexión (nuevos datos, ediciones, eliminaciones) y los envía a la nube.
Recibe (Pull): Pregunta a la nube si hay cambios realizados por otras computadoras y los descarga, actualizando la base de datos local.
Beneficio Principal: Puedes seguir trabajando a toda velocidad si se corta el internet. Todos tus datos se guardan localmente y, en cuanto la conexión se restablezca y reinicies la aplicación, se sincronizarán automáticamente con la nube y con los demás puestos.
1.2. Paso a Paso: Puesta en Marcha de una Nueva Computadora
Para añadir un nuevo puesto de trabajo y conectarlo al sistema central, sigue estos pasos:
Requisitos Previos:
La nueva computadora debe tener acceso a internet (al menos para la primera configuración).
Tener a mano el archivo de instalación de la aplicación (el setup.exe generado por Electron).
Pasos de Instalación y Sincronización:
Instalar la Aplicación:
Ejecuta el archivo de instalación (setup.exe) en la nueva computadora y sigue los pasos del asistente.
Ejecutar la Aplicación por Primera Vez:
Una vez instalada, abre la aplicación. Es posible que veas un breve momento de carga mientras se inicializa.
En este primer arranque, ocurrirá la magia:
La aplicación detectará que es una instalación nueva.
Se conectará automáticamente a la API en la nube.
Descargará toda la información existente (usuarios, productos, proveedores, etc.) desde la base de datos central y la guardará en su nueva base de datos local.
Este proceso puede tardar unos segundos o minutos dependiendo de la cantidad de datos y la velocidad de internet.
Iniciar Sesión:
Una vez que la sincronización inicial termine, la aplicación te presentará la pantalla de Login.
Ahora puedes iniciar sesión con cualquiera de los usuarios y contraseñas que ya existen en el sistema (por ejemplo, el usuario administrador que creaste en la primera computadora).
¡Y listo! La nueva computadora está ahora completamente integrada en la red. Cualquier cambio que hagas en este puesto se sincronizará con los demás, y viceversa.
Nota Importante: La sincronización principal ocurre al iniciar la aplicación. Si se realizan cambios importantes en otro puesto mientras tienes la aplicación abierta, es recomendable reiniciarla para recibir las últimas actualizaciones.
Parte 2: Documentación Técnica
Esta sección detalla la arquitectura, los componentes y el flujo de datos del sistema. Está destinada a desarrolladores para el mantenimiento y futuras mejoras.
2.1. Arquitectura General
El sistema se compone de tres componentes principales:
Cliente (Aplicación de Escritorio):
Framework: Electron.
Lógica Principal: Node.js.
Base de Datos Local: SQLite, gestionada a través del ORM Sequelize.
Responsabilidades:
Proveer la interfaz de usuario.
Realizar todas las operaciones de lectura/escritura (CRUD) contra la base de datos SQLite local para una respuesta inmediata.
Contener el Motor de Sincronización (sync-manager.js).
Servidor (API):
Framework: Node.js con Express.
Entorno de Despliegue: Railway.
Responsabilidades:
Actuar como el único intermediario entre los clientes y la base de datos central.
Exponer endpoints seguros para la autenticación y la sincronización de datos.
Contener la lógica de negocio para resolver conflictos y validar datos.
Base de Datos Central (Nube):
Sistema Gestor: PostgreSQL.
Proveedor de Hosting: Railway.
Responsabilidades:
Ser la única fuente de la verdad (Single Source of Truth).
Almacenar de forma persistente y segura los datos consolidados de todos los clientes.
2.2. Diseño de la Base de Datos para Sincronización
Para permitir una sincronización robusta y sin conflictos, todas las tablas sincronizadas (tanto en SQLite como en PostgreSQL) implementan los siguientes patrones:
Claves Primarias UUID: Se utiliza DataTypes.UUID (con defaultValue: DataTypes.UUIDV4) como clave primaria en lugar de enteros autoincrementales. Esto garantiza que los IDs generados en diferentes clientes nunca colisionen.
Timestamps de Auditoría: La opción timestamps: true está activada en todos los modelos. Las columnas createdAt y updatedAt son cruciales para determinar el orden de los eventos y resolver conflictos (la regla por defecto es "el último cambio gana").
Eliminación Lógica (Soft Deletes): La opción paranoid: true está activada. Esto añade una columna deletedAt. Cuando un registro se elimina, no se borra de la base de datos; en su lugar, se le asigna una fecha a deletedAt. Esto permite que la "eliminación" de un registro pueda ser sincronizada con otros clientes.
2.3. Flujo de Sincronización (Detallado)
El proceso es gestionado por el módulo sync-manager.js en el cliente de Electron y se ejecuta al inicio de la aplicación.
Obtención de lastSyncTime:
(Mejora Futura) El gestor debería leer la fecha y hora de la última sincronización exitosa desde un archivo de configuración local (ej. config.json). En la implementación actual, se usa una fecha fija (2020-01-01) para garantizar que siempre se revise todo el historial.
Fase de PUSH (Cliente -> Servidor):
El cliente busca en todas sus tablas locales los registros donde updatedAt sea mayor que lastSyncTime.
Se incluyen los registros con deletedAt no nulo (eliminados lógicamente).
Se construye un array de objetos (payload). A cada objeto se le añade una propiedad tableName para que la API sepa a qué modelo pertenece.
Se realiza una petición POST al endpoint /sync/push de la API con el payload en el cuerpo.
La API recibe el array, inicia una transacción en PostgreSQL y recorre cada objeto. Usando la propiedad tableName, determina el modelo correspondiente y ejecuta un upsert. upsert es una operación que actualiza el registro si el id (UUID) ya existe, o lo inserta si es nuevo.
Fase de PULL (Servidor -> Cliente):
El cliente realiza una petición GET al endpoint /sync/pull?lastSyncTime=<fecha>.
La API busca en todas sus tablas en PostgreSQL los registros donde updatedAt sea mayor que lastSyncTime (incluyendo los paranoid).
La API construye un array con todos los registros encontrados y lo devuelve al cliente.
El cliente recibe el array, inicia una transacción en SQLite y recorre cada objeto.
Para cada registro remoto, busca si ya existe localmente por su id.
Si no existe localmente: Lo crea (Model.create()).
Si ya existe: Compara las fechas de updatedAt. Si la versión remota es más nueva que la local, la actualiza (Model.update()). Si es más antigua o igual, la ignora.
Finalización:
(Mejora Futura) Si ambas fases se completan con éxito, el gestor debería actualizar el lastSyncTime en el archivo de configuración local con la fecha y hora actual.
El estado isSyncing se libera para permitir futuras sincronizaciones.