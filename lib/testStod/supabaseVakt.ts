// VAKT: ett test får aldrig nå den RIKTIGA Supabase-klienten (lib/supabase.ts).
//
// Utan session svarar den riktiga klienten "inte inloggad" och appkoden fångar felet och tar läsfelsvägen — testet blir grönt
// men prövar en annan väg än den det påstår, och första anropet i en kall process tar ~70 ms (modulladdningen), vilket gjorde
// page.origo.render.test.tsx till en tidsrace (#849). Sonden 2026-10-20 (393 filer) hittade fyra sidtester som gick förbi sin mock.
//
// Hur: setup-filen (vitest.setup.ts) byter `@/lib/supabase` mot klienten härifrån i VARJE testfil. Varje användning av klienten
// (from, rpc, auth, storage …) registreras och kastar. Att bara kasta räcker inte — appkoden har try/catch — så efter varje test
// (`kontrolleraEfterTest`) faller testet om något registrerats, med vilken egenskap som användes och var i koden.
//
// Ett test som VILL ha en klient mockar den själv (`vi.mock('@/lib/supabase', …)`, 53 filer gör det): testfilens egen mock går före
// den här. Direkta `createClient`-anrop mot prod (lib/notis.flush.test.ts) går inte via lib/supabase och berörs inte.

/** Egenskaper som inspektion, await och jämförelser läser utan att klienten "används". */
const HARMLOSA = new Set(['then', 'toJSON', 'asymmetricMatch', '$$typeof', 'nodeType', 'tagName', 'constructor', 'prototype', 'valueOf', 'toString', 'inspect']);

export type Overtradelse = { egenskap: string; var: string };

const registrerade: Overtradelse[] = [];

function varIKoden(): string {
  const rader = (new Error().stack ?? '').split('\n').slice(2);
  const egna = rader.filter((r) => /\/(lib|app|components)\//.test(r) && !/supabaseVakt\.ts/.test(r)).slice(0, 2);
  return egna.map((r) => r.trim().replace(/^.*\/(?=(lib|app|components)\/)/, '').replace(/\)$/, '')).join(' < ') || 'okänd plats';
}

/** Klienten som ersätter lib/supabase: skapar ingenting, och varje användning registreras och kastar. */
export function byggVaktKlient(): object {
  return new Proxy({}, {
    get(_mal, egenskap) {
      if (typeof egenskap === 'symbol' || HARMLOSA.has(egenskap)) return undefined;
      registrerade.push({ egenskap, var: varIKoden() });
      return () => {
        throw new Error(`Testet nådde den RIKTIGA Supabase-klienten (supabase.${egenskap}). Mocka funktionen som anropar den, eller klienten själv: vi.mock('@/lib/supabase', …).`);
      };
    },
  });
}

export function hamtaOvertradelser(): readonly Overtradelse[] {
  return registrerade;
}

export function nollstall(): void {
  registrerade.length = 0;
}

/** Körs efter varje test. Kastar om testet nådde klienten (och nollställer, så nästa test börjar rent). */
export function kontrolleraEfterTest(): void {
  if (registrerade.length === 0) return;
  const rader = registrerade.map((o) => `  supabase.${o.egenskap}  ←  ${o.var}`);
  nollstall();
  throw new Error(
    `Testet nådde den RIKTIGA Supabase-klienten ${rader.length} gång${rader.length === 1 ? '' : 'er'} (appkoden kan ha fångat felet, så testet såg grönt ut):\n${rader.join('\n')}\n` +
      `Mocka funktionen som anropar klienten (t.ex. hamtaVidaGrans, hamtaStammoln) i testfilen, eller klienten: vi.mock('@/lib/supabase', …).`,
  );
}
