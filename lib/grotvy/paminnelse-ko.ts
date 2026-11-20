// Producenten för GROT-påminnelserna: läser GROT-listan, räknar vilka tidpunkter (7 och 2 dagar före markägarens datum) som
// gäller idag, och lägger en rad per mottagare i notis_kö. /api/notis/flush (var 5:e minut) bygger texten och skickar.
//
// Körs av /api/grot/paminnelse (Vercel-cron 05:00 UTC, Bearer CRON_SECRET) med en SERVICE-klient. `dry` läser och räknar allt men
// skriver ingenting — samma kod, samma lista; det är torrkörningen man tittar på före något skickas.
//
// MOTTAGARE: bara Martin (e-post, som helikopternotisen) — se GROT_MOTTAGARE_EPOST. Saknas mottagaren returneras ett FEL (ok:false → 500 i
// cron-loggen), aldrig ett tyst "inget att göra".
//
// LARM SKA LARMA: ett tomt/oläsbart underlag, en saknad mottagare och ett skrivfel (t.ex. kolumnen dedup_nyckel saknas = migrationen inte
// körd) ger ok:false med klartext. Dedup: unikt index (typ, mottagare_id, dedup_nyckel) + insert … on conflict do nothing — samma tidpunkt
// för samma trakt och datum köas aldrig två gånger, hur många gånger rutten än körs.

import { hamtaGrotRaw } from './hamta';
import { arGrotUnderlagTillforlitligt } from './ko';
import { byggGrotLista } from './lista';
import { grotPaminnelser, paminnelsePayload, PAMINNELSE_TYP, type GrotPaminnelse } from './paminnelse';

/** Vem som får påminnelserna. E-post (inte roll), som helikopternotisen: Joacim har också roll admin men ska inte ha den här. */
export const GROT_MOTTAGARE_EPOST = ['martin.lindqvist@kompersmalaskog.com'];

export const DEDUP_MIGRATION = '20261004_notis_ko_dedup_nyckel.sql';

export interface KoRapport {
  ok: boolean;
  dry: boolean;
  idag: string;
  /** Rader i GROT-listan idag, och hur många som har markägarens datum */
  listan: number;
  medDatum: number;
  mottagare: { id: string; namn: string }[];
  /** Påminnelser som gäller idag (före dedup) */
  kandidater: { nyckel: string; namn: string; senast: string; dagarKvar: number; tidpunkt: number; markBegransning: string | null }[];
  /** Nycklar som lades i kön (tom vid dry) */
  koade: string[];
  /** Nycklar som redan fanns i kön och därför hoppades över */
  redanKoade: string[];
  anmarkningar: string[];
  fel?: string;
}

function tomRapport(idag: string, dry: boolean): KoRapport {
  return { ok: true, dry, idag, listan: 0, medDatum: 0, mottagare: [], kandidater: [], koade: [], redanKoade: [], anmarkningar: [] };
}

const kandidatRad = (k: GrotPaminnelse) => ({ nyckel: k.nyckel, namn: k.namn, senast: k.senast, dagarKvar: k.dagarKvar, tidpunkt: k.tidpunkt, markBegransning: k.markBegransning });

export async function koaGrotPaminnelser(sb: any, opt: { idag: string; dry: boolean; nu?: Date }): Promise<KoRapport> {
  const rapport = tomRapport(opt.idag, opt.dry);
  try {
    const raw = await hamtaGrotRaw(sb);
    if (!arGrotUnderlagTillforlitligt(raw)) {
      return { ...rapport, ok: false, fel: 'GROT-underlaget är tomt (inga trakter eller ingen skördad volym) — köar inget. Ett dolt läsfel får inte tolkas som "ingen påminnelse".' };
    }
    const lista = byggGrotLista(raw, { idag: opt.idag });
    rapport.listan = lista.alla.length;
    rapport.medDatum = lista.alla.filter((r) => !!r.senast).length;

    const kandidater = grotPaminnelser(lista);
    rapport.kandidater = kandidater.map(kandidatRad);

    const med = await sb.from('medarbetare').select('id, namn, epost, aktiv').in('epost', GROT_MOTTAGARE_EPOST);
    if (med.error) return { ...rapport, ok: false, fel: `Kunde inte läsa mottagaren: ${med.error.message}` };
    const mottagare = ((med.data || []) as { id: string; namn: string; aktiv: boolean | null }[]).filter((m) => m.aktiv !== false);
    rapport.mottagare = mottagare.map((m) => ({ id: m.id, namn: m.namn }));
    if (mottagare.length === 0) return { ...rapport, ok: false, fel: `Hittar ingen aktiv mottagare med e-post ${GROT_MOTTAGARE_EPOST.join(', ')}.` };

    if (kandidater.length === 0) return rapport; // inget idag — ett sant, tomt svar

    const nycklar = kandidater.map((k) => k.nyckel);
    if (opt.dry) {
      // Torrkörning: visa också vad som redan ligger i kön, om kolumnen finns.
      const finns = await sb.from('notis_kö').select('dedup_nyckel').eq('typ', PAMINNELSE_TYP).in('dedup_nyckel', nycklar);
      if (finns.error) rapport.anmarkningar.push(`Kunde inte läsa notis_kö.dedup_nyckel (${finns.error.message}) — kör migrationen ${DEDUP_MIGRATION} innan skarp körning.`);
      else rapport.redanKoade = Array.from(new Set(((finns.data || []) as { dedup_nyckel: string }[]).map((r) => r.dedup_nyckel)));
      return rapport;
    }

    const skickasAt = (opt.nu ?? new Date()).toISOString();
    const rader: { mottagare_id: string; typ: string; payload: unknown; skickas_at: string; dedup_nyckel: string }[] = [];
    kandidater.forEach((k) => mottagare.forEach((m) => rader.push({ mottagare_id: m.id, typ: PAMINNELSE_TYP, payload: paminnelsePayload(k), skickas_at: skickasAt, dedup_nyckel: k.nyckel })));

    const ins = await sb.from('notis_kö').upsert(rader, { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true }).select('dedup_nyckel');
    if (ins.error) {
      const hint = /dedup_nyckel/i.test(ins.error.message || '') ? ` — kör migrationen ${DEDUP_MIGRATION} (kolumnen/indexet saknas).` : '';
      return { ...rapport, ok: false, fel: `Kunde inte köa påminnelserna: ${ins.error.message}${hint}` };
    }
    const koade = new Set(((ins.data || []) as { dedup_nyckel: string }[]).map((r) => r.dedup_nyckel));
    rapport.koade = Array.from(koade);
    rapport.redanKoade = nycklar.filter((n) => !koade.has(n));
    return rapport;
  } catch (e: any) {
    return { ...rapport, ok: false, fel: e?.message || String(e) };
  }
}
