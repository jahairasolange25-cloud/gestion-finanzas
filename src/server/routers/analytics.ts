import { z } from "zod";
import { and, asc, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { categories, transactions } from "../db/schema";
import { protectedProcedure, router } from "../trpc";
import { parseDate, toDateFields } from "../../lib/date-fields";

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function sumCents(type: "expense" | "income") {
  return sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = ${type} THEN ${transactions.amountCents} ELSE 0 END), 0)`;
}

function isoWeekStart(dateStr: string): string {
  const d = parseDate(dateStr);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toDateFields(d).date;
}

const monthLabel = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

export const analyticsRouter = router({
  summary: protectedProcedure.input(rangeSchema).query(async ({ ctx, input }) => {
    const { from, to } = input;
    const where = and(gte(transactions.date, from), lte(transactions.date, to));

    const totals = await ctx.db
      .select({
        income: sumCents("income"),
        expense: sumCents("expense"),
        n: count(),
      })
      .from(transactions)
      .where(where)
      .get();

    const biggest = await ctx.db
      .select()
      .from(transactions)
      .where(and(where, eq(transactions.type, "expense")))
      .orderBy(desc(transactions.amountCents))
      .limit(1)
      .get();

    const byDay = await ctx.db
      .select({
        date: transactions.date,
        expense: sumCents("expense"),
        income: sumCents("income"),
      })
      .from(transactions)
      .where(where)
      .groupBy(transactions.date)
      .orderBy(asc(transactions.date))
      .all();

    const byCategory = await ctx.db
      .select({
        categoryId: transactions.categoryId,
        name: categories.name,
        icon: categories.icon,
        color: categories.color,
        total: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
        n: count(),
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(where, eq(transactions.type, "expense")))
      .groupBy(transactions.categoryId)
      .orderBy(desc(sql`COALESCE(SUM(${transactions.amountCents}), 0)`))
      .all();

    const byWeek = new Map<string, number>();
    for (const row of byDay) {
      if (row.expense <= 0) continue;
      const w = isoWeekStart(row.date);
      byWeek.set(w, (byWeek.get(w) ?? 0) + row.expense);
    }
    const weekSeries = [...byWeek.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([weekStart, total]) => ({ weekStart, total }));

    const now = new Date();
    const months: { year: number; month: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    const monthRows = await ctx.db
      .select({
        year: transactions.year,
        month: transactions.month,
        total: sumCents("expense"),
      })
      .from(transactions)
      .where(eq(transactions.type, "expense"))
      .groupBy(transactions.year, transactions.month)
      .all();
    const monthMap = new Map(
      monthRows.map((r) => [monthLabel(r.year, r.month), r.total]),
    );
    const byMonth = months.map((m) => ({
      year: m.year,
      month: m.month,
      total: monthMap.get(monthLabel(m.year, m.month)) ?? 0,
    }));

    const daysElapsed = Math.max(
      1,
      Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000) + 1,
    );

    return {
      income: totals?.income ?? 0,
      expense: totals?.expense ?? 0,
      balance: (totals?.income ?? 0) - (totals?.expense ?? 0),
      count: totals?.n ?? 0,
      dailyAvgExpense: Math.round((totals?.expense ?? 0) / daysElapsed),
      biggest: biggest ?? null,
      topCategory: byCategory[0] ?? null,
      byDay,
      byCategory,
      byWeek: weekSeries,
      byMonth,
    };
  }),
});
