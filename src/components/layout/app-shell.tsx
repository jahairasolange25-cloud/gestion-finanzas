"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloudOff, Home, LayoutDashboard, PiggyBank, Plus, Settings, Target, Wallet, Wallet2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/store/ui-store";

const NAV = [
  { href: "/", label: "Inicio", icon: Home, exact: true },
  { href: "/history", label: "Historial", icon: Wallet },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/budgets", label: "Presupuestos", icon: Wallet2 },
  { href: "/fixed", label: "Gastos fijos", icon: PiggyBank },
  { href: "/goals", label: "Metas", icon: Target },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

function OfflineBadge() {
  const offlineMode = useUiStore((s) => s.offlineMode);
  if (!offlineMode) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
      <CloudOff className="size-3" aria-hidden /> Sin conexión
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const offlineMode = useUiStore((s) => s.offlineMode);

  return (
    <div className="min-h-dvh bg-slate-100/70">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-white">
            <Wallet className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900">Mis Finanzas</p>
            <p className="text-[11px] text-slate-400">Personal</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Navegación principal">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <Icon className="size-4.5" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-2">
          <OfflineBadge />
        </div>
      </aside>

      <main className="lg:pl-60">
        {offlineMode ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 bg-amber-100/90 px-4 py-2 text-center text-xs font-semibold text-amber-800"
          >
            <CloudOff className="size-3.5 shrink-0" aria-hidden />
            Sin conexión: los gastos se guardan y se sincronizan al reconectar
          </div>
        ) : null}
        <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-8">
          {children}
        </div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Navegación móvil"
      >
        <div className="grid grid-cols-5 items-center">
          {NAV.slice(0, 2).map(({ href, label, icon: Icon, exact }) => (
            <NavItem key={href} href={href} label={label} icon={Icon} active={exact ? pathname === href : pathname.startsWith(href)} />
          ))}

          <Link
            href="/"
            aria-label="Registrar transacción"
            className="relative -mt-5 grid place-items-center"
          >
            <span className="grid size-14 place-items-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 active:scale-95 transition-transform">
              <Plus className="size-7" aria-hidden />
            </span>
          </Link>

          {NAV.slice(2, 3).map(({ href, label, icon: Icon, exact }) => (
            <NavItem key={href} href={href} label={label} icon={Icon} active={exact ? pathname === href : pathname.startsWith(href)} />
          ))}
          <NavItem
            href="/settings"
            label="Ajustes"
            icon={Settings}
            active={pathname.startsWith("/settings")}
          />
        </div>
      </nav>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors",
        active ? "text-indigo-600" : "text-slate-400 hover:text-slate-600",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </Link>
  );
}
