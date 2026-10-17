"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, CalendarCheck2, CheckCircle2, PiggyBank } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { CategoryIcon } from "./category-icon";
import { formatMoney } from "@/lib/money";
import { formatDateShort, todayStr } from "@/lib/date-fields";
import { cn } from "@/lib/cn";

type Decision = "savings" | "carry" | "move";

export function CloseCycleScreen() {
  const utils = trpc.useUtils();
  const [decisions, setDecisions] = useState<Record<string, { decision: Decision; target?: string }>>({});

  const { data: current } = trpc.cycles.current.useQuery({ today: todayStr() });
  const cycleKey = current?.cycleKey;

  const { data: leftovers, isLoading } = trpc.cycles.leftovers.useQuery(
    { cycleKey: cycleKey! },
    { enabled: !!cycleKey },
  );
  const { data: budgetsData } = trpc.budgets.list.useQuery(
    { cycleKey: cycleKey! },
    { enabled: !!cycleKey },
  );
  const { data: savingsData } = trpc.savings.list.useQuery(
    { cycleKey: cycleKey! },
    { enabled: !!cycleKey },
  );

  const close = trpc.cycles.close.useMutation();

  const items = leftovers?.items ?? [];
  const closure = leftovers?.closure ?? null;
  const buckets = (savingsData?.buckets ?? []).filter((b) => b.isActive && b.pct > 0);

  const targetOptions = useMemo(
    () => (budgetsData?.rows ?? []).map((r) => ({ id: r.categoryId, name: r.name, icon: r.icon, color: r.color })),
    [budgetsData],
  );

  const set = (categoryId: string, decision: Decision, target?: string) =>
    setDecisions((prev) => ({ ...prev, [categoryId]: { decision, target } }));

  const allDecided =
    items.length > 0 &&
    items.every((i) => {
      const d = decisions[i.categoryId];
      return d && (d.decision !== "move" || !!d.target);
    });

  const savedPreview = items.reduce((s, i) => {
    const d = decisions[i.categoryId];
    return d?.decision === "savings" ? s + i.leftoverCents : s;
  }, 0);
  const carriedPreview = items.reduce((s, i) => {
    const d = decisions[i.categoryId];
    return d && d.decision !== "savings" ? s + i.leftoverCents : s;
  }, 0);

  const submit = () => {
    if (!cycleKey || !allDecided) return;
    close.mutate(
      {
        cycleKey,
        date: todayStr(),
        decisions: items.map((i) => ({
          categoryId: i.categoryId,
          decision: decisions[i.categoryId].decision,
          targetCategoryId: decisions[i.categoryId].target ?? null,
        })),
      },
      {
        onSuccess: () => {
          void utils.cycles.leftovers.invalidate();
          void utils.cycles.overview.invalidate();
          void utils.budgets.list.invalidate();
          void utils.savings.list.invalidate();
        },
      },
    );
  };

  if (isLoading || !leftovers || !current) {
    return <Card className="p-8 text-center text-sm text-slate-400">Cargando ciclo…</Card>;
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Cierre de ciclo</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {`Ciclo ${current.label} · decide qué hacer con el sobrante de cada concepto`}
        </p>
      </header>

      {closure ? (
        <ClosedSummary
          savedCents={closure.savedCents}
          carriedCents={closure.carriedCents}
          closedAt={closure.closedAt}
          items={leftovers.closureItems.map((i) => ({
            id: i.id,
            categoryName: i.categoryName,
            leftoverCents: i.leftoverCents,
            decision: i.decision,
            targetCategoryId: i.targetCategoryId,
          }))}
          targetOptions={targetOptions}
        />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto size-8 text-emerald-500" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-slate-700">Nada pendiente por repartir</p>
          <p className="mt-1 text-sm text-slate-400">
            No hay conceptos con sobrante en este ciclo. Define metas en Gastos personales para
            poder repartir lo que no gastes.
          </p>
        </Card>
      ) : (
        <>
          <Card className="flex items-center justify-between p-4">
            <div>
              <p className="text-[11px] font-medium text-slate-400">Sobrante total del ciclo</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
                {formatMoney(leftovers.totalLeftoverCents)}
              </p>
            </div>
            <PiggyBank className="size-8 text-slate-200" aria-hidden />
          </Card>

          <section aria-label="Conceptos con sobrante" className="flex flex-col gap-3">
            {items.map((item) => {
              const d = decisions[item.categoryId];
              return (
                <Card key={item.categoryId} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2.5">
                      <span
                        className="grid size-9 place-items-center rounded-xl"
                        style={{ backgroundColor: `${item.color}1f` }}
                      >
                        <CategoryIcon name={item.icon} className="size-4.5" style={{ color: item.color }} />
                      </span>
                      <span>
                        <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-400">
                          No gastaste {formatMoney(item.leftoverCents)} de {formatMoney(item.availableCents)}
                        </p>
                      </span>
                    </span>
                    <span className="text-sm font-bold tabular-nums text-emerald-600">
                      +{formatMoney(item.leftoverCents)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <DecisionButton
                      active={d?.decision === "savings"}
                      onClick={() => set(item.categoryId, "savings")}
                      icon={<PiggyBank className="size-4" aria-hidden />}
                      label="A ahorro"
                    />
                    <DecisionButton
                      active={d?.decision === "carry"}
                      onClick={() => set(item.categoryId, "carry")}
                      icon={<CalendarCheck2 className="size-4" aria-hidden />}
                      label="Al próximo ciclo"
                    />
                    <DecisionButton
                      active={d?.decision === "move"}
                      onClick={() => set(item.categoryId, "move")}
                      icon={<ArrowRightLeft className="size-4" aria-hidden />}
                      label="Mover a…"
                    />
                  </div>

                  {d?.decision === "savings" ? (
                    <p className="mt-2 text-[11px] text-slate-400">
                      {buckets.length > 0
                        ? `Se repartirá en ${buckets.map((b) => `${b.name} ${b.pct}%`).join(", ")}`
                        : "No hay bolsillos activos con porcentaje"}
                    </p>
                  ) : null}

                  {d?.decision === "move" ? (
                    <div className="mt-2">
                      <select
                        value={d.target ?? ""}
                        onChange={(e) => set(item.categoryId, "move", e.target.value)}
                        aria-label={`Concepto destino para ${item.name}`}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                      >
                        <option value="">Elige el concepto destino…</option>
                        {targetOptions
                          .filter((t) => t.id !== item.categoryId)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </section>

          <Card className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-medium text-slate-400">Va al ahorro</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-600">
                  {formatMoney(savedPreview)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-400">Pasa al próximo ciclo</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-indigo-600">
                  {formatMoney(carriedPreview)}
                </p>
              </div>
            </div>
            <Button
              size="lg"
              className="mt-4 w-full"
              disabled={!allDecided || close.isPending}
              onClick={submit}
            >
              {close.isPending ? "Cerrando ciclo…" : "Confirmar cierre de ciclo"}
            </Button>
            <p className="mt-2 text-center text-xs text-slate-400">
              {allDecided
                ? "Podrás ver el resumen del cierre después de confirmar."
                : "Elige una decisión para cada concepto con sobrante."}
            </p>
            {close.isError ? (
              <p className="mt-2 text-center text-xs font-medium text-rose-600">
                No se pudo cerrar el ciclo. Intenta de nuevo.
              </p>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}

function DecisionButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 text-[11px] font-semibold transition-colors",
        active
          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
          : "border-slate-200 text-slate-500 hover:border-slate-300",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ClosedSummary({
  savedCents,
  carriedCents,
  closedAt,
  items,
  targetOptions,
}: {
  savedCents: number;
  carriedCents: number;
  closedAt: number;
  items: Array<{
    id: string;
    categoryName: string;
    leftoverCents: number;
    decision: string;
    targetCategoryId: string | null;
  }>;
  targetOptions: Array<{ id: string; name: string }>;
}) {
  const nameOf = (id: string | null) => targetOptions.find((t) => t.id === id)?.name ?? "otro concepto";
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="size-8 shrink-0 text-emerald-500" aria-hidden />
        <div>
          <p className="text-base font-bold text-slate-900">Ciclo cerrado</p>
          <p className="text-xs text-slate-400">
            El {formatDateShort(new Date(closedAt).toISOString().slice(0, 10))}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="text-[11px] font-medium text-emerald-700">Guardado en ahorros</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700">
            {formatMoney(savedCents)}
          </p>
        </div>
        <div className="rounded-xl bg-indigo-50 p-3">
          <p className="text-[11px] font-medium text-indigo-700">Pasó al próximo ciclo</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-indigo-700">
            {formatMoney(carriedCents)}
          </p>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-slate-100">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="text-slate-600">{i.categoryName}</span>
            <span className="text-right text-xs text-slate-400">
              {i.decision === "savings"
                ? "Guardado en ahorros"
                : i.decision === "carry"
                  ? "Arrastrado al próximo ciclo"
                  : `Movido a ${nameOf(i.targetCategoryId)}`}
              <span className="ml-2 font-semibold tabular-nums text-slate-600">
                {formatMoney(i.leftoverCents)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
