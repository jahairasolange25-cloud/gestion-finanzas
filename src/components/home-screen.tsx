"use client";

import { CloudUpload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CaptureForm } from "./capture-form";
import { TransactionList } from "./transaction-list";
import { Card } from "./ui/card";
import { formatMoney } from "@/lib/money";
import { monthStart, todayStr, toDateFields } from "@/lib/date-fields";
import { pendingCount } from "@/lib/offline-queue";
import { RECENT_LIMIT } from "@/hooks/use-save-transaction";

export function HomeScreen() {
  const { data: recent = [] } = trpc.transactions.recent.useQuery({
    limit: RECENT_LIMIT,
  });
  const { data: summary } = trpc.analytics.summary.useQuery(
    {
      from: monthStart(0),
      to: todayStr(),
    },
    { enabled: recent.length > 0 || !recent },
  );

  const f = toDateFields();
  const dateLabel = `${f.day} de ${["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][f.month - 1]}`;
  const pending = pendingCount();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Registrar gasto</h1>
          <p className="text-sm text-slate-500">Hoy, {dateLabel}</p>
        </div>
        {pending > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            <CloudUpload className="size-3" aria-hidden />
            {pending} pendiente{pending > 1 ? "s" : ""}
          </span>
        ) : null}
      </header>

      <Card className="p-4 sm:p-6">
        <CaptureForm />
      </Card>

      {summary ? (
        <div className="grid grid-cols-3 gap-3">
          <MiniStat
            label="Gasto del mes"
            value={formatMoney(summary.expense)}
            tone="rose"
          />
          <MiniStat
            label="Ingreso del mes"
            value={formatMoney(summary.income)}
            tone="emerald"
          />
          <MiniStat
            label="Balance"
            value={formatMoney(summary.balance)}
            tone={summary.balance >= 0 ? "emerald" : "rose"}
          />
        </div>
      ) : null}

      <section aria-label="Transacciones recientes">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-800">Recientes</h2>
        </div>
        {recent.length > 0 ? (
          <TransactionList rows={recent} limit={3} />
        ) : (
          <Card className="p-8 text-center text-sm text-slate-400">
            Sin movimientos todavía. Registra tu primer gasto arriba.
          </Card>
        )}
      </section>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "rose" | "emerald";
}) {
  return (
    <Card className="px-3 py-3">
      <p className="text-[11px] font-medium text-slate-400">{label}</p>
      <p
        className={`mt-0.5 truncate text-sm font-bold tabular-nums ${
          tone === "rose" ? "text-rose-600" : "text-emerald-600"
        }`}
      >
        {value}
      </p>
    </Card>
  );
}
