import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { budgets, categories, transactions } from "../db/schema";
import type { Db } from "../db";
import { protectedProcedure, router } from "../trpc";

const amountSchema = z
  .number()
  .int()
  .positive("El monto debe ser mayor a 0")
  .max(10_000_000_000, "El monto no puede superar S/ 100,000,000");

const upsertSchema = z.object({
  categoryId: z.string().max(64),
  amountCents: amountSchema,
});

const monthSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

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
      message: "El presupuesto solo aplica a categorías de gasto",
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

export const budgetsRouter = router({
  /** Presupuestos con lo gastado en el período indicado (por defecto, mes actual). */
  list: protectedProcedure
    .input(monthSchema.partial())
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const year = input.year ?? now.getFullYear();
      const month = input.month ?? now.getMonth() + 1;

      const rows = await ctx.db
        .select({
          id: budgets.id,
          categoryId: budgets.categoryId,
          amountCents: budgets.amountCents,
          period: budgets.period,
          isActive: budgets.isActive,
          createdAt: budgets.createdAt,
          categoryName: categories.name,
          categoryIcon: categories.icon,
          categoryColor: categories.color,
        })
        .from(budgets)
        .leftJoin(categories, eq(budgets.categoryId, categories.id))
        .orderBy(categories.name)
        .all();

      const catIds = rows
        .map((r) => r.categoryId)
        .filter((id): id is string => id !== null);
      const spentByCat = new Map<string, number>();
      if (catIds.length > 0) {
        const spentRows = await ctx.db
          .select({
            categoryId: transactions.categoryId,
            total: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.type, "expense"),
              eq(transactions.year, year),
              eq(transactions.month, month),
              inArray(transactions.categoryId, catIds),
            ),
          )
          .groupBy(transactions.categoryId)
          .all();
        for (const r of spentRows) {
          if (r.categoryId) spentByCat.set(r.categoryId, r.total ?? 0);
        }
      }

      return {
        year,
        month,
        rows: rows.map((r) => {
          const spentCents = r.categoryId !== null ? (spentByCat.get(r.categoryId) ?? 0) : 0;
          return {
            ...r,
            spentCents,
            pct: r.amountCents > 0 ? Math.min(100, Math.round((spentCents / r.amountCents) * 100)) : 0,
            status: budgetStatus(spentCents, r.amountCents),
          };
        }),
      };
    }),

  /** Un presupuesto por categoría: crea si no existe, actualiza el monto si ya hay. */
  upsert: protectedProcedure
    .input(upsertSchema)
    .mutation(async ({ ctx, input }) => {
      await assertExpenseCategory(ctx.db, input.categoryId);

      const existing = await ctx.db
        .select()
        .from(budgets)
        .where(eq(budgets.categoryId, input.categoryId))
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
        amountCents: input.amountCents,
        period: "monthly" as const,
        isActive: true,
        createdAt: Date.now(),
      };
      await ctx.db.insert(budgets).values(row).run();
      return row;
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
      if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Presupuesto no encontrado" });
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Presupuesto no encontrado" });
      }
      return { ok: true };
    }),
});
