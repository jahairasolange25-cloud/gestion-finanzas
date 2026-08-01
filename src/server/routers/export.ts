import { z } from "zod";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { categories, transactions } from "../db/schema";
import { protectedProcedure, router } from "../trpc";
import { todayStr } from "../../lib/date-fields";

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Escape de celdas CSV (separador `;`, comillas dobladas). */
function csvCell(s: string): string {
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const exportRouter = router({
  /** Export CSV de transacciones (BOM UTF-8 para Excel, separador `;`). */
  csv: protectedProcedure.input(rangeSchema).query(async ({ ctx, input }) => {
    const conds: (ReturnType<typeof gte> | ReturnType<typeof lte>)[] = [];
    if (input.from) conds.push(gte(transactions.date, input.from));
    if (input.to) conds.push(lte(transactions.date, input.to));
    const where = conds.length ? and(...conds) : undefined;

    const rows = await ctx.db
      .select({
        date: transactions.date,
        type: transactions.type,
        concept: transactions.concept,
        note: transactions.note,
        amountCents: transactions.amountCents,
        categoryName: categories.name,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      .orderBy(asc(transactions.date), asc(transactions.createdAt))
      .all();

    const header = ["Fecha", "Tipo", "Categoría", "Concepto", "Nota", "Monto (S/)"];
    const lines = rows.map((r) =>
      [
        r.date,
        r.type === "expense" ? "Gasto" : "Ingreso",
        csvCell(r.categoryName ?? ""),
        csvCell(r.concept ?? ""),
        csvCell(r.note ?? ""),
        (r.amountCents / 100).toFixed(2).replace(".", ","),
      ].join(";"),
    );

    return {
      filename: `finanzas-${todayStr()}.csv`,
      csv: `\uFEFF${[header.join(";"), ...lines].join("\r\n")}`,
    };
  }),
});
