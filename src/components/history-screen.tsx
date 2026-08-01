"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { TransactionList } from "@/components/transaction-list";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { MONTH_NAMES, todayStr } from "@/lib/date-fields";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const PAGE_SIZE = 100;

export function HistoryScreen() {
  const now = useMemo(() => new Date(), []);
  const months = useMemo(() => {
    const arr: { value: string; label: string }[] = [
      { value: "", label: "Todos los meses" },
    ];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
      });
    }
    return arr;
  }, [now]);

  const [month, setMonth] = useState("");
  const [type, setType] = useState<"all" | "expense" | "income">("all");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const { data: categories = [] } = trpc.categories.list.useQuery();

  const range = useMemo(() => {
    if (!month) return {};
    const [y, m] = month.split("-").map(Number);
    return {
      from: `${y}-${String(m).padStart(2, "0")}-01`,
      to:
        m === now.getMonth() + 1 && y === now.getFullYear()
          ? todayStr()
          : `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`,
    };
  }, [month, now]);

  const query = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      type: type === "all" ? undefined : type,
      categoryId: categoryId || undefined,
      search: debouncedSearch || undefined,
      limit: PAGE_SIZE,
    }),
    [range, type, categoryId, debouncedSearch],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.transactions.list.useInfiniteQuery(query, {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      initialCursor: undefined,
    });

  const rows = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data]);
  const totals = data?.pages[0]?.totals;

  const selectCls =
    "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500";

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Historial</h1>
        <p className="text-sm text-slate-500">Todas tus transacciones con filtros</p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls} aria-label="Mes">
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={selectCls} aria-label="Tipo">
          <option value="all">Gastos e ingresos</option>
          <option value="expense">Solo gastos</option>
          <option value="income">Solo ingresos</option>
        </select>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectCls} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {categories
            .filter((c) => c.isActive)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar concepto…"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
            aria-label="Buscar por concepto"
          />
        </label>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span>
          Gastos: <b className="text-rose-600 tabular-nums">{formatMoney(totals?.expense ?? 0)}</b>
        </span>
        <span>
          Ingresos: <b className="text-emerald-600 tabular-nums">{formatMoney(totals?.income ?? 0)}</b>
        </span>
        <span>
          Balance:{" "}
          <b className={`tabular-nums ${(totals?.income ?? 0) - (totals?.expense ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {formatMoney((totals?.income ?? 0) - (totals?.expense ?? 0))}
          </b>
        </span>
      </div>

      {rows.length > 0 ? (
        <>
          <TransactionList rows={rows} />
          {hasNextPage ? (
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? "Cargando…" : "Cargar más"}
            </Button>
          ) : null}
        </>
      ) : (
        <Card className="p-10 text-center text-sm text-slate-400">
          No se encontraron transacciones con esos filtros.
        </Card>
      )}
    </div>
  );
}
