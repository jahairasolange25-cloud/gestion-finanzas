"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  PiggyBank,
  ReceiptText,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CaptureForm } from "./capture-form";
import { TransactionList } from "./transaction-list";
import { Card } from "./ui/card";
import { Progress, type ProgressTone } from "./ui/progress";
import { formatMoney } from "@/lib/money";
import { formatDayMonth, todayStr } from "@/lib/date-fields";
import { pendingCount } from "@/lib/offline-queue";
import { RECENT_LIMIT } from "@/hooks/use-save-transaction";

function pctOf(part: number, whole: number): number {
  if (whole <= 0) return part > 0 ? 100 : 0;
  return (part / whole) * 100;
}

function spentTone(pct: number): ProgressTone {
  if (pct >= 100) return "rose";
  if (pct >= 80) return "amber";
  return "emerald";
}

export function HomeScreen() {
  const today = todayStr();
  const { data: current } = trpc.cycles.current.useQuery({ today });
  const cycleKey = current?.cycleKey;
  const { data: overview } = trpc.cycles.overview.useQuery(
    { cycleKey: cycleKey! },
    { enabled: !!cycleKey },
  );
  const { data: recent = [] } = trpc.transactions.recent.useQuery({
    limit: RECENT_LIMIT,
  });

  const pending = pendingCount();
  const isPayday = today.endsWith("-25");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
            Ciclo actual
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            {current?.label ?? "…"}
          </h1>
          {current ? (
            <p className="mt-0.5 text-sm text-slate-500">
              Próximo pago: {formatDayMonth(current.nextPayday)}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {pending > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              <CloudUpload className="size-3" aria-hidden />
              {pending} pendiente{pending > 1 ? "s" : ""}
            </span>
          ) : null}
          {current ? (
            <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
              {isPayday
                ? "Hoy llega tu pago"
                : `Faltan ${current.daysRemaining} día${current.daysRemaining === 1 ? "" : "s"} para tu pago`}
            </span>
          ) : null}
        </div>
      </header>

      {overview ? (
        <>
          <Card className="grid grid-cols-2 gap-3 p-4">
            <div>
              <p className="text-[11px] font-medium text-slate-400">
                Ingresos del ciclo
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-600">
                {formatMoney(overview.income.totalCents)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-400">
                Sin asignar
              </p>
              <p
                className={`mt-0.5 text-lg font-bold tabular-nums ${
                  overview.unassignedCents >= 0 ? "text-slate-800" : "text-rose-600"
                }`}
              >
                {formatMoney(overview.unassignedCents)}
              </p>
              {overview.unassignedCents < 0 ? (
                <p className="text-[11px] text-rose-500">
                  Asignaste más que tus ingresos
                </p>
              ) : null}
            </div>
          </Card>

          <div className="grid gap-3 lg:grid-cols-3">
            <SectionCard
              href="/fixed"
              icon={ReceiptText}
              title="Gastos fijos"
              value={`${formatMoney(overview.fijos.paidCents)} de ${formatMoney(overview.fijos.expectedCents)}`}
              sub={
                overview.fijos.expectedCents === 0
                  ? "Sin cobros este ciclo"
                  : overview.fijos.paidCents >= overview.fijos.expectedCents
                    ? "Todo pagado este ciclo"
                    : `Falta pagar ${formatMoney(overview.fijos.expectedCents - overview.fijos.paidCents)}`
              }
              pct={pctOf(overview.fijos.paidCents, overview.fijos.expectedCents)}
              tone="indigo"
            />
            <SectionCard
              href="/concepts"
              icon={ShoppingBag}
              title="Gastos personales"
              value={`${formatMoney(overview.personales.spentCents)} de ${formatMoney(overview.personales.metaCents)}`}
              sub={
                overview.personales.metaCents === 0
                  ? "Define metas por concepto"
                  : overview.personales.metaCents - overview.personales.spentCents >= 0
                    ? `Te queda ${formatMoney(overview.personales.metaCents - overview.personales.spentCents)}`
                    : `Excedido por ${formatMoney(overview.personales.spentCents - overview.personales.metaCents)}`
              }
              pct={pctOf(overview.personales.spentCents, overview.personales.metaCents)}
              tone={spentTone(pctOf(overview.personales.spentCents, overview.personales.metaCents))}
            />
            <SectionCard
              href="/savings"
              icon={PiggyBank}
              title="Ahorros"
              value={formatMoney(overview.ahorros.cycleCents)}
              sub={`Acumulado: ${formatMoney(overview.ahorros.totalCents)} en ${overview.ahorros.bucketCount} bolsillo${overview.ahorros.bucketCount === 1 ? "" : "s"}`}
              pct={null}
              tone="emerald"
            />
          </div>

          <Card className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2.5">
              <CheckCircle2
                className={`size-5 shrink-0 ${overview.closure ? "text-emerald-500" : "text-slate-300"}`}
                aria-hidden
              />
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {overview.closure ? "Ciclo cerrado" : "Cierre de ciclo"}
                </p>
                <p className="text-xs text-slate-400">
                  {overview.closure
                    ? `Guardaste ${formatMoney(overview.closure.savedCents)} y arrastraste ${formatMoney(overview.closure.carriedCents)}`
                    : "Reparte los sobrantes de tus conceptos al terminar el ciclo"}
                </p>
              </div>
            </div>
            <Link
              href="/close"
              className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              {overview.closure ? "Ver cierre" : "Cerrar ciclo"}
            </Link>
          </Card>
        </>
      ) : null}

      <Card className="p-4 sm:p-6">
        <CaptureForm />
      </Card>

      <section aria-label="Transacciones recientes">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-800">Recientes</h2>
          <Link href="/history" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
            Ver todas
          </Link>
        </div>
        {recent.length > 0 ? (
          <TransactionList rows={recent} limit={5} />
        ) : (
          <Card className="p-8 text-center text-sm text-slate-400">
            Sin movimientos todavía. Registra tu primer gasto arriba.
          </Card>
        )}
      </section>
    </div>
  );
}

function SectionCard({
  href,
  icon: Icon,
  title,
  value,
  sub,
  pct,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  value: string;
  sub: string;
  pct: number | null;
  tone: ProgressTone;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full p-4 transition-shadow hover:shadow-md">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-slate-500">
              <Icon className="size-4" aria-hidden />
            </span>
            {title}
          </span>
          <ChevronRight
            className="size-4 text-slate-300 transition-colors group-hover:text-slate-500"
            aria-hidden
          />
        </div>
        <p className="mt-3 text-lg font-bold tabular-nums text-slate-900">
          {value}
        </p>
        <p className="text-xs text-slate-500">{sub}</p>
        {pct !== null ? <Progress value={pct} tone={tone} className="mt-3" /> : null}
      </Card>
    </Link>
  );
}
