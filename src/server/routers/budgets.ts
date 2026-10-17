import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { budgets, categories, transactions } from "../db/schema";
import type { Db } from "../db";
import { protectedProcedure, router } from "../trpc";
import { prevCycleKey, todayCycleKey } from "../../lib/cycle";

const cycleKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Ciclo inválido");

const amountSchema = z
  .number()
  .int()
  .positive("El monto debe ser mayor a 0")
  .max(10_000_000_000, "El monto no puede superar S/ 100,000,000");

async function assertExpenseCategory(db: Db, categoryId: string) {
  const cat = await db
    .select({ id: categories.id, type: categories.type })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  if (!cat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "La categoría no existe" });
  }
  if (cat.type !== "expense") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "La meta solo aplica a conceptos de gasto",
    });
  }
}

export type BudgetStatus = "ok" | "near" | "over";

/** Umbrales de alerta: cerca al 80 %, superado al 100 %. */
export function budgetStatus(spentCents: number, amountCents: number): BudgetStatus {
  if (amountCents <= 0) return "ok";
  if (spentCents >= amountCents) return "over";
  if (spentCents >= amountCents * 0.8) return "near";
  return "ok";
}

export function remainingCents(availableCents: number, spentCents: number): number {
  return availableCents - spentCents;
}

export const budgetsRouter = router({
  /**
   * Conceptos de gasto con su meta del ciclo, lo consumido y el sobrante.
   * Incluye conceptos sin meta para poder asignarla.
   */
  list: protectedProcedure
    .input(z.object({ cycleKey: cycleKeySchema.optional() }))
    .query(async ({ ctx, input }) => {
      const cycleKey = input.cycleKey ?? todayCycleKey();

      const cats = await ctx.db
        .select({
          id: categories.id,
          name: categories.name,
          icon: categories.icon,
          color: categories.color,
        })
        .from(categories)
        .where(and(eq(categories.type, "expense"), eq(categories.isActive, true)))
        .orderBy(categories.sortOrder, categories.name)
        .all();

      const metas = await ctx.db
        .select({
          id: budgets.id,
          categoryId: budgets.categoryId,
          amountCents: budgets.amountCents,
          carryCents: budgets.carryCents,
        })
        .from(budgets)
        .where(and(eq(budgets.cycleKey, cycleKey), eq(budgets.isActive, true)))
        .all();
      const metaByCat = new Map(metas.map((m) => [m.categoryId, m]));

      const spentRows = await ctx.db
        .select({
          categoryId: transactions.categoryId,
          total: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.type, "expense"),
            eq(transactions.cycleKey, cycleKey),
            isNull(transactions.fixedExpenseId),
          ),
        )
        .groupBy(transactions.categoryId)
        .all();
      const spentByCat = new Map<string, number>();
      for (const r of spentRows) {
        if (r.categoryId) spentByCat.set(r.categoryId, r.total ?? 0);
      }

      const rows = cats.map((c) => {
        const meta = metaByCat.get(c.id);
        const amountCents = meta?.amountCents ?? 0;
        const carryCents = meta?.carryCents ?? 0;
        const availableCents = amountCents + carryCents;
        const spentCents = spentByCat.get(c.id) ?? 0;
        return {
          categoryId: c.id,
          name: c.name,
          icon: c.icon,
          color: c.color,
          budgetId: meta?.id ?? null,
          amountCents,
          carryCents,
          availableCents,
          spentCents,
          remainingCents: availableCents - spentCents,
          pct:
            availableCents > 0
              ? Math.min(100, Math.round((spentCents / availableCents) * 100))
              : 0,
          status: budgetStatus(spentCents, availableCents),
        };
      });

      const totals = rows.reduce(
        (acc, r) => ({
          metaCents: acc.metaCents + r.amountCents,
          carryCents: acc.carryCents + r.carryCents,
          spentCents: acc.spentCents + r.spentCents,
        }),
        { metaCents: 0, carryCents: 0, spentCents: 0 },
      );

      return { cycleKey, rows, totals };
    }),

  /** Asigna o actualiza la meta de un concepto para un ciclo. */
  upsert: protectedProcedure
    .input(
      z.object({
        categoryId: z.string().max(64),
        cycleKey: cycleKeySchema,
        amountCents: amountSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertExpenseCategory(ctx.db, input.categoryId);

      const existing = await ctx.db
        .select()
        .from(budgets)
        .where(
          and(
            eq(budgets.categoryId, input.categoryId),
            eq(budgets.cycleKey, input.cycleKey),
          ),
        )
        .get();

      if (existing) {
        return ctx.db
          .update(budgets)
          .set({ amountCents: input.amountCents, isActive: true })
          .where(eq(budgets.id, existing.id))
          .returning()
          .get();
      }

      const row = {
        id: randomUUID(),
        categoryId: input.categoryId,
        cycleKey: input.cycleKey,
        amountCents: input.amountCents,
        carryCents: 0,
        period: "monthly" as const,
        isActive: true,
        createdAt: Date.now(),
      };
      await ctx.db.insert(budgets).values(row).run();
      return row;
    }),

  /** Copia las metas del ciclo anterior al actual (solo conceptos sin meta todavía). */
  copyPrevious: protectedProcedure
    .input(z.object({ cycleKey: cycleKeySchema }))
    .mutation(async ({ ctx, input }) => {
      const prev = prevCycleKey(input.cycleKey);
      const prevRows = await ctx.db
        .select()
        .from(budgets)
        .where(and(eq(budgets.cycleKey, prev), eq(budgets.isActive, true)))
        .all();

      const currentRows = await ctx.db
        .select({ categoryId: budgets.categoryId })
        .from(budgets)
        .where(eq(budgets.cycleKey, input.cycleKey))
        .all();
      const taken = new Set(currentRows.map((r) => r.categoryId));

      let created = 0;
      for (const r of prevRows) {
        if (taken.has(r.categoryId)) continue;
        await ctx.db
          .insert(budgets)
          .values({
            id: randomUUID(),
            categoryId: r.categoryId,
            cycleKey: input.cycleKey,
            amountCents: r.amountCents,
            carryCents: 0,
            period: "monthly" as const,
            isActive: true,
            createdAt: Date.now(),
          })
          .run();
        created++;
      }
      return { created };
    }),

  setActive: protectedProcedure
    .input(z.object({ id: z.string().max(64), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db
        .update(budgets)
        .set({ isActive: input.isActive })
        .where(eq(budgets.id, input.id))
        .returning()
        .get();
      if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Meta no encontrada" });
      return res;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().max(64) }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db
        .delete(budgets)
        .where(eq(budgets.id, input.id))
        .run();
      if (res.rowsAffected === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meta no encontrada" });
      }
      return { ok: true };
    }),
});
