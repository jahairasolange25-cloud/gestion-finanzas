import type { Metadata } from "next";
import { BudgetsScreen } from "@/components/budgets-screen";

export const metadata: Metadata = { title: "Presupuestos" };

export default function BudgetsPage() {
  return <BudgetsScreen />;
}
