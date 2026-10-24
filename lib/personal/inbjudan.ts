// Ny medarbetare: vad admin får skicka in och hur svaren från Supabase Auth tolkas. Ren logik, testad i inbjudan.test.ts.

/** Samma värden som medarbetare.roll har i prod (components/admin/medarbetarDelar.tsx ROLLER). */
export const INBJUDAN_ROLLER = ["forare", "admin"] as const;
export type InbjudanRoll = (typeof INBJUDAN_ROLLER)[number];

export type InbjudanIndata = { namn: string; epost: string; telefon: string | null; roll: InbjudanRoll };

const EPOST = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Orden i felet är det admin läser — inga tekniska termer. */
export function tolkaInbjudan(raw: unknown): { ok: true; data: InbjudanIndata } | { ok: false; fel: string } {
  if (!raw || typeof raw !== "object") return { ok: false, fel: "Namn och e-post krävs." };
  const r = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const namn = text(r.namn);
  // GoTrue lagrar e-post med små bokstäver, och autentisera() slår upp medarbetaren på exakt user.email.
  const epost = text(r.epost).toLowerCase();
  const telefon = text(r.telefon);
  if (!namn) return { ok: false, fel: "Namn krävs." };
  if (namn.length > 120) return { ok: false, fel: "Namnet är för långt." };
  if (!epost || epost.length > 254 || !EPOST.test(epost)) return { ok: false, fel: "E-postadressen ser inte rätt ut." };
  if (telefon.length > 40) return { ok: false, fel: "Telefonnumret är för långt." };
  const roll = r.roll;
  if (!INBJUDAN_ROLLER.includes(roll as InbjudanRoll)) return { ok: false, fel: "Välj en roll." };
  return { ok: true, data: { namn, epost, telefon: telefon || null, roll: roll as InbjudanRoll } };
}

/** `ilike` utan jokertecken: e-postadresser kan innehålla _ och %. */
export const ilikeExakt = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

type AuthFel = { code?: string; status?: number; message?: string } | null | undefined;

/** Kontot finns redan i Auth (bekräftat). */
export const arKontoFinns = (e: AuthFel) =>
  !!e && (e.code === "email_exists" || e.code === "user_already_exists" || /already (been )?registered/i.test(e.message || ""));

/** Supabase har en gräns för hur många mail som går ut per timme. */
export const arMailGrans = (e: AuthFel) =>
  !!e && (e.code === "over_email_send_rate_limit" || e.status === 429 || /rate limit/i.test(e.message || ""));
