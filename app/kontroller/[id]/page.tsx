import { redirect } from "next/navigation";
import type { Viewport } from "next";
import { autentisera, kanRedigera } from "@/lib/resurs-auth";
import ResursSida from "./ResursSida";

export const metadata = { title: "Kontroller" };
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
  return <ResursSida id={id} kanRedigera={kanRedigera(roll)} />;
}
