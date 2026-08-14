import type { Metadata } from "next";
import { GoalsScreen } from "@/components/goals-screen";

export const metadata: Metadata = { title: "Metas de ahorro" };

export default function GoalsPage() {
  return <GoalsScreen />;
}
