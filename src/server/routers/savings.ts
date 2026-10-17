import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { savingsBuckets, savingsEntries } from "../db/schema";
import { protectedProcedure, router } from "../trpc";
import { parseDate, toDateFields } from "../../lib/date-fields";
import { cycleKeyOf, splitByPct, todayCycleKey } from "../../lib/cycle";

const cycleKeySchema = z.string().regex(/^\d{4}-\d{2}$/, "Ciclo inválido");

const amountSchema = z
  .number()
  .int()
  .positive("El monto debe ser mayor a 0")
  .max(10_000_000_000, "El monto no puede superar S/ 100,000,000");

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

const SALDO = sql<number>`COALESCE(SUM(CASE WHEN ${savingsEntries.kind} = 'retiro' THEN -${savingsEntries.amountCents} ELSE ${savingsEntries.amountCents} END), 0)`;

export const savingsRouter = router({
  /** Sub-bolsillos con saldo acumulado + aportes/retiros del ciclo + movimientos recientes. */
  list: protectedProcedure
    .input(z.object({ cycleKey: cycleKeySchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const cycleKey = input?.cycleKey ?? todayCycleKey();

      const buckets = await ctx.db
        .select()
        .from(savingsBuckets)
        .orderBy(savingsBuckets.sortOrder, savingsBuckets.createdAt)
        .all();

      const balances = await ctx.db
        .select({ bucketId: savingsEntries.bucketId, balance: SALDO })
        .from(savingsEntries)
        .groupBy(savingsEntries.bucketId)
        .all();
      const balanceBy = new Map(balances.map((b) => [b.bucketId, b.balance ?? 0]));

      const bucketRows = buckets.map((b) => ({
        ...b,
        balanceCents: balanceBy.get(b.id) ?? 0,
      }));

      const cycleRow = await ctx.db
        .select({
          aportes: sql<number>`COALESCE(SUM(CASE WHEN ${savingsEntries.kind} IN ('aporte','sobrante','ajuste') THEN ${savingsEntries.amountCents} ELSE 0 END), 0)`,
          retiros: sql<number>`COALESCE(SUM(CASE WHEN ${savingsEntries.kind} = 'retiro' THEN ${savingsEntries.amountCents} ELSE 0 END), 0)`,
        })
        .from(savingsEntries)
        .where(eq(savingsEntries.cycleKey, cycleKey))
        .get();

      const recent = await ctx.db
        .select({
          id: savingsEntries.id,
          bucketId: savingsEntries.bucketId,
          kind: savingsEntries.kind,
          amountCents: savingsEntries.amountCents,
          cycleKey: savingsEntries.cycleKey,
          note: savingsEntries.note,
          date: savingsEntries.date,
          ts: savingsEntries.ts,
          bucketName: savingsBuckets.name,
          bucketIcon: savingsBuckets.icon,
          bucketColor: savingsBuckets.color,
        })
        .from(savingsEntries)
        .innerJoin(savingsBuckets, eq(savingsEntries.bucketId, savingsBuckets.id))
        .orderBy(desc(savingsEntries.ts))
        .limit(30)
        .all();

      return {
        cycleKey,
        buckets: bucketRows,
        totalCents: bucketRows.reduce((s, b) => s + b.balanceCents, 0),
        cycle: {
          aportes: cycleRow?.aportes ?? 0,
          retiros: cycleRow?.retiros ?? 0,
        },
        recent,
      };
    }),

  /** Crea o actualiza un sub-bolsillo. */
  upsertBucket: protectedProcedure
    .input(
      z.object({
        id: z.string().max(64).optional(),
        name: z.string().trim().min(1, "El nombre es obligatorio").max(60),
        pct: z.number().int().min(0).max(100),
        icon: z.string().max(40).optional(),
        color: z.string().max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const existing = await ctx.db
          .select()
          .from(savingsBuckets)
          .where(eq(savingsBuckets.id, input.id))
          .get();
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sub-bolsillo no encontrado" });
        }
        return ctx.db
          .update(savingsBuckets)
          .set({
            name: input.name,
            pct: input.pct,
            icon: input.icon ?? existing.icon,
            color: input.color ?? existing.color,
          })
          .where(eq(savingsBuckets.id, input.id))
          .returning()
          .get();
      }

      const count = await ctx.db
        .select({ n: sql<number>`COUNT(*)` })
        .from(savingsBuckets)
        .get();
      const row = {
        id: randomUUID(),
        name: input.name,
        pct: input.pct,
        icon: input.icon ?? "piggy-bank",
        color: input.color ?? "#10b981",
        sortOrder: count?.n ?? 0,
        isActive: true,
        createdAt: Date.now(),
      };
      await ctx.db.insert(savingsBuckets).values(row).run();
      return row;
    }),

  setBucketActive: protectedProcedure
    .input(z.object({ id: z.string().max(64), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db
        .update(savingsBuckets)
        .set({ isActive: input.isActive })
        .where(eq(savingsBuckets.id, input.id))
        .returning()
        .get();
      if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Sub-bolsillo no encontrado" });
      return res;
    }),

  /** Elimina un sub-bolsillo solo si nunca tuvo movimientos. */
  removeBucket: protectedProcedure
    .input(z.object({ id: z.string().max(64) }))
    .mutation(async ({ ctx, input }) => {
      const entries = await ctx.db
        .select({ n: sql<number>`COUNT(*)` })
        .from(savingsEntries)
        .where(eq(savingsEntries.bucketId, input.id))
        .get();
      if ((entries?.n ?? 0) > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "El sub-bolsillo tiene movimientos; desactívalo en su lugar",
        });
      }
      const res = await ctx.db
        .delete(savingsBuckets)
        .where(eq(savingsBuckets.id, input.id))
        .run();
      if (res.rowsAffected === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sub-bolsillo no encontrado" });
      }
      return { ok: true };
    }),

  /** Aporte del ciclo: se reparte automáticamente según el % de cada sub-bolsillo. */
  aporte: protectedProcedure
    .input(
      z.object({
        amountCents: amountSchema,
        date: dateSchema.optional(),
        note: z.string().trim().max(200).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const buckets = await ctx.db
        .select()
        .from(savingsBuckets)
        .where(and(eq(savingsBuckets.isActive, true), sql`${savingsBuckets.pct} > 0`))
        .orderBy(savingsBuckets.sortOrder)
        .all();
      if (buckets.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No hay sub-bolsillos activos con porcentaje asignado",
        });
      }

      const f = input.date ? toDateFields(parseDate(input.date)) : toDateFields();
      const cycleKey = cycleKeyOf(f.date);
      const parts = splitByPct(
        input.amountCents,
        buckets.map((b) => ({ id: b.id, pct: b.pct })),
      );

      const now = Date.now();
      const rows = parts
        .filter((p) => p.amountCents > 0)
        .map((p) => ({
          id: randomUUID(),
          bucketId: p.id,
          kind: "aporte" as const,
          amountCents: p.amountCents,
          cycleKey,
          note: input.note ?? null,
          ...f,
          createdAt: now,
        }));

      for (const row of rows) {
        await ctx.db.insert(savingsEntries).values(row).run();
      }

      return {
        cycleKey,
        totalCents: rows.reduce((s, r) => s + r.amountCents, 0),
        entries: rows.map((r) => ({
          bucketId: r.bucketId,
          amountCents: r.amountCents,
          bucketName: buckets.find((b) => b.id === r.bucketId)?.name ?? "",
        })),
      };
    }),

  /** Retiro de un sub-bolsillo; valida que haya saldo suficiente. */
  retiro: protectedProcedure
    .input(
      z.object({
        bucketId: z.string().max(64),
        amountCents: amountSchema,
        date: dateSchema.optional(),
        note: z.string().trim().max(200).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const bucket = await ctx.db
        .select()
        .from(savingsBuckets)
        .where(eq(savingsBuckets.id, input.bucketId))
        .get();
      if (!bucket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sub-bolsillo no encontrado" });
      }

      const balanceRow = await ctx.db
        .select({ balance: SALDO })
        .from(savingsEntries)
        .where(eq(savingsEntries.bucketId, input.bucketId))
        .get();
      const balance = balanceRow?.balance ?? 0;
      if (input.amountCents > balance) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El monto supera el saldo disponible del sub-bolsillo",
        });
      }

      const f = input.date ? toDateFields(parseDate(input.date)) : toDateFields();
      const now = Date.now();
      const row = {
        id: randomUUID(),
        bucketId: input.bucketId,
        kind: "retiro" as const,
        amountCents: input.amountCents,
        cycleKey: cycleKeyOf(f.date),
        note: input.note ?? null,
        ...f,
        createdAt: now,
      };
      await ctx.db.insert(savingsEntries).values(row).run();
      return { ...row, bucketName: bucket.name };
    }),

  /** Historial de movimientos, opcionalmente filtrado por sub-bolsillo. */
  history: protectedProcedure
    .input(
      z.object({
        bucketId: z.string().max(64).optional(),
        limit: z.number().int().min(1).max(200).default(60),
      }),
    )
    .query(({ ctx, input }) => {
      const q = ctx.db
        .select({
          id: savingsEntries.id,
          bucketId: savingsEntries.bucketId,
          kind: savingsEntries.kind,
          amountCents: savingsEntries.amountCents,
          cycleKey: savingsEntries.cycleKey,
          note: savingsEntries.note,
          date: savingsEntries.date,
          ts: savingsEntries.ts,
          bucketName: savingsBuckets.name,
          bucketIcon: savingsBuckets.icon,
          bucketColor: savingsBuckets.color,
        })
        .from(savingsEntries)
        .innerJoin(savingsBuckets, eq(savingsEntries.bucketId, savingsBuckets.id))
        .orderBy(desc(savingsEntries.ts))
        .limit(input.limit);
      return input.bucketId
        ? q.where(eq(savingsEntries.bucketId, input.bucketId)).all()
        : q.all();
    }),
});
