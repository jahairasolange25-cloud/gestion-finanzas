"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/money";

/** Alertas in-app de presupuestos: cerca del límite (>=80%) o superado. */
export function BudgetAlerts() {
  const { data } = trpc.budgets.list.useQuery({});

  const alerts = (data?.rows ?? []).filter(
    (b) => b.isActive && b.status !== "ok" && b.status !== undefined,
  );
  if (alerts.length === 0) return null;

  return (
    <section aria-label="Alertas de presupuestos" className="flex flex-col gap-2">
      {alerts.map((b) => {
        const over = b.status === "over";
        return (
          <Link
            key={b.id}
            href="/budgets"
            className={
              "flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold " +
              (over ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700")
            }
          >
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {over
                ? `${b.categoryName} superó su presupuesto`
                : `${b.categoryName} está al ${b.pct}% de su presupuesto`}
            </span>
            <span className="shrink-0 tabular-nums text-xs">
              {formatMoney(b.spentCents)} / {formatMoney(b.amountCents)}
            </span>
          </Link>
        );
      })}
    </section>
  );
}
