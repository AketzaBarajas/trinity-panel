# trinity-panel · guía de puesta en marcha (ES)

Web privada de control horario de TRINITY (equipo de 3 personas). Guía de puesta en marcha y de pruebas, fase a fase.
SvelteKit 3 (SPA estática) + Supabase (Postgres, login con Discord, tiempo real) + Cloudflare Pages.


## Estado

| Fase | Qué | Estado |
|---|---|---|
| 1 | Diseño (artboard "D · Final") | ✅ |
| 2 | Base de datos + login con Discord | ✅ (probado 2026-10-23) |
| 3 | Cronómetro + ventana "¿Qué has hecho?" (+ admins eliminan sesiones) | ✅ (probado 2026-10-24) |
| 4 | Dashboard: gráficas, ranking, últimas | ✅ (probado 2026-10-24) |
| 5 | Registro global + filtros | ✅ (probado 2026-10-24) |
| 6 | Reglas del pacto (+ editar sesiones, objetivo personal) | ✅ (probado 2026-10-24) |
| 7 | PWA, Discord, copias, Lighthouse | ✅ (publicada en trinity-panel.pages.dev, 2026-10-24) |

## Puesta en marcha (Fase 2) — una sola vez

### 1. Supabase

1. Crea un proyecto en <https://supabase.com/dashboard> → nombre `trinity-panel`, región **Central EU (Frankfurt)**.
2. **SQL Editor** → pega todo `supabase/migrations/20261023180000_fase2_base_y_login.sql` → **Run**.
3. Copia `supabase/allowlist.example.sql` a `supabase/allowlist.sql`, pon los 3 IDs de Discord y ejecútalo en el SQL Editor.
   (Discord → Ajustes → Avanzado → *Modo desarrollador* → clic derecho en el nombre → *Copiar ID de usuario*.)
4. **Project Settings → API**: copia la *Project URL* y la *publishable key* a `.env` (plantilla en `.env.example`).
5. **Authentication → Sign In / Providers**: desactiva **Email** (y cualquier otro). Solo Discord.

### 2. Discord

1. <https://discord.com/developers/applications> → **New Application** → `trinity-panel`.
2. **OAuth2** → copia *Client ID* y *Client Secret* (*Reset Secret*).
3. **OAuth2 → Redirects** → añade `https://<tu-proyecto>.supabase.co/auth/v1/callback`.
4. En Supabase → **Authentication → Providers → Discord** → actívalo y pega Client ID y Secret.

### 3. URLs permitidas en Supabase

**Authentication → URL Configuration**:

- *Site URL*: `https://trinity-panel.pages.dev`
- *Redirect URLs*: `http://localhost:5173/auth/callback` y `https://trinity-panel.pages.dev/auth/callback`

### 4. Arrancar en local

```sh
npm install
npm run dev
```

Abre <http://localhost:5173>.

## Cómo comprobar que la Fase 2 funciona

1. Entras en `/login` → **Entrar con Discord** → autorizas → vuelves a la web.
2. Primera vez: te lleva a **/bienvenida** → eliges color y rol → **Entrar al panel**.
3. En la portada ves la tarjeta **Equipo**: tú con tu color y rol; los que aún no han entrado salen como *"Aún no ha entrado"*.
4. Abre la web en otra ventana con otra cuenta: el color que coja uno aparece **bloqueado al instante** en el selector del otro (tiempo real).
5. Una cuenta de Discord que **no** está en la lista → vuelve a `/login` con el aviso *"Esa cuenta de Discord no está en la lista de TRINITY"*.
6. **Ajustes** → cambia color o rol → *Guardar cambios* → se ve en la cabecera y en la portada. *Cerrar sesión* te devuelve al login.
7. Botón de luna/sol → modo claro y oscuro (se recuerda).

## Fase 3 · Cronómetro — puesta en marcha

1. **SQL Editor** → ejecuta, en este orden, si no lo has hecho ya:
   - `supabase/migrations/20261024100000_paleta_miembros_validada.sql`
   - `supabase/migrations/20261024160000_fase3_cronometro.sql`
2. Al final del segundo verás *Success*. Si sale el aviso *"pg_cron no disponible"*, no pasa nada: actívalo en **Database → Extensions → pg_cron** y vuelve a ejecutar solo el bloque `do $$ … $$` del final (el corte a las 4 h funciona igualmente al parar o al abrir la web).

### Cómo funciona

- **Iniciar / Parar** en la cabecera, en cualquier página. Responde al instante; el servidor guarda la hora real de inicio y de fin. Puedes cerrar la pestaña o apagar el PC: el cronómetro sigue.
- Al **Parar** se abre **"¿Qué has hecho?"**: frase (obligatoria), una o varias especialidades, descripción opcional. `Ctrl + Enter` guarda.
  - **Más tarde** / `Esc`: la sesión queda pendiente (aviso ámbar en la cabecera) y se te vuelve a pedir al abrir la web.
  - **Descartar**: borra la sesión (solo recién parada y sin describir).
  - Menos de 1 minuto → se considera un clic sin querer y no se guarda.
- **Corte automático a las 4 h**: la sesión se cierra en inicio + 4 h y queda *para revisar*. La barra fina del cronómetro marca cuánto falta; los últimos 15 min se pone ámbar.
- **Añadir horas a mano** (panel → *Tu semana*): solo de los últimos 7 días, máx. 12 h, nunca en el futuro. Quedan marcadas como manuales y para revisar.
- No puedes tener dos sesiones que se solapen (lo impide la base de datos y la ventana te lo avisa antes).

### Cómo comprobar que la Fase 3 funciona

1. Pulsa **Iniciar**: el reloj arranca al momento, sale "desde 17:02" y tu nodo en el panel late.
2. Abre la web en otra ventana o con otra cuenta: ves "Ake está fichado · 00:00:12" en *Ahora mismo* (tiempo real).
3. Recarga la página o ciérrala y vuelve: el reloj sigue con el tiempo correcto.
4. Pulsa **Parar** antes de 1 minuto → aviso *"Menos de 1 minuto: no se ha guardado"*.
5. Inicia, espera más de 1 minuto y **Parar** → se abre la ventana. Pulsa **Guardar** sin rellenar → te dice qué falta. Rellena y guarda → aviso *"Guardado · 2 min"* y las horas suben en el panel.
6. Inicia, para y pulsa **Más tarde** → aparece *"Describe tu sesión"* en la cabecera. Recarga → la ventana se abre sola.
7. **Añadir horas a mano** con unas horas que pisen una sesión tuya → la franja se pone roja y no deja guardar.
8. Inicia en una pestaña y pulsa **Iniciar** en otra que no se haya actualizado → *"Ya tienes un cronómetro en marcha"*.
9. (Opcional, corte) En el SQL Editor: `update app_settings set auto_cut_minutes = 30;`, inicia, espera 31 min → la sesión se para sola y te pide describirla con el aviso de corte. Después vuelve a `240`.

## Admins: eliminar sesiones

Migración: `supabase/migrations/20261024180000_admin_eliminar_sesiones.sql` (ejecutar una vez en el SQL Editor).

- Página **Sesiones** (cabecera): lista de todas las sesiones del equipo, la ven los tres.
- Los admins ven **Eliminar** en cada fila → piden un **motivo** (obligatorio) → la sesión deja de contar.
- Cada eliminación queda copiada en `session_deletions` y se muestra en **"Eliminadas recientemente"** para todos. Nadie puede editar ni borrar ese registro desde la web.
- Se puede eliminar también una sesión en marcha (p. ej. un cronómetro olvidado).

**Probar:** entra como admin → *Sesiones* → *Eliminar* en una sesión → sin motivo no deja → con motivo desaparece, las horas bajan en el panel y aparece abajo en *Eliminadas recientemente* (también en la ventana de otro miembro, en vivo).

## Fase 4 · Dashboard

Migración: `supabase/migrations/20261024200000_fase4_estadisticas.sql` (una vez, SQL Editor). Añade las funciones de totales (`daily_minutes`, `hourly_minutes`, `specialty_minutes`) y cambia los colores de las especialidades por una paleta validada para daltonismo.

- **Tu semana** (panel de cristal): ahora con **Últimas actividades** (5) → *Ver todas* lleva a Sesiones.
- **Análisis** (bajando en el panel), con selector **Semana · Mes · Año · Todo**:
  - Horas por día/semana/mes, apiladas por persona (con la línea del mínimo del equipo en vistas por semanas).
  - Clasificación con pestañas **Horas** y **% del mínimo** (en Mes/Año el mínimo es proporcional a los días pasados).
  - ¿Cuándo se trabaja? (mapa día × hora, filtrable por persona).
  - ¿En qué se va el tiempo? (donut por especialidad).
  - Línea del día (sesiones de hoy por persona; flechas para otros días de la semana).
  - Constancia del último año (tipo GitHub) con rachas.

### Cómo comprobar que la Fase 4 funciona

1. Ejecuta la migración y recarga. Baja hasta **Análisis**: aparecen las 6 gráficas sin error rojo.
2. Pasa el ratón por una barra, una casilla del mapa, el donut y el calendario → sale el detalle por persona.
3. Cambia **Semana → Mes → Año → Todo**: las barras se redibujan y la clasificación se reordena.
4. Pestaña **% del mínimo**: quien tenga ≥ 100 % pone *Cumple*.
5. Inicia el cronómetro: en **Línea del día** aparece tu bloque creciendo con la línea turquesa de "ahora". Páralo y guarda: en unos segundos se actualizan barras, donut, calendario y *Últimas actividades* (también en la ventana de otro miembro).
6. Los chips de especialidad (ventana "¿Qué has hecho?") y el abanico del orbe usan los colores nuevos.

## Fase 5 · Registro global (página Sesiones)

Migración: `supabase/migrations/20261025090000_fase5_registro.sql` (una vez, SQL Editor). Activa la extensión `unaccent` y añade `session_log`, que filtra en el servidor y devuelve a la vez las filas y los totales de **todo** el filtro.

- **Filtros**: buscador (frase + descripción, sin tildes ni mayúsculas; tecla `/` para saltar a él, `Esc` lo borra), fechas (Todo · Esta semana · Semana pasada · Este mes · 30 días, o desde–hasta a mano), persona, especialidad y proyecto (la fila de proyecto solo aparece si hay más de uno). Varias opciones en un filtro = cualquiera de ellas.
- **Totales del filtro**: horas, sesiones, media por sesión y reparto por persona.
- **Lista agrupada por día** (la cabecera del día se queda pegada al bajar) con las horas y sesiones de ese día. Se ve la descripción y se resalta lo buscado.
- **Atajos**: pulsar el nombre de una persona o una especialidad en una fila filtra por ella.
- Los filtros viven en la URL: se pueden recargar o pasar por Discord (`/sesiones?persona=…&fechas=semana`).
- Reglas: una sesión cuenta en el día en que **empieza** y con su duración entera.

### Cómo comprobar que la Fase 5 funciona

1. Ejecuta la migración y abre **Sesiones**: salen los totales arriba y la lista por días (sin aviso rojo).
2. Pulsa **Esta semana**: los totales cambian y las fechas de la derecha se rellenan con lunes–domingo.
3. Elige una persona y una especialidad: solo quedan sus sesiones; los totales y el reparto cuadran.
4. Escribe `guia` en el buscador: encuentra "Guía…" y lo marca en amarillo.
5. Recarga la página: los filtros siguen puestos. **Quitar filtros** lo deja todo como al principio.
6. Con otro miembro, guarda una sesión: aparece sola en la lista (si cumple el filtro).

## Fase 6 · Reglas del pacto (página Pacto)

Migración: `supabase/migrations/20261025120000_fase6_pacto.sql` (una vez, SQL Editor, después de la Fase 5).

**Reglas (las del PACTO DE FAMILIA, nada inventado):**

- **Mínimo semanal** (lunes–domingo). Cambiarlo guarda historial: vale desde un lunes (esta semana o la siguiente), nunca hacia atrás, y pide apuntar el acuerdo de los tres.
- **Ausencias justificadas**: exámenes, lesión o enfermedad, viaje, partido o concentración. Cada día ausente baja el mínimo de esa semana 1/7; la semana entera = *justificada*. Uno mismo tiene que avisar **48 h antes** (lesión o enfermedad: en cuanto pueda, hasta 7 días después). Un admin puede marcar la de otro sin esos límites y con el motivo *Otro* (con nota).
- **Recuperar**: lo que falte una semana se compensa **solo** con lo que sobre la semana siguiente (primero se cubre el mínimo propio de esa semana). Ej.: 2 h → la siguiente necesitas 6 h.
- **Incumplir** (ni cumplida, ni recuperada, ni justificada): la 1.ª vez **toque de atención**, después **penalización**.
- Las semanas cuentan desde el **inicio del pacto** (por defecto el lunes 26 oct 2026, editable) y, para cada uno, desde la semana en que entró en la web; los días de esa semana antes de entrar no se le exigen.
- **Validar**: las horas a mano y las sesiones con corte automático cuentan mientras tanto. Las valida (o les corrige las horas, con motivo) un admin que **no** sea el dueño. Queda escrito quién lo hizo.

**Qué hay en la web:**

- **Pacto** (cabecera; con un número ámbar si tienes sesiones de otros por validar): *Esta semana* (horas / objetivo de cada uno con el porqué, estado, racha, total desde el inicio y toques), *Semana a semana* (un símbolo por semana y persona), *Por validar*, *Ausencias* y *Reglas* (los admins cambian el mínimo y el inicio).
- **Tu semana** (portada): la barra y "te faltan" usan tu objetivo real (mínimo − ausencias + lo que recuperas), con avisos del pacto y tu objetivo personal como marca discontinua.
- **Sesiones**: botón **Editar** en tus sesiones (o en todas si eres admin) para cambiar frase, especialidades y descripción, nunca las horas (decisión D5). Las filas dicen *por validar* o *Validada por …*.
- **Ajustes → Objetivo semanal**: tu meta personal (no cambia el mínimo).

### Cómo comprobar que la Fase 6 funciona

1. Ejecuta la migración. Como el pacto empieza el lunes 26, **para probar hoy**: *Pacto → Reglas → Inicio del pacto* → elige el 19 oct → *Guardar*. (Después vuelve a ponerlo en el 26 si queréis empezar limpio.)
2. *Pacto → Esta semana*: sales con tus horas, tu objetivo (algo menos de 4 h si entraste a mitad de semana) y el estado *En curso*. En *Semana a semana* aparece la semana 43 con un círculo discontinuo que se rellena.
3. *Ausencias*: elige mañana con motivo *Exámenes* → avisa de que faltan menos de 48 h y no deja. Elige dentro de 4 días → se guarda y aparece en la lista. *Quitar* la borra.
4. Ponte una ausencia de *Lesión o enfermedad* de ayer → se acepta y en *Esta semana* tu mínimo baja (`− 1 día justificado`).
5. Añade horas a mano (portada) → salen en *Por validar* con "La valida otro admin". Con la cuenta de otro miembro: *Validar* → desaparece y en *Sesiones* pone *Validada por …*. *Corregir horas* sin motivo no deja; con motivo cambia la duración.
6. *Reglas → Cambiar el mínimo* a 5 h *desde el lunes 2 nov* con una nota → en *Reglas* aparece "Desde el 2 nov: 5 h" y en *Historial del mínimo*. Esta semana sigue en 4 h.
7. *Sesiones → Editar* en una sesión tuya → cambia la frase → *Guardar* → se ve al momento (también en la ventana del otro).
8. *Ajustes → Objetivo semanal* = 6 → en *Tu semana* aparece una marca discontinua en la barra y "Para tu objetivo de 6 h te faltan…" cuando cumplas el mínimo.

## Fase 7 · App instalable, Discord y copias de seguridad

Migración: `supabase/migrations/20261026090000_fase7_discord_y_copias.sql` (una vez, SQL Editor, después de la Fase 6).
Activa `pg_net`, programa dos tareas en `pg_cron` (`trinity-discord` cada minuto y `trinity-copia-semanal` los lunes a las 03:00 UTC), hace una primera copia y **devuelve el inicio del pacto al lunes 26 oct** si se adelantó para probar.

### 1. Publicar en Cloudflare Pages (una vez)

La app instalable y los avisos de Discord apuntan a `https://trinity-panel.pages.dev`.

```sh
npm run build
npx wrangler login                 # abre el navegador, una sola vez
npx wrangler pages deploy build --project-name trinity-panel
```

✅ Hecho el 2026-10-24: el proyecto `trinity-panel` existe (Pages clásico, creado con `wrangler pages project create trinity-panel --production-branch main --force`; el `--force` solo hizo falta esa vez para que wrangler no lo mandara a Workers y se quedara la URL `trinity-panel.pages.dev`). Para publicar cambios, repite `build` + `deploy`.
En Supabase ya están permitidas `https://trinity-panel.pages.dev` y `/auth/callback` (Fase 2).

### 2. Conectar Discord (lo hace el admin principal)

1. Discord → ajustes del canal donde quieras los avisos → **Integraciones → Webhooks → Nuevo webhook** → **Copiar URL**.
2. Web → **Ajustes → Discord** → pega la URL → **Guardar**. Se guarda en el esquema `private` de la base de datos: el navegador no la puede leer.
3. **Prueba** → llega un mensaje "trinity-panel está conectado" al canal.

### Qué se manda

| Aviso | Cuándo | Ejemplo |
|---|---|---|
| Inicio | Cuando la sesión lleva 1 min (un clic sin querer nunca llega) | 🟢 **Marco** ha empezado a trabajar · InfoCraft |
| Fin | Cuando la sesión ya tiene frase | ✅ **Marco** ha terminado · **1h 25m** · InfoCraft + frase + especialidades |
| Horas a mano | Al guardarlas | 📝 **Nora** ha añadido horas a mano · … · por validar |
| Resumen | Domingo 21:00 (Madrid) | Clasificación con horas / objetivo y estado de cada uno, total del equipo y especialidad estrella |
| Recordatorio | Jueves 18:00 | ⏰ @Nora llevas **1h 30m** de 4h 00m (37 %)… (solo si alguien va por debajo del 50 %) |

- Cada aviso sale **una sola vez**. Solo se avisa de sesiones creadas después de conectar el webhook.
- Los admins encienden o apagan cada tipo en **Ajustes → Discord** y pueden mandar **ahora** la prueba, el resumen o el recordatorio de esta semana.
- **Ajustes → Discord** dice si el último aviso llegó o falló (p. ej. webhook borrado).
- Ningún texto de una sesión puede mencionar a `@everyone`: las menciones están bloqueadas salvo las del recordatorio.

### Copias de seguridad

- Cada lunes de madrugada, foto completa de todas las tablas en `backups` (se guardan 12 semanales + 12 a mano).
- **Ajustes → Copias de seguridad** (solo admins): lista, **Hacer copia ahora** y **Descargar** en JSON.
- Ojo: la copia vive en el mismo Supabase. Protege de errores dentro de la app (borrar algo sin querer), no de perder el proyecto entero: para eso, descarga una de vez en cuando.

### App instalable (PWA)

- `static/manifest.webmanifest` + iconos en `static/icons/` + `src/service-worker.ts`.
- La carcasa (HTML, JS, CSS, fuentes) se guarda en caché → arranca al instante. Los datos llegan siempre en vivo de Supabase (sin conexión no funciona: eso es v2).
- Cuando se publica una versión nueva sale el aviso **"Hay una versión nueva · Recargar"**.
- **Ajustes → App → Instalar en este ordenador** (Chrome o Edge). Clic derecho en el icono de la barra de tareas: accesos directos a *Sesiones* y *Pacto*.
- En `npm run dev` el service worker no se registra (no estorba a la recarga en caliente).
- `static/_headers`: caché de un año para `/_app/immutable/*` y cabeceras de seguridad en Cloudflare Pages.

### Lighthouse (página de login, `npm run preview`, 2026-10-24)

| | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|
| Escritorio | 100 | 100 | 100 | 63 |
| Móvil | 96 | 100 | 100 | 63 |

El SEO baja a propósito: la web es privada (`noindex`). El resto de páginas necesitan login y no se pueden medir así.

### Cómo comprobar que la Fase 7 funciona

1. Ejecuta la migración → *Success*. En **Database → Cron Jobs** aparecen `trinity-discord` y `trinity-copia-semanal`.
2. Publica en Cloudflare (paso 1) y entra en `https://trinity-panel.pages.dev` con Discord.
3. **Ajustes → App → Instalar en este ordenador** → se abre en su propia ventana y aparece en el menú Inicio.
4. **Ajustes → Discord**: pega el webhook → *Guardar* → **Prueba** → llega el mensaje y, a los pocos segundos, sale *"Último aviso (prueba) entregado"*.
5. **Iniciar** el cronómetro, espera a que pase 1 min (+ hasta 1 min del tic) → llega 🟢 al canal. **Parar** y describir → llega ✅ con la frase.
6. **Resumen de esta semana** y **Recordatorio** → llegan al canal (el recordatorio solo si alguien va por debajo del 50 %; si no, lo avisa).
7. Apaga *Inicio y fin de sesiones* → inicia y para una sesión → no llega nada.
8. **Ajustes → Copias de seguridad** → hay una copia → **Descargar** → se baja un `.json` con todas las tablas.
9. Publica otra vez (`build` + `deploy`) con la app abierta → sale *"Hay una versión nueva · Recargar"*.

## Seguridad (resumen)

- La clave del navegador es pública; la protección la ponen las reglas **RLS** de la base de datos.
- Un trigger en `auth.users` rechaza cualquier cuenta que no esté en `allowed_members`.
- Cada uno solo puede editar su rol, color y objetivo. Los permisos de admin solo los cambia el admin principal (`set_member_admin`).
- Las horas no se pueden escribir desde el navegador: solo las funciones del servidor (`start_session`, `stop_session`, `add_manual_session`) ponen horas, siempre con `now()` del servidor o con las reglas de las horas manuales. `describe_session` nunca toca las horas; `review_session` (admins, nunca la propia) las corrige dejando registro en `session_reviews`.
- La URL del webhook de Discord vive en el esquema `private` (sin acceso desde la API). Solo el admin principal la cambia (`set_discord_webhook`) y ninguna función la devuelve.
- Las copias (`backups`) solo las leen los admins.
- Ausencias y mínimo solo cambian con funciones (`add_absence`, `delete_absence`, `set_weekly_minimum`, `set_pact_start`) que aplican las reglas del pacto en el servidor.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run check` | Comprobación de tipos |
| `npm run build` | Compila la web estática en `build/` |
| `npm run preview` | Sirve la compilación en local |
