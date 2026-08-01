"use client";

import { useState } from "react";
import { CloudUpload, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/money";
import { DAY_NAMES, formatDateShort, formatDayMonth } from "@/lib/date-fields";
import type { TransactionRow } from "@/hooks/use-save-transaction";
import { cn } from "@/lib/cn";
import { CategoryIcon } from "./category-icon";
import { TransactionEditor } from "./transaction-editor";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

export function TransactionList({
  rows,
  limit,
}: {
  rows: TransactionRow[];
  limit?: number;
}) {
  const { data: categories = [] } = trpc.categories.list.useQuery();
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TransactionRow | null>(null);

  const groups = new Map<string, TransactionRow[]>();
  for (const row of rows) {
    const arr = groups.get(row.date) ?? [];
    arr.push(row);
    groups.set(row.date, arr);
  }
  const dates = [...groups.keys()].sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="flex flex-col gap-4">
      {dates.slice(0, limit).map((date) => {
        const dayRows = groups.get(date)!;
        const expense = dayRows.reduce(
          (acc, r) => (r.type === "expense" ? acc + r.amountCents : acc),
          0,
        );
        const income = dayRows.reduce(
          (acc, r) => (r.type === "income" ? acc + r.amountCents : acc),
          0,
        );
        return (
          <section key={date} aria-label={formatDateShort(date)}>
            <header className="mb-1.5 flex items-baseline justify-between px-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {formatDayHeader(date)}
              </h4>
              <div className="text-xs text-slate-500 tabular-nums">
                {income > 0 ? (
                  <span className="mr-2 font-medium text-emerald-600">
                    +{formatMoney(income)}
                  </span>
                ) : null}
                {expense > 0 ? (
                  <span className="font-medium text-slate-700">−{formatMoney(expense)}</span>
                ) : null}
              </div>
            </header>
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white">
              {dayRows.map((row) => {
                const cat = row.categoryId ? catMap.get(row.categoryId) : undefined;
                return (
                  <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-xl"
                      style={{ backgroundColor: `${cat?.color ?? "#94a3b8"}1f` }}
                    >
                      <CategoryIcon
                        name={cat?.icon}
                        className="size-4.5"
                        style={{ color: cat?.color ?? "#94a3b8" }}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {row.concept || cat?.name || "Sin categoría"}
                      </p>
                      {row.pending ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                          <CloudUpload className="size-3" aria-hidden /> Pendiente de sincronizar
                        </span>
                      ) : (
                        <p className="text-xs text-slate-400">
                          {cat?.name}
                          {row.note ? ` · ${row.note}` : ""}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        row.type === "expense" ? "text-slate-800" : "text-emerald-600",
                      )}
                    >
                      {row.type === "expense" ? "−" : "+"}
                      {formatMoney(row.amountCents)}
                    </span>
                    {!row.pending ? (
                      <>
                        <button
                          onClick={() => setMenuFor(menuFor === row.id ? null : row.id)}
                          aria-label={`Opciones de ${row.concept || cat?.name || "transacción"}`}
                          aria-expanded={menuFor === row.id}
                          className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
                        >
                          <Ellipsis className="size-4" />
                        </button>
                        {menuFor === row.id ? (
                          <div className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} aria-hidden />
                        ) : null}
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {editing ? <TransactionEditor row={editing} onClose={() => setEditing(null)} /> : null}
      {confirmDelete ? (
        <DeleteConfirm
          row={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onDone={() => {
            setConfirmDelete(null);
            setMenuFor(null);
          }}
        />
      ) : null}
      {menuFor ? <RowMenu onEdit={() => setEditing(rows.find((r) => r.id === menuFor) ?? null)} onDelete={() => setConfirmDelete(rows.find((r) => r.id === menuFor) ?? null)} onClose={() => setMenuFor(null)} /> : null}
    </div>
  );
}

function RowMenu({
  onEdit,
  onDelete,
  onClose,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:right-4 sm:top-4" role="menu" aria-label="Opciones">
      <div className="fixed inset-0 z-50" onClick={onClose} aria-hidden />
      <div className="relative z-50 m-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:m-0 sm:w-56">
        <button
          role="menuitem"
          onClick={() => {
            onEdit();
            onClose();
          }}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Pencil className="size-4 text-slate-400" /> Editar
        </button>
        <button
          role="menuitem"
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="size-4" /> Eliminar
        </button>
      </div>
    </div>
  );
}

function DeleteConfirm({
  row,
  onCancel,
  onDone,
}: {
  row: TransactionRow;
  onCancel: () => void;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const remove = trpc.transactions.delete.useMutation();

  const confirm = () => {
    remove.mutate(
      { id: row.id },
      {
        onSuccess: () => {
          void utils.transactions.recent.invalidate();
          void utils.transactions.list.invalidate();
          void utils.analytics.summary.invalidate();
          onDone();
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Confirmar eliminación">
      <Card className="w-full max-w-sm rounded-b-none p-5 sm:rounded-2xl">
        <h2 className="text-base font-bold text-slate-900">¿Eliminar transacción?</h2>
        <p className="mt-1 text-sm text-slate-500">
          {row.concept ? `"${row.concept}"` : "Esta transacción"} ({formatMoney(row.amountCents)}). Esta acción no se puede deshacer.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={remove.isPending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirm} disabled={remove.isPending}>
            {remove.isPending ? "…" : "Eliminar"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function formatDayHeader(date: string): string {
  const today = new Date();
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const diff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      target.getTime()) /
      86400000,
  );
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff > 1 && diff < 7) return DAY_NAMES[target.getDay()];
  return formatDayMonth(date);
}
