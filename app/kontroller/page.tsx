import { redirect } from "next/navigation";
import type { Viewport } from "next";
import { autentisera, kanRedigera } from "@/lib/resurs-auth";
import FordonLista from "@/components/fordon/FordonLista";

export const metadata = { title: "Fordon" };
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function Page() {
  const { user, roll } = await autentisera();
  if (!user) redirect("/login");
  return <FordonLista kanRedigera={kanRedigera(roll)} />;
}
