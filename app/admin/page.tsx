import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Viewport } from "next";
import AdminClient from "@/components/admin/AdminClient";

export const metadata = { title: "Admin" };

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
    .select("id, namn, roll")
    .eq("epost", user.email)
    .single();

  if (!medarbetare || (medarbetare.roll !== "chef" && medarbetare.roll !== "admin")) {
    redirect("/arbetsrapport");
  }

  return <AdminClient currentUser={medarbetare} />;
}
