// Introduktion för ny förare (arbetsmiljö, 2026-11-02). Fem korta steg om det man måste veta innan man kör:
// vem vi ringer om något händer, vad man gör om något händer, vem skyddsombudet är, maskinkollen och riskerna på trakten.
// Stegen och texterna står HÄR (ändras här). Det första steget räknas ur förarens egna uppgifter; de andra fyra är
// klara när föraren tryckt "Jag har läst" (tabellen am_introduktion, tiden sätts av databasen).

import type { SupabaseClient } from '@supabase/supabase-js';

export type LasSteg = 'nod' | 'skyddsombud' | 'maskinkoll' | 'risker';
export type StegId = 'uppgifter' | LasSteg;

export type Steg = {
  id: StegId;
  titel: string;
  /** Raden under titeln när steget inte är gjort. */
  kort: string;
  /** Texten i arket, en mening per rad. */
  rader: string[];
  /** Var man gör det, när steget har en egen vy. */
  lank?: { href: string; text: string };
};

export const STEG: Steg[] = [
  {
    id: 'uppgifter', titel: 'Telefon och anhörig', kort: 'Vem vi ringer om något händer dig',
    rader: ['Fyll i ditt telefonnummer.', 'Fyll i vem vi ringer om något händer dig.'],
    lank: { href: '/personal', text: 'Fyll i' },
  },
  {
    id: 'nod', titel: 'Om något händer', kort: '112, var du är och vad du gör',
    rader: [
      'Om något händer finns under sökfältet på startsidan.',
      'Där står 112, var du är och vägen hit.',
      'Det står vad du gör om någon är skadad, om det brinner och mer.',
      'Det fungerar utan täckning.',
    ],
    lank: { href: '/om-nagot-hander', text: 'Öppna Om något händer' },
  },
  {
    id: 'skyddsombud', titel: 'Skyddsombudet', kort: 'Den du pratar med om arbetsmiljön',
    rader: [
      'Skyddsombudet hjälper dig när något på jobbet inte är säkert.',
      'Du kan alltid ringa skyddsombudet.',
    ],
  },
  {
    id: 'maskinkoll', titel: 'Maskinkollen', kort: 'En gång i månaden, och när något är fel',
    rader: [
      'En gång i månaden testar du sex saker på maskinen, som nödstopp och nödutgång.',
      'Ja är alltid bra. Svarar du Nej tar du en bild.',
      'Ser du något som är fel: tryck Något är fel och ta en bild.',
      'Är det farligt ska maskinen stå. Ring arbetsledningen.',
    ],
    lank: { href: '/maskinkoll', text: 'Öppna Maskinkoll' },
  },
  {
    id: 'risker', titel: 'Risker på trakten', kort: 'Läs dem innan du börjar',
    rader: [
      'När du börjar på en ny trakt kommer riskerna upp i maskinen.',
      'Där står vad som är farligt och vad du gör.',
      'Läs dem och tryck Jag har läst.',
    ],
  },
];

export const LAS_STEG: LasSteg[] = ['nod', 'skyddsombud', 'maskinkoll', 'risker'];

const harText = (s: string | null | undefined) => typeof s === 'string' && s.trim().length > 0;

export type Kvitto = { steg: LasSteg; tid: string };

export type IntroLage = {
  /** Per steg: tiden det blev klart (läst), true (uppgifterna ifyllda) eller null (inte klart). */
  klar: Record<StegId, string | true | null>;
  antalKlara: number;
  antal: number;
  /** Alla klara: när det sista steget lästes. null = inte klart. */
  klarTid: string | null;
};

export function introLage(uppgifter: { telefon?: string | null; anhorig_telefon?: string | null }, kvitton: Kvitto[]): IntroLage {
  const klar = {} as Record<StegId, string | true | null>;
  klar.uppgifter = harText(uppgifter.telefon) && harText(uppgifter.anhorig_telefon) ? true : null;
  for (const s of LAS_STEG) klar[s] = kvitton.find(k => k.steg === s)?.tid ?? null;
  const antalKlara = STEG.filter(s => klar[s.id] !== null).length;
  const alla = antalKlara === STEG.length;
  const tider = LAS_STEG.map(s => klar[s]).filter((t): t is string => typeof t === 'string').sort();
  return { klar, antalKlara, antal: STEG.length, klarTid: alla ? (tider[tider.length - 1] ?? null) : null };
}

const MANAD = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
export function datumText(iso: string): string {
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
  return `${d.getDate()} ${MANAD[d.getMonth()]}`;
}

/** En rad som säger läget: "Klar 3 nov" eller "2 av 5 klart". */
export function lageText(l: IntroLage): string {
  return l.klarTid ? `Klar ${datumText(l.klarTid)}` : `${l.antalKlara} av ${l.antal} klart`;
}

/** Raden i startsidans Behöver dig. null = klar (eller okänt) → ingen rad. */
export function behoverDigText(l: IntroLage | null): string | null {
  if (!l || l.antalKlara === l.antal) return null;
  return `Gör introduktionen · ${l.antalKlara} av ${l.antal} klart`;
}

/** Kvittona för en eller alla medarbetare. null = kunde inte läsas (aldrig en tom lista som ser ut som "inget läst"). */
export async function hamtaKvitton(sb: SupabaseClient, medarbetareId?: string): Promise<Map<string, Kvitto[]> | null> {
  let q = sb.from('am_introduktion').select('medarbetare_id, steg, tid');
  if (medarbetareId) q = q.eq('medarbetare_id', medarbetareId);
  const { data, error } = await q;
  if (error || !Array.isArray(data)) return null;
  const ut = new Map<string, Kvitto[]>();
  for (const r of data as { medarbetare_id: string; steg: LasSteg; tid: string }[]) {
    if (!LAS_STEG.includes(r.steg)) continue;
    const l = ut.get(r.medarbetare_id) ?? [];
    l.push({ steg: r.steg, tid: r.tid });
    ut.set(r.medarbetare_id, l);
  }
  return ut;
}

/** "Jag har läst". Redan läst (unik nyckel) räknas som lyckat. false = kunde inte sparas. */
export async function kvittera(sb: SupabaseClient, medarbetareId: string, steg: LasSteg): Promise<boolean> {
  const { error } = await sb.from('am_introduktion').insert({ medarbetare_id: medarbetareId, steg });
  return !error || error.code === '23505';
}
