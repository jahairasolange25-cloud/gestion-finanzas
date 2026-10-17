import type { Metadata } from "next";
import { CloseCycleScreen } from "@/components/close-cycle-screen";

export const metadata: Metadata = { title: "Cierre de ciclo" };

export default function ClosePage() {
  return <CloseCycleScreen />;
}
