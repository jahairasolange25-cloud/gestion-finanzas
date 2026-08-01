"use client";

import { CloudUpload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/money";
import { DAY_NAMES, formatDateShort, formatDayMonth } from "@/lib/date-fields";
import type { TransactionRow } from "@/hooks/use-save-transaction";
import { cn } from "@/lib/cn";
import { CategoryIcon } from "./category-icon";

export function TransactionList({
  rows,
  limit,
}: {
  rows: TransactionRow[];
  limit?: number;
}) {
  const { data: categories = [] } = trpc.categories.list.useQuery();
  const catMap = new Map(categories.map((c) => [c.id, c]));

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
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
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
