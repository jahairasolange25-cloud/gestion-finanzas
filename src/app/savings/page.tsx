import type { Metadata } from "next";
import { SavingsScreen } from "@/components/savings-screen";

export const metadata: Metadata = { title: "Ahorros" };

export default function SavingsPage() {
  return <SavingsScreen />;
}
