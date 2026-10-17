import type { Metadata } from "next";
import { ConceptsScreen } from "@/components/concepts-screen";

export const metadata: Metadata = { title: "Gastos personales" };

export default function ConceptsPage() {
  return <ConceptsScreen />;
}
