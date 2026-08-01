"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Crown, PieChart as PieIcon, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Chart, axisStyle, baseTooltip } from "@/components/charts";
import { Card, CardHeader } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { formatDayMonth, MONTH_NAMES, monthStart, todayStr, toDateFields } from "@/lib/date-fields";

function monthRange(offset: number) {
  const now = new Date();
  const from = monthStart(offset);
  if (offset === 0) return { from, to: todayStr() };
  const lastDay = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from, to: toDateFields(lastDay).date };
}

export function DashboardScreen() {
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const monthLabel = `${
    MONTH_NAMES[(now.getMonth() + offset + 12) % 12]
  } ${now.getFullYear() + Math.floor((now.getMonth() + offset) / 12)}`;

  const { from, to } = useMemo(() => monthRange(offset), [offset]);
  const { data } = trpc.analytics.summary.useQuery({ from, to });
  const pending = data === undefined;

  const byDayOption = useMemo(() => {
    if (!data) return {};
    return {
      tooltip: baseTooltip,
      grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        type: "category" as const,
        data: data.byDay.map((d) => String(Number(d.date.slice(8)))),
        ...axisStyle,
      },
      yAxis: {
        type: "value" as const,
        ...axisStyle,
        axisLabel: {
          color: "#94a3b8",
          fontSize: 11,
          formatter: (v: number) => `S/${Math.round(v / 100)}`,
        },
      },
      series: [
        {
          name: "Gasto",
          type: "line" as const,
          smooth: true,
          showSymbol: false,
          data: data.byDay.map((d) => d.expense),
          lineStyle: { width: 2.5, color: "#6366f1" },
          itemStyle: { color: "#6366f1" },
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(99,102,241,0.25)" },
                { offset: 1, color: "rgba(99,102,241,0.02)" },
              ],
            },
          },
        },
      ],
    };
  }, [data]);

  const byCategoryOption = useMemo(() => {
    if (!data) return {};
    const top = data.byCategory.slice(0, 8);
    return {
      tooltip: baseTooltip,
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: "value" as const, ...axisStyle, axisLabel: { color: "#94a3b8", fontSize: 11 } },
      yAxis: {
        type: "category" as const,
        data: top.map((c) => c.name).reverse(),
        ...axisStyle,
      },
      series: [
        {
          type: "bar" as const,
          data: top
            .map((c) => ({ value: c.total, itemStyle: { color: c.color ?? "#94a3b8" } }))
            .reverse(),
          barWidth: 16,
          itemStyle: { borderRadius: [0, 8, 8, 0] },
        },
      ],
    };
  }, [data]);

  const pieOption = useMemo(() => {
    if (!data) return {};
    const top = data.byCategory.slice(0, 7);
    const rest = data.byCategory.slice(7).reduce((a, c) => a + c.total, 0);
    const items = top.map((c) => ({
      name: c.name,
      value: c.total,
      itemStyle: { color: c.color ?? "#94a3b8" },
    }));
    if (rest > 0) items.push({ name: "Otros", value: rest, itemStyle: { color: "#cbd5e1" } });
    return {
      tooltip: {
        ...baseTooltip,
        trigger: "item" as const,
        valueFormatter: (v: number) => `S/ ${(v / 100).toLocaleString("es-PE")}`,
      },
      legend: { bottom: 0, textStyle: { color: "#64748b", fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
      series: [
        {
          type: "pie" as const,
          radius: ["42%", "68%"],
          center: ["50%", "44%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
          label: { show: false },
          data: items,
        },
      ],
    };
  }, [data]);

  const byWeekOption = useMemo(() => {
    if (!data) return {};
    return {
      tooltip: baseTooltip,
      grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        type: "category" as const,
        data: data.byWeek.map((w) => `Sem ${formatDayMonth(w.weekStart)}`),
        ...axisStyle,
      },
      yAxis: { type: "value" as const, ...axisStyle, axisLabel: { color: "#94a3b8", fontSize: 11 } },
      series: [
        {
          type: "bar" as const,
          data: data.byWeek.map((w) => w.total),
          barWidth: 18,
          itemStyle: { color: "#10b981", borderRadius: [6, 6, 0, 0] },
        },
      ],
    };
  }, [data]);

  const byMonthOption = useMemo(() => {
    if (!data) return {};
    return {
      tooltip: baseTooltip,
      grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        type: "category" as const,
        data: data.byMonth.map((m) => MONTH_NAMES[m.month - 1].slice(0, 3)),
        ...axisStyle,
      },
      yAxis: { type: "value" as const, ...axisStyle },
      series: [
        {
          type: "line" as const,
          smooth: true,
          data: data.byMonth.map((m) => m.total),
          lineStyle: { width: 2.5, color: "#f59e0b" },
          itemStyle: { color: "#f59e0b" },
          symbolSize: 7,
          areaStyle: { color: "rgba(245,158,11,0.12)" },
        },
      ],
    };
  }, [data]);

  const ahorroPct =
    data && data.income > 0 ? Math.round(((data.income - data.expense) / data.income) * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Análisis de tus finanzas</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="grid size-10 place-items-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="min-w-36 text-center text-sm font-semibold text-slate-700">
            {monthLabel}
          </span>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset === 0}
            className="grid size-10 place-items-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </header>

      {!data || pending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Gastos" value={formatMoney(data.expense)} icon={<TrendingDown className="size-4" />} tone="rose" />
          <Kpi label="Ingresos" value={formatMoney(data.income)} icon={<TrendingUp className="size-4" />} tone="emerald" />
          <Kpi label="Balance" value={formatMoney(data.balance)} icon={<Wallet className="size-4" />} tone={data.balance >= 0 ? "emerald" : "rose"} />
          <Kpi
            label="Ahorro"
            value={ahorroPct === null ? "—" : `${ahorroPct}%`}
            sub={data.balance > 0 ? `+${formatMoney(data.balance)}` : undefined}
            icon={<PieIcon className="size-4" />}
            tone="indigo"
          />
          <Kpi label="Promedio diario" value={formatMoney(data.dailyAvgExpense)} icon={<TrendingDown className="size-4" />} tone="slate" />
          <Kpi
            label="Mayor gasto"
            value={data.biggest ? formatMoney(data.biggest.amountCents) : "—"}
            sub={data.biggest?.concept ?? undefined}
            icon={<Crown className="size-4" />}
            tone="amber"
          />
          <Kpi
            label="Categoría top"
            value={data.topCategory?.name ?? "—"}
            sub={data.topCategory ? formatMoney(data.topCategory.total) : undefined}
            icon={<TrendingDown className="size-4" />}
            tone="indigo"
          />
          <Kpi label="Operaciones" value={String(data.count)} icon={<Wallet className="size-4" />} tone="slate" />
        </div>
      )}

      {data && data.count === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400">
          No hay movimientos en {monthLabel}. Registra gastos desde la pantalla de inicio.
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Gasto por día" subtitle={monthLabel} />
              <div className="px-2 pb-3">
                <Chart option={byDayOption} height={240} label="Gasto por día" />
              </div>
            </Card>
            <Card>
              <CardHeader title="Gasto por categoría" subtitle="Ranking del período" />
              <div className="px-2 pb-3">
                <Chart option={byCategoryOption} height={240} label="Gasto por categoría" />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Distribución" subtitle="% por categoría" />
              <div className="px-2 pb-3">
                <Chart option={pieOption} height={260} label="Distribución por categoría" />
              </div>
            </Card>
            <Card>
              <CardHeader title="Gasto por semana" subtitle={monthLabel} />
              <div className="px-2 pb-3">
                <Chart option={byWeekOption} height={260} label="Gasto por semana" />
              </div>
            </Card>
            <Card>
              <CardHeader title="Tendencia" subtitle="Últimos 6 meses" />
              <div className="px-2 pb-3">
                <Chart option={byMonthOption} height={260} label="Tendencia 6 meses" />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "rose" | "emerald" | "indigo" | "amber" | "slate";
}) {
  const tones: Record<string, string> = {
    rose: "bg-rose-50 text-rose-600",
    emerald: "bg-emerald-50 text-emerald-600",
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <span className={`grid size-7 place-items-center rounded-lg ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-1 truncate text-lg font-bold text-slate-900 tabular-nums">{value}</p>
      {sub ? <p className="truncate text-[11px] text-slate-400">{sub}</p> : null}
    </Card>
  );
}
