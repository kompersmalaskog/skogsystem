// ÅRSHJULET (2026-11-03, efter Skogsentreprenörernas arbetsmiljöhjul): det som ska göras en gång om året, i den månad det hör till.
// Svarar på "Vad är kvar i år?". Riskbedömningen och skyddsronden har egna vyer och räknas ur dem; resten bockas av här
// (tabellen am_arshjul_gjort, migration 20261103124235_am_arshjul.sql). Admin och skyddsombud ser det; förare inte.
//
// Ren logik utom läsning och skrivning längst ner. Texterna ändras HÄR.

import type { SupabaseClient } from '@supabase/supabase-js';
import { MASKINTYPER, lage as riskLage, type Bedomning, type MaskinTyp } from './maskinRisk';
import { antalBesvarade, type Rond } from './skyddsrond';
import { datumText } from './introduktion';

export type ManuellPunkt = 'apt_var' | 'osa' | 'kemikalier' | 'apt_host' | 'uppfoljning';
export type PunktId = 'riskbedomning' | 'skyddsrond' | ManuellPunkt;

export type Punkt = {
  id: PunktId;
  /** 1–12: månaden den hör till. */
  manad: number;
  titel: string;
  /** Vad man gör, i en eller två meningar. */
  vad: string;
  /** Har en egen vy som räknar den — då går raden dit och bockas inte av här. */
  href?: string;
};

export const PUNKTER: readonly Punkt[] = [
  { id: 'riskbedomning', manad: 1, titel: 'Riskbedömning', vad: 'Se över riskerna för varje maskintyp och tryck Stämmer.', href: '/riskbedomning' },
  { id: 'apt_var', manad: 3, titel: 'Arbetsplatsträff, våren', vad: 'Samla alla en timme. Prata om det som hänt sedan sist och vad som ska bli bättre. Skriv ner vad ni bestämde.' },
  { id: 'osa', manad: 3, titel: 'Hur mår vi?', vad: 'Fråga alla hur de har det på jobbet: för mycket att göra, stress, att jobba ensam, hur vi har det ihop. Skriv ner vad ni bestämde.' },
  { id: 'kemikalier', manad: 5, titel: 'Kemikalierna', vad: 'Gå igenom oljor, sprayer och bränsle i maskinerna och verkstaden. Finns säkerhetsbladet för varje i kemikalielistan? Släng det som inte används.' },
  { id: 'apt_host', manad: 9, titel: 'Arbetsplatsträff, hösten', vad: 'Samla alla en timme. Prata om det som hänt sedan sist och vad som ska bli bättre. Skriv ner vad ni bestämde.' },
  { id: 'skyddsrond', manad: 10, titel: 'Skyddsrond', vad: 'Gå igenom maskinerna, verkstaden och lastbilen tillsammans med skyddsombudet.', href: '/skyddsrond' },
  { id: 'uppfoljning', manad: 11, titel: 'Hur gick året?', vad: 'Titta tillbaka: blev det som skulle göras gjort? Vad gör vi bättre nästa år?' },
];

export const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

export type Gjord = { punkt: ManuellPunkt; gjordTid: string; anteckning: string | null };

export type Rad = {
  punkt: Punkt;
  gjordTid: string | null;
  anteckning: string | null;
  /** Ordet under titeln. */
  under: string;
  ton?: 'orange' | 'gron';
  /** Dags nu eller försenad. */
  attGora: boolean;
};

/** År och månad (1–12) i svensk tid. */
export function svenskArManad(nu: Date): { ar: number; manad: number } {
  const [ar, manad] = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit' })
    .format(nu).split('-').map(Number);
  return { ar, manad };
}

const arFor = (iso: string) => svenskArManad(new Date(iso)).ar;

/** Riskbedömningen är gjord i år när alla fyra maskintyper är godkända i år på listan som gäller nu. Datumet = den sista. */
export function riskGjord(b: Record<MaskinTyp, Bedomning>, ar: number, nu: Date): string | null {
  let senast: string | null = null;
  for (const t of MASKINTYPER) {
    const g = b[t].godkandTid;
    if (!g || arFor(g) !== ar || riskLage(t, b[t], nu) === 'andrad' || riskLage(t, b[t], nu) === 'aldrig') return null;
    if (!senast || g > senast) senast = g;
  }
  return senast;
}

/** Skyddsronden är gjord i år när en rond blev klar i år. */
export function rondGjord(ronder: readonly Rond[], ar: number): string | null {
  const klara = ronder.filter(r => r.klar && arFor(r.klar) === ar).map(r => r.klar!).sort();
  return klara.length ? klara[klara.length - 1] : null;
}

export type Indata = {
  nu: Date;
  gjorda: readonly Gjord[];
  risk: Record<MaskinTyp, Bedomning> | null;
  ronder: readonly Rond[] | null;
};

/** En rad per punkt, i månadsordning. */
export function byggArshjul(d: Indata): Rad[] {
  const { ar, manad } = svenskArManad(d.nu);
  return PUNKTER.map(p => {
    let gjordTid: string | null = null;
    let anteckning: string | null = null;
    let pagar: string | null = null;
    if (p.id === 'riskbedomning') gjordTid = d.risk ? riskGjord(d.risk, ar, d.nu) : null;
    else if (p.id === 'skyddsrond') {
      gjordTid = d.ronder ? rondGjord(d.ronder, ar) : null;
      const p2 = d.ronder?.find(r => !r.klar);
      if (!gjordTid && p2) pagar = `Pågår · ${antalBesvarade(p2)} av ${p2.punkter.length}`;
    } else {
      const g = d.gjorda.find(x => x.punkt === p.id);
      if (g) { gjordTid = g.gjordTid; anteckning = g.anteckning; }
    }

    if (gjordTid) return { punkt: p, gjordTid, anteckning, under: `Gjord ${datumText(gjordTid)}`, ton: 'gron', attGora: false };
    if (pagar) return { punkt: p, gjordTid, anteckning, under: pagar, ton: 'orange', attGora: true };
    if (p.manad < manad) return { punkt: p, gjordTid, anteckning, under: `Inte gjord · skulle gjorts i ${MANADER[p.manad - 1]}`, ton: 'orange', attGora: true };
    if (p.manad === manad) return { punkt: p, gjordTid, anteckning, under: 'Dags nu', ton: 'orange', attGora: true };
    return { punkt: p, gjordTid, anteckning, under: `I ${MANADER[p.manad - 1]}`, attGora: false };
  });
}

/** Raden på Arbetsmiljö-sidan. Riskbedömningen och skyddsronden har egna rader där och räknas inte en gång till här. */
export function arshjulRad(rader: readonly Rad[], ar: number): { titel: string; under: string; ton?: 'orange'; attGora: boolean } {
  const gjorda = rader.filter(r => r.gjordTid).length;
  const att = rader.filter(r => r.attGora && !r.punkt.href);
  const titel = `Året ${ar}`;
  if (att.length > 0) {
    const forst = att[0].punkt.titel;
    return { titel, under: att.length === 1 ? `Att göra: ${forst}` : `${att.length} att göra · först ${forst}`, ton: 'orange', attGora: true };
  }
  const nasta = rader.find(r => !r.gjordTid && !r.attGora);
  if (gjorda === rader.length) return { titel, under: 'Allt är gjort i år', attGora: false };
  return { titel, under: nasta ? `${gjorda} av ${rader.length} gjort · nästa i ${MANADER[nasta.punkt.manad - 1]}` : `${gjorda} av ${rader.length} gjort`, attGora: false };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Läsning och skrivning
// ---------------------------------------------------------------------------------------------------------------------------

const MANUELLA = new Set<string>(['apt_var', 'osa', 'kemikalier', 'apt_host', 'uppfoljning']);

/** Årets avbockade. null = kunde inte läsas (aldrig "inget gjort"). */
export async function hamtaGjorda(sb: SupabaseClient, ar: number): Promise<Gjord[] | null> {
  const { data, error } = await sb.from('am_arshjul_gjort').select('punkt, gjord_tid, anteckning').eq('ar', ar);
  if (error) return null;
  return ((data ?? []) as { punkt: string; gjord_tid: string; anteckning: string | null }[])
    .filter(r => MANUELLA.has(r.punkt))
    .map(r => ({ punkt: r.punkt as ManuellPunkt, gjordTid: r.gjord_tid, anteckning: r.anteckning }));
}

/** Bocka av. Vem och när sätter databasen. Redan gjord (23505) räknas som lyckat. Fel = text, annars null. */
export async function markeraGjord(sb: SupabaseClient, ar: number, punkt: ManuellPunkt, anteckning: string): Promise<string | null> {
  const t = anteckning.trim();
  const { error } = await sb.from('am_arshjul_gjort').insert({ ar, punkt, anteckning: t ? t.slice(0, 500) : null });
  if (!error || error.code === '23505') return null;
  return 'Kunde inte spara just nu. Försök igen.';
}

/** Ångra en avbockning. */
export async function angraGjord(sb: SupabaseClient, ar: number, punkt: ManuellPunkt): Promise<string | null> {
  const { error } = await sb.from('am_arshjul_gjort').delete().eq('ar', ar).eq('punkt', punkt);
  return error ? 'Kunde inte ångra just nu. Försök igen.' : null;
}
