import type { CreateTransactionInput } from "./types";

const KEY = "finanzas.pending.v1";

/**
 * Cola offline: las transacciones creadas sin conexión se persisten aquí
 * (localStorage, payloads minúsculos) y se reenvían al volver a estar online.
 * Cada item lleva un `clientId` que el servidor usa como clave de idempotencia,
 * de modo que un reintento nunca genera duplicados.
 */
export function getPendingQueue(): CreateTransactionInput[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CreateTransactionInput[]) : [];
  } catch {
    return [];
  }
}

export function enqueuePending(input: CreateTransactionInput): void {
  const queue = getPendingQueue();
  queue.push(input);
  localStorage.setItem(KEY, JSON.stringify(queue));
}

/** Elimina de la cola SOLO los items confirmados (por clientId). */
export function removePending(inputs: CreateTransactionInput[]): void {
  if (inputs.length === 0) return;
  const sent = new Set(inputs.map((i) => i.clientId));
  const rest = getPendingQueue().filter((i) => !sent.has(i.clientId));
  if (rest.length === 0) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(rest));
}

export function clearPendingQueue(): void {
  localStorage.removeItem(KEY);
}

export function pendingCount(): number {
  return getPendingQueue().length;
}
