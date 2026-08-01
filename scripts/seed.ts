import { randomUUID } from "node:crypto";
import { count } from "drizzle-orm";
import { categories, transactions } from "../src/server/db/schema";
import { db } from "../src/server/db";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from "../src/server/db/seed-categories";
import { toDateFields } from "../src/lib/date-fields";

const now = Date.now();
let catId = 0;
const catIds = new Map<string, string>();

async function seedCategories() {
  const existing = await db.select({ n: count() }).from(categories).get();
  if (existing && existing.n > 0) {
    console.log("ℹ Categorías ya existen, se omiten");
    return;
  }
  const incomeNames = new Set<string>(DEFAULT_INCOME_CATEGORIES.map((c) => c.name));
  const rows = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map(
    (c) => {
      const id = `cat-${++catId}`;
      catIds.set(c.name, id);
      return {
        id,
        name: c.name,
        type: incomeNames.has(c.name) ? ("income" as const) : ("expense" as const),
        icon: c.icon,
        color: c.color,
        sortOrder: 0,
        isActive: true,
        isSystem: true,
        createdAt: now,
      };
    },
  );
  await db.insert(categories).values(rows).run();
  console.log(`✓ ${rows.length} categorías sembradas`);
}

async function seedDemoTransactions() {
  const args = process.argv.slice(2);
  if (!args.includes("--demo")) return;

  const catIdOf = (name: string) => catIds.get(name) ?? `cat-1`;

  const demo: { type: "expense" | "income"; cat: string; concept: string; amount: number }[] = [
    { type: "expense", cat: "Alimentación", concept: "Mercado semanal", amount: 85 },
    { type: "expense", cat: "Transporte", concept: "Pasajes", amount: 12 },
    { type: "expense", cat: "Café", concept: "Café", amount: 9 },
    { type: "expense", cat: "Entretenimiento", concept: "Cine", amount: 28 },
    { type: "income", cat: "Sueldo", concept: "Sueldo", amount: 2500 },
  ];

  const rows: (typeof transactions.$inferInsert)[] = [];
  const daysAgo = 120;
  for (let i = 0; i < daysAgo; i++) {
    const base = new Date(now - i * 86400000);
    const nTx = 1 + Math.floor(Math.random() * 4);
    for (let j = 0; j < nTx; j++) {
      const d = new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate(),
        8 + Math.floor(Math.random() * 12),
        Math.floor(Math.random() * 60),
      );
      const f = toDateFields(d);
      const t = demo[Math.floor(Math.random() * 4)];
      rows.push({
        id: randomUUID(),
        type: t.type,
        amountCents: Math.round(t.amount * 100),
        categoryId: catIdOf(t.cat),
        concept: t.concept,
        note: null,
        ...f,
        createdAt: d.getTime(),
        updatedAt: d.getTime(),
      });
    }
    if (i % 30 === 0) {
      rows.push({
        id: randomUUID(),
        type: "income",
        amountCents: 250000,
        categoryId: catIdOf("Sueldo"),
        concept: "Sueldo",
        note: null,
        ...toDateFields(new Date(base.getFullYear(), base.getMonth(), 1, 9)),
        createdAt: base.getTime(),
        updatedAt: base.getTime(),
      });
    }
  }
  await db.insert(transactions).values(rows).run();
  console.log(`✓ ${rows.length} transacciones demo`);
}

async function main() {
  await seedCategories();
  await seedDemoTransactions();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
