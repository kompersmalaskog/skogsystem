import { redirect } from "next/navigation";
import type { Viewport } from "next";
import { autentisera, kanRedigera } from "@/lib/resurs-auth";
import FordonSida from "@/components/fordon/FordonSida";

export const metadata = { title: "Fordon" };
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, roll } = await autentisera();
  if (!user) redirect("/login");
  return <FordonSida id={id} kanRedigera={kanRedigera(roll)} />;
}
