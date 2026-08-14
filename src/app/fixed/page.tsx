import type { Metadata } from "next";
import { FixedExpensesScreen } from "@/components/fixed-expenses-screen";

export const metadata: Metadata = { title: "Gastos fijos" };

export default function FixedExpensesPage() {
  return <FixedExpensesScreen />;
}
