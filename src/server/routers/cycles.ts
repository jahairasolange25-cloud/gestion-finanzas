import { z } from "zod";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import {
  budgets,
  categories,
  closureDecisions,
  cycleClosureItems,
  cycleClosures,
  fixedExpenses,
  savingsBuckets,
  savingsEntries,
  transactions,
} from "../db/schema";
import type { Db } from "../db";
import { protectedProcedure, router } from "../trpc";
import { parseDate, toDateFields, todayStr } from "../../lib/date-fields";
import {
  cycleBounds,
  cycleKeyOf,
  cycleLabel,
  daysUntilNextPayday,
  nextCycleKey,
  nextPaydayStr,
  splitByPct,
} from "../../lib/cycle";
import { chargeDatesInRange } from "./fixed-expenses";

const cycleKeySchema = z.string().regex(/^\d{4}-\d{2}$/, "Ciclo inválido");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) => {
      const [y, m, d] = s.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    },
    { message: "Fecha de calendario inválida" },
  );

/** Sobrantes por concepto del ciclo: meta + arrastrado − consumido (solo positivos). */
async function computeLeftovers(db: Db, cycleKey: string) {
  const metas = await db
    .select({
      categoryId: budgets.categoryId,
      amountCents: budgets.amountCents,
      carryCents: budgets.carryCents,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(eq(budgets.cycleKey, cycleKey), eq(budgets.isActive, true)))
    .all();

  const spentRows = await db
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
  const spentBy = new Map<string, number>();
  for (const r of spentRows) {
    if (r.categoryId) spentBy.set(r.categoryId, r.total ?? 0);
  }

  return metas
    .map((m) => {
      const availableCents = m.amountCents + m.carryCents;
      const spentCents = spentBy.get(m.categoryId) ?? 0;
      return {
        categoryId: m.categoryId,
        name: m.name,
        icon: m.icon,
        color: m.color,
        amountCents: m.amountCents,
        carryCents: m.carryCents,
        availableCents,
        spentCents,
        leftoverCents: availableCents - spentCents,
      };
    })
    .filter((r) => r.leftoverCents > 0);
}

export const cyclesRouter = router({
  /** Ciclo actual: rango, etiqueta y días restantes hasta el próximo 25. */
  current: protectedProcedure
    .input(
      z
        .object({
          cycleKey: cycleKeySchema.optional(),
          today: dateSchema.optional(),
        })
        .optional(),
    )
    .query(({ input }) => {
      const ref = input?.today ? parseDate(input.today) : new Date();
      const cycleKey = input?.cycleKey ?? cycleKeyOf(input?.today ?? todayStr());
      const { start, end } = cycleBounds(cycleKey);
      return {
        cycleKey,
        label: cycleLabel(cycleKey),
        start,
        end,
        daysRemaining: daysUntilNextPayday(ref),
        nextPayday: nextPaydayStr(ref),
      };
    }),

  /** Resumen del ciclo para la pantalla principal. */
  overview: protectedProcedure
    .input(z.object({ cycleKey: cycleKeySchema }))
    .query(async ({ ctx, input }) => {
      const cycleKey = input.cycleKey;
      const { start, end } = cycleBounds(cycleKey);

      const incomeRow = await ctx.db
        .select({
          total: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(transactions)
        .where(
          and(eq(transactions.type, "income"), eq(transactions.cycleKey, cycleKey)),
        )
        .get();

      const fes = await ctx.db
        .select({
          id: fixedExpenses.id,
          amountCents: fixedExpenses.amountCents,
          frequency: fixedExpenses.frequency,
          chargeDay: fixedExpenses.chargeDay,
          createdAt: fixedExpenses.createdAt,
        })
        .from(fixedExpenses)
        .where(eq(fixedExpenses.isActive, true))
        .all();
      const fijosExpectedCents = fes.reduce(
        (s, fe) => s + chargeDatesInRange(fe, start, end).length * fe.amountCents,
        0,
      );

      const fijosPaidRow = await ctx.db
        .select({
          total: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.cycleKey, cycleKey),
            isNotNull(transactions.fixedExpenseId),
          ),
        )
        .get();

      const metas = await ctx.db
        .select({ amountCents: budgets.amountCents, carryCents: budgets.carryCents })
        .from(budgets)
        .where(and(eq(budgets.cycleKey, cycleKey), eq(budgets.isActive, true)))
        .all();
      const personalMetaCents = metas.reduce(
        (s, m) => s + m.amountCents + m.carryCents,
        0,
      );

      const personalSpentRow = await ctx.db
        .select({ total: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.type, "expense"),
            eq(transactions.cycleKey, cycleKey),
            isNull(transactions.fixedExpenseId),
          ),
        )
        .get();

      const savingsCycleRow = await ctx.db
        .select({
          total: sql<number>`COALESCE(SUM(CASE WHEN ${savingsEntries.kind} IN ('aporte','sobrante','ajuste') THEN ${savingsEntries.amountCents} ELSE 0 END), 0)`,
        })
        .from(savingsEntries)
        .where(eq(savingsEntries.cycleKey, cycleKey))
        .get();

      const savingsBalanceRow = await ctx.db
        .select({
          total: sql<number>`COALESCE(SUM(CASE WHEN ${savingsEntries.kind} = 'retiro' THEN -${savingsEntries.amountCents} ELSE ${savingsEntries.amountCents} END), 0)`,
        })
        .from(savingsEntries)
        .get();

      const bucketCountRow = await ctx.db
        .select({ n: sql<number>`COUNT(*)` })
        .from(savingsBuckets)
        .where(eq(savingsBuckets.isActive, true))
        .get();

      const closure = await ctx.db
        .select()
        .from(cycleClosures)
        .where(eq(cycleClosures.cycleKey, cycleKey))
        .get();

      const incomeTotal = incomeRow?.total ?? 0;
      const savingCycle = savingsCycleRow?.total ?? 0;

      return {
        cycleKey,
        income: { totalCents: incomeTotal, count: incomeRow?.count ?? 0 },
        fijos: {
          expectedCents: fijosExpectedCents,
          paidCents: fijosPaidRow?.total ?? 0,
          paidCount: fijosPaidRow?.count ?? 0,
          count: fes.length,
        },
        personales: {
          metaCents: personalMetaCents,
          spentCents: personalSpentRow?.total ?? 0,
          withMetaCount: metas.length,
        },
        ahorros: {
          cycleCents: savingCycle,
          totalCents: savingsBalanceRow?.total ?? 0,
          bucketCount: bucketCountRow?.n ?? 0,
        },
        unassignedCents:
          incomeTotal - fijosExpectedCents - personalMetaCents - savingCycle,
        closure: closure
          ? {
              id: closure.id,
              closedAt: closure.closedAt,
              savedCents: closure.savedCents,
              carriedCents: closure.carriedCents,
            }
          : null,
      };
    }),

  /** Sobrantes por concepto y estado del cierre del ciclo. */
  leftovers: protectedProcedure
    .input(z.object({ cycleKey: cycleKeySchema }))
    .query(async ({ ctx, input }) => {
      const items = await computeLeftovers(ctx.db, input.cycleKey);
      const closure = await ctx.db
        .select()
        .from(cycleClosures)
        .where(eq(cycleClosures.cycleKey, input.cycleKey))
        .get();
      const closureItems = closure
        ? await ctx.db
            .select()
            .from(cycleClosureItems)
            .where(eq(cycleClosureItems.closureId, closure.id))
            .all()
        : [];

      return {
        cycleKey: input.cycleKey,
        items,
        totalLeftoverCents: items.reduce((s, i) => s + i.leftoverCents, 0),
        closure: closure ?? null,
        closureItems,
      };
    }),

  /** Cierra el ciclo aplicando una decisión por cada concepto con sobrante. */
  close: protectedProcedure
    .input(
      z.object({
        cycleKey: cycleKeySchema,
        date: dateSchema.optional(),
        decisions: z.array(
          z.object({
            categoryId: z.string().max(64),
            decision: z.enum(closureDecisions),
            targetCategoryId: z.string().max(64).nullable().optional(),
          }),
        ),
        note: z.string().trim().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const already = await ctx.db
        .select()
        .from(cycleClosures)
        .where(eq(cycleClosures.cycleKey, input.cycleKey))
        .get();
      if (already) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Este ciclo ya está cerrado",
        });
      }

      const leftovers = await computeLeftovers(ctx.db, input.cycleKey);
      const leftoverByCat = new Map(leftovers.map((l) => [l.categoryId, l]));
      const decidedCats = new Set(input.decisions.map((d) => d.categoryId));

      for (const l of leftovers) {
        if (!decidedCats.has(l.categoryId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Falta la decisión para el sobrante de "${l.name}"`,
          });
        }
      }

      for (const d of input.decisions) {
        const lo = leftoverByCat.get(d.categoryId);
        if (!lo) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "El concepto indicado no tiene sobrante en este ciclo",
          });
        }
        if (d.decision === "move") {
          if (!d.targetCategoryId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Falta el concepto destino para el sobrante de "${lo.name}"`,
            });
          }
          if (d.targetCategoryId === d.categoryId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "El concepto destino debe ser distinto al de origen",
            });
          }
          const target = await ctx.db
            .select()
            .from(categories)
            .where(eq(categories.id, d.targetCategoryId))
            .get();
          if (!target || target.type !== "expense") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "El concepto destino no es válido",
            });
          }
        }
      }

      const needsSavings = input.decisions.some((d) => d.decision === "savings");
      const buckets = await ctx.db
        .select()
        .from(savingsBuckets)
        .where(and(eq(savingsBuckets.isActive, true), sql`${savingsBuckets.pct} > 0`))
        .orderBy(savingsBuckets.sortOrder)
        .all();
      if (needsSavings && buckets.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No hay sub-bolsillos activos con porcentaje para recibir el sobrante",
        });
      }

      const now = Date.now();
      const f = input.date ? toDateFields(parseDate(input.date)) : toDateFields();
      const closureId = randomUUID();
      const nextKey = nextCycleKey(input.cycleKey);

      let savedCents = 0;
      let carriedCents = 0;
      const itemRows: Array<typeof cycleClosureItems.$inferInsert> = [];

      for (const d of input.decisions) {
        const lo = leftoverByCat.get(d.categoryId)!;

        if (d.decision === "savings") {
          const parts = splitByPct(
            lo.leftoverCents,
            buckets.map((b) => ({ id: b.id, pct: b.pct })),
          );
          for (const p of parts) {
            if (p.amountCents <= 0) continue;
            await ctx.db
              .insert(savingsEntries)
              .values({
                id: randomUUID(),
                bucketId: p.id,
                kind: "sobrante",
                amountCents: p.amountCents,
                cycleKey: input.cycleKey,
                note: `Sobrante ${cycleLabel(input.cycleKey)} · ${lo.name}`,
                ...f,
                createdAt: now,
              })
              .run();
          }
          savedCents += lo.leftoverCents;
        } else {
          const targetCatId =
            d.decision === "carry" ? d.categoryId : d.targetCategoryId!;
          const existingRow = await ctx.db
            .select()
            .from(budgets)
            .where(
              and(
                eq(budgets.categoryId, targetCatId),
                eq(budgets.cycleKey, nextKey),
              ),
            )
            .get();
          if (existingRow) {
            await ctx.db
              .update(budgets)
              .set({ carryCents: existingRow.carryCents + lo.leftoverCents })
              .where(eq(budgets.id, existingRow.id))
              .run();
          } else {
            await ctx.db
              .insert(budgets)
              .values({
                id: randomUUID(),
                categoryId: targetCatId,
                cycleKey: nextKey,
                amountCents: 0,
                carryCents: lo.leftoverCents,
                period: "monthly",
                isActive: true,
                createdAt: now,
              })
              .run();
          }
          carriedCents += lo.leftoverCents;
        }

        itemRows.push({
          id: randomUUID(),
          closureId,
          categoryId: d.categoryId,
          categoryName: lo.name,
          leftoverCents: lo.leftoverCents,
          decision: d.decision,
          targetCategoryId: d.targetCategoryId ?? null,
          createdAt: now,
        });
      }

      await ctx.db
        .insert(cycleClosures)
        .values({
          id: closureId,
          cycleKey: input.cycleKey,
          savedCents,
          carriedCents,
          note: input.note ?? null,
          closedAt: now,
        })
        .run();
      for (const row of itemRows) {
        await ctx.db.insert(cycleClosureItems).values(row).run();
      }

      return {
        closureId,
        savedCents,
        carriedCents,
        items: itemRows.length,
      };
    }),
});
