import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Viewport } from "next";
import AvtalClient from "./AvtalClient";

export const metadata = { title: "Avtal & Abonnemang" };
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const { data: med } = await supabase
    .from("medarbetare")
    .select("roll")
    .eq("epost", user.email)
    .maybeSingle();

  const kanRedigera = med?.roll === "admin" || med?.roll === "chef";

  return <AvtalClient kanRedigera={kanRedigera} />;
}
