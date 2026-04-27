1_SOFTWARE_LOCAL.md — Guía de ejecución local
Requisitos

Node.js 18 LTS o 20 LTS

npm 9+ (o pnpm 8+ / yarn 1.x)

Git

(Opcional, si hay DB) PostgreSQL 14+ o SQLite (según tu backend)

Cuenta de Mercado Pago de prueba (para endpoints de suscripción)

Estructura sugerida del repo
/ (monorepo o dos repos separados)
  /backend
  /frontend

Variables de entorno (frontend)

Crea frontend/.env (o .env.local) con:

# URL pública del backend (sin / al final)
VITE_API_URL=http://localhost:4000

# Opcionales de UI/negocio
VITE_PRICE_SINGLE=2999
VITE_PRICE_MULTI=4499
VITE_CURRENCY=ARS


Notas:

En el código vimos también VITE_API_BASE en algunos componentes antiguos. Unifica todo a VITE_API_URL (ya lo hace src/api.js).

No pongas / al final de VITE_API_URL (el código ya limpia duplicados).

Variables de entorno (backend)

Dependen de tu implementación real. Base mínima:

PORT=4000
# Si usás JWT:
JWT_SECRET=un-secreto-seguro

# DB (ejemplos)
DATABASE_URL=postgres://user:pass@localhost:5432/ventasimple
# o
SQLITE_PATH=./data.sqlite

# Mercado Pago (sandbox)
MP_ACCESS_TOKEN=TEST-...
MP_WEBHOOK_SECRET=alguno-si-lo-usás
MP_PUBLIC_KEY=TEST-...
APP_BASE_URL=http://localhost:5173   # para redirecciones, si aplica

Instalación y arranque (frontend)
cd frontend
npm install
npm run dev


Vite abre en http://localhost:5173

El frontend espera el backend en http://localhost:4000

Instalación y arranque (backend)
cd backend
npm install
npm run dev


Servirá en http://localhost:4000

Si usás DB: crea la base y corre migraciones/seed (npm run db:migrate, npm run db:seed), según tu stack.

Rutas/Secciones principales del frontend

/auth: Login/Registro

/dashboard: Panel (licencia, dispositivos, atajos de datos)

/data: Datos & Retención (perfil del negocio, retención, tablas, exportes, estadísticas, cámaras IA)

/account: Suscripción y facturación (pausar/reanudar/cancelar, cambiar medio de pago)

/return: handler de retorno post-checkout (auto‐refresh de licencia y redirección a dashboard)

Endpoints que consume el frontend (del backend)

Según src/api.js:

Auth: POST /login, POST /register

Licencias: GET /license, POST /license/refresh, POST /license/devices/attach, POST /license/devices/detach

Suscripciones (Mercado Pago):
POST /subscribe, POST /subscription/cancel, POST /subscription/pause, POST /subscription/resume, POST /subscription/change-method

Negocio: GET/POST /business/profile

Retención/Limpieza: GET/POST /retention/settings, POST /retention/run

Tablas: GET /data/tables, GET /data/tables/:name, POST /data/tables/:name/vacuum, POST /data/tables/:name/truncate

Exportes: POST /data/export, GET /data/export, GET /data/export/:id

Estadísticas:
GET /stats/summary?from&to
GET /stats/top-products?from&to&limit
GET /stats/category-leaders?from&to
GET /stats/sales-series?from&to&bucket

Cámaras IA (beta):
POST /ai/request-activation
GET /ai/cameras, POST /ai/cameras, PATCH /ai/cameras/:id, POST /ai/cameras/:id/toggle, POST /ai/cameras/:id/test, DELETE /ai/cameras/:id
GET /ai/events?cameraId&type&limit

Flujo de prueba local

Levantá backend en :4000 y frontend en :5173.

Registrate en /auth → debería loguear y redirigir a /dashboard.

En /dashboard, probá:

Refrescar licencia (simulada/inactiva al principio).

Vincular dispositivo (usa localStorage/UA).

Atajos: ir a /data, “Vista previa de limpieza”, “Exportar ahora (PDF)”.

En /data, probá:

Guardar perfil del negocio.

Ajustar retención.

Listar/optimizar/vaciar tablas (si el backend lo soporta).

Crear exportes y ver su lista/estado.

Cambiar rango y ver estadísticas (Recharts).

Cámaras IA: activar (solicitud), alta de cámara de prueba y listar eventos (si backend tiene mocks).

2_BACKEND_EN_LÍNEA.md — Deploy del backend (API)

Esta guía asume Node.js + un servicio de hosting (ej. Render, Fly.io, Railway, Heroku, VPS). Ajustá comandos a tu proveedor.

Checklist previo

Revisión de CORS: permitir origen del frontend productivo (ej. https://app.tudominio.com)

HTTPS en producción

Variables de entorno seguras

Logs y manejo de errores

Webhooks de Mercado Pago (si aplican)

Migraciones de DB automatizadas en el deploy

Variables de entorno (producción)

Configuralas en tu proveedor:

NODE_ENV=production
PORT=4000

# Auth
JWT_SECRET=<secreto-fuerte>

# DB
DATABASE_URL=postgres://user:pass@host:5432/dbname
# o
SQLITE_PATH=/var/data/data.sqlite

# Mercado Pago
MP_ACCESS_TOKEN=PROD-...
MP_PUBLIC_KEY=PROD-...
MP_WEBHOOK_SECRET=<si utilizás webhooks>

# App
APP_BASE_URL=https://app.tudominio.com
FRONTEND_URL=https://app.tudominio.com

CORS

Configura CORS para:

origin: FRONTEND_URL

methods: GET,POST,PATCH,DELETE,OPTIONS

credentials: false (si no usás cookies)

Pasos de deploy (ejemplo Render / Railway)

Crear servicio “Web Service” desde tu repo backend/.

Build command:

npm install
npm run build   # si tenés build step (TypeScript, etc). Si es JS puro, omití.


Start command:

npm start


Configurar variables de entorno (ver arriba).

(Opcional) Disk/Volume si usás SQLite.

Conectar dominio api.tudominio.com (o usar el host del proveedor).

Webhooks de Mercado Pago (opcional)

Endpoint típico: POST /webhooks/mp

Verificá X-Hub-Signature o firma configurable, y compara con MP_WEBHOOK_SECRET.

Actualizá estado de suscripción y license.status según eventos authorized, paused, cancelled, etc.

Asegurá reintentos idempotentes.

Seguridad y límites

Rate limiting (ej. 60 req/min por token/IP)

Validación de payloads (zod/joi/Celeb)

Sanitización de entrada a SQL

Logs estructurados (pino/winston)

Monitoreo: healthcheck GET /health y métricas si usás Prometheus

Migraciones

Ejecutá migraciones en cada release (ej. npm run db:migrate).

Semillas mínimas si el sistema lo requiere (roles, flags).

Smoke test post-deploy

GET /health → 200

POST /login con usuario de prueba → 200

GET /license con token → 200

POST /data/export → 202/200 y aparece en GET /data/export

Revisa CORS desde la app productiva

3_FRONTEND_EN_LÍNEA.md — Deploy del frontend (Vite + React)

Podés usar Netlify, Vercel, Cloudflare Pages o S3+CloudFront. Ejemplo con Vercel y Netlify.

Variables de entorno (build)

En tu proveedor:

VITE_API_URL=https://api.tudominio.com
VITE_PRICE_SINGLE=2999
VITE_PRICE_MULTI=4499
VITE_CURRENCY=ARS


Importante: en Vite, VITE_* se inyecta en build. Si cambiás el endpoint luego, necesitás un rebuild.

Deploy con Vercel

Importá el repo frontend/.

Framework preset: Vite.

Build command: npm run build

Output dir: dist

Variables de entorno: (ver arriba).

Rewrites para SPA (opcional si Vercel no las pone solo):

Source: /(.*) → Destination: /index.html (excepto assets).

Dominios:

Producción: app.tudominio.com

Preview: auto por PR.

Deploy con Netlify

New site → Import from Git.

Build command: npm run build

Publish directory: dist

Env vars: (ver arriba)

_redirects (para SPA):

/* /index.html 200

Comandos
npm install
npm run build
npm run preview  # prueba local de build en :4173

Rutas SPA y 404

Asegurate de redirigir a index.html para rutas internas (/dashboard, /data, etc.) en el proveedor (rewrites).

Integraciones y librerías usadas

React Router (rutas SPA)

Recharts (gráficos en /data#stats)

Vite (build)

Fetch API (consumo de backend via src/api.js)

LocalStorage (token y user)

Clipboard API (copiar token)

Mercado Pago (redirecciones a init_point devuelto por backend en /subscribe y change-method)

CSS: estilos globales en src/index.css + estilos inline en vistas

Páginas clave

src/routes/Auth.jsx — registro/login

src/routes/Dashboard.jsx — licencia, dispositivos, atajos de datos

src/routes/Account.jsx — suscripción y facturación

src/routes/DataAdmin.jsx — perfil de negocio, retención/limpieza, tablas, exportes, estadísticas, cámaras IA

src/App.jsx — rutas y protección

src/api.js — cliente HTTP (todas las rutas del backend)

src/components/* — UI (Toast, SubscribeModal, etc.)

Pruebas post-deploy (front)

Abrí https://app.tudominio.com

Flujo /auth → login/registro → /dashboard

Botones hacia /data, /data#stats, /account

CORS OK (no debe haber errores de Access-Control-Allow-Origin)

Acciones:

Vista previa de limpieza (si backend lo soporta)

Exportar ahora (PDF) y ver en “Exportaciones”

Vincular/desvincular dispositivo

Cambio/alta de plan: abrir checkout de MP vía init_point

Apéndice — Notas de calidad y estilo (lo que mejoramos)

Panel estadísticas & gestión: incorporado en /data con:

Resumen (monto total, tickets, ticket promedio, unidades)

Series por day|week|month

Top productos (barras)

Participación por categoría (pie)

Exportes (PDF/CSV), retención y limpieza (preview/ejecución)

Gestión de tablas (vacuum/truncate)

Cámaras IA (beta): alta, toggle, prueba y eventos

Estilo visual: tarjetas oscuras, tipografía legible, chips, botones consistentes, layout responsive, toasts para feedback.

UX: accesos directos desde el dashboard a secciones de datos/estadísticas; modales/avisos claros para Mercado Pago y retención.

Si querés, te los entrego como 3 archivos separados con nombres exactos para copiar al repo (docs/1_SOFTWARE_LOCAL.md, docs/2_BACKEND_EN_LINEA.md, docs/3_FRONTEND_EN_LINEA.md).

# Guía de ejecución local (Software local)

## Requisitos
- Node.js 18 LTS o 20 LTS
- npm 9+ (o pnpm 8+ / yarn 1.x)
- Git
- (Opcional) PostgreSQL 14+ o SQLite (según backend)
- Cuenta de prueba de Mercado Pago (para checkout de suscripciones)

## Estructura sugerida


/ (monorepo o dos repos)
/backend
/frontend


## Variables de entorno (frontend)
Crea `frontend/.env`:

URL pública del backend (sin / final)

VITE_API_URL=http://localhost:4000

Opcionales UI/negocio

VITE_PRICE_SINGLE=2999
VITE_PRICE_MULTI=4499
VITE_CURRENCY=ARS

> El front usa `VITE_API_URL` (ver `src/api.js`). No agregues “/” al final.

## Variables de entorno (backend)
(ajusta a tu stack real)


PORT=4000
NODE_ENV=development

Auth (si usás JWT)

JWT_SECRET=un-secreto-seguro

DB

DATABASE_URL=postgres://user:pass@localhost:5432/ventasimple

o

SQLITE_PATH=./data.sqlite

Mercado Pago (sandbox)

MP_ACCESS_TOKEN=TEST-...
MP_PUBLIC_KEY=TEST-...
MP_WEBHOOK_SECRET=opcional
APP_BASE_URL=http://localhost:5173

FRONTEND_URL=http://localhost:5173


## Instalar y correr FRONTEND
```bash
cd frontend
npm install
npm run dev
# http://localhost:5173

Instalar y correr BACKEND
cd backend
npm install
# si hay migraciones/seed:
# npm run db:migrate && npm run db:seed
npm run dev
# http://localhost:4000

Rutas/Secciones del frontend

/auth — login/registro

/dashboard — licencias, dispositivos, atajos de datos

/data — Perfil, Retención, Tablas, Exportes, Estadísticas, Cámaras IA

/account — suscripción/facturación (pausa, reanuda, cancela, cambio medio de pago)

/return — handler de retorno post-checkout (refresh licencia + redirect a dashboard)

Endpoints consumidos por el frontend

(Ver src/api.js)

Auth: POST /login, POST /register

Licencias: GET /license, POST /license/refresh, POST /license/devices/attach, POST /license/devices/detach

Suscripciones MP: POST /subscribe, POST /subscription/cancel, POST /subscription/pause, POST /subscription/resume, POST /subscription/change-method

Negocio: GET/POST /business/profile

Retención/Limpieza: GET/POST /retention/settings, POST /retention/run

Tablas: GET /data/tables, GET /data/tables/:name, POST /data/tables/:name/vacuum, POST /data/tables/:name/truncate

Exportes: POST /data/export, GET /data/export, GET /data/export/:id

Estadísticas: GET /stats/summary, GET /stats/top-products, GET /stats/category-leaders, GET /stats/sales-series

Cámaras IA: POST /ai/request-activation, GET/POST/PATCH/DELETE /ai/cameras..., GET /ai/events

Flujo de prueba local

Levantá backend :4000 y frontend :5173.

Registrate en /auth → redirige a /dashboard.

En /dashboard probá “Refrescar”, vincular dispositivo, atajos hacia /data y exportes.

En /data actualizá Perfil, Retención, Tablas, Exportes, Estadísticas y (si aplica) Cámaras IA.

Notas de calidad/UX implementadas

Panel de estadísticas con resumen, series (día/semana/mes), top productos y pie de categorías.

Gestión de retención (preview/ejecución) y exportes PDF/CSV.

Gestión de tablas (vacuum/truncate).

Cámaras IA (beta): alta, toggle, prueba, eventos.

Estilos oscuros, tarjetas, toasts, accesos rápidos desde el dashboard.


---

### `docs/2_BACKEND_EN_LINEA.md`
```markdown
# Deploy del backend (API en línea)

Esta guía asume Node.js en Render/Fly/Railway/Heroku o VPS. Ajusta comandos a tu proveedor.

## Checklist previo
- CORS: permitir origen del frontend productivo
- HTTPS activo
- Variables de entorno seguras (no comitear .env)
- Migraciones de DB automatizadas
- Webhooks Mercado Pago (si aplican) con verificación de firma
- Healthcheck y logs

## Variables de entorno (producción)


NODE_ENV=production
PORT=4000

Auth

JWT_SECRET=<secreto-fuerte>

DB

DATABASE_URL=postgres://user:pass@host:5432/dbname

o

SQLITE_PATH=/var/data/data.sqlite

Mercado Pago

MP_ACCESS_TOKEN=PROD-...
MP_PUBLIC_KEY=PROD-...
MP_WEBHOOK_SECRET=<si usás webhooks>

App

APP_BASE_URL=https://app.tudominio.com

FRONTEND_URL=https://app.tudominio.com


## CORS
- `origin: FRONTEND_URL`
- `methods: GET,POST,PATCH,DELETE,OPTIONS`
- `credentials: false` (si no usás cookies)

## Pasos típicos de deploy (ej. Render)
1. Crear **Web Service** desde `/backend`.
2. Build command:
   ```bash
   npm install
   npm run build   # si tenés TypeScript u otro paso. Si no, omití.


Start command:

npm start


Setear variables de entorno (arriba).

(Opcional SQLite) Añadir volume persistente.

Conectar dominio api.tudominio.com o usar el host del proveedor.

Webhooks Mercado Pago (opcional)

Endpoint típico: POST /webhooks/mp.

Valida firma/headers (MP_WEBHOOK_SECRET o el método que elijas).

Actualiza estado de suscripción/licencia (authorized, paused, cancelled, etc.).

Reintentos idempotentes.

Seguridad

Rate limiting (por IP/token).

Validación de payloads (zod/joi).

Sanitización para SQL.

Logs estructurados (pino/winston).

Healthcheck GET /health (200) y métricas (opcional).

Migraciones

Ejecutar en cada release:

npm run db:migrate
# opcional
npm run db:seed

Smoke test post-deploy

GET /health → 200

POST /login con usuario de prueba → 200

GET /license con token → 200

POST /data/export → 200/202 y aparece en GET /data/export

Verificar CORS desde el frontend productivo


---

### `docs/3_FRONTEND_EN_LINEA.md`
```markdown
# Deploy del frontend (React + Vite)

Recomendado: Vercel, Netlify o Cloudflare Pages. Aquí Vercel/Netlify.

## Variables de entorno en build


VITE_API_URL=https://api.tudominio.com

VITE_PRICE_SINGLE=2999
VITE_PRICE_MULTI=4499
VITE_CURRENCY=ARS

> En Vite, las `VITE_*` se inyectan en build. Si cambiás endpoints, hacé rebuild.

## Vercel
1. Importar repo `frontend/`.
2. Framework: **Vite**.
3. Build command: `npm run build`
4. Output dir: `dist`
5. Env vars: (arriba).
6. Rewrites SPA (si hace falta):
   - Source: `/(.*)` → Destination: `/index.html`
7. Dominios:
   - Prod: `app.tudominio.com`
   - Preview por PR: automático

## Netlify
1. New site → Import from Git.
2. Build: `npm run build`
3. Publish: `dist`
4. Env vars: (arriba)
5. `_redirects`:


/* /index.html 200


## Comandos locales
```bash
npm install
npm run build
npm run preview   # http://localhost:4173

SPA y rutas

Asegurá rewrites a index.html para rutas internas (/dashboard, /data, /account, etc.).

Páginas/archivos clave

src/routes/Auth.jsx — registro/login

src/routes/Dashboard.jsx — licencias, dispositivos, atajos de datos

src/routes/Account.jsx — suscripción/facturación

src/routes/DataAdmin.jsx — Perfil, Retención, Tablas, Exportes, Estadísticas, Cámaras IA

src/App.jsx — rutas y protección

src/api.js — cliente HTTP al backend

src/components/* — Toast, SubscribeModal, etc.

src/index.css — estilos globales

Pruebas post-deploy

Abrir https://app.tudominio.com

Flujo /auth → login/registro → /dashboard

Ir a /data y /data#stats y /account

Verificar CORS (sin errores en la consola)

Probar:

“Vista previa de limpieza”

“Exportar ahora (PDF)” y ver lista en “Exportaciones”

Vincular/desvincular dispositivo

Checkout MP desde “Suscribirme” (devuelve init_point del backend)

---

## AUDITORÍA DE SEGURIDAD — Sistema de Licencias (2026-04-27)

### Arquitectura del sistema

| Componente | Descripción |
|---|---|
| `vs-license.json` | Archivo local en `userData/` con `{ plan, tenant_id, email, token, licencia, api_url }` |
| `/api/auth/activate-license` | Primer arranque: valida clave + credenciales, vincula licencia al tenant |
| `/api/auth/desktop-callback` | Canjea token de deep link, devuelve sesión completa |
| `/api/auth/validate-session` | Valida JWT + plan contra DB al sincronizar |
| `handleDeepLink()` | Procesa `ventasimple://activate?token=...` en el proceso main |

### Vectores analizados y resultado

#### 1. Edición manual de `vs-license.json` (plan spoofing)
**Ataque**: editar `plan: “FREE”` → `plan: “ENTERPRISE”` directamente en disco.
**Impacto real**: solo cosmético — oculta el banner de prueba y muestra badge “ENTERPRISE” en la UI. Las feature flags (`lotes`, `remoto`, `ofertas`) vienen del servidor y se validan con JWT, por lo que no se habilitan.
**Mitigación existente**: `validate-session` consulta la DB en cada sincronización y revierte el plan mostrado si difiere.

#### 2. `api_url` arbitraria en license file → redirección de deep link a servidor falso
**Ataque**: editar `api_url: “https://attacker.com”` + triggear `ventasimple://activate?token=x`. El deep link llama al servidor falso que devuelve `{ plan: “ENTERPRISE”, token: “fake” }`.
**Impacto potencial**: plan local “ENTERPRISE” + token inválido (el falso no lo firma el SECRET_KEY real, así que `validate-session` lo rechaza).
**Fix aplicado** (`license-handlers.js`): el deep link ahora siempre usa la constante hardcodeada `CLOUD_API`, ignorando `api_url` del archivo.

```js
// ANTES (vulnerable):
const apiUrl = (readLicense()?.api_url || CLOUD_API).replace(/\/$/, '');
// DESPUÉS (seguro):
const apiUrl = CLOUD_API.replace(/\/$/, '');
```

#### 3. IPC `save-license` sin validación de entrada
**Ataque**: código renderer (ej. extensión de devtools) llama `window.electronAPI.invoke('save-license', { plan: 'ENTERPRISE', api_url: 'https://attacker.com' })`.
**Mitigación existente**: CSP `default-src 'self' 'unsafe-inline'` bloquea scripts externos; el renderer es HTML local.
**Fix aplicado** (`license-handlers.js`): se valida que `plan` sea uno de `['FREE','BASIC','PRO','ENTERPRISE']` y `api_url` se pina a `CLOUD_API` siempre.

```js
const VALID_PLANS = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'];
if (data.plan && !VALID_PLANS.includes(String(data.plan).toUpperCase()))
  return { ok: false, error: 'Plan inválido' };
const sanitized = { ...data, api_url: CLOUD_API };
```

#### 4. Fuerza bruta de claves de licencia
**Ataque**: automatizar peticiones a `/api/auth/activate-license` con claves aleatorias.
**Espacio de claves**: `VSTX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}` = 36^12 ≈ 4.7 billones de combinaciones. Imposible por fuerza bruta exhaustiva, pero un atacante con muchas IPs podría intentar claves conocidas (leaks).
**Fix aplicado** (`licencias.py`): añadido `@limiter.limit(“5/minute”)` en `activate_license` (igual que `/login`).

#### 5. Degradación de plan con clave FREE
**Ataque**: un usuario PRO usa una clave FREE para “reactivar” → plan se degrada a FREE en la DB.
**Escenario**: reinstalación del desktop en otra máquina con una clave FREE sobrante.
**Fix aplicado** (`licencias.py`): solo se actualiza el plan si la nueva licencia tiene igual o mayor rango.

```python
PLAN_RANK = {“FREE”: 0, “BASIC”: 1, “PRO”: 2, “ENTERPRISE”: 3}
if PLAN_RANK[new_plan] >= PLAN_RANK[current_plan]:
    # actualizar plan
else:
    # solo marcar email_verified = TRUE, no tocar el plan
```

#### 6. Token JWT en disco (robo de sesión)
**Ataque**: acceso físico o malware extrae `vs-license.json` y usa el `token` para llamar a la API.
**Mitigación existente**: el JWT expira según `access_token_expire_minutes` (configurado en Railway). El tenant puede ser suspendido desde el panel admin, lo que invalida la sesión en `validate-session`.
**Recomendación pendiente**: reducir `access_token_expire_minutes` a ≤ 60 min para desktop, o implementar refresh tokens.

#### 7. Licencia ACTIVA reutilizada en otra cuenta
**Ataque**: usar la clave de otra persona para vincularla a tu cuenta.
**Mitigación existente** (`licencias.py`):
```python
if lic[“estado”] == “ACTIVA” and lic[“tenant_id”]:
    owner = db.execute(“SELECT email FROM tenants WHERE id = :id”, ...).fetchone()
    if not owner or owner[0] != body.email:
        raise HTTPException(409, “Esta licencia ya está en uso por otra cuenta.”)
```

#### 8. Deep link token replay
**Ataque**: interceptar un deep link `ventasimple://activate?token=X` y reutilizarlo.
**Mitigación existente**: el token es un JWT con `type: “desktop_activation”` y expiración. Una vez canjeado, `desktop_callback` genera un nuevo `session_token`; el `desktop_activation` original sigue siendo válido hasta expirar pero al re-canjearse solo regenera la misma sesión (idempotente).
**Recomendación pendiente**: marcar el `desktop_activation` token como usado en DB (one-time token) para prevenir replay dentro de la ventana de expiración.

### Resumen de cambios aplicados

| Archivo | Cambio |
|---|---|
| `src/ipc-handlers/license-handlers.js` | `api_url` pinado a `CLOUD_API` en deep link; validación de `plan` y `api_url` en `save-license` |
| `backend-py/app/routers/licencias.py` | Rate limiting 5/min en `activate-license`; protección contra degradación de plan |

### Pruebas realizadas

1. Editar `vs-license.json` → `plan: “ENTERPRISE”`, `api_url: “https://evil.com”` → triggear deep link → confirmar que el proceso main llama a `CLOUD_API` (no al servidor falso).
2. Llamar `save-license` con `plan: “HACKED”` → devuelve `{ ok: false, error: “Plan inválido” }`.
3. Llamar `save-license` con `api_url: “https://evil.com”` → archivo escrito con `api_url: “https://api.ventasimple.cloud”`.
4. Intentar activar licencia ACTIVA de otro email → `409 Esta licencia ya está en uso por otra cuenta`.
5. Activar licencia FREE sobre cuenta PRO → plan mantiene PRO en DB.