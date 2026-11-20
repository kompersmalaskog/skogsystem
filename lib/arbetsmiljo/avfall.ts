// FARLIGT AVFALL (2026-11-03): anteckningen när vi lämnar farligt avfall — gamla hydraulslangar, oljiga trasor och absorbent, tomma
// oljedunkar. Avfallsförordningen kräver att den som yrkesmässigt producerar farligt avfall antecknar vad, ungefär hur mycket, när och
// till vem, och sparar det i minst tre år. Servicen gör maskinhandlarna (serviceavtal), så det som blir vårt är det vi byter själva.
//
// Flödet: föraren trycker Lämnat avfall, väljer var och vad, och ger telefonen till den som tar emot — mottagaren skriver sitt namn och
// skriver under med fingret och trycker Mottaget. Först då sparas lämningen, och den går aldrig att ändra (en liggare).
// Tabellerna am_avfall_lamning och am_avfall_mottagare (migration 20261103151814_am_farligt_avfall.sql), bilderna i am-foton under
// förarens egen mapp. Utan täckning ligger lämningen kvar i telefonen och skickas när nätet kommer (avfallKo.ts).
//
// Ren logik utom läsning och skrivning längst ner. Texterna, vikterna och avfallskoderna ändras HÄR.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Dokument, DokRad } from './dokument';
import { langtDatum } from './dokument';

export const BUCKET = 'am-foton';

export type AvfallTyp = 'slang' | 'trasor' | 'dunkar' | 'annat';

/**
 * Det vi lämnar. `kgStyck` = ungefärlig vikt per styck (räknas), `kgFast` = ungefärlig vikt när den är med (bockas).
 * Avfallskoden står i årslistan. KONTROLLERA KODERNA MED MOTTAGAREN — deras följesedel har den kod de själva använder.
 */
export const AVFALL_TYPER: Record<AvfallTyp, { namn: string; kort: string; kod: string; raknas: boolean; kgStyck?: number; kgFast?: number }> = {
  slang:  { namn: 'Hydraulslangar', kort: 'slang', kod: '16 01 21*', raknas: true, kgStyck: 2 },
  trasor: { namn: 'Trasor och absorbent', kort: 'trasor', kod: '15 02 02*', raknas: false, kgFast: 3 },
  dunkar: { namn: 'Tomma oljedunkar', kort: 'dunk', kod: '15 01 10*', raknas: true, kgStyck: 1 },
  annat:  { namn: 'Annat', kort: 'annat', kod: '', raknas: false, kgFast: 2 },
};
export const TYP_ORDNING: AvfallTyp[] = ['slang', 'trasor', 'dunkar', 'annat'];

/** En sak i lämningen. antal finns bara för det som räknas; text bara för Annat. */
export type Post = { typ: AvfallTyp; antal?: number; text?: string };

export type Mottagare = { id: string; namn: string };

export type Lamning = {
  id: string;
  mottagareNamn: string;
  poster: Post[];
  kg: number;
  kvitteradNamn: string;
  underskriftSokvag: string;
  foljesedelSokvag: string | null;
  lamnadTid: string;
  lamnadAvNamn: string | null;
  /** Bara i telefonens kö: inte skickad än. */
  vantar?: boolean;
};

/** Valen i formuläret → posterna. Det som inte är valt finns inte. */
export function poster(val: { slang: number; dunkar: number; trasor: boolean; annat: boolean; annatText: string }): Post[] {
  const ut: Post[] = [];
  if (val.slang > 0) ut.push({ typ: 'slang', antal: Math.min(99, Math.round(val.slang)) });
  if (val.trasor) ut.push({ typ: 'trasor' });
  if (val.dunkar > 0) ut.push({ typ: 'dunkar', antal: Math.min(99, Math.round(val.dunkar)) });
  if (val.annat) ut.push({ typ: 'annat', text: val.annatText.trim().slice(0, 80) || undefined });
  return ut;
}

/** Ungefärlig vikt i hela kg, aldrig 0 när något är valt. */
export function uppskattaKg(p: readonly Post[]): number {
  let kg = 0;
  for (const x of p) {
    const t = AVFALL_TYPER[x.typ];
    kg += t.raknas ? (t.kgStyck ?? 0) * (x.antal ?? 0) : (t.kgFast ?? 0);
  }
  return p.length === 0 ? 0 : Math.max(1, Math.round(kg));
}

function postText(x: Post): string {
  if (x.typ === 'slang') return x.antal === 1 ? '1 slang' : `${x.antal} slangar`;
  if (x.typ === 'dunkar') return x.antal === 1 ? '1 dunk' : `${x.antal} dunkar`;
  if (x.typ === 'trasor') return 'trasor';
  return x.text || 'annat';
}

/** "2 slangar, trasor" — första ordet med stor bokstav. */
export function posterText(p: readonly Post[]): string {
  const t = p.map(postText).join(', ');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/** "2 slangar, trasor · ca 6 kg". */
export function lamningUnder(l: Pick<Lamning, 'poster' | 'kg'>): string {
  return `${posterText(l.poster)} · ca ${fmtKg(l.kg)} kg`;
}

export function fmtKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace('.', ',');
}

const TZ = 'Europe/Stockholm';
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** 'YYYY-MM-DD' i svensk tid. */
function svDag(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** "3 nov" (svensk tid). */
export function kortDatum(iso: string): string {
  const [, m, d] = svDag(iso).split('-').map(Number);
  return `${d} ${MAN[m - 1]}`;
}

/** "15:42" (svensk tid). */
export function klockslag(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function svenskAr(iso: string): number {
  return Number(svDag(iso).slice(0, 4));
}

const fornamn = (n: string | null | undefined) => n?.trim().split(/\s+/)[0] || null;

/** Raden i listan: "LBC Ryd · 3 nov". */
export function lamningTitel(l: Pick<Lamning, 'mottagareNamn' | 'lamnadTid'>): string {
  return `${l.mottagareNamn} · ${kortDatum(l.lamnadTid)}`;
}

/** Svaret överst. Nyast först i listan. */
export function svar(l: readonly Lamning[]): { text: string; under: string | null; ton?: 'orange' } {
  const vantar = l.filter(x => x.vantar).length;
  if (vantar > 0) {
    return { text: vantar === 1 ? '1 lämning väntar på täckning' : `${vantar} lämningar väntar på täckning`, under: 'Den skickas av sig själv när telefonen får nät.', ton: 'orange' };
  }
  if (l.length === 0) return { text: 'Inget lämnat än', under: 'Gamla slangar, oljiga trasor och tomma dunkar' };
  const s = sortera(l)[0];
  return { text: `Senast lämnat ${kortDatum(s.lamnadTid)}`, under: `${s.mottagareNamn} · kvitterat` };
}

export function sortera(l: readonly Lamning[]): Lamning[] {
  return [...l].sort((a, b) => b.lamnadTid.localeCompare(a.lamnadTid));
}

/** Årets lämningar, nyast först. */
export function forAr(l: readonly Lamning[], ar: number): Lamning[] {
  return sortera(l.filter(x => svenskAr(x.lamnadTid) === ar));
}

export function arSvar(l: readonly Lamning[]): { text: string; under: string } {
  const kg = l.reduce((s, x) => s + x.kg, 0);
  return {
    text: l.length === 0 ? 'Inget lämnat' : l.length === 1 ? '1 lämning' : `${l.length} lämningar`,
    under: l.length === 0 ? 'Inget farligt avfall lämnat det här året' : `ca ${fmtKg(Math.round(kg * 10) / 10)} kg · alla kvitterade`,
  };
}

/** Årets lista som dokument (A4) — det tillsynen frågar efter. */
export function avfallDokument(l: readonly Lamning[], ar: number, nu: Date = new Date()): Dokument {
  const lista = forAr(l.filter(x => !x.vantar), ar);
  const s = arSvar(lista);
  const rader: DokRad[] = lista.map(x => ({
    titel: `${langtDatum(x.lamnadTid)} · ${x.mottagareNamn}`,
    text: [
      x.poster.map(p => {
        const t = AVFALL_TYPER[p.typ];
        const namn = p.typ === 'annat' ? (p.text || 'Annat') : t.raknas ? `${t.namn} ${p.antal} st` : t.namn;
        return t.kod ? `${namn} (${t.kod})` : namn;
      }).join(', '),
      `ca ${fmtKg(x.kg)} kg`,
      x.lamnadAvNamn ? `lämnat av ${x.lamnadAvNamn}` : null,
    ].filter(Boolean).join(' · '),
    status: `Mottaget av ${x.kvitteradNamn} ${klockslag(x.lamnadTid)}`,
    ton: 'bra',
  }));
  return {
    titel: `Farligt avfall ${ar}`,
    filnamn: `farligt-avfall-${ar}`,
    fakta: [
      { etikett: 'År', varde: String(ar) },
      { etikett: 'Utskriven', varde: langtDatum(nu.toISOString()) },
    ],
    svar: lista.length === 0 ? 'Inget farligt avfall lämnat' : `${s.text} · ${s.under}`,
    svarTon: lista.length === 0 ? 'dampad' : undefined,
    sektioner: lista.length === 0 ? [] : [{ rubrik: 'Lämningar', under: 'Varje lämning är kvitterad med namn och underskrift av mottagaren.', rader }],
    not: 'Anteckning om farligt avfall enligt avfallsförordningen. Vikterna är uppskattade. Sparas i minst tre år.',
  };
}

/** Förvalt ställe: det man senast lämnade på (enheten minns), annars det första. */
export function forvald(mottagare: readonly Mottagare[], senast: string | null): string | null {
  if (senast && mottagare.some(m => m.id === senast)) return senast;
  return mottagare[0]?.id ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Läsning och skrivning
// ---------------------------------------------------------------------------------------------------------------------------

type LamningRad = {
  id: string; mottagare_namn: string; poster: Post[]; kg: number | string; kvitterad_namn: string;
  underskrift_sokvag: string; foljesedel_sokvag: string | null; lamnad_tid: string; lamnad_av_namn: string | null;
};

/** Alla lämningar (en liten tabell). null = kunde inte läsas. */
export async function hamtaLamningar(sb: SupabaseClient): Promise<Lamning[] | null> {
  const { data, error } = await sb.from('am_avfall_lamning')
    .select('id, mottagare_namn, poster, kg, kvitterad_namn, underskrift_sokvag, foljesedel_sokvag, lamnad_tid, lamnad_av_namn')
    .order('lamnad_tid', { ascending: false }).limit(1000);
  if (error) return null;
  return ((data ?? []) as LamningRad[]).map(r => ({
    id: r.id, mottagareNamn: r.mottagare_namn, poster: Array.isArray(r.poster) ? r.poster : [], kg: Number(r.kg),
    kvitteradNamn: r.kvitterad_namn, underskriftSokvag: r.underskrift_sokvag, foljesedelSokvag: r.foljesedel_sokvag,
    lamnadTid: r.lamnad_tid, lamnadAvNamn: fornamn(r.lamnad_av_namn),
  }));
}

/** Aktiva mottagare i ordning. null = kunde inte läsas. */
export async function hamtaMottagare(sb: SupabaseClient): Promise<Mottagare[] | null> {
  const { data, error } = await sb.from('am_avfall_mottagare').select('id, namn').eq('aktiv', true)
    .order('ordning', { ascending: true }).order('namn', { ascending: true });
  if (error) return null;
  return (data ?? []) as Mottagare[];
}

/** Ny mottagare (admin och skyddsombud). Fel = text, annars null. */
export async function laggTillMottagare(sb: SupabaseClient, namn: string): Promise<string | null> {
  const n = namn.trim();
  if (!n) return 'Skriv var ni lämnar.';
  const { error } = await sb.from('am_avfall_mottagare').insert({ namn: n.slice(0, 80) });
  return error ? 'Kunde inte spara just nu. Försök igen.' : null;
}

/** Signerad länk (10 min) till underskriften eller följesedeln. null = gick inte (andras bilder ser bara arbetsledningen). */
export async function bildLank(sb: SupabaseClient, sokvag: string): Promise<string | null> {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(sokvag, 600);
  return error || !data?.signedUrl ? null : data.signedUrl;
}
