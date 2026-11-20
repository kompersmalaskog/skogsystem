// Fakes för rutt-tester som ska prova ROLLKRAVET på riktigt: den RIKTIGA kravRoll/kravInloggad/autentisera körs, bara
// cookies och Supabase-sessionen är fakes. Sessionen styrs av globalThis.__session = { email, roll } | null.
//
//   vi.mock("next/headers", async () => (await import("@/lib/testStod/authFakes")).nextHeadersFake);
//   vi.mock("@supabase/ssr", async () => (await import("@/lib/testStod/authFakes")).ssrFake);
//
// `tjanst` är en tillåtande tjänstklient (Proxy) som räknar hur många gånger service-nyckeln användes: en nekad
// förfrågan ska ge 0.
const g = globalThis as any;

export const nextHeadersFake = { cookies: async () => ({ getAll: () => [], set: () => {} }) };

export const ssrFake = {
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: g.__session ? { id: g.__session.id ?? "u1", email: g.__session.email } : null } }) },
    // autentisera(): medarbetaren slås upp på e-post med den inloggades egen klient.
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: g.__session && g.__session.medarbetareId !== null ? { id: g.__session.medarbetareId ?? "m-sess", roll: g.__session.roll } : null }) }) }) }),
  }),
};

export const SESSION = {
  utloggad: null,
  forare: { email: "forare@x.se", roll: "forare", medarbetareId: "m-forare" },
  admin: { email: "admin@x.se", roll: "admin", medarbetareId: "m-admin" },
} as const;

/** Tillåtande kedjeklient: varje metod ger kedjan vidare, await ger { data: [], error: null }. */
export function tjanst(svar: { data?: unknown; error?: unknown } = {}): any {
  const kedja = (): any =>
    new Proxy(function () {}, {
      get: (_t, p) => (p === "then" ? (res: any, rej: any) => Promise.resolve({ data: [], error: null, count: 0, ...svar }).then(res, rej) : kedja()),
      apply: () => kedja(),
    });
  return kedja();
}

export function nollstall() {
  g.__session = null;
  g.__tjanstAnvandningar = 0;
}
