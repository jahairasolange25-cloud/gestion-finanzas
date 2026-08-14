import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { goals } from "../db/schema";
import type { Db } from "../db";
import { protectedProcedure, router } from "../trpc";

const amountSchema = z
  .number()
  .int()
  .positive("El monto debe ser mayor a 0")
  .max(10_000_000_000, "El monto no puede superar S/ 100,000,000");

const createSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(60),
  targetCents: amountSchema,
  icon: z.string().trim().max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  deadline: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Fecha límite en formato YYYY-MM").optional().nullable(),
});

const updateSchema = createSchema.partial().extend({ id: z.string().max(64) });

async function getGoal(db: Db, id: string) {
  const goal = await db.select().from(goals).where(eq(goals.id, id)).get();
  if (!goal) throw new TRPCError({ code: "NOT_FOUND", message: "Meta no encontrada" });
  return goal;
}

export const goalsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(goals)
      .orderBy(goals.createdAt)
      .all(),
  ),

  create: protectedProcedure.input(createSchema).mutation(async ({ ctx, input }) => {
    const now = Date.now();
    const row = {
      id: randomUUID(),
      name: input.name,
      targetCents: input.targetCents,
      currentCents: 0,
      icon: input.icon ?? "piggy-bank",
      color: input.color ?? "#10b981",
      deadline: input.deadline ?? null,
      isActive: true,
      createdAt: now,
    };
    await ctx.db.insert(goals).values(row).run();
    return row;
  }),

  update: protectedProcedure.input(updateSchema).mutation(async ({ ctx, input }) => {
    const { id, ...rest } = input;
    await getGoal(ctx.db, id);
    return ctx.db
      .update(goals)
      .set(rest)
      .where(eq(goals.id, id))
      .returning()
      .get();
  }),

  setActive: protectedProcedure
    .input(z.object({ id: z.string().max(64), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db
        .update(goals)
        .set({ isActive: input.isActive })
        .where(eq(goals.id, input.id))
        .returning()
        .get();
      if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Meta no encontrada" });
      return res;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().max(64) }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db.delete(goals).where(eq(goals.id, input.id)).run();
      if (res.rowsAffected === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meta no encontrada" });
      }
      return { ok: true };
    }),

  /** Suma un abono al progreso de la meta. */
  deposit: protectedProcedure
    .input(z.object({ id: z.string().max(64), amountCents: amountSchema }))
    .mutation(async ({ ctx, input }) => {
      const goal = await getGoal(ctx.db, input.id);
      return ctx.db
        .update(goals)
        .set({ currentCents: Math.min(goal.targetCents, goal.currentCents + input.amountCents) })
        .where(eq(goals.id, input.id))
        .returning()
        .get();
    }),

  /** Resta del progreso (sin bajar de 0). */
  withdraw: protectedProcedure
    .input(z.object({ id: z.string().max(64), amountCents: amountSchema }))
    .mutation(async ({ ctx, input }) => {
      const goal = await getGoal(ctx.db, input.id);
      return ctx.db
        .update(goals)
        .set({ currentCents: Math.max(0, goal.currentCents - input.amountCents) })
        .where(eq(goals.id, input.id))
        .returning()
        .get();
    }),
});
