"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import type { TransactionRow } from "@/hooks/use-save-transaction";
import type { TransactionType } from "@/lib/types";

const inputCls =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500";

export function TransactionEditor({
  row,
  onClose,
}: {
  row: TransactionRow;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const update = trpc.transactions.update.useMutation();
  const { data: categories = [] } = trpc.categories.list.useQuery();

  const [type, setType] = useState<TransactionType>(row.type);
  const [amount, setAmount] = useState(String((row.amountCents / 100).toFixed(2)));
  const [categoryId, setCategoryId] = useState(row.categoryId ?? "");
  const [concept, setConcept] = useState(row.concept ?? "");
  const [note, setNote] = useState(row.note ?? "");
  const [date, setDate] = useState(row.date);
  const [error, setError] = useState<string | null>(null);

  const catsOfType = categories.filter((c) => c.type === type && c.isActive);

  const changeType = (t: TransactionType) => {
    setType(t);
    // Al cambiar el tipo, la categoría podría no corresponder: se limpia.
    if (categoryId && !catsOfType.some((c) => c.id === categoryId)) {
      setCategoryId("");
    }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountCents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setError("Monto inválido");
      return;
    }
    update.mutate(
      {
        id: row.id,
        type,
        amountCents,
        categoryId: categoryId || null,
        concept: concept.trim() || null,
        note: note.trim() || null,
        date,
      },
      {
        onSuccess: () => {
          void utils.transactions.recent.invalidate();
          void utils.transactions.list.invalidate();
          void utils.analytics.summary.invalidate();
          onClose();
        },
        onError: (err) => setError(err.message ?? "Error al guardar"),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Editar transacción">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Editar transacción</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={save} className="flex flex-col gap-3" noValidate>
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => changeType("expense")}
              aria-pressed={type === "expense"}
              className={type === "expense" ? "rounded-lg bg-white py-2 shadow-sm text-rose-600" : "py-2 text-slate-500"}
            >
              Gasto
            </button>
            <button
              type="button"
              onClick={() => changeType("income")}
              aria-pressed={type === "income"}
              className={type === "income" ? "rounded-lg bg-white py-2 shadow-sm text-emerald-600" : "py-2 text-slate-500"}
            >
              Ingreso
            </button>
          </div>

          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Monto en soles
            <input
              className={inputCls}
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Fecha
            <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Categoría
            <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sin categoría</option>
              {catsOfType.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Concepto (opcional)
            <input
              className={inputCls}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              maxLength={120}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Nota (opcional)
            <textarea
              className="h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
          </label>

          {error ? (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={update.isPending}>
            {update.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </form>
      </div>
    </div>
  );
}
