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

E2E: `npm run dev` en otra terminal y luego `node scripts/e2e.mjs`
(prueba captura, cola offline y sincronización; requiere `npm i -D playwright`).

## Deploy (Vercel + Turso)

```bash
# 1. Crea una BD en Turso y saca su URL + token
# 2. En Vercel configura:
DATABASE_URL=libsql://tu-db.turso.io
TURSO_AUTH_TOKEN=eyJ...
```

La app usa el mismo driver para local y remoto; sin variables usa
`data/finanzas.db` local.

## Arquitectura

```
src/
├── app/                    # Rutas: / (captura), /history, /dashboard, /settings
│   ├── api/trpc/[trpc]/    # Route handler de tRPC (nodejs runtime)
│   ├── manifest.ts         # Web App Manifest (PWA)
│   ├── providers.tsx       # QueryClient + tRPC provider
│   └── layout.tsx          # Shell, PWA sync, metadata
├── server/
│   ├── db/                 # Drizzle schema + cliente + categorías seed
│   ├── routers/            # transactions, categories, analytics (tRPC)
│   └── context.ts, trpc.ts # init tRPC
├── components/
│   ├── capture-form.tsx    # Formulario <1s: monto → categoría → guardar
│   ├── dashboard-screen.tsx# KPIs + 5 gráficos ECharts
│   ├── history-screen.tsx  # Filtros: mes, tipo, categoría, búsqueda
│   ├── settings-screen.tsx # CRUD de categorías
│   ├── transaction-list.tsx# Lista agrupada por día
│   ├── charts.tsx          # Wrapper ECharts (lazy, tree-shaken)
│   ├── pwa-sync.tsx        # SW + detección offline + flush de cola
│   └── layout/             # Sidebar desktop + bottom nav móvil
├── hooks/use-save-transaction.ts  # Optimistic UI + cola offline
├── lib/                    # money, date-fields, trpc, offline-queue, types
└── store/ui-store.ts       # Zustand persistido (última categoría)
```

## Modelo de datos

Tablas: `categories`, `transactions`, `fixed_expenses`, `budgets`, `goals`
(fijas/ presupuestos/ metas listas para V2).

`transactions` denormaliza los campos de fecha al insertar
(`year`, `month`, `quarter`, `semester`, `weekIso`, `day`, `dayOfWeek`, `hour`)
con 6 índices, para que las agregaciones del dashboard sean `GROUP BY` puros
sobre índices sin funciones SQL por fila. Montos en **céntimos** (INTEGER).

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

- Backups: exportar la BD (`data/finanzas.db`) o migrar a Turso.
- El usuario es único: no hay autenticación (a propósito). Si se despliega
  en Vercel, la BD es privada por defecto (sin endpoints públicos).

## Roadmap

- **MVP** (hecho): captura <1s, dashboard KPIs + gráficos, historial con
  filtros, PWA instalable, modo offline con cola, CRUD categorías.
- **V1**: ingresos con fecha/categoría completos, comparación de períodos,
  heatmap diario, export CSV/JSON.
- **V2**: presupuestos con alertas, gastos fijos recurrentes, metas de ahorro.
- **Futuro**: insights automáticos, dark mode, autogeneración de gastos fijos.
