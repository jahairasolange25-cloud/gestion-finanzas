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

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  period: text("period", { enum: ["monthly"] }).notNull().default("monthly"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

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

export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type FixedExpense = typeof fixedExpenses.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Goal = typeof goals.$inferSelect;
