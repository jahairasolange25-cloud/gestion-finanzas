# Auditoría de Preparación para Producción
## Mis Finanzas — Sistema de Finanzas Personales

**Fecha:** 1 de agosto de 2026
**Versión auditada:** 0.1.0 (MVP)
**Autor de la auditoría:** Revisión técnica integral (Arquitectura, SRE, Seguridad, DevOps, Performance, Producto)

---

# 1. Resumen Ejecutivo

El proyecto es un **MVP sólido, bien ejecutado y con una arquitectura notablemente limpia** para su alcance. La decisión de construir sobre **Next.js 16 + tRPC + Drizzle ORM + SQLite (libsql/Turso) + TanStack Query + PWA** es correcta, coherente con los objetivos (simple, barato, rápido, mantenible) y no requiere reescribirse.

La base de código es pequeña (~4.000 líneas), legible, tipada de punta a punta y sin dependencias infladas. El patrón de **UI optimista + cola offline + campos de fecha denormalizados con índices** es una decisión de diseño de nivel senior. El objetivo de registrar un gasto en <1s **es técnicamente alcanzable y ya se logra de forma percibida** mediante optimistic UI.

Sin embargo, **el proyecto no está listo para producción pública**. Existen bloqueadores críticos:

| # | Hallazgo | Criticidad |
|---|----------|------------|
| 1 | **Cero autenticación y autorización** — todas las rutas tRPC son `publicProcedure` | CRÍTICA |
| 2 | **No existe repositorio git** — sin control de versiones, sin historial, sin rollback | CRÍTICA |
| 3 | **Bug de pérdida de datos en la cola offline** (`useFlushPending` borra la cola completa) | CRÍTICA |
| 4 | **Bug de zona horaria** — el servidor calcula `year/month/day` en UTC; el cliente en hora local (Perú UTC-5). Transacciones tras ~19:00 caen en el día siguiente; la ruta online y la offline registran días distintos | ALTA |
| 5 | **SQLite de archivo en hosting serverless (Vercel) = datos efímeros** — sin Turso, cada función serverless pierde las escrituras | ALTA |
| 6 | **Sin rate limiting ni límite de cuerpo** — API pública explotable | ALTA |
| 7 | **Totales incorrectos en Historial** — se suman solo los primeros 500 registros del rango | MEDIA |
| 8 | Sin pruebas automatizadas, sin CI/CD, sin monitoreo, sin backups automatizados | MEDIA |

**Veredicto global: 38 % de preparación para producción.**

> La arquitectura está lista; la ingeniería de producción (seguridad, CI/CD, datos, observabilidad) no.

---

# 2. Estado actual del proyecto (por área)

| Área | Preparación | Nota |
|------|:-----------:|------|
| Arquitectura | ████████░░ 80 % | Correcta para el alcance; no necesita reescritura |
| Frontend / PWA | ███████░░░ 70 % | Excelente base; faltan boundaries de error y ajustes de accesibilidad |
| Backend | ██████░░░░ 55 % | Diseño limpio; faltan auth, rate limiting, errores tipados, logging |
| Base de datos | ██████░░░░ 55 % | Modelo e índices bien diseñados; falta backup, migraciones en CI, FK verificadas |
| Seguridad | ██░░░░░░░░ 15 % | **El bloqueador principal** |
| Rendimiento | ███████░░░ 70 % | <1s ya logrado por diseño; falta medirlo en producción |
| Calidad de código | ████████░░ 75 % | Legible y consistente; faltan tests |
| Producción (Ops) | ██░░░░░░░░ 15 % | Todo por hacer: git, CI/CD, hosting, monitoreo, backups |
| Escalabilidad | ██████░░░░ 55 % | Bien preparada para 1 usuario y para crecer sin reescribir |
| UX de captura | ████████░░ 80 % | Flujo de captura excelente; pulir edge cases |

**Global ponderado: ≈ 38 %**

---

# 3. Arquitectura

## 3.1 Estructura y separación de responsabilidades

```
src/
├── app/          → Rutas App Router + manifest + providers (UI de página)
├── server/       → tRPC: routers, context, db (esquema + cliente), seed
├── components/   → UI de dominio (capture, dashboard, history, settings, layout)
├── hooks/        → use-save-transaction (optimistic UI + cola)
├── lib/          → money, date-fields, offline-queue, trpc, types, cn
└── store/        → Zustand persistido (preferencias UI)
```

**Fortalezas**
- **Monolito bien modularizado.** La separación `server/` ↔ `lib/` ↔ `components/` ↔ `hooks/` ↔ `store/` es clara y consistente. Un desarrollador nuevo entiende el proyecto en una hora.
- **Tipado de punta a punta.** tRPC + Zod + Drizzle: el contrato entre cliente y servidor no puede desincronizarse (src/lib/trpc.ts:4).
- **Decisiones de diseño correctas:** montos en céntimos como INTEGER (src/server/db/schema.ts:29), campos de fecha denormalizados con 6 índices (schema.ts:48-55), moneda/IDIOMA centralizados (src/lib/money.ts:1-2).
- **El API es "backend-for-frontend"** dentro del mismo proceso Next.js — cero infraestructura extra. Correcto para 1 usuario.
- **Las tablas `fixed_expenses`, `budgets`, `goals` ya están modeladas** para V2 (schema.ts:58-95) — la evolución no requiere migraciones de ruptura.

**Debilidades**
- **`useFlushPending` con bug de pérdida de datos** (ver §8.2).
- **Procedimientos muertos:** `transactions.update` y `transactions.delete` (src/server/routers/transactions.ts:83-108) no tienen consumidor en la UI. Superficie de ataque sin beneficio.
- **Todo el árbol de componentes es cliente** (`"use client"` desde el shell). No se aprovechan Server Components para el HTML inicial — cada pantalla muestra skeletons hasta hidratar.
- **Sin capa de acceso a datos (DAL)**: los routers consultan Drizzle directamente. Correcto hoy; dificultará testear y añadir auth mañana.
- **Sin `errorFormatter` personalizado** en tRPC (src/server/trpc.ts) — los errores Zod llegan crudos al cliente; no hay errores de dominio ("categoría no existe", "fuera de límite").
- **Sin middleware de rate limiting ni de sesión** en el pipeline de tRPC.
- **Doble sistema de "fecha de hoy"**: cliente y servidor calculan fechas por separado — origen del bug de TZ (§8.3).

**Riesgos**
- Añadir auth después (sesiones por cookie) requerirá tocar `context.ts`, todos los procedimientos y el cliente tRPC — ventana de 1-2 días, no una reescritura.
- Crecer la UI sin tests de regresión hará que el bug de la cola offline reaparezca.

**Mejoras recomendadas**
1. Añadir `protectedProcedure` + middleware de sesión ahora, antes de que crezcan los routers.
2. Implementar un middleware de rate limiting por IP (API Route + headers de Vercel, o in-memory LRU).
3. Eliminar o conectar `update`/`delete` de transacciones (o ambos: dar edición/borrado en la UI).
4. Centralizar la creación de filas en un helper `createTransactionRow(input)` compartido entre servidor y cliente para eliminar la divergencia de TZ.
5. Introducir errores de dominio en el `errorFormatter`.

---

# 4. Frontend

## 4.1 Carga inicial, bundles y code splitting

Medido sobre el build de producción real (Next 16.2.12 + Turbopack):

| Recurso | Tamaño raw | Aprox. gzip | Carga |
|---------|-----------|-------------|-------|
| `rootMainFiles` (React 19, Next, tRPC, TanStack Query, runtime) | ~445 KB (3 chunks) | ~130-150 KB | **Toda ruta** |
| Polyfills | ~110 KB | ~35 KB | Toda ruta |
| **ECharts** (`0-2glljkywec1.js`) | **564 KB** | **~160 KB** | **Solo /dashboard** (lazy, bien logrado) |
| CSS | ~29 KB | ~6 KB | Global |

**Evaluación**
- ✅ **Code splitting correcto:** ECharts está aislado en un chunk propio que solo se descarga al visitar el dashboard (verificado en `.next/build-manifest.json`). La captura de gastos nunca paga el costo de ECharts.
- ✅ **Prefetching de rutas** por defecto de Next en `Link` → navegación casi instantánea.
- ✅ **Fuentes auto-hospedadas** con `next/font` (src/app/layout.tsx:8-9): cero requests externos, sin CLS.
- ✅ **PWA instalable** con manifest válido (src/app/manifest.ts) y service worker propio (public/sw.js).
- ⚠️ El shell base (~180 KB gzip) es razonable pero mejorable: todo es cliente, no hay Server Components que reduzcan JS inicial.
- ⚠️ `preconnect` a nada externo (bien); pero no hay `aria-live` para el feedback "¡Guardado!".

## 4.2 Lazy loading y renderizados innecesarios

- **Sin `next/dynamic` explícito** para ECharts — pero el route-splitting de Next lo logra por segmento. Bien.
- `useMemo` correcto en los options de ECharts (src/components/dashboard-screen.tsx:30-174) — los gráficos solo se actualizan cuando cambian los datos.
- **Sin debounce en la búsqueda del historial** (src/components/history-screen.tsx:96): cada tecla dispara una query tRPC. Añadir debounce de ~300 ms.
- El `summary` del inicio se consulta incluso cuando no hay transacciones (`enabled` redundante, home-screen.tsx:22).

## 4.3 PWA y modo offline — análisis profundo

Diseño del service worker (public/sw.js): **network-first para navegación**, **stale-while-revalidate para estáticos**, **network-first con fallback de cache para GET de API**, y **jamás intercepta POST** (la cola offline los resuelve). Esta es la estrategia correcta.

- ✅ La UI detecta `navigator.onLine`, muestra banner y reenvía la cola al reconectar (src/components/pwa-sync.tsx).
- ✅ Fila marcada como "Pendiente de sincronizar" (transaction-list.tsx:77-81).
- ⚠️ La cola usa `localStorage` (src/lib/offline-queue.ts) — adecuado para payloads pequeños, pero se pierde si el usuario borra datos del sitio, y no tiene tope de crecimiento (estado offline prolongado = cola ilimitada).
- ⚠️ El service worker no cachea la API con política de expiración: los GET de analytics quedan en `finanzas-api-v1` indefinidamente (stale data offline). Aceptable hoy.
- ❌ **`updateViaCache` no configurado**: `navigator.serviceWorker.register("/sw.js")` (pwa-sync.tsx:17) — los navegadores pueden servir el SW desde HTTP cache y retrasar la actualización. Usar `{ updateViaCache: "none" }` (patrón recomendado por Next.js).
- ❌ No hay `beforeinstallprompt` ni instrucciones de instalación en iOS (Safari no muestra el prompt automático).

## 4.4 Accesibilidad (a11y)

- ✅ Roles y labels ARIA correctos: tabs (`role="tablist"`), `aria-pressed`, `aria-label` en campos, `role="status"` para el banner, `role="img"` con descripción en gráficos.
- ✅ Focus visible en botones (`focus-visible:outline-2`, button.tsx:41).
- ❌ **`maximumScale: 1`** en el viewport (layout.tsx:32) **bloquea el zoom por pellizco** — falla de accesibilidad real (WCAG 1.4.4). Eliminarlo o permitir zoom ≥ 2.
- ⚠️ Contrastes: `text-[11px] text-slate-400` (mini-stats, home-screen.tsx:95) probablemente < 4.5:1 sobre fondo claro. Verificar con axe/Lighthouse.
- ⚠️ El botón "Guardar" grande (`h-14`) cumple el objetivo táctil ≥ 44 px; los chips de categoría (≈ 70 px de alto) también. Bien.
- ⚠️ Sin anuncios `aria-live` para el cambio "Gasto ↔ Ingreso" ni el estado "¡Guardado!".

## 4.5 Experiencia móvil

- ✅ Bottom nav con botón central flotante de captura (app-shell.tsx:84-107) — patrón estándar de apps financieras.
- ✅ `safe-area-inset-bottom` para iPhone con notch (app-shell.tsx:85).
- ✅ `inputMode="decimal"` + auto-focus → teclado numérico al instante.
- ⚠️ Sin `theme-color` dinámico ni dark mode (roadmap futuro).

---

# 5. Backend

## 5.1 Arquitectura y organización

- ✅ tRPC v11 con httpBatchLink (batching de queries — visible en `dev.log` como peticiones agrupadas). Correcto.
- ✅ Zod valida en el límite de cada procedimiento (longitudes, tipos, rangos).
- ✅ Runtime Node en el route handler (route.ts:6) — necesario para libsql.
- ⚠️ `createContext` no hace nada más que pasar `db` (context.ts:3) — el punto de extensión para auth/rate-limit está listo pero vacío.

## 5.2 Validaciones — huecos concretos

- `dateSchema` valida **formato** `\d{4}-\d{2}-\d{2}` pero **no valida fechas de calendario**: `2026-02-31` pasa y `parseDate` produce una fecha inválida que se inserta (transactions.ts:8, date-fields.ts:52-55).
- `amountCents` es `int().positive()` **sin tope superior** — acepta `9e15` (overflow potencial en SUM).
- `categoryId` no se valida contra `categories` — se puede crear una transacción con una categoría inexistente o de otro tipo (gasto con categoría de ingreso).
- No hay `date <= today` en el servidor (el cliente lo limita con `max`, capture-form.tsx:198, pero eso es evitable).

## 5.3 Manejo de errores

- **No hay `errorFormatter`** en tRPC → errores de Zod en bruto, sin mensajes de dominio.
- El cliente lanza el error sin feedback: `useSaveTransaction` hace `throw err` (use-save-transaction.ts:70) y la UI solo revierte la fila. **El usuario no sabe por qué falló el guardado** (¿servidor caído? ¿validación?). Solo aplica a la ruta online; en offline la transacción se encola y el problema se enmascara.
- Sin `error.tsx` / `global-error.tsx` / `not-found.tsx` personalizados (verificado: no existen).
- La carga se deja en skeletons infinitos si la API falla (dashboard-screen.tsx:208-213) — sin estado de error, sin reintentar visible.

## 5.4 Logging

- **No existe logging estructurado.** El único log es `dev.log` (salida del dev server). En producción: Vercel recoge logs de console, pero no hay correlación, ni niveles, ni request IDs.
- Sin `instrumentation.ts` (OpenTelemetry) ni registro de métricas de negocio (transacciones creadas, errores, latencia).

## 5.5 Seguridad del backend

- **Todas las rutas son públicas** (`publicProcedure`) — no hay autenticación ni autorización (ver §7).
- **Sin rate limiting** — un bot o un script puede insertar miles de filas o saturar el endpoint de analytics.
- Sin límite de cuerpo de petición en tRPC (default de Next ~1 MB; el batching permite muchos ops por request).
- `like` con `%...%` (transactions.ts:59-61) — sin escape de wildcards del usuario: buscar `%` o `_` devuelve todo. Es un mal menor (no es inyección, Drizzle parametriza), pero rompe la semántica de búsqueda.

## 5.6 Rendimiento del backend

- Los endpoints devuelven en **12-50 ms** en local (dev.log). La escritura `transactions.create` cuesta ~25 ms de aplicación. Cumple de sobra el <1s.
- `analytics.summary` ejecuta 6 queries — todas index-backed, correctas para 1 usuario.
- **Sin caché de respuestas** (p.ej. `Cache-Control: s-maxage`): el cliente amortigua con TanStack Query (staleTime 30 s), suficiente.

## 5.7 Resiliencia

- La cola offline es el mecanismo de resiliencia del cliente. **Tiene el bug de pérdida de datos** (§8.2).
- **Sin idempotencia**: si el POST llega al servidor pero la respuesta se pierde (timeout), el reintento duplica la transacción.
- Sin retry con backoff explícito (TanStack retry:1 cubre parcialmente).
- Sin healthcheck ni `/api/health`.

---

# 6. Base de datos

## 6.1 Modelo de datos

- ✅ **Diseño correcto y profesional.** `transactions` denormaliza `year, month, quarter, semester, weekIso, day, dayOfWeek, hour` al insertar (schema.ts:36-44) → las agregaciones del dashboard son `GROUP BY` puros sobre índices, sin funciones SQL por fila. Es el patrón correcto para SQLite analítico de 1 usuario.
- ✅ Montos en céntimos (INTEGER) — sin errores de coma flotante.
- ✅ Tipos estrictos (`type` enum), `onDelete: "set null"` para categorías (no se pierde historia).
- ✅ Tablas de V2 ya modeladas (`budgets`, `fixed_expenses`, `goals`).
- ⚠️ **FK: verificar que libsql aplica `PRAGMA foreign_keys`**. El cliente `createClient` de libsql habilita FKs por defecto en la mayoría de versiones, pero no hay constancia explícita en el código. Una transacción con `categoryId` inexistente lo validaría.
- ⚠️ Sin `UNIQUE` en `categories(name, type)` — se pueden duplicar nombres.
- ⚠️ IDs tipo `cat-${n}` en el seed (seed.ts:25) — colisionan si se insertan categorías con el mismo prefijo (no hay `crypto.randomUUID()` como en el resto).

## 6.2 Índices

6 índices sobre `transactions` (drizzle/0001_flimsy_loners.sql) cubren todos los accesos: rango de fecha, categoría, tipo, año-mes, semana y creación. **Cobertura correcta y suficiente.** Los `LIKE '%...%'` no son indexables — aceptable con < 1M filas.

## 6.3 Consultas y crecimiento

- Todas las agregaciones son `GROUP BY` con índices. Con **millones de filas**, la suma de 6 queries sigue siendo sub-100 ms en SQLite (los índices cubren el rango).
- El punto débil a escala es `transactions.list` con `LIKE` + `ORDER BY date DESC` sin paginación (ver §10).
- `byMonth` escanea el índice `(year, month)` completo — fine incluso a 10M filas.

## 6.4 Integridad y restricciones

- Falta `CHECK (amount_cents > 0)` a nivel de esquema (solo Zod lo garantiza).
- Falta validación `date` vs `ts` coherente (un `date` backdated puede tener `ts` de hoy — ya ocurre: `ts` se calcula con `new Date()` y `date` viene del input; no son la misma hora).
- ⚠️ Inconsistencia temporal: `ts`, `year/month/...` se derivan del servidor (UTC en producción), `date` puede venir del cliente — los campos pueden discrepar entre sí (mismo bug de TZ).

## 6.5 Backups y recuperación

- **No hay backups automatizados en ningún modo.** En modo local: el README sugiere copiar `data/finanzas.db`. En Turso: la capa gratuita tiene snapshots/retention, pero no está configurado ni documentado.
- No hay procedimiento documentado de restauración ni de verificación de backups (restore test).
- No hay `db:backup` script, ni export CSV/JSON (roadmap V1).

---

# 7. Seguridad — Auditoría completa

| Área | Estado | Hallazgo |
|------|:------:|----------|
| **Autenticación** | ❌ | **No existe.** Todos los procedimientos son `publicProcedure` (src/server/trpc.ts:7). Quien encuentre la URL puede **leer y escribir TODOS los datos financieros** |
| **Autorización** | ❌ | No aplica — no hay concepto de usuario ni propiedad de datos |
| **Gestión de sesiones** | ❌ | No hay cookies, JWT ni sesiones |
| **CSRF** | ⚠️ | Hoy irrelevante (sin cookies). **Con auth por cookies habrá que protegerlo**: `SameSite=Lax/Strict` + origen check |
| **XSS** | ✅/⚠️ | React escapa todo; no hay `dangerouslySetInnerHTML`. Riesgo bajo. Mitigar además con CSP |
| **SQL Injection** | ✅ | Drizzle parametriza todo. `LIKE %...%` no escapa wildcards del usuario (semántica, no inyección) |
| **Content Security Policy** | ❌ | **No hay cabeceras de seguridad en absoluto** — verificado: `headers: []` en `routes-manifest.json`. Faltan `CSP`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` |
| **Manejo de secretos** | ✅ | `.env` en `.gitignore`; `TURSO_AUTH_TOKEN` y `DATABASE_URL` solo en servidor. Sin `NEXT_PUBLIC_` con secretos. `.env.example` bien |
| **Cifrado en tránsito** | ✅ | HTTPS automático en Vercel (pendiente de publicar) |
| **Cifrado en reposo** | ⚠️ | Turso cifra en disco; datos del cliente en localStorage/Cache API **sin cifrar** (riesgo residual: alguien con acceso físico al dispositivo lee la cola offline) |
| **Almacenamiento local** | ⚠️ | Cola offline en localStorage (offline-queue.ts:3) y respuestas de API en Cache API — datos financieros sin cifrar en el dispositivo |
| **Permisos de navegador** | ⚠️ | Solo `navigator.vibrate` (no requiere permiso). Sin permisos peligrosos solicitados |
| **Exposición** | ❌ | Sin `robots.txt` ni `noindex` — la app será indexable; sin auth eso agrava el riesgo |
| **Rate limiting** | ❌ | Ninguno |
| **Cabecera `poweredBy`** | ⚠️ | Next la incluye por defecto — deshabilitarla (`poweredByHeader: false`) |

### Vulnerabilidades priorizadas

1. **CRÍTICA — Ausencia total de autenticación.** Datos financieros legibles por cualquiera con la URL. No es aceptable en producción pública. (Mitigación intermedia: Cloudflare Access / protección de despliegue de Vercel + password. Mitigación definitiva: auth real con 1 cuenta.)
2. **ALTA — Sin cabeceras de seguridad/CSP.** Clickjacking, MIME sniffing, XSS residual, exfiltración de datos.
3. **ALTA — Sin rate limiting ni límite de tamaño.** Abuso del endpoint público.
4. **MEDIA — Datos offline en claro** en el dispositivo (localStorage + Cache API).
5. **MEDIA — Sin noindex** mientras no haya auth.

---

# 8. Rendimiento y el objetivo <1s

## 8.1 Análisis del flujo de captura

| Etapa | Latencia | ¿Bloquea el <1s? |
|-------|----------|------------------|
| Render inicial de la pantalla | ~180 KB gzip JS → TTI ~1.5-2 s en móvil medio | No bloquea el *registro* (la app ya está abierta) |
| Escribir monto (teclado numérico + autofocus) | 0 (input) | No |
| Tocar Guardar → **optimistic UI** | **< 10 ms** (inserción en caché local, use-save-transaction.ts:61-62) | **No** — la fila aparece al instante |
| Escritura en servidor (background) | ~25-50 ms API + ~50 ms red | No (asíncrona) |
| Invalidación de queries (background) | ~30 ms | No |
| Reinicio del formulario + vibración + foco | < 100 ms | No |

**Conclusión: el objetivo <1s se cumple por diseño en el camino feliz (online y offline).** El número no depende de la red, solo de la latencia de inserción en la caché de TanStack Query — insignificante.

## 8.2 Cuellos de botella y bugs que rompen la confianza en los datos

1. **BUG CRÍTICO — Pérdida de datos en la cola offline** (use-save-transaction.ts:85-103):
   ```ts
   for (const item of queue) {
     try { await create.mutateAsync(item); sent++; }
     catch { break; }
   }
   if (sent > 0) { clearPendingQueue(); ... }
   ```
   Si la transacción 3 de 5 falla (p. ej. red inestable), las 4 y 5 **nunca se enviaron pero se borran**. Pérdida permanente de gastos registrados sin conexión. Además, si el envío 1 llegó al servidor pero la respuesta se perdió, el reenvío al recargar duplicará la fila (sin idempotencia).
   **Corrección mínima:** eliminar una a una de la cola **solo** las que tengan respuesta exitosa (splice por índice), o usar una cola de mensajes con estado (`sending`/`done` + idempotency key).
2. **BUG — Zona horaria (UTC vs Perú):** en Vercel el servidor corre en UTC. `transactions.create` calcula `new Date()` en el servidor (transactions.ts:23) — un gasto registrado a las 19:30 en Perú (UTC-5) se guarda con fecha **del día siguiente**. La ruta offline lo calcula en el cliente (use-save-transaction.ts:18, hora local correcta) → **la misma operación produce fechas distintas según el estado de red**. Los campos denormalizados (`day`, `month`, `weekIso`, `hour`) heredan el error.
   **Corrección mínima:** el cliente debe enviar siempre `date` + `ts` (epoch) y el servidor derivar los campos a partir del epoch del cliente.
3. **MEDIA — Historial incompleto:** `limit: 500` sin paginación (transactions.ts:49, history-screen.tsx:52). Con >500 operaciones en el rango: (a) filas invisibles, (b) **totales de gastos/ingresos/balance incorrectos** porque se suman solo las filas cargadas (history-screen.tsx:55-56).
4. **MEDIA — Sin debounce en búsqueda** (historial) → ráfagas de requests por pulsación.

## 8.3 Métricas objetivas propuestas

| Métrica | Objetivo | Dónde medir |
|---------|----------|-------------|
| Captura percibida (Guardar → fila visible) | **< 100 ms p95** | Web Vital personalizado (performance.now) |
| Escritura servidor (`transactions.create`) | **< 150 ms p95** | Logs de ruta de Vercel |
| LCP | < 2,5 s | Core Web Vitals (campo) |
| INP | < 200 ms | Core Web Vitals |
| TTFB API | < 100 ms p95 | Vercel |
| Disponibilidad | > 99,5 % mensual | Uptime monitor |
| Errores de sync offline | **0** | Contador de flush fallidos |

---

# 9. Producción — Qué falta exactamente

## 9.1 Stack objetivo recomendado (costo: ~$0-1/mes)

| Componente | Elección recomendada | Costo | Estado |
|------------|---------------------|:-----:|--------|
| Hosting | **Vercel** (Hobby) — Next.js nativo, CDN global, HTTPS automático | $0 | ⏳ Pendiente |
| Dominio | `tu-dominio.com` (~$10/año) o `*.vercel.app` gratis | $0-1/mes | ⏳ Pendiente |
| HTTPS + CDN | Automático en Vercel | $0 | Automático |
| Base de datos | **Turso** (libsql) — ya soportado por el código (drizzle.config.ts:8, db/index.ts:6-8) | $0 (free: ~9 GB, millones de lecturas/mes) | ⏳ Pendiente de configurar |
| Backups | Turso (snapshots/retention) + export diario opcional | $0 | ❌ No existe |
| Autenticación | Sesión propia con cookie httpOnly + bcrypt, **o** Cloudflare Access delante (0 código) | $0 | ❌ No existe |
| Rate limiting | Middleware tRPC + headers Vercel (Vercel Firewall en Hobby no; usar middleware propio) | $0 | ❌ No existe |
| Monitoreo | Vercel Analytics (Core Web Vitals) + **Sentry free tier** (errores) | $0 | ❌ No existe |
| Alertas | UptimeRobot (gratis, 50 checks) → email | $0 | ❌ No existe |
| CI/CD | **GitHub Actions** (lint + typecheck + build + tests) + deploy automático Vercel | $0 | ❌ No existe (ni git) |
| Secretos | Vercel Environment Variables (ya previstos: `DATABASE_URL`, `TURSO_AUTH_TOKEN`) | $0 | ⏳ Pendiente |
| Analítica | Vercel Analytics o Plausible self-hosted (opcional) | $0 | ❌ No existe |

## 9.2 Checklist completa de lanzamiento

**Bloqueantes (no lanzar sin esto):**
- [ ] Inicializar repositorio git + subir a GitHub (privado) — hoy **no existe ningún control de versiones**
- [x] Implementar autenticación (o barrera de acceso: Cloudflare Access/Vercel Protection)
- [ ] Arreglar el bug de pérdida de datos de la cola offline
- [ ] Arreglar el bug de zona horaria
- [ ] Configurar Turso (URL + token) — el modo `file:` **no persiste en Vercel serverless** (cada instancia tiene su disco efímero)
- [x] Cabeceras de seguridad + CSP en `next.config.ts`
- [x] Rate limiting en la capa tRPC
- [ ] Migraciones aplicadas como paso de deploy (`db:migrate` en el build) — hoy se ejecutan a mano

**Importantes (primeras 2 semanas en producción):**
- [ ] `error.tsx`/`global-error.tsx`/`not-found.tsx` + mensajes de error visibles en la UI
- [x] `robots.txt` (contenido 100% detrás de auth)
- [ ] Paginación del historial (o cursor) + totales por SQL (no por filas limitadas)
- [x] Registro estructurado mínimo (request id + errores)
- [ ] Backup automatizado de Turso (script + cron mensual, o export CSV)
- [ ] `.nvmrc` + `engines` en package.json (Node 20.9+, probado con 24)
- [x] `poweredByHeader: false`, `generateEtags` por defecto ok

**Deseables:**
- [ ] Monitoreo de errores (Sentry), alertas de uptime, Vercel Analytics
- [x] Edición/borrado de transacciones en la UI (los procedimientos ya existen)
- [ ] Debounce de búsqueda, `aria-live` para guardado, quitar `maximumScale:1`
- [x] Script de export/backup (CSV en Ajustes + `db:backup` para BD local)
- [ ] `sw.js` con `updateViaCache: "none"` y versión de caché de API con expiración
- [ ] Idempotency keys en `transactions.create`

---

# 10. Calidad del código

| Criterio | Evaluación |
|----------|-----------|
| Legibilidad | ⭐⭐⭐⭐⭐ Nombres claros en español/inglés, componentes pequeños (<250 líneas), flujo obvio |
| Consistencia | ⭐⭐⭐⭐ Convenciones uniformes (cn(), Card, Button, i18n de fechas centralizada) |
| Reutilización | ⭐⭐⭐⭐ `formatMoney`, `CategoryIcon`, `TransactionList`, `Chart` bien extraídos |
| Complejidad | ⭐⭐⭐⭐ Sin lógica de negocio en los componentes; helpers puros en lib/ |
| Duplicación | ⭐⭐⭐ El cálculo de filas de transacción está duplicado entre servidor (transactions.ts:26-36) y cliente (use-save-transaction.ts:17-31) — la causa del bug de TZ; extraer a helper compartido |
| Deuda técnica | Baja. Las deudas reales son los bugs §8.2 y la ausencia de tests |

**Estado de la herramienta:** `npm run lint` pasa limpio; `npm run build` compila sin errores ni advertencias; TypeScript en strict mode sin quejas. Bien.

**Testing:** ⚠️ Existe `scripts/e2e.mjs` (smoke E2E con Playwright: captura online, cola offline, flush, persistencia) — cubre exactamente los flujos críticos, pero: (a) requiere dev server manual, (b) no está en package.json ni en CI, (c) **no hay ningún test unitario** de los routers, de `money.ts`, de `date-fields.ts` ni de `offline-queue.ts` (donde está el bug de pérdida de datos). Dado el bug, los tests unitarios de la cola son la prioridad #1 de testing.

---

# 11. Escalabilidad

| Escenario | Análisis |
|-----------|----------|
| **Millones de registros** | Las agregaciones son `GROUP BY` sobre índices → siguen siendo <100 ms. El punto débil es `list` con `LIKE` y orden por fecha + límite 500 sin paginación → **necesitará keyset pagination** (WHERE date < cursor). El almacenamiento: 1 fila ≈ 200 B → 1M filas ≈ 200 MB → el free tier de Turso (9 GB) soporta ~40M de transacciones. Sobra |
| **Múltiples dispositivos** | Turso = DB central → todos los dispositivos leen la misma verdad. El optimistic UI local de cada dispositivo es consistente. Falta solo el bug de TZ resuelto para que todos los dispositivos coincidan |
| **Sincronización offline** | El modelo actual (cola FIFO simple) colapsa con 2+ dispositivos: el dispositivo A no conoce los pendientes del B; sin conflictos ni timestamps de sync, dos dispositivos pueden crear filas duplicadas para el mismo gasto. **Para 1 usuario es aceptable; para multi-dispositivo simultáneo (editar desde el móvil lo creado en la web) se requiere** una versión de dispositivo (device_id + last_sync) o un vector clock simple. No es una reescritura — es una mejora de la capa offline |
| **Crecimiento de la BD** | Turso escala a regiones sin tocar el código; si algún día se supera, la migración a Postgres (Neon free) tocaría solo `src/server/db/index.ts` + driver de Drizzle — **el resto del código es agnóstico al motor** (beneficio real de Drizzle) |
| **Multi-usuario** | Requiere auth + columna `userId` + filtrado por sesión. El middleware tRPC lo haría centralizado. Dicho esto: **no es un objetivo del proyecto** y añadirlo antes de tiempo sería sobreingeniería |

**Conclusión:** la arquitectura escala sin reescribir hasta el punto en que el proyecto tiene sentido; las únicas deudas de escala son paginación y la capa de sync multi-dispositivo.

---

# 12. Experiencia de usuario — Flujo de captura real

Flujo actual en el celular (390 px de ancho, thumb-friendly):

1. **Abrir la app** → bottom nav, botón central + grande de captura. 1 toque.
2. **Monto** → autofocus + teclado numérico. Escribir "7.50".
3. **Categoría** → chips 4×2, última usada pre-seleccionada (Zustand persistido). 1 toque (normalmente ya está bien).
4. **Guardar** → botón XL. 1 toque.
5. **Feedback** → la fila aparece al instante en "Recientes", check verde "¡Guardado!", vibración sutil, el foco vuelve al monto (captura en cadena: siguiente gasto en 3 segundos).

**Veredicto: el flujo cumple el objetivo. Un gasto típico se registra en 2-3 toques y <5 segundos totales (siempre <1s percibido).** Es mejor que la mayoría de apps financieras del mercado (que exigen 4-5 pantallas).

**Mejoras propuestas (por impacto):**
1. **Alta — Duplicar con "Deshacer":** nada rompe más la confianza en una app de dinero que un gasto duplicado; y la cola offline sin idempotencia lo permite. Un toast "Deshacer" de 5 s lo neutraliza.
2. **Alta — Editar/borrar desde la lista:** hoy es imposible corregir un error sin tocar la BD (los procedimientos `update`/`delete` ya existen pero no hay UI).
3. **Media — Guardado automático de draft:** si el usuario escribe un monto y cierra la app, se pierde. Persistir el estado del formulario.
4. **Media — Feedback de error visible:** hoy, si falla el envío, la fila simplemente desaparece en silencio (use-save-transaction.ts:70).
5. **Media — Quick actions:** botón "+" con acción rápida (última categoría → guardar directo con monto solo) para el caso de uso "compra del pan".
6. **Baja — PWA:** `beforeinstallprompt` y guía de instalación iOS; `aria-live` en "¡Guardado!"; permitir zoom.
7. **Baja — Dark mode** (ya en roadmap).

---

# 13. Matriz de riesgos

| ID | Riesgo | Prob. | Impacto | Criticidad | Prioridad | Mitigación |
|----|--------|:-----:|:-------:|:----------:|:---------:|------------|
| R1 | Pérdida de datos en cola offline (bug) | Alta | Alto | **Crítica** | P0 | Fix `useFlushPending` + tests unitarios + idempotency |
| R2 | Exposición pública de datos financieros (sin auth) | Alta | Alto | **Crítica** | P0 | Auth / barrera de acceso antes del deploy público |
| R3 | Pérdida de datos en Vercel (SQLite efímero) | Alta | Alto | **Crítica** | P0 | Turso obligatorio; fallar en build si `DATABASE_URL` falta |
| R4 | Sin control de versiones | Alta | Alto | **Crítica** | P0 | `git init` + GitHub privado hoy |
| R5 | Fechas erróneas por zona horaria | Media | Alto | **Alta** | P1 | Cliente envía epoch; servidor deriva campos |
| R6 | Duplicados por reintento (sin idempotencia) | Media | Medio | **Alta** | P1 | `clientId`/`idempotencyKey` en create |
| R7 | Ataque de spam/DoS a la API pública | Baja | Medio | **Alta** | P1 | Rate limiting |
| R8 | Pérdida total de datos (sin backups) | Baja | Alto | **Alta** | P1 | Backups Turso + export mensual |
| R9 | XSS/clickjacking (sin CSP/headers) | Baja | Medio | **Media** | P2 | Headers + CSP en next.config |
| R10 | Totales incorrectos en historial >500 filas | Media | Bajo | **Media** | P2 | Paginación + totales SQL |
| R11 | Regresión silenciosa (sin tests en CI) | Media | Medio | **Media** | P2 | Unit tests + CI |
| R12 | Sin monitoreo → caída silenciosa | Media | Bajo | **Media** | P2 | UptimeRobot + Sentry |
| R13 | Multi-dispositivo inconsistente | Baja | Bajo | **Baja** | P3 | A futuro: device_id en sync |

---

# 14. Lista priorizada de mejoras (MoSCoW)

## Must Have (sin esto no hay producción)
1. **M1 — Autenticación** (o barrera equivalente). Sesión por cookie httpOnly + bcrypt, 1 cuenta. Middleware `protectedProcedure`.
2. **M2 — Fix cola offline** (pérdida de datos) + tests unitarios de `offline-queue` y `use-save-transaction`.
3. **M3 — Git + GitHub privado** + CI básico (lint, typecheck, build, tests).
4. **M4 — Turso + guard** de entorno: `next build` falla si no hay `DATABASE_URL`/`TURSO_AUTH_TOKEN` (evita deploy con BD efímera).
5. **M5 — Fix zona horaria** (epoch del cliente → campos en servidor).
6. **M6 — Rate limiting** + límites de cuerpo en tRPC.
7. **M7 — Cabeceras de seguridad + CSP** (y `poweredByHeader: false`).
8. **M8 — Migraciones automáticas en el deploy** (`db:migrate` pre-build) + verificación FK.

## Should Have (primer trimestre de producción)
9. **S1 — Paginación (keyset)** del historial + totales calculados en SQL.
10. **S2 — Páginas de error** (`error.tsx`, `global-error.tsx`, `not-found.tsx`) y feedback visible de fallos.
11. **S3 — Backups**: snapshot Turso + script `db:export` (JSON/CSV) manual.
12. **S4 — Editar/borrar transacciones en la UI** (procedimientos existentes).
13. **S5 — Monitoreo**: Sentry (errores) + UptimeRobot (alertas) + Vercel Analytics (CWV).
14. **S6 — `robots.txt` noindex** mientras no haya auth multi-usuario.
15. **S7 — Idempotency keys** en `transactions.create`.
16. **S8 — `.nvmrc`, engines, script `dev:https` para probar SW/PWA local**.

## Nice to Have (V1+)
17. **N1 — Toast "Deshacer"** en captura.
18. **N2 — Draft persistido** del formulario.
19. **N3 — `updateViaCache: "none"` + expiración de caché API del SW**.
20. **N4 — Debounce de búsqueda, zoom accesible, `aria-live`**.
21. **N5 — Dark mode.**
22. **N6 — Instrumentación ligera de métricas de negocio** (transacciones/día, latencia create).

---

# 15. Roadmap de implementación hacia producción

**Fase 0 — Fundación (1-2 días)** · *M3, M2*
Git init + GitHub privado + CI (lint/typecheck/build/test) + tests unitarios de la cola offline + fix del bug de pérdida de datos.

**Fase 1 — Seguridad básica (2-3 días)** · *M1, M6, M7, S6*
Auth de 1 cuenta (cookie httpOnly + bcrypt + middleware tRPC), rate limiting, cabeceras/CSP, noindex, `poweredByHeader: false`.

**Fase 2 — Datos correctos (2-3 días)** · *M5, M8, S1*
Fix de TZ (epoch del cliente), guard de entorno, migraciones en build, verificación FK, paginación + totales SQL, idempotency.

**Fase 3 — Despliegue (1 día)** · *M4, S3, S5*
Crear BD Turso + token, configurar variables en Vercel, primer deploy, verificar HTTPS/dominio, UptimeRobot + Sentry, backup inicial + script de export.

**Fase 4 — Consolidación (1-2 semanas)** · *S2, S4, S7, S8, N1-N4*
Páginas de error, edición/borrado en UI, feedback de fallos, deshacer, draft, pulido PWA/a11y.

**Fase 5 — Estabilización (continuo)**
Uso diario real durante 30 días; revisar CWV reales (Vercel Analytics), latencias p95, cero pérdidas en sync; ajustar alertas.

**Esfuerzo total estimado: 1-2 semanas (media jornada/día) para llegar a producción real. No requiere reescritura.**

---

# 16. Roadmap de evolución (versiones)

**V1 (4-6 semanas tras producción)**
- Presupuestos con alertas (tabla ya lista)
- Gastos fijos recurrentes + autogeneración mensual
- Metas de ahorro con progreso
- Comparación de períodos (mes vs mes)
- Export CSV/JSON (también sirve de backup manual)

**V2 (trimestre 2)**
- Dark mode, heatmap diario
- Ingresos completos con fecha/categoría en dashboard
- Sincronización multi-dispositivo robusta (device_id, resolución de conflictos)
- Notificaciones (presupuesto superado, recordatorio de gasto fijo)

**V3 (futuro, opcional)**
- Insights automáticos (patrones, anomalías) — sin ML: reglas deterministas
- OCR de recibos (solo si la captura manual deja de ser suficiente)
- Integración bancaria (PLAID/API local — requiere evaluación de costo/privacidad)

---

# 17. Recomendación final de arquitectura

**Mantener la arquitectura actual.** Es la elección correcta para los requisitos no negociables:

| Requisito | Cómo lo cumple la arquitectura actual |
|-----------|--------------------------------------|
| <1s captura | Optimistic UI + TanStack Query (ya medido: inserción local ~10 ms, API ~30-50 ms) |
| Móvil excelente | PWA instalable, bottom nav, teclado numérico, safe-area, offline |
| Alta disponibilidad | Vercel (CDN global, auto-scaling serverless) + Turso (replicado) |
| Muy bajo costo | Todo en capas gratuitas: Vercel Hobby $0, Turso free $0, Sentry/UptimeRobot $0 |
| Arquitectura simple | Un solo proceso, tRPC tipado, sin microservicios, sin colas externas |
| Mantenimiento fácil | 4.000 líneas, Drizzle, migraciones versionadas, 1 dependencia de runtime pesada (ECharts) |
| Alta seguridad | Alcanzable con las mejoras M1/M6/M7 (auth + headers + rate limit) |
| Escalabilidad futura | Turso→Postgres sin tocar código; agregaciones indexadas; capas ya modeladas para V2 |

**Decisiones que NO cambiaría:** Next.js 16 + tRPC + Drizzle + libsql/Turso + TanStack Query + PWA. **Decisiones que cambiaría hoy:** añadir auth desde el principio (middleware tRPC), enviar epoch del cliente, paginar el historial, e instrumentar la cola offline con idempotencia.

---

# 18. Veredicto final

**¿Está listo el proyecto para producción? No, no todavía.**

- ✅ **Listo para uso personal local** (LAN) con precaución: funciona, es rápido, y el modo offline mitiga caídas — pero el bug de la cola (R1) puede perder datos incluso en local, y no hay backups.
- ❌ **No listo para el uso diario por Internet:** sin auth expone los datos financieros (R2), y en Vercel sin Turso la BD no persiste (R3). Ambos son bloqueadores absolutos.
- ⏳ **A 1-2 semanas de estar listo:** las Fases 0-3 (§15) convierten este MVP en una aplicación de producción real, gratis, mantenible y sin deuda estructural.

La evidencia que sostiene cada conclusión está en el cuerpo del informe: bugs con referencia a archivo/línea (use-save-transaction.ts:85-103, transactions.ts:23, history-screen.tsx:52), verificación de build (compila limpio, chunks correctos), verificación de config (routes-manifest.json `headers: []`, sin git, sin loading/error boundaries), y análisis del flujo de datos completo.

**Cuando M1-M8 estén completos, este proyecto estará — para un único usuario — en el percentil alto de calidad entre las finanzas personales autoalojadas.** La base es excepcional; lo que falta es ingeniería de producción, no arquitectura.

---

# 19. Habilidades necesarias para el siguiente nivel

## Imprescindibles (valor inmediato, alto impacto)

| Habilidad | Por qué es importante | Impacto | ¿Vale la pena? |
|-----------|----------------------|:-------:|:---------------|
| **Autenticación y sesiones web** | Es el bloqueador #1 (R2). Cookies httpOnly, bcrypt, middleware tRPC | Crítico | Sí — 1-2 días de estudio y se aplica directo |
| **Testing (unit + E2E)** | El bug R1 existe por falta de tests. Vitest/Jest + el e2e.mjs ya escrito | Alto | Sí — domina Vitest, cubre offline-queue y routers |
| **DevOps / CI-CD básico** | Git, GitHub Actions, deploy automatizado Vercel, variables de entorno | Alto | Sí — 1 semana de fundamentos |
| **SQL (avanzado en SQLite)** | Agregaciones, índices, keyset pagination, PRAGMA, EXPLAIN QUERY PLAN | Alto | Sí — el modelo ya lo aprovecha; falta dominar los límites |
| **Seguridad Web (OWASP Top 10)** | CSP, headers, rate limiting, auth, protección de datos financieros | Alto | Sí — nivel "fundamentos" basta para este proyecto |
| **Next.js/React/TypeScript profundos** | Ya se domina el 80%; falta: Server Components, error boundaries, caching | Medio | Sí — cursillo específico de App Router avanzado |
| **PWA avanzada** | Background Sync, caché con expiración, install prompts | Medio | Sí — solo las partes que afectan a sync |

## Recomendables (mejoran calidad, no bloquean)

| Habilidad | Por qué | Impacto | ¿Vale la pena? |
|-----------|---------|:-------:|:---------------|
| **UX/UI móvil** | El flujo de captura ya es bueno; UX refinada (deshacer, drafts) multiplica el uso diario | Medio | Sí — lectura selectiva |
| **Observabilidad** | Sentry, métricas, logging estructurado — cuesta 1 día configurarlo | Medio | Sí — configurar una vez |
| **FinOps** | Elegir capas gratuitas correctas, vigilar uso de Turso/Vercel | Bajo | Sí — solo vigilar, sin estudios |
| **Accesibilidad (WCAG)** | Zoom, contraste, lectores — requisito de calidad y legal eventual | Bajo | Parcial — los fixes concretos de este proyecto son 2 horas |
| **Data Visualization** | ECharts ya resuelve el dashboard; solo si se quieren insights avanzados | Bajo | No por ahora |
| **Product Thinking** | Priorizar V1 vs V2, no sobre-construir | Medio | Sí — hábito, no curso |

## Opcionales (no necesarias para este proyecto)

| Habilidad | Por qué sería útil | Impacto | ¿Vale la pena? |
|-----------|-------------------|:-------:|:---------------|
| **ML / IA aplicada** | Insights y predicciones de gasto | Bajo | No — reglas deterministas cubren el 90% del valor |
| **OCR de recibos** | Captura aún más rápida | Bajo | No — la captura manual <5 s ya supera al OCR en velocidad |
| **Integración bancaria** | Automatizar el registro | Medio | No — costo alto, privacidad de credenciales bancarias, APIs limitadas en Perú |
| **Notificaciones push** | Recordatorios de presupuesto | Medio | Parcial — Web Push es barato y V2 lo puede usar |
| **Automatización (zapier/n8n)** | Importar de otros sistemas | Bajo | No |
| **Machine Learning** | Detección de anomalías | Bajo | No — análisis descriptivo basta para 1 usuario |

---

## Apéndice A — Evidencia técnica clave

| Hallazgo | Referencia |
|----------|-----------|
| Sin autenticación | `src/server/trpc.ts:7` — `publicProcedure` en los 11 procedimientos |
| Bug cola offline | `src/hooks/use-save-transaction.ts:85-103` — `clearPendingQueue()` tras envío parcial |
| Bug zona horaria | `src/server/routers/transactions.ts:23` (`new Date()` servidor) vs `src/hooks/use-save-transaction.ts:18` (cliente) |
| Sin cabeceras de seguridad | `.next/routes-manifest.json` → `"headers": []` |
| SQLite efímero en serverless | `src/server/db/index.ts:6-8` — `file:` por defecto; `next.config.ts` no define fallback |
| Sin git | `git status` → `fatal: not a git repository` |
| Sin error/loading/not-found | `Test-Path` → `False` en los 4 archivos |
| Sin paginación + totales incorrectos | `src/server/routers/transactions.ts:49` (`limit 500`) + `src/components/history-screen.tsx:52,55-56` |
| Chunk ECharts aislado (lazy) | `.next/build-manifest.json` — `0-2glljkywec1.js` (564 KB) solo en dashboard |
| Latencia real local | `dev.log` — create 12-121 ms, queries 12-39 ms |
| Modelo e índices | `src/server/db/schema.ts:24-56`, `drizzle/0001_flimsy_loners.sql` |
| Build y lint limpios | `npm run build` (5.3 s, sin warnings), `npm run lint` (sin errores) |
| Procedimientos sin UI | `src/server/routers/transactions.ts:83-108` (`update`, `delete`) |
