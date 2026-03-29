import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Visitas · GA4",
  description: "Sesiones y usuarios por propiedad en un solo panel",
};

export default function TrafficLayout({ children }: { children: React.ReactNode }) {
  return children;
}
