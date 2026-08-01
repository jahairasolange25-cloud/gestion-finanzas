"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  enqueuePending,
  getPendingQueue,
  removePending,
} from "@/lib/offline-queue";
import { parseDate, toDateFields } from "@/lib/date-fields";
import type { CreateTransactionInput } from "@/lib/types";
import type { Transaction } from "@/server/db/schema";

export type TransactionRow = Transaction & { pending?: boolean };

export const RECENT_LIMIT = 15;
const recentInput = { limit: RECENT_LIMIT };

type RecentData = TransactionRow[] | undefined;

function makeRow(input: CreateTransactionInput, id: string): TransactionRow {
  const d = input.ts
    ? new Date(input.ts)
    : input.date
      ? parseDate(input.date)
      : new Date();
  const f = toDateFields(d);
  const now = Date.now();
  return {
    id,
    clientId: id,
    type: input.type,
    amountCents: input.amountCents,
    categoryId: input.categoryId ?? null,
    concept: input.concept ?? null,
    note: input.note ?? null,
    ...f,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Guardado con optimistic UI (<1s percibido):
 * 1. Genera un `clientId` (UUID) que es a la vez el id de la fila optimista
 *    y la clave de idempotencia del servidor.
 * 2. Inserta la fila al instante en la caché de "recent".
 * 3. Envía al servidor en segundo plano; si está offline, encola y reenvía
 *    al reconectar. Un reintento nunca duplica (mismo clientId).
 */
export function useSaveTransaction() {
  const utils = trpc.useUtils();
  const create = trpc.transactions.create.useMutation();

  const patchRecent = useCallback(
    (fn: (old: RecentData) => RecentData) => {
      utils.transactions.recent.setData(recentInput, fn);
    },
    [utils],
  );

  const save = useCallback(
    async (
      input: CreateTransactionInput,
    ): Promise<{ ok: boolean; pending: boolean; id: string }> => {
      const clientId = input.clientId ?? crypto.randomUUID();
      const item: CreateTransactionInput = {
        ...input,
        clientId,
        ts: input.ts ?? Date.now(),
      };

      if (!navigator.onLine) {
        enqueuePending(item);
        patchRecent((old) => [
          { ...makeRow(item, clientId), pending: true },
          ...(old ?? []),
        ]);
        return { ok: true, pending: true, id: clientId };
      }

      patchRecent((old) => [makeRow(item, clientId), ...(old ?? [])]);
      try {
        await create.mutateAsync(item);
        void utils.transactions.recent.invalidate();
        void utils.transactions.list.invalidate();
        void utils.analytics.summary.invalidate();
        return { ok: true, pending: false, id: clientId };
      } catch (err) {
        patchRecent((old) => (old ?? []).filter((t) => t.id !== clientId));
        throw err;
      }
    },
    [create, patchRecent, utils],
  );

  return { save, isSaving: create.isPending, isError: create.isError };
}

/**
 * Reenvía la cola offline cuando hay conexión.
 * Solo elimina los items con respuesta confirmada; si uno falla, el resto
 * permanece en la cola para el siguiente intento.
 */
export function useFlushPending() {
  const utils = trpc.useUtils();
  const create = trpc.transactions.create.useMutation();

  const flush = useCallback(async () => {
    const queue = getPendingQueue();
    if (queue.length === 0 || !navigator.onLine) return 0;
    const sent: CreateTransactionInput[] = [];
    for (const item of queue) {
      try {
        await create.mutateAsync(item);
        sent.push(item);
      } catch {
        break;
      }
    }
    if (sent.length > 0) {
      removePending(sent);
      void utils.transactions.recent.invalidate();
      void utils.transactions.list.invalidate();
      void utils.analytics.summary.invalidate();
    }
    return sent.length;
  }, [create, utils]);

  return { flush, isFlushing: create.isPending };
}
