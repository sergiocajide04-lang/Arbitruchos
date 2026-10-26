# REFRUN · Reto de árbitros

Aplicación web progresiva (PWA) privada para un grupo de árbitros de hockey sobre patines:
**los goles del primer partido del fin de semana se convierten en los kilómetros que cada
árbitro debe correr esa semana**. Registra partidos y entrenamientos (con lectura automática
de capturas de Strava, Apple Fitness o máquinas de gimnasio), calcula objetivos y
cumplimiento, y muestra clasificación y estadísticas de toda la temporada.

- **Frontend:** React 19 + TypeScript estricto + Vite 6 + Tailwind CSS, PWA (vite-plugin-pwa).
- **Backend:** Supabase (PostgreSQL + Auth + Row Level Security + Realtime). Sin servidor propio.
- **OCR:** Tesseract.js ejecutado en el navegador. **Las capturas nunca se suben ni se guardan.**
- **Publicación:** GitHub Pages mediante GitHub Actions (alternativas: Cloudflare Pages, Netlify).
- **Coste:** 0 € dentro de los límites gratuitos de GitHub y Supabase.

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Instalación local](#2-instalación-local)
3. [Comandos de desarrollo](#3-comandos-de-desarrollo)
4. [Configuración de Supabase](#4-configuración-de-supabase)
5. [Ejecución de migraciones](#5-ejecución-de-migraciones)
6. [Creación del primer usuario (administrador)](#6-creación-del-primer-usuario-administrador)
7. [Configuración del grupo](#7-configuración-del-grupo)
8. [Pruebas](#8-pruebas)
9. [Publicación](#9-publicación)
10. [Instalación de la PWA en el móvil](#10-instalación-de-la-pwa-en-el-móvil)
11. [Actualización de versiones](#11-actualización-de-versiones)
12. [Copias de seguridad y exportación](#12-copias-de-seguridad-y-exportación)
13. [Límites y costes del plan gratuito](#13-límites-y-costes-del-plan-gratuito)
14. [Solución de problemas frecuentes](#14-solución-de-problemas-frecuentes)
15. [Reglas de cálculo](#15-reglas-de-cálculo)
16. [Arquitectura y estructura](#16-arquitectura-y-estructura)
17. [Seguridad y privacidad](#17-seguridad-y-privacidad)
18. [OCR: funcionamiento y límites](#18-ocr-funcionamiento-y-límites)

---

## 1. Requisitos

- **Node.js 20 o superior** (probado con Node 22 y 24) y npm.
- Una cuenta gratuita de **Supabase** (https://supabase.com).
- Una cuenta de **GitHub** para publicar (o Cloudflare Pages / Netlify).
- Navegador moderno. En iPhone, iOS 16.4+ recomendado para la experiencia PWA completa.

## 2. Instalación local

```bash
npm install
cp .env.example .env.local     # en Windows: copy .env.example .env.local
```

Edita `.env.local` con los datos **públicos** de tu proyecto de Supabase (ver §4):

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
VITE_BASE=/
```

> Si tu proyecto usa las claves antiguas, puedes poner la clave **anon public** (`eyJ…`) en
> `VITE_SUPABASE_PUBLISHABLE_KEY` (o en `VITE_SUPABASE_ANON_KEY`). **Nunca** uses la clave
> secreta (`sb_secret_…`) ni la `service_role`: el build falla si detecta una en el bundle.

Sin estas variables la app arranca mostrando una pantalla «Falta configurar la conexión».

## 3. Comandos de desarrollo

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 |
| `npm run build` | Copia los recursos OCR, comprueba tipos y genera `dist/` (incluye `404.html` para GitHub Pages) |
| `npm run preview` | Sirve el build de producción localmente (con service worker) |
| `npm test` | Pruebas unitarias, de interfaz y de seguridad de la base de datos |
| `npm run test:ocr` | Pruebas de integración del OCR con Tesseract.js real |
| `npm run lint` / `npm run typecheck` | ESLint y TypeScript estricto |
| `npm run check:secrets` | Busca claves privadas en `dist/` |
| `npm run verify` | Todo lo anterior en cadena |
| `npm run icons` | Regenera favicon, iconos PWA y pantallas de inicio desde `src/config/brand.json` |
| `npm run dev:visual` | Arnés visual con datos sintéticos, sin Supabase (http://localhost:5199/?ruta=/clasificacion). Solo desarrollo |

## 4. Configuración de Supabase

1. Crea un proyecto en https://supabase.com/dashboard (región cercana, p. ej. *West EU*).
2. **Project Settings → Data API**: copia la *Project URL* → `VITE_SUPABASE_URL`.
3. **Project Settings → API Keys**: copia la *Publishable key* → `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. **Authentication → Sign In / Providers → Email**: deja activado *Email*, activa
   *Confirm email* y fija una longitud mínima de contraseña de 8.
5. **Authentication → URL Configuration**:
   - *Site URL*: la URL pública, p. ej. `https://TU_USUARIO.github.io/NOMBRE_REPO/`
   - *Redirect URLs*: añade `https://TU_USUARIO.github.io/NOMBRE_REPO/**` y
     `http://localhost:5173/**` (y `http://localhost:4173/**` si usas `npm run preview`).
6. (Recomendado) **Authentication → Emails**: el servidor de correo incluido tiene un límite
   muy bajo de envíos por hora. Para un grupo pequeño suele bastar; si no, configura un SMTP
   propio gratuito (p. ej. Brevo o Resend).

Realtime queda configurado por las migraciones (tablas `matches`, `workouts`, `group_members`).

## 5. Ejecución de migraciones

Las migraciones están en `supabase/migrations/` y deben aplicarse **en orden**:

1. `20261025120000_schema.sql` – tablas, tipos y restricciones.
2. `20261025120100_logic.sql` – funciones, triggers de integridad, auditoría y RPC.
3. `20261025120200_security.sql` – privilegios, RLS y Realtime.

**Opción A – Editor SQL (la más sencilla):** en el panel de Supabase abre *SQL Editor*,
pega el contenido de cada archivo y ejecútalo, uno tras otro.

**Opción B – Supabase CLI:**

```bash
npx supabase login
npx supabase init            # solo si te lo pide; no toca supabase/migrations
npx supabase link --project-ref TU_REF
npx supabase db push
```

Las mismas migraciones se prueban automáticamente contra PostgreSQL real (PGlite) en `npm test`.

## 6. Creación del primer usuario (administrador)

No hay usuarios ni contraseñas predeterminados. El primer administrador se crea así:

1. Abre la app publicada (o `npm run dev`) y pulsa **Crear cuenta**.
2. Confirma el correo con el enlace recibido y entra.
3. En la pantalla de bienvenida elige **Crear un grupo nuevo**: pasas a ser su **propietario**.
4. **Cierra la creación de grupos** para que nadie más pueda crear grupos en tu instalación.
   En el *SQL Editor* de Supabase:

   ```sql
   update public.app_settings set allow_group_creation = false;
   ```

> Alternativa: crea el usuario en *Authentication → Users → Add user* (con *Auto Confirm*)
> y continúa desde el paso 3. Cualquier persona que se registre por su cuenta **no ve ningún
> dato**: solo accede a un grupo si canjea una invitación válida.

## 7. Configuración del grupo

1. **Temporada** (menú → Temporada → Nueva): nombre, fechas de inicio y fin, zona horaria,
   estado *Activa*, metodología de cumplimiento (por defecto *Acumulado de temporada*), actividades que computan (por defecto
   *Carrera* y *Cinta*) y si los registros manuales requieren revisión.
2. **Invitaciones** (menú → Miembros → Invitar): genera un código (`ABCDE-12345`) con número
   de usos y caducidad. Compártelo o comparte el enlace `…/unirse?codigo=…`. El código solo se
   muestra una vez; en la base de datos se guarda su hash.
3. Roles: el **propietario** gestiona administradores; los **administradores** gestionan
   temporadas, invitaciones, miembros, correcciones de partidos y moderación de entrenamientos;
   los **miembros** registran sus partidos y entrenamientos. Desactivar a un miembro le retira el
   acceso sin borrar su historial. No hay límite de miembros.

## 8. Pruebas

```bash
npm test          # 140 pruebas: cálculo, OCR (análisis), formularios, interfaz y seguridad RLS
npm run test:ocr  # 3 pruebas de OCR real con Tesseract.js sobre capturas sintéticas
```

- **Seguridad (tests/db):** aplican las migraciones a un PostgreSQL real (PGlite) con los roles
  de Supabase simulados y verifican aislamiento entre grupos, imposibilidad de registrar
  entrenamientos ajenos, cambios de reglas por no administradores, auditoría, etc.
- **Interfaz (tests/ui):** React Testing Library con la capa de datos simulada.
- **OCR (tests/ocr-integration):** capturas generadas con `node scripts/generate-ocr-fixtures.mjs`
  (datos inventados, sin información personal).
- `npm run check:secrets` comprueba que no hay claves privadas en el bundle.

## 9. Publicación

### GitHub Pages (recomendado)

1. Crea un repositorio y sube el proyecto:
   ```bash
   git init && git add . && git commit -m "REFRUN v1"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/NOMBRE_REPO.git
   git push -u origin main
   ```
   > GitHub Pages es gratuito en repositorios **públicos**. En repositorios privados requiere un
   > plan de pago; en ese caso usa Cloudflare Pages o Netlify. Publicar el código no expone datos:
   > el repositorio no contiene secretos y los datos están protegidos por RLS.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables** (son valores públicos, no secretos):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - (opcional) `PAGES_BASE` = `/` si usas un dominio propio.
4. Haz *push* a `main`. El workflow `.github/workflows/deploy.yml` ejecuta lint, tipos, pruebas,
   build y búsqueda de secretos, y publica en `https://TU_USUARIO.github.io/NOMBRE_REPO/`.
5. Añade esa URL en Supabase (§4, paso 5).

La ruta base, el manifiesto, el service worker y el `404.html` (para que funcionen las URL
profundas) se ajustan automáticamente al nombre del repositorio.

### Cloudflare Pages

*Workers & Pages → Create → Pages → Connect to Git*. Build command `npm run build`, output
`dist`, variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_BASE=/` y
`NODE_VERSION=22`. El archivo `public/_redirects` resuelve las rutas de la SPA.

### Netlify

*Add new site → Import from Git*. Build command `npm run build`, publish directory `dist`,
mismas variables (`VITE_BASE=/`). También usa `public/_redirects`.

## 10. Instalación de la PWA en el móvil

Tras entrar, la app muestra la tarjeta **«Lleva REFRUN contigo»** con instrucciones (se puede
cerrar; con «No volver a mostrar» no reaparece en ese navegador, y se puede reactivar en Ajustes).

- **iPhone:** abre la URL en Safari → botón *Compartir* → *Añadir a pantalla de inicio*.
- **Android:** en Chrome, botón *Instalar* de la tarjeta (si el navegador lo ofrece) o menú ⋮ →
  *Instalar aplicación* / *Añadir a pantalla de inicio*.

Las instrucciones están siempre disponibles en **Ajustes** y **Ayuda**.

## 11. Actualización de versiones

- Cada *push* a `main` publica una nueva versión. Los usuarios ven el aviso **«Hay una nueva
  versión»** y la activan con *Actualizar* (recarga completa, sin mezclar archivos de versiones).
- Cambios de base de datos: añade **nuevas** migraciones con fecha posterior (nunca edites las ya
  aplicadas) y ejecútalas antes de publicar el frontend que las necesite.
- Dependencias: `npm outdated`, actualiza con cuidado y ejecuta `npm run verify`.

## 12. Copias de seguridad y exportación

- **Desde la app:** menú → Temporada → *Exportar CSV* (clasificación, partidos y entrenamientos)
  o *Exportar JSON*. Cualquier miembro puede exportar los datos de su grupo.
- **Base de datos completa:** el plan gratuito no ofrece copias descargables. Haz volcados
  periódicos con la cadena de conexión (Project Settings → Database):
  ```bash
  npx supabase db dump --db-url "postgresql://…" -f backup-esquema.sql
  npx supabase db dump --db-url "postgresql://…" --data-only -f backup-datos.sql
  ```
  Guarda esos archivos en un lugar privado: contienen datos personales.
- Política de conservación: partidos y entrenamientos no se borran en cascada; cada alta,
  edición o borrado queda en `audit_events` con la instantánea anterior.

## 13. Límites y costes del plan gratuito

Los límites cambian con el tiempo; consulta siempre las páginas oficiales de precios.

- **Supabase Free:** base de datos pequeña (del orden de 500 MB, sobrada para este uso),
  número limitado de proyectos activos, **pausa del proyecto tras una semana sin actividad**
  (se reactiva manualmente desde el panel), sin copias descargables ni recuperación a un punto en
  el tiempo, límite bajo de correos con el SMTP incluido y sin garantía de disponibilidad (SLA).
  El workflow opcional `supabase-keepalive.yml` (se activa con la variable
  `SUPABASE_KEEPALIVE=true`) hace una petición ligera cada 3 días; no garantiza evitar la pausa.
- **GitHub Pages:** gratuito para repositorios públicos, con límites de tamaño y ancho de banda
  amplios para este uso. Sin garantía de disponibilidad.
- La app no usa servicios de pago, analítica ni CDNs de terceros (fuentes y OCR van en el bundle).

## 14. Solución de problemas frecuentes

| Problema | Solución |
|---|---|
| Pantalla «Falta configurar la conexión» | Faltan `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local` o en las variables del repositorio. |
| El enlace del correo lleva a una página en blanco o a localhost | Revisa *Site URL* y *Redirect URLs* en Supabase (§4). |
| «Correo o contraseña incorrectos» justo tras registrarse | Confirma primero el correo. |
| No llegan los correos | Límite del SMTP incluido: espera o configura un SMTP propio. Revisa spam. |
| «Código de invitación no válido o caducado» | El código caducó, se agotaron sus usos o fue revocado. Pide uno nuevo. Tras 10 intentos fallidos en una hora se bloquea temporalmente. |
| Error 404 al recargar una página en GitHub Pages | Asegúrate de publicar con el workflow (genera `404.html`). |
| La app no se actualiza | Pulsa *Actualizar* en el aviso, o cierra todas las pestañas/la app y vuelve a abrir. |
| La app dejó de responder tras unos días sin uso | El proyecto de Supabase se pausó: reactívalo desde su panel. |
| El OCR no lee bien una captura | Usa una captura de pantalla (no una foto), sin recortar etiquetas; corrige los campos o usa el registro manual. |
| «La temporada está cerrada» | Un administrador debe reabrirla (Temporada → Editar → estado) para hacer cambios. |

---

## 15. Reglas de cálculo

Implementadas una sola vez en `src/domain/calc/` y cubiertas por pruebas.

- **Objetivo de un partido:** `goles_equipo_1 + goles_equipo_2` (13-1 → 14 km; 25-0 → 25 km;
  4-7 → 11 km). Goles enteros 0-99; un campo vacío nunca cuenta como 0.
- **Semana:** lunes a domingo en la zona horaria de la temporada. Por defecto un partido genera
  el objetivo de la **semana siguiente** (sábado 24 → semana del 26 al 1); se puede elegir la del
  propio partido. Un árbitro no puede tener dos partidos en la misma semana de una temporada.
- **Kilómetros computables:** entrenamientos *confirmados*, de los tipos que la temporada declara
  computables y con fecha dentro de la temporada.
- **Temporada acumulada (metodología por defecto):** los objetivos y los kilómetros se **suman
  semana tras semana durante toda la temporada**.
  - Objetivo acumulado = suma de los goles de **todos** los partidos registrados.
  - Km hechos = suma de todos los entrenamientos computables (los km de más de una semana cuentan
    para el total).
  - Pendientes = max(0, objetivo acumulado − km hechos).
  - Cumplimiento = km hechos ÷ objetivo acumulado × 100 (puede superar el 100 %).
  - Totales del grupo = suma de los de cada árbitro. Se ven en Inicio, Clasificación y
    Estadísticas → «Todo el grupo», junto con km y ritmo medio por mes.
- **Vista semanal (informativa):** km de la semana frente al partido asignado a esa semana.
- **Metodologías alternativas** (las elige un administrador en Temporada; el cambio queda
  registrado): *semanas independientes* (cada semana por separado, el exceso no compensa) y
  *compensación* (el exceso cubre déficits de semanas anteriores). En ambas solo cuentan las
  semanas ya iniciadas y nunca se usa la media de porcentajes semanales.
- **Ritmo medio:** tiempo total ÷ distancia total de entrenamientos con duración (nunca la media
  de ritmos). **Mejor ritmo:** actividad de al menos 1 km.
- Los porcentajes se muestran redondeados hacia abajo (99,7 % → 99 %) para no anunciar un objetivo
  cumplido que no lo está.

## 16. Arquitectura y estructura

```
src/
  config/brand.json        Nombre, colores y geometría del logotipo (centralizados)
  domain/                  Tipos y lógica de negocio pura (calc/: objetivos, cumplimiento, estadísticas)
  features/
    auth/                  Sesión, pantallas de acceso y guardas de rutas
    group/                 Grupo activo, bienvenida, invitaciones y miembros
    seasons/ matches/ workouts/ ranking/ stats/ profile/ history/ settings/ dashboard/
    ocr/                   Preprocesado, motor, normalización, identificación y validación
    pwa/                   Instalación, conexión y actualizaciones
  components/              UI reutilizable (botones, campos, diálogos accesibles) y layout
  services/api.ts          Único punto de acceso a Supabase
  hooks/                   Datos de temporada y borradores de formularios
supabase/migrations/       Esquema, lógica, RLS (versionado)
tests/                     db (RLS real), ui, ocr-integration, visual (arnés de desarrollo)
scripts/                   Iconos, recursos OCR, fallback SPA, secretos, capturas sintéticas
```

- **Fuente de verdad:** solo `matches` y `workouts`; todos los totales se derivan al vuelo (no hay
  totales almacenados que puedan divergir).
- **Integridad en la base de datos:** triggers que calculan la semana, fijan el estado de
  validación, bloquean temporadas cerradas, exigen motivo en las correcciones y auditan cambios.
- **Datos remotos:** TanStack Query + Realtime (los cambios del grupo se reflejan en directo).

## 17. Seguridad y privacidad

- RLS activado en **todas** las tablas; permisos de columna; `anon` sin acceso a datos.
- Un usuario solo ve grupos en los que es miembro activo; no puede registrar entrenamientos a
  nombre de otro; solo administradores cambian reglas, temporadas y miembros.
- Las funciones privilegiadas (crear grupo, invitar, canjear) son RPC `security definer` que
  validan permisos; los códigos de invitación se guardan como hash SHA-256.
- En el navegador solo hay valores públicos. `check:secrets` bloquea el despliegue si aparece una
  clave privada.
- **Capturas:** se procesan en memoria; no se suben, no se guardan en Storage, IndexedDB ni
  localStorage, y el service worker no las cachea. Solo se envían los valores confirmados.
- En el dispositivo solo se guardan preferencias (`refrun_*_v1`) y borradores de formularios.

## 18. OCR: funcionamiento y límites

Tesseract.js (motor LSTM, modelo `eng` *best_int*) autoalojado en `/ocr/` (copiado de
`node_modules` en cada build: `tesseract.js`, `tesseract.js-core`, `@tesseract.js-data/eng`). Se
descarga (~6 MB) la primera vez y queda en caché. Proceso: escala de grises, inversión automática
en modo oscuro, contraste → reconocimiento → filas visuales → tokens (es/en, coma o punto,
km/m/mi, h:mm:ss, min/km, km/h, kcal, W) → asociación con etiquetas → validación cruzada
distancia-tiempo-ritmo. Los campos dudosos se marcan «Revisar», los calculados «Calculado» y
los no encontrados quedan vacíos. Distingue calorías activas y totales.

**Límites:** no es infalible. Puede fallar con fotos inclinadas o con reflejos, pantallas LCD de
siete segmentos, fuentes muy estilizadas, textos muy pequeños, o diseños de apps no previstos.
Siempre se pide revisión y confirmación, y existe el registro manual.
