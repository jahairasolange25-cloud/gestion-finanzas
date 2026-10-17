import { z } from "zod";
import { and, desc, eq, gte, lt, lte, or, sql } from "drizzle-orm";
import type { Column, SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import {
  categories,
  transactions,
  transactionType,
} from "../db/schema";
import type { Db } from "../db";
import { protectedProcedure, router } from "../trpc";
import { parseDate, toDateFields, todayStr } from "../../lib/date-fields";
import { cycleKeyOf } from "../../lib/cycle";

/** Rango de epoch plausible: 2000-01-01 a 2100-01-01. */
const tsSchema = z
  .number()
  .int()
  .min(946684800000)
  .max(4102444800000);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) => {
      const [y, m, d] = s.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return (
        dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
      );
    },
    { message: "Fecha de calendario inválida" },
  );

const createSchema = z.object({
  type: z.enum(transactionType),
  amountCents: z
    .number()
    .int()
    .positive("El monto debe ser mayor a 0")
    .max(10_000_000_000, "El monto no puede superar S/ 100,000,000"),
  categoryId: z.string().max(64).nullable().optional(),
  concept: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  date: dateSchema.optional(),
  ts: tsSchema.optional(),
  clientId: z.string().max(64).optional(),
});

/** Escapa comodines de LIKE para que la búsqueda sea literal. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** LIKE literal: `like()` de Drizzle no emite ESCAPE, y SQLite no tiene escape por defecto. */
function likeLiteral(column: Column | SQL.Aliased | SQL, q: string): SQL {
  return sql`${column} like ${`%${escapeLike(q)}%`} escape '\\'`;
}

/** Valida que la categoría exista y que su tipo coincida con el de la transacción. */
async function assertCategoryMatches(
  db: Db,
  categoryId: string | null | undefined,
  type: (typeof transactionType)[number],
): Promise<void> {
  if (!categoryId) return;
  const cat = await db
    .select({ id: categories.id, type: categories.type })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  if (!cat) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "La categoría no existe",
    });
  }
  if (cat.type !== type) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "La categoría no corresponde al tipo de transacción",
    });
  }
}

export const transactionsRouter = router({
  create: protectedProcedure
    .input(createSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCategoryMatches(ctx.db, input.categoryId, input.type);

      if (input.clientId) {
        const existing = await ctx.db
          .select()
          .from(transactions)
          .where(eq(transactions.clientId, input.clientId))
          .get();
        if (existing) return existing;
      }

      const d = input.date
        ? parseDate(input.date)
        : input.ts
          ? new Date(input.ts)
          : new Date();
      const f = toDateFields(d);
      const now = Date.now();
      const row = {
        id: input.clientId ?? randomUUID(),
        type: input.type,
        amountCents: input.amountCents,
        categoryId: input.categoryId ?? null,
        concept: input.concept ?? null,
        note: input.note ?? null,
        clientId: input.clientId ?? null,
        cycleKey: cycleKeyOf(f.date),
        ...f,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await ctx.db.insert(transactions).values(row).run();
      } catch (err) {
        // Carrera: otro request con el mismo clientId ganó → devolver el existente.
        if (input.clientId) {
          const winner = await ctx.db
            .select()
            .from(transactions)
            .where(eq(transactions.clientId, input.clientId))
            .get();
          if (winner) return winner;
        }
        throw err;
      }
      return row;
    }),

  list: protectedProcedure
    .input(
      z.object({
        from: dateSchema.optional(),
        to: dateSchema.optional(),
        cycleKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        type: z.enum(transactionType).optional(),
        categoryId: z.string().max(64).optional(),
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(200).default(100),
        /** Cursor de paginación keyset: base64("ts:id") de la última fila. */
        cursor: z.string().max(128).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds = [];
      if (input.from) conds.push(gte(transactions.date, input.from));
      if (input.to) conds.push(lte(transactions.date, input.to));
      if (input.cycleKey) conds.push(eq(transactions.cycleKey, input.cycleKey));
      if (input.type) conds.push(eq(transactions.type, input.type));
      if (input.categoryId)
        conds.push(eq(transactions.categoryId, input.categoryId));
      if (input.search) {
        conds.push(
          or(
            likeLiteral(transactions.concept, input.search),
            likeLiteral(transactions.note, input.search),
          ),
        );
      }
      if (input.cursor) {
        const [ts, id] = Buffer.from(input.cursor, "base64")
          .toString()
          .split(":");
        conds.push(
          or(
            lt(transactions.ts, Number(ts)),
            and(eq(transactions.ts, Number(ts)), lt(transactions.id, id)),
          ),
        );
      }

      const where = conds.length ? and(...conds) : undefined;

      const rows = await ctx.db
        .select()
        .from(transactions)
        .where(where)
        .orderBy(desc(transactions.ts), desc(transactions.id))
        .limit(input.limit + 1)
        .all();

      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      const last = page[page.length - 1];
      const nextCursor = hasMore && last
        ? Buffer.from(`${last.ts}:${last.id}`).toString("base64")
        : null;

      const totals = await ctx.db
        .select({
          expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amountCents} ELSE 0 END), 0)`,
          income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amountCents} ELSE 0 END), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(transactions)
        .where(where)
        .get();

      return {
        rows: page,
        nextCursor,
        totals: {
          expense: totals?.expense ?? 0,
          income: totals?.income ?? 0,
          count: totals?.count ?? 0,
        },
      };
    }),

  recent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(15) }))
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(transactions)
        .orderBy(desc(transactions.ts))
        .limit(input.limit)
        .all(),
    ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        amountCents: z
          .number()
          .int()
          .positive()
          .max(10_000_000_000)
          .optional(),
        type: z.enum(transactionType).optional(),
        categoryId: z.string().max(64).nullable().optional(),
        concept: z.string().trim().max(120).nullable().optional(),
        note: z.string().trim().max(1000).nullable().optional(),
        date: dateSchema.optional(),
        ts: tsSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, date, ts, type, ...rest } = input;

      const existing = await ctx.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .get();
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transacción no encontrada",
        });
      }

      const nextType = type ?? existing.type;
      const nextCategoryId =
        rest.categoryId !== undefined ? rest.categoryId : existing.categoryId;
      await assertCategoryMatches(ctx.db, nextCategoryId, nextType);

      const changes: Record<string, unknown> = { ...rest, updatedAt: Date.now() };
      if (type) changes.type = type;
      if (date !== undefined || ts !== undefined) {
        const d = date !== undefined ? parseDate(date) : new Date(ts!);
        const f = toDateFields(d);
        Object.assign(changes, f, { cycleKey: cycleKeyOf(f.date) });
      }
      return ctx.db
        .update(transactions)
        .set(changes)
        .where(eq(transactions.id, id))
        .returning()
        .get();
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().max(64) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(transactions)
        .where(eq(transactions.id, input.id))
        .run();
      return { ok: true };
    }),

  monthRange: protectedProcedure
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
    .query(({ input }) => {
      const from = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
      const to =
        input.month === 12
          ? `${input.year + 1}-01-01`
          : `${input.year}-${String(input.month + 1).padStart(2, "0")}-01`;
      return { from, to, today: todayStr() };
    }),
});
