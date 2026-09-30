import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Maskinvy2Client from "./Maskinvy2Client";

// ROLLSKYDDAD (admin/chef) sedan 2026-09-30 — samma vakt som /admin. Vyn visar
// TU per maskin och per förare; ett maskintal läses lätt som ett omdöme om
// föraren fast han inte rår över underhåll och störningar. Lättare att öppna
// något stängt än att stänga något öppet (Martin). Förr bara sessionsskyddad:
// RLS på fakt_tid gav då föraren sina egna rader, inte andras.
export const metadata = { title: "Maskinanalys" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(alla) { alla.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  const { data: medarbetare } = await supabase.from("medarbetare").select("roll").eq("epost", user.email).single();
  if (!medarbetare || (medarbetare.roll !== "chef" && medarbetare.roll !== "admin")) redirect("/maskinvy");
  return <Maskinvy2Client />;
}
