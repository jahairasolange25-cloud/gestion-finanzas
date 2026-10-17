# Mis Finanzas — Gestión de Finanzas Personales

PWA personal para registrar gastos en segundos y analizar patrones de consumo.
Optimizada para móvil, con modo offline y dashboard tipo Business Intelligence.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **tRPC v11** + **Zod** — API tipada de punta a punta
- **Drizzle ORM** + **SQLite (libsql)** — funciona local (`file:`) y en Turso (`libsql://`)
- **TanStack Query v5** — cache + optimistic updates (el corazón del <1s)
- **Zustand** — estado UI (última categoría usada, modo offline)
- **Apache ECharts** (tree-shaken) — gráficos del dashboard
- **Tailwind CSS v4** + **lucide-react** — UI
- **PWA** — manifest, service worker propio, instalable, offline

## Requisitos

- Node.js 20.9+ (probado con 24)

## Puesta en marcha

```bash
npm install
npm run db:migrate    # crea data/finanzas.db con el esquema
npm run db:seed       # categorías por defecto (18)
npm run db:demo       # + 300 transacciones demo (opcional)
npm run dev           # http://localhost:3000
```

Scripts BD: `db:generate` (drizzle-kit), `db:migrate`, `db:seed`, `db:demo`,
`db:reset` (borra datos; `--hard` borra el archivo).

Calidad: `npm test` (vitest, 146 tests unitarios/integración), `npm run lint`,
`npx tsc --noEmit`, `npm run build`.

E2E: `npm run dev` en otra terminal y luego `node scripts/e2e.mjs`
(prueba captura, cola offline y sincronización; requiere `npm i -D playwright`).

## Git y CI
```bash
git init
git add -A
git commit -m "Fase 0: fundacion - tests, idempotencia offline, esquema auth, CI"
git branch -M main
# crea el repo en https://github.com/new (sin README/licencia/gitignore)
git remote add origin https://github.com/TU-USUARIO/gestion-finanzas.git
git push -u origin main
```

El workflow `.github/workflows/ci.yml` corre lint + typecheck + tests + build
en cada push/PR (Node 24, `npm ci`). Requisitos: Node 20.9+ (`.nvmrc` = 24).

## Deploy (Vercel + Turso)

**Producción:** https://gestion-finanzas-five-kappa.vercel.app
(BD: `libsql://finanzas-jahairasolange25-cloud.aws-us-east-1.turso.io`)

```bash
# 1. Crea una BD en Turso y saca su URL + token
# 2. En Vercel configura:
DATABASE_URL=libsql://tu-db.turso.io
TURSO_AUTH_TOKEN=eyJ...
# 3. Aplica el esquema y las categorías por defecto (una vez, con variables):
npm run db:migrate && npm run db:seed
# 4. Despliega:
vercel link && vercel --prod
```

La app usa el mismo driver para local y remoto; sin variables usa
`data/finanzas.db` local. Los deploys son manuales (`vercel --prod`);
para auto-deploy al hacer push: Vercel → proyecto → Settings → Git →
Connect Repository.

## Arquitectura

```
src/
├── app/                    # Rutas: / (inicio + captura), /history, /dashboard,
│   │                       # /fixed, /concepts, /savings, /close, /settings
│   ├── api/trpc/[trpc]/    # Route handler de tRPC (nodejs runtime)
│   ├── manifest.ts         # Web App Manifest (PWA)
│   ├── providers.tsx       # QueryClient + tRPC provider
│   └── layout.tsx          # Shell, PWA sync, metadata
├── server/
│   ├── db/                 # Drizzle schema + cliente + categorías seed
│   ├── routers/            # transactions, categories, analytics (tRPC)
│   │                       # fixed-expenses, budgets, savings, cycles
│   └── context.ts, trpc.ts # init tRPC
├── components/
│   ├── home-screen.tsx     # Ciclo actual + 3 secciones + captura + recientes
│   ├── capture-form.tsx    # Formulario <1s: monto → categoría → guardar
│   ├── fixed-expenses-screen.tsx # Cobros del ciclo + marcar pagado
│   ├── concepts-screen.tsx # Metas por concepto (gastado de meta)
│   ├── savings-screen.tsx  # Sub-bolsillos: aportar, retirar, historial
│   ├── close-cycle-screen.tsx# Cierre de ciclo con decisiones de sobrantes
│   ├── dashboard-screen.tsx# KPIs + 5 gráficos ECharts
│   ├── history-screen.tsx  # Filtros: mes, tipo, categoría, búsqueda
│   ├── settings-screen.tsx # CRUD de categorías + accesos
│   ├── transaction-list.tsx# Lista agrupada por día
│   ├── charts.tsx          # Wrapper ECharts (lazy, tree-shaken)
│   ├── pwa-sync.tsx        # SW + detección offline + flush de cola
│   └── layout/             # Sidebar desktop + bottom nav móvil
├── hooks/use-save-transaction.ts  # Optimistic UI + cola offline
├── lib/                    # money, date-fields, cycle (25→24 + reparto %),
│                           # trpc, offline-queue, types
└── store/ui-store.ts       # Zustand persistido (última categoría)
```

## Modelo de datos

Tablas: `users`, `sessions`, `categories`, `transactions`, `fixed_expenses`,
`budgets` (meta por concepto y ciclo), `goals`, `savings_buckets`,
`savings_entries` (movimientos: `aporte`/`sobrante`/`retiro`/`ajuste`),
`cycle_closures` y `cycle_closure_items` (decisiones del cierre).

`transactions` denormaliza los campos de fecha al insertar
(`cycleKey`, `year`, `month`, `quarter`, `semester`, `weekIso`, `day`,
`dayOfWeek`, `hour`) con 10 índices, para que las agregaciones del dashboard
sean `GROUP BY` puros sobre índices sin funciones SQL por fila. Montos en
**céntimos** (INTEGER). `clientId` único da idempotencia a la cola offline y
`fixedExpenseId` vincula los pagos de gastos fijos.

## Modelo de ciclo (25 → 24)

El ciclo va del **25 de un mes al 24 del siguiente** (el 25 es el día de pago).
`cycleKey` es `"YYYY-MM"` del mes en que inicia y se deriva del calendario
local del cliente (`src/lib/cycle.ts`); el servidor nunca lo infiere de UTC.

- **Inicio**: ciclo actual, días para el próximo pago, ingresos del ciclo y
  "sin asignar" = ingresos − cobros fijos esperados − metas de conceptos −
  aportes a ahorro del ciclo.
- **Fijos** (`/fixed`): cada gasto fijo proyecta sus cobros con fecha esperada
  dentro del ciclo; "marcar pagado" crea la transacción (idempotente por
  `clientId`) y se puede deshacer.
- **Personales** (`/concepts`): meta por concepto por ciclo (`budgets`),
  disponible = meta + sobrante arrastrado (`carryCents`) − gastado. Los gastos
  de conceptos excluyen transacciones de gastos fijos.
- **Ahorros** (`/savings`): sub-bolsillos con porcentaje (20/50/30 por
  defecto); cada aporte se reparte con `splitByPct` (residuo del redondeo a
  los de mayor fracción).
- **Cierre** (`/close`): por cada concepto con sobrante se decide `savings`
  (repartir a bolsillos), `carry` (arrastrar al próximo ciclo) o `move`
  (mover a otro concepto); guarda `cycle_closures` + `cycle_closure_items`
  y los `savings_entries` tipo `sobrante`.

## Estrategia <1s para registrar un gasto

1. **Optimistic UI** — la fila aparece en la lista al instante; la escritura
   va en segundo plano y los queries se invalidan en background.
2. **Cola offline** — si no hay red, la transacción se guarda en
   localStorage y se reenvía al reconectar (evento `online`); el UI muestra
   "Pendiente de sincronizar".
3. **Captura mínima** — monto con teclado numérico (auto-focus), chips de
   categoría (pre-selecciona la última usada vía Zustand persistido),
   concepto opcional. Todo lo demás queda en "Más opciones".

## Seguridad de datos

- **Autenticación**: cuenta única creada en la primera visita (setup). Sesión
  por cookie `httpOnly` + `SameSite=Lax` + `Secure` (prod), token con hash
  SHA-256 en BD, 30 días con renovación deslizante, máx. 5 sesiones.
  Contraseña con scrypt (salt por usuario, comparación en tiempo constante).
- **CSRF**: verificación de Origin en toda mutación + SameSite=Lax.
- **Rate limiting**: 10 intentos de login / 15 min, 120 mutaciones / min,
  600 queries / min (en memoria).
- **Headers**: CSP estricto, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `poweredByHeader: false`,
  `robots.txt` con disallow total.
- **Logging**: registro estructurado JSON por request (`requestId`, `ip`,
  ruta, latencia; errores siempre, >1000 ms como warning).
- **Integridad**: editar/borrar transacciones desde el historial (con
  confirmación) y export CSV de todo el historial en Ajustes (separador `;`,
  BOM UTF-8, nombre `finanzas-YYYY-MM-DD.csv`).
- Backups: `npm run db:backup` (copia con timestamp de la BD local en
  `backups/`); para BD remota: `turso db dump <nombre-db>`.

## Roadmap

- **MVP** (hecho): captura <1s, dashboard KPIs + gráficos, historial con
  filtros, PWA instalable, modo offline con cola, CRUD categorías.
- **V1** (hecho): auth de una cuenta, ingresos con fecha/categoría, export
  CSV, edición/borrado en historial, backups.
- **V2** (hecho): modelo de ciclo 25→24 — metas por concepto, gastos fijos
  con pago por ciclo, sub-bolsillos de ahorro con % y cierre de ciclo con
  decisiones de sobrantes.
- **Futuro**: comparación de períodos, heatmap diario, export JSON,
  insights automáticos, dark mode, notificaciones.
