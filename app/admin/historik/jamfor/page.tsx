import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Viewport } from "next";
import JamforClient from "@/components/historik/JamforClient";

export const metadata = { title: "Jämför maskiner" };
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Historiken (produktionsrapporter 2011–2026) är bara för roll = 'admin'. Chef kommer in på /admin men inte hit; databasen släpper
// ändå bara igenom admin (RLS: public.ar_admin() på alla hist_-tabeller och på bucketen "historik"), så den här kontrollen är bara hövlighet + redirect.
export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const { data: medarbetare } = await supabase
    .from("medarbetare")
    .select("id, roll")
    .eq("epost", user.email)
    .single();

  if (!medarbetare || medarbetare.roll !== "admin") {
    redirect("/admin");
  }

  return <JamforClient />;
}
