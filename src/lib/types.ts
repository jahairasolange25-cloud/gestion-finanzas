export type TransactionType = "expense" | "income";

export interface CreateTransactionInput {
  type: TransactionType;
  amountCents: number;
  categoryId?: string | null;
  concept?: string | null;
  note?: string | null;
  date?: string;
  /** Epoch ms local del usuario. El servidor deriva los campos de fecha de aquí. */
  ts?: number;
  /** Clave de idempotencia (UUID del cliente). Se reutiliza como id de la fila optimista. */
  clientId?: string;
}
