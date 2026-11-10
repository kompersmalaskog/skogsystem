// Åtgärdslistan — det som maskinkollen och "Något är fel" lämnar efter sig. Admin och skyddsombud läser; bara admin stänger.
// Läsningen är EN databasfunktion (am_atgarder(), migration 20261101102742_arbetsmiljo_atgarder.sql) som bär namnen —
// skyddsombudet får inte läsa medarbetare själv. Stängningens tid och vem sätts av databasen, aldrig här.
// Ärligt: ett läsfel är ett fel (`{ ok: false }`), aldrig en tom lista.

import type { SupabaseClient } from '@supabase/supabase-js';
import { bildTyp, delNamn, franLagring, type BildTyp, type Val } from './maskinBild';

export type Kalla = 'svar' | 'forare' | 'manuell' | 'tillbud' | 'skyddsrond';

export type Atgard = {
  id: string;
  kalla: Kalla;
  maskinId: string | null;
  maskinNamn: string | null;
  beskrivning: string;
  fotoUrl: string | null;
  deadline: string | null;
  status: 'oppen' | 'klar';
  stopp: boolean;
  vadGjordes: string | null;
  stangdTid: string | null;
  stangdAvNamn: string | null;
  skapad: string;
  rapportorNamn: string | null;
  /** Var på maskinen föraren tryckte (Något är fel). null = inte angivet, eller kunde inte läsas. */
  plats: { typ: BildTyp; val: Val } | null;
};

export type Las<T> = { ok: true; data: T } | { ok: false; fel: string };

export const LASFEL = 'Kunde inte läsa åtgärderna just nu.';
const TZ = 'Europe/Stockholm';

/** Dagens datum i svensk tid, 'YYYY-MM-DD'. */
export function svenskDag(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function dagarMellan(fran: string, till: string): number {
  return Math.round((Date.parse(`${till}T00:00:00Z`) - Date.parse(`${fran}T00:00:00Z`)) / 86_400_000);
}

const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function kortDatum(dag: string): string {
  const [, m, d] = dag.split('-').map(Number);
  return `${d} ${MANAD[m - 1]}`;
}

/** "Stefan Nilsson" → "Stefan". null när namnet saknas. */
export function fornamn(namn: string | null): string | null {
  const t = namn?.trim();
  return t ? t.split(/\s+/)[0] : null;
}

/** När något hände, i ord: "idag 18:31", "igår 18:31", "31 okt". */
export function narText(iso: string, nu: Date = new Date()): string {
  const d = new Date(iso);
  const dag = svenskDag(d);
  const idag = svenskDag(nu);
  const tid = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
  const diff = dagarMellan(dag, idag);
  if (diff === 0) return `idag ${tid}`;
  if (diff === 1) return `igår ${tid}`;
  return kortDatum(dag);
}

/** Senast när åtgärden ska vara gjord, i ord. `sen` = passerad (visas orange). Saknas datum: ingen text. */
export function deadlineText(deadline: string | null, idag: string): { text: string; sen: boolean } | null {
  if (!deadline) return null;
  const kvar = dagarMellan(idag, deadline);
  if (kvar < 0) return { text: kvar === -1 ? 'Sen 1 dag' : `Sen ${-kvar} dagar`, sen: true };
  if (kvar === 0) return { text: 'Idag', sen: false };
  if (kvar === 1) return { text: 'I morgon', sen: false };
  return { text: kortDatum(deadline), sen: false };
}

/** Varifrån åtgärden kom, i förarens ord. */
export function kallaText(k: Kalla): string {
  if (k === 'svar') return 'Maskinkoll';
  if (k === 'forare') return 'Något är fel';
  if (k === 'tillbud') return 'Rapport om vad som hände';
  if (k === 'skyddsrond') return 'Skyddsrond';
  return 'Lagd för hand';
}

/** Raden under titeln: "Stefan · idag 18:31" (vem saknas → bara när). */
export function underText(a: Atgard, nu: Date = new Date()): string {
  const vem = fornamn(a.rapportorNamn);
  return [vem, narText(a.skapad, nu)].filter(Boolean).join(' · ');
}

export type Grupper = { stopp: Atgard[]; oppna: Atgard[]; klara: Atgard[] };

/**
 * Stopp först (äldst först — den har stått längst), sedan övriga öppna efter deadline (sen först, utan datum sist),
 * sist de stängda (senast stängd först). Ett stopp står ALLTID under stopp, aldrig efter datum.
 */
export function gruppera(lista: Atgard[]): Grupper {
  const oppna = lista.filter(a => a.status === 'oppen');
  const stopp = oppna.filter(a => a.stopp).sort((a, b) => a.skapad.localeCompare(b.skapad));
  const ovriga = oppna.filter(a => !a.stopp).sort((a, b) => {
    if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
    return a.skapad.localeCompare(b.skapad);
  });
  const klara = lista.filter(a => a.status === 'klar').sort((a, b) => (b.stangdTid ?? '').localeCompare(a.stangdTid ?? ''));
  return { stopp, oppna: ovriga, klara };
}

/** Svaret överst. */
export function svar(g: Grupper): { tal: number; rad: string } {
  const n = g.stopp.length + g.oppna.length;
  if (n === 0) return { tal: 0, rad: 'Inget att åtgärda' };
  if (g.stopp.length === 0) return { tal: n, rad: n === 1 ? 'åtgärd att göra' : 'åtgärder att göra' };
  const maskiner = new Set(g.stopp.map(a => a.maskinId ?? a.id)).size;
  return { tal: n, rad: maskiner === 1 ? '1 maskin ska stå' : `${maskiner} maskiner ska stå` };
}

type Rad = {
  id: string; kalla: string; maskin_id: string | null; maskin_namn: string | null; beskrivning: string; foto_url: string | null;
  deadline: string | null; status: string; stopp: boolean | null; vad_gjordes: string | null; stangd_tid: string | null;
  stangd_av_namn: string | null; skapad: string; rapportor_namn: string | null;
};

function tillAtgard(r: Rad): Atgard {
  return {
    id: r.id,
    kalla: (r.kalla === 'svar' || r.kalla === 'forare' || r.kalla === 'tillbud' || r.kalla === 'skyddsrond' ? r.kalla : 'manuell') as Kalla,
    maskinId: r.maskin_id,
    maskinNamn: r.maskin_namn,
    beskrivning: r.beskrivning,
    fotoUrl: r.foto_url,
    deadline: r.deadline,
    status: r.status === 'klar' ? 'klar' : 'oppen',
    stopp: r.stopp === true,
    vadGjordes: r.vad_gjordes,
    stangdTid: r.stangd_tid,
    stangdAvNamn: r.stangd_av_namn,
    skapad: r.skapad,
    rapportorNamn: r.rapportor_namn,
    plats: null,
  };
}

export async function hamtaAtgarder(sb: SupabaseClient): Promise<Las<Atgard[]>> {
  const { data, error } = await sb.rpc('am_atgarder');
  if (error || !Array.isArray(data)) return { ok: false, fel: LASFEL };
  const lista = (data as Rad[]).map(tillAtgard);
  const platser = await hamtaPlatser(sb);
  return { ok: true, data: lista.map(a => ({ ...a, plats: platser.get(a.id) ?? null })) };
}

/**
 * Var på maskinen (migration 20261110123344_am_atgard_maskin_plats.sql). Ett TILLÄGG: går det inte att läsa visas
 * åtgärderna som förut, utan bild — aldrig ett fel i listan. Bara maskiner med teckning (skördare, skotare) får en plats.
 */
async function hamtaPlatser(sb: SupabaseClient): Promise<Map<string, { typ: BildTyp; val: Val }>> {
  const ut = new Map<string, { typ: BildTyp; val: Val }>();
  try {
    const { data, error } = await sb.from('am_atgard')
      .select('id, maskin_del, maskin_x, maskin_y, dim_maskin(maskin_typ)')
      .not('maskin_del', 'is', null);
    if (error || !Array.isArray(data)) return ut;
    for (const r of data as { id: string; maskin_del: unknown; maskin_x: unknown; maskin_y: unknown; dim_maskin: { maskin_typ: string | null } | { maskin_typ: string | null }[] | null }[]) {
      const m = Array.isArray(r.dim_maskin) ? r.dim_maskin[0] : r.dim_maskin;
      const typ = bildTyp(m?.maskin_typ);
      const val = franLagring(r.maskin_del, r.maskin_x, r.maskin_y);
      if (typ && val) ut.set(r.id, { typ, val });
    }
  } catch { /* tillägget får aldrig fälla listan */ }
  return ut;
}

const STANDARD_BESKRIVNING = 'Fel rapporterat av föraren';

/** Raden om felet: delen först när den finns — "Band och kedjor · läcker vid boggin", eller bara "Band och kedjor". */
export function felText(a: Pick<Atgard, 'beskrivning' | 'plats'>): string {
  if (!a.plats) return a.beskrivning;
  const del = delNamn(a.plats.val.del, a.plats.typ);
  return a.beskrivning.trim() === STANDARD_BESKRIVNING ? del : `${del} · ${a.beskrivning}`;
}

/** Får den inloggade stänga åtgärder (admin)? null = kunde inte läsas → ingen Klar-knapp. */
export async function farStanga(sb: SupabaseClient): Promise<boolean | null> {
  const { data, error } = await sb.rpc('ar_admin');
  if (error || typeof data !== 'boolean') return null;
  return data;
}

/** Startsidans märke. null = kunde inte läsas → inget märke, aldrig 0. Förare får 0 (funktionen ger dem inga rader). */
export async function hamtaAtgardMarke(sb: SupabaseClient): Promise<{ antal: number; stopp: number } | null> {
  const r = await hamtaAtgarder(sb);
  if (!r.ok) return null;
  const g = gruppera(r.data);
  return { antal: g.stopp.length + g.oppna.length, stopp: g.stopp.length };
}

/**
 * Stänger. Bara en ÖPPEN åtgärd ändras (`eq status oppen`); databasen sätter när och vem.
 * Läser tillbaka: noll rader = någon annan hann stänga den, eller du får inte.
 */
export async function stangAtgard(sb: SupabaseClient, id: string, vadGjordes: string): Promise<string | null> {
  const text = vadGjordes.trim();
  if (!text) return 'Skriv vad som gjordes.';
  const { data, error } = await sb.from('am_atgard')
    .update({ status: 'klar', vad_gjordes: text, stangd_tid: new Date().toISOString() })
    .eq('id', id).eq('status', 'oppen')
    .select('status');
  if (error) return 'Kunde inte spara. Försök igen.';
  if (!data || data.length === 0) return 'Åtgärden är redan stängd, eller så får du inte stänga den.';
  if ((data[0] as { status: string }).status !== 'klar') return 'Kunde inte spara. Försök igen.';
  return null;
}

/** Bildens länk (privat bucket, 10 min). null = gick inte att hämta. */
export async function fotoLank(sb: SupabaseClient, sokvag: string): Promise<string | null> {
  const { data, error } = await sb.storage.from('am-foton').createSignedUrl(sokvag, 600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Radens och arkets rubrik. En maskinåtgärd heter som maskinen. Ett tillbud säger vad det är först — "Olycka · Giant",
 * "Tillbud" (utan maskin) — så det aldrig läses som ett maskinfel. `typ` saknas (gick inte att läsa) → "Tillbud".
 */
export function atgardTitel(a: Pick<Atgard, 'kalla' | 'maskinNamn'>, typ?: 'tillbud' | 'olycka' | null): string {
  if (a.kalla === 'tillbud') {
    const vad = typ === 'olycka' ? 'Olycka' : 'Tillbud';
    return a.maskinNamn ? `${vad} · ${a.maskinNamn}` : vad;
  }
  if (a.kalla === 'skyddsrond') return a.maskinNamn ? `Skyddsrond · ${a.maskinNamn}` : 'Skyddsrond';
  return a.maskinNamn ?? 'Okänd maskin';
}
