import { z } from "zod";
import { asc, count, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { categories, transactions, transactionType } from "../db/schema";
import { publicProcedure, router } from "../trpc";

const base = {
  name: z.string().trim().min(1).max(40),
  type: z.enum(transactionType),
  icon: z.string().trim().max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
};

export const categoriesRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(categories)
      .orderBy(asc(categories.type), asc(categories.sortOrder), asc(categories.name))
      .all(),
  ),

  create: publicProcedure.input(z.object(base)).mutation(async ({ ctx, input }) => {
    const now = Date.now();
    const row = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      icon: input.icon ?? "tag",
      color: input.color ?? "#64748b",
      sortOrder: 0,
      isActive: true,
      isSystem: false,
      createdAt: now,
    };
    await ctx.db.insert(categories).values(row).run();
    return row;
  }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(40).optional(),
        icon: z.string().trim().max(40).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      return ctx.db
        .update(categories)
        .set(rest)
        .where(eq(categories.id, id))
        .returning()
        .get();
    }),

  setActive: publicProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db
        .update(categories)
        .set({ isActive: input.isActive })
        .where(eq(categories.id, input.id))
        .returning()
        .get(),
    ),

  /** Elimina si no tiene transacciones; si las tiene, la desactiva. */
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db
        .select({ n: count() })
        .from(transactions)
        .where(eq(transactions.categoryId, input.id))
        .get();
      const n = res?.n ?? 0;
      if (n > 0) {
        await ctx.db
          .update(categories)
          .set({ isActive: false })
          .where(eq(categories.id, input.id))
          .run();
        return { ok: true, deactivated: true };
      }
      await ctx.db.delete(categories).where(eq(categories.id, input.id)).run();
      return { ok: true, deactivated: false };
    }),
});
