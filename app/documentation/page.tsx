import type { Metadata } from "next";
import { DocumentationView } from "@/components/documentation/DocumentationView";

export const metadata: Metadata = {
  title: "ELSTAND Intelligence — Documentation",
  description:
    "Dokumentasi teknis ELSTAND Intelligence, ELVOID, architecture, intelligence pipeline, API, Web3, security, dan learning system.",
};

export default function DocumentationPage() {
  return <DocumentationView />;
}
