import type { Metadata } from "next";
import { HistoryScreen } from "@/components/history-screen";

export const metadata: Metadata = { title: "Historial" };

export default function HistoryPage() {
  return <HistoryScreen />;
}
