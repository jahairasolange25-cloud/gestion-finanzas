import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const transactionType = ["expense", "income"] as const;
export type TransactionType = (typeof transactionType)[number];

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: transactionType }).notNull().default("expense"),
  icon: text("icon").notNull().default("tag"),
  color: text("color").notNull().default("#6366f1"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

/**
 * Tabla analítica principal.
 * Los campos de fecha (year, month, quarter, semester, weekIso, day, dayOfWeek, hour)
 * se denormalizan al insertar para que las agregaciones sean `GROUP BY` directos
 * sobre índices, sin llamar funciones SQL por fila.
 */
export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: transactionType }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    concept: text("concept"),
    note: text("note"),
    /** Clave de idempotencia generada por el cliente (evita duplicados en reintentos/cola offline). */
    clientId: text("client_id"),
    /** Ciclo "YYYY-MM" (25 → 24) al que pertenece la fecha. */
    cycleKey: text("cycle_key").notNull().default(""),
    /** Si nació de marcar un gasto fijo como pagado. */
    fixedExpenseId: text("fixed_expense_id").references(() => fixedExpenses.id, {
      onDelete: "set null",
    }),
    date: text("date").notNull(),
    ts: integer("ts").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    quarter: integer("quarter").notNull(),
    semester: integer("semester").notNull(),
    weekIso: integer("week_iso").notNull(),
    day: integer("day").notNull(),
    dayOfWeek: integer("day_of_week").notNull(),
    hour: integer("hour").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_tx_date").on(t.date),
    index("idx_tx_category").on(t.categoryId),
    index("idx_tx_type").on(t.type),
    index("idx_tx_year_month").on(t.year, t.month),
    index("idx_tx_week").on(t.weekIso),
    index("idx_tx_created").on(t.createdAt),
    index("idx_tx_cycle").on(t.cycleKey),
    index("idx_tx_cycle_category").on(t.cycleKey, t.categoryId),
    index("idx_tx_fixed").on(t.fixedExpenseId),
    uniqueIndex("idx_tx_client").on(t.clientId),
  ],
);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_sessions_user").on(t.userId),
    index("idx_sessions_expires").on(t.expiresAt),
  ],
);

export const fixedExpenses = sqliteTable("fixed_expenses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  categoryId: text("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  frequency: text("frequency", { enum: ["weekly", "monthly", "yearly"] })
    .notNull()
    .default("monthly"),
  chargeDay: integer("charge_day").notNull().default(1),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
});

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    /** Meta por ciclo "YYYY-MM" (25 → 24). */
    cycleKey: text("cycle_key").notNull().default(""),
    amountCents: integer("amount_cents").notNull(),
    /** Sobrante arrastrado del ciclo anterior (o movido desde otro concepto). */
    carryCents: integer("carry_cents").notNull().default(0),
    period: text("period", { enum: ["monthly"] }).notNull().default("monthly"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("idx_budgets_cat_cycle").on(t.categoryId, t.cycleKey)],
);

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  targetCents: integer("target_cents").notNull(),
  currentCents: integer("current_cents").notNull().default(0),
  icon: text("icon").notNull().default("piggy-bank"),
  color: text("color").notNull().default("#10b981"),
  deadline: text("deadline"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

/** Sub-bolsillos del ahorro (Fondo de emergencia, Metas grandes, Viaje...). */
export const savingsBuckets = sqliteTable("savings_buckets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Porcentaje del aporte del ciclo que va a este bolsillo (0-100). */
  pct: integer("pct").notNull().default(0),
  icon: text("icon").notNull().default("piggy-bank"),
  color: text("color").notNull().default("#10b981"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

export const savingsEntryKind = ["aporte", "sobrante", "retiro", "ajuste"] as const;
export type SavingsEntryKind = (typeof savingsEntryKind)[number];

/** Movimientos del ahorro; el signo lo determina el tipo. */
export const savingsEntries = sqliteTable(
  "savings_entries",
  {
    id: text("id").primaryKey(),
    bucketId: text("bucket_id")
      .notNull()
      .references(() => savingsBuckets.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: savingsEntryKind }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    cycleKey: text("cycle_key").notNull().default(""),
    note: text("note"),
    date: text("date").notNull(),
    ts: integer("ts").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_savings_bucket").on(t.bucketId),
    index("idx_savings_cycle").on(t.cycleKey),
    index("idx_savings_ts").on(t.ts),
  ],
);

/** Cierres de ciclo: un registro por ciclo cerrado. */
export const cycleClosures = sqliteTable("cycle_closures", {
  id: text("id").primaryKey(),
  cycleKey: text("cycle_key").notNull().unique(),
  /** Total que pasó a ahorro en el cierre. */
  savedCents: integer("saved_cents").notNull().default(0),
  /** Total arrastrado o movido a otros conceptos. */
  carriedCents: integer("carried_cents").notNull().default(0),
  note: text("note"),
  closedAt: integer("closed_at").notNull(),
});

export const closureDecisions = ["savings", "carry", "move"] as const;
export type ClosureDecision = (typeof closureDecisions)[number];

/** Decisión tomada por cada concepto con sobrante al cerrar el ciclo. */
export const cycleClosureItems = sqliteTable(
  "cycle_closure_items",
  {
    id: text("id").primaryKey(),
    closureId: text("closure_id")
      .notNull()
      .references(() => cycleClosures.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    /** Snapshot del nombre por si la categoría se elimina. */
    categoryName: text("category_name").notNull().default(""),
    leftoverCents: integer("leftover_cents").notNull(),
    decision: text("decision", { enum: closureDecisions }).notNull(),
    targetCategoryId: text("target_category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_closure_items_closure").on(t.closureId)],
);

export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type FixedExpense = typeof fixedExpenses.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type SavingsBucket = typeof savingsBuckets.$inferSelect;
export type SavingsEntry = typeof savingsEntries.$inferSelect;
export type CycleClosure = typeof cycleClosures.$inferSelect;
export type CycleClosureItem = typeof cycleClosureItems.$inferSelect;
