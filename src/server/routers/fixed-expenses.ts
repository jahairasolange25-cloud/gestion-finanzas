import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { fixedExpenses, categories, transactions } from "../db/schema";
import type { Db } from "../db";
import { protectedProcedure, router } from "../trpc";
import { toDateFields } from "../../lib/date-fields";
import type { FixedExpense } from "../db/schema";

const frequencies = ["weekly", "monthly", "yearly"] as const;

const baseFields = {
  name: z.string().trim().min(1, "El nombre es obligatorio").max(60),
  amountCents: z
    .number()
    .int()
    .positive("El monto debe ser mayor a 0")
    .max(10_000_000_000, "El monto no puede superar S/ 100,000,000"),
  categoryId: z.string().max(64).nullable().optional(),
  frequency: z.enum(frequencies).default("monthly"),
  /** Para monthly/yearly: día del mes (1-31). Para weekly: día de la semana (0=Dom..6=Sáb). */
  chargeDay: z.number().int().min(0).max(31).optional(),
  note: z.string().trim().max(200).optional().nullable(),
};

const createSchema = z.object(baseFields).superRefine(refineChargeDay);
const updateSchema = z.object(baseFields).partial().superRefine(refineChargeDay).extend({
  id: z.string().max(64),
});

function refineChargeDay(v: { frequency?: "weekly" | "monthly" | "yearly"; chargeDay?: number }, ctx: z.RefinementCtx) {
  if (v.frequency === undefined || v.chargeDay === undefined) return;
  if (v.frequency === "weekly" && v.chargeDay > 6) {
    ctx.addIssue({
      code: "custom",
      path: ["chargeDay"],
      message: "Para frecuencia semanal el día debe ser 0 (domingo) a 6 (sábado)",
    });
  }
  if (v.frequency !== "weekly" && (v.chargeDay < 1 || v.chargeDay > 31)) {
    ctx.addIssue({
      code: "custom",
      path: ["chargeDay"],
      message: "El día de cobro debe estar entre 1 y 31",
    });
  }
}

async function assertCategory(db: Db, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const cat = await db
    .select({ id: categories.id, type: categories.type })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  if (!cat) throw new TRPCError({ code: "NOT_FOUND", message: "La categoría no existe" });
  if (cat.type !== "expense") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Los gastos fijos solo aplican a categorías de gasto",
    });
  }
}

/** Ocurrencias de cobro de un gasto fijo dentro del mes (año, mes 1-12). */
export function chargeDatesForMonth(
  fe: Pick<FixedExpense, "frequency" | "chargeDay" | "createdAt">,
  year: number,
  month: number,
): Date[] {
  const dates: Date[] = [];
  if (fe.frequency === "monthly") {
    const lastDay = new Date(year, month, 0).getDate();
    dates.push(new Date(year, month - 1, Math.min(fe.chargeDay, lastDay)));
  } else if (fe.frequency === "yearly") {
    const created = new Date(fe.createdAt);
    if (created.getMonth() + 1 === month) {
      const lastDay = new Date(year, month, 0).getDate();
      dates.push(new Date(year, month - 1, Math.min(fe.chargeDay, lastDay)));
    }
  } else {
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month - 1, d);
      if (dt.getDay() === fe.chargeDay) dates.push(dt);
    }
  }
  return dates;
}

export const fixedExpensesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: fixedExpenses.id,
        name: fixedExpenses.name,
        amountCents: fixedExpenses.amountCents,
        categoryId: fixedExpenses.categoryId,
        frequency: fixedExpenses.frequency,
        chargeDay: fixedExpenses.chargeDay,
        isActive: fixedExpenses.isActive,
        note: fixedExpenses.note,
        createdAt: fixedExpenses.createdAt,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColor: categories.color,
      })
      .from(fixedExpenses)
      .leftJoin(categories, eq(fixedExpenses.categoryId, categories.id))
      .orderBy(fixedExpenses.createdAt)
      .all(),
  ),

  create: protectedProcedure.input(createSchema).mutation(async ({ ctx, input }) => {
    await assertCategory(ctx.db, input.categoryId);
    const now = Date.now();
    const row = {
      id: randomUUID(),
      name: input.name,
      amountCents: input.amountCents,
      categoryId: input.categoryId ?? null,
      frequency: input.frequency,
      chargeDay: input.chargeDay ?? 1,
      isActive: true,
      note: input.note ?? null,
      createdAt: now,
    };
    await ctx.db.insert(fixedExpenses).values(row).run();
    return row;
  }),

  update: protectedProcedure.input(updateSchema).mutation(async ({ ctx, input }) => {
    const { id, ...rest } = input;
    const existing = await ctx.db
      .select()
      .from(fixedExpenses)
      .where(eq(fixedExpenses.id, id))
      .get();
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Gasto fijo no encontrado" });

    const nextCategoryId = rest.categoryId !== undefined ? rest.categoryId : existing.categoryId;
    await assertCategory(ctx.db, nextCategoryId);

    const changes: Record<string, unknown> = { ...rest };
    if (rest.frequency !== undefined && rest.frequency !== existing.frequency) {
      changes.chargeDay = rest.chargeDay ?? 1;
    }
    return ctx.db
      .update(fixedExpenses)
      .set(changes)
      .where(eq(fixedExpenses.id, id))
      .returning()
      .get();
  }),

  setActive: protectedProcedure
    .input(z.object({ id: z.string().max(64), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db
        .update(fixedExpenses)
        .set({ isActive: input.isActive })
        .where(eq(fixedExpenses.id, input.id))
        .returning()
        .get();
      if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Gasto fijo no encontrado" });
      return res;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().max(64) }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db
        .delete(fixedExpenses)
        .where(eq(fixedExpenses.id, input.id))
        .run();
      if (res.rowsAffected === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Gasto fijo no encontrado" });
      }
      return { ok: true };
    }),

  /**
   * Genera (de forma perezosa e idempotente) las transacciones del mes para los
   * gastos fijos activos. Clave de idempotencia: clientId `fe:<id>:<YYYY-MM-DD>`,
   * protegida por el índice único de transactions.client_id.
   */
  generateMonth: protectedProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }))
    .mutation(async ({ ctx, input }) => {
      const fes = await ctx.db
        .select()
        .from(fixedExpenses)
        .where(eq(fixedExpenses.isActive, true))
        .all();

      let created = 0;
      let skipped = 0;
      for (const fe of fes) {
        for (const d of chargeDatesForMonth(fe, input.year, input.month)) {
          const f = toDateFields(d);
          const clientId = `fe:${fe.id}:${f.date}`;
          const existing = await ctx.db
            .select({ id: transactions.id })
            .from(transactions)
            .where(eq(transactions.clientId, clientId))
            .get();
          if (existing) {
            skipped++;
            continue;
          }
          const now = Date.now();
          const row = {
            id: randomUUID(),
            type: "expense" as const,
            amountCents: fe.amountCents,
            categoryId: fe.categoryId,
            concept: fe.name,
            note: null,
            clientId,
            ...f,
            createdAt: now,
            updatedAt: now,
          };
          try {
            await ctx.db.insert(transactions).values(row).run();
            created++;
          } catch {
            skipped++;
          }
        }
      }
      return { created, skipped, total: fes.length };
    }),

  /** Proyección del mes: gastos fijos activos que tocará cobrar y su total. */
  monthPreview: protectedProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }))
    .query(async ({ ctx, input }) => {
      const fes = await ctx.db
        .select()
        .from(fixedExpenses)
        .where(eq(fixedExpenses.isActive, true))
        .all();
      const items = fes.flatMap((fe) =>
        chargeDatesForMonth(fe, input.year, input.month).map((d) => {
          const f = toDateFields(d);
          return {
            id: fe.id,
            name: fe.name,
            amountCents: fe.amountCents,
            categoryId: fe.categoryId,
            date: f.date,
            clientId: `fe:${fe.id}:${f.date}`,
          };
        }),
      );
      return {
        year: input.year,
        month: input.month,
        count: items.length,
        totalCents: items.reduce((a, i) => a + i.amountCents, 0),
        items: items.sort((a, b) => (a.date < b.date ? -1 : 1)),
      };
    }),
});
