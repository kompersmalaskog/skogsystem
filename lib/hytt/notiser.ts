// NOTISER I HYTTEN (Windows-notis via Chrome när appen inte är framme). Rena funktioner: vad en notis säger, vilka knappar den har och NÄR den kommer.
// Appen känner bara sitt eget fönster (lib/hytt/notisFonster). Notisen är ett TILLÄGG: larmet, besökskortet och instruktionskortet i appen fungerar som förut.
//
// Tre sorter, i den här ordningen när flera kommer — fara, besök, område. Windows lägger den senast skapade överst, så de skapas i omvänd ordning (område, besök, fara):
//  FARA   (röd ikon)    "<Namn> <meter> m" + kortregeln/kommentaren. Ligger kvar tills föraren stänger den. EN notis per fara och inkörning.
//  BESÖK  (orange ikon) "Besök: <namn> kommer <nu/ca hh:mm>" + "<trakt> · Stäng av när du ser hen". Knappar Uppfattat / Öppna kartan. Ny notis med ljud efter 5 min, en gång.
//  OMRÅDE (neutral)     ytans namn + första punkten (+N till). Ett tryck öppnar instruktionskortet. EN notis per yta och text (samma Sett-hash som kortet).
// Info (avlägg, ved, grind …) ger ingen notis.

import { BESOK_NOTIS_PAMINNELSE_MIN } from '@/lib/besok/konstanter';
import { kommerText } from '@/lib/besok/tid';
import { kommentarPunkter } from '@/lib/kommentarPunkter';
import type { FonsterLage } from './notisFonster';

export type NotisTyp = 'fara' | 'besok' | 'omrade' | 'test';

export const NOTIS_IKON: Record<NotisTyp, string> = {
  fara: '/notis-fara.png',
  besok: '/notis-besok.png',
  omrade: '/notis-omrade.png',
  test: '/notis-test.png',
};

export type NotisKnapp = { action: 'uppfattat' | 'visa'; title: string };

export type HyttNotis = {
  typ: NotisTyp;
  /** Samma tag ersätter en gammal notis (Windows visar inte två). */
  tag: string;
  titel: string;
  text: string;
  ikon: string;
  /** Ligger kvar tills föraren trycker eller stänger. */
  kvarTillTryck: boolean;
  /** Spelar ljud igen fast tagen finns (påminnelsen). */
  renotify: boolean;
  knappar: NotisKnapp[];
  /** Det service workern och sidan behöver när notisen trycks. */
  data: { hytt: true; typ: NotisTyp; url: string; besokId?: string; maskinId?: string | null; test?: boolean; paminnelse?: boolean };
};

export type Roll = 'skordare' | 'skotare' | null;

// ── FARA ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type FaraIn = { id: string; namn: string; typ?: string; avstandM: number | null; text: string | null };

/** El-ledning och Vidas Kraftledning (symbol, linje eller Vidas lager). Markkabel ligger i marken och är ingen ledning i luften. */
export const arLedning = (f: Pick<FaraIn, 'namn' | 'typ'>): boolean => /ledning/i.test(`${f.typ ?? ''} ${f.namn}`);

/** Kortregeln: det föraren ska göra. Per maskin för en ledning (skördaren fäller, skotaren har kranen uppe), annars det allmänna. */
export function faraRegel(f: Pick<FaraIn, 'namn' | 'typ' | 'avstandM'>, roll: Roll): string {
  if (arLedning(f)) {
    if (roll === 'skordare') return 'Fäll inte mot ledningen';
    if (roll === 'skotare') return 'Kranen nära ledningen';
  }
  return f.avstandM == null ? 'Du är inne i ytan – kör inte här' : 'Håll avstånd';
}

export function faraNotis(f: FaraIn, roll: Roll, url: string): HyttNotis {
  const meter = f.avstandM == null ? '' : ` ${Math.max(0, Math.round(f.avstandM))} m`;
  const rader = [faraRegel(f, roll), ...kommentarPunkter(f.text).slice(0, 1)];
  return {
    typ: 'fara', tag: `fara-${f.id}`, titel: `${f.namn}${meter}`, text: rader.join('\n'), ikon: NOTIS_IKON.fara,
    kvarTillTryck: true, renotify: false, knappar: [{ action: 'visa', title: 'Visa på kartan' }],
    data: { hytt: true, typ: 'fara', url },
  };
}

// ── BESÖK ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type BesokIn = { id: string; namn: string; besokstid: string };

export function besokNotis(b: BesokIn, a: { trakt: string; maskinId: string | null; test: boolean; url: string; nu: Date; paminnelse: boolean }): HyttNotis {
  // kommerText ger "kommer nu" / "kommer ca 14:30" — notisen säger samma sak som kortet.
  const text = `${a.trakt ? `${a.trakt} · ` : ''}Stäng av när du ser hen`;
  return {
    typ: 'besok', tag: `besok-${b.id}`, titel: `Besök: ${b.namn} ${kommerText(b.besokstid, a.nu)}`,
    text: a.paminnelse ? `Inte kvitterat ännu. ${text}` : text, ikon: NOTIS_IKON.besok,
    kvarTillTryck: true, renotify: a.paminnelse,
    knappar: [{ action: 'uppfattat', title: 'Uppfattat' }, { action: 'visa', title: 'Öppna kartan' }],
    data: { hytt: true, typ: 'besok', url: a.url, besokId: b.id, maskinId: a.maskinId, test: a.test, ...(a.paminnelse ? { paminnelse: true } : {}) },
  };
}

// ── OMRÅDE ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type OmradeIn = { nyckel: string; namn: string; bricka?: string; typ?: string; instruktioner: { text: string; hash: string }[]; fler: number };

/** Nyckeln en notis hör till: området + texternas hash. Ändrad text = ny nyckel = ny notis (som kortet, som blir osett igen). */
export const omradeNyckel = (o: OmradeIn): string => `${o.nyckel}|${o.instruktioner.map((x) => x.hash).join(',')}`;

const KORTA = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

export function omradeNotis(o: OmradeIn, url: string): HyttNotis {
  const forsta = kommentarPunkter(o.instruktioner[0]?.text)[0] ?? '';
  const extra = Math.max(0, o.instruktioner.length - 1) + Math.max(0, o.fler);
  const titel = o.bricka ? (o.typ ? `${o.bricka} · ${o.typ}` : o.bricka) : o.namn;
  return {
    typ: 'omrade', tag: `omrade-${o.nyckel}`, titel, text: `${KORTA(forsta, 140)}${extra ? ` (+${extra} till)` : ''}`, ikon: NOTIS_IKON.omrade,
    kvarTillTryck: true, renotify: false, knappar: [], data: { hytt: true, typ: 'omrade', url },
  };
}

// ── NÄR ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type NotisState = {
  /** Fara-id → notisen visad den här inkörningen. Nollas när faran inte längre är nära (nästa inkörning ger en ny). */
  fara: Record<string, boolean>;
  /** Besök-id → läge. `visad` = en notis ligger uppe nu; `forst` = när den första kom; `paminnd` = påminnelsen skickad. */
  besok: Record<string, { visad: boolean; forst: number | null; paminnd: boolean }>;
  /** Områdesnycklar (med hash) som redan fått en notis. */
  omrade: Record<string, true>;
};
export const TOMT_NOTISLAGE: NotisState = { fara: {}, besok: {}, omrade: {} };

export type NotisIndata = {
  lage: FonsterLage;
  nu: number;
  roll: Roll;
  trakt: string;
  maskinId: string | null;
  test: boolean;
  url: string;
  fara: FaraIn[];
  /** Besök den här maskinen inte kvitterat. */
  besok: BesokIn[];
  omrade: OmradeIn | null;
};

export type NotisUtfall = { state: NotisState; visa: HyttNotis[]; stang: string[]; /** Appen är framme: stäng varje notis från hytten som ligger uppe. */ stangAlla: boolean };

const RANG: Record<NotisTyp, number> = { omrade: 0, besok: 1, fara: 2, test: 3 };   // lägst först: det som skapas sist hamnar överst

/**
 * Ett steg: givet fönsterläget och vad som väntar — vad ska visas, vad ska stängas. Anropas vid varje ändring (fönster, larm, besök, instruktion) och av en tickande klocka.
 *  • framme (synlig OCH vald): ingen notis; alla uppe stängs. Besöken får en ny notis nästa gång appen är borta och de fortfarande väntar.
 *  • borta: notis för det som väntar och inte redan fått sin.
 */
export function stegaNotiser(prev: NotisState, i: NotisIndata): NotisUtfall {
  const state: NotisState = { fara: { ...prev.fara }, besok: { ...prev.besok }, omrade: { ...prev.omrade } };
  const visa: HyttNotis[] = [];
  const stang: string[] = [];
  const borta = i.lage === 'borta';

  // FARA: per inkörning. Faran som inte längre är nära nollställs (en ny inkörning ger en ny notis). Notisen själv lämnas kvar tills föraren stänger den.
  const naraId = new Set(i.fara.map((f) => f.id));
  for (const id of Object.keys(state.fara)) if (!naraId.has(id)) delete state.fara[id];
  for (const f of i.fara) {
    if (state.fara[f.id]) continue;
    if (borta) { visa.push(faraNotis(f, i.roll, i.url)); state.fara[f.id] = true; }
  }

  // BESÖK: väntar tills Uppfattat. Försvunnet (kvitterat, passerat) → städas och notisen stängs.
  const vantarId = new Set(i.besok.map((b) => b.id));
  for (const id of Object.keys(state.besok)) {
    if (!vantarId.has(id)) { if (state.besok[id].visad) stang.push(`besok-${id}`); delete state.besok[id]; }
  }
  for (const b of i.besok) {
    const s = state.besok[b.id] ?? { visad: false, forst: null, paminnd: false };
    if (!borta) {
      if (s.visad) { stang.push(`besok-${b.id}`); s.visad = false; }   // föraren är i appen: kortet där räcker
    } else if (!s.visad) {
      const dagsDags = s.forst != null && !s.paminnd && i.nu - s.forst >= BESOK_NOTIS_PAMINNELSE_MIN * 60000;
      visa.push(besokNotis(b, { trakt: i.trakt, maskinId: i.maskinId, test: i.test, url: i.url, nu: new Date(i.nu), paminnelse: dagsDags }));
      s.visad = true;
      if (s.forst == null) s.forst = i.nu;
      if (dagsDags) s.paminnd = true;
    } else if (s.forst != null && !s.paminnd && i.nu - s.forst >= BESOK_NOTIS_PAMINNELSE_MIN * 60000) {
      // Notisen ligger uppe men har inte setts på 5 min: en ny, med ljud, EN gång.
      visa.push(besokNotis(b, { trakt: i.trakt, maskinId: i.maskinId, test: i.test, url: i.url, nu: new Date(i.nu), paminnelse: true }));
      s.paminnd = true;
    }
    state.besok[b.id] = s;
  }

  // OMRÅDE: en notis per område och text. Samma yta igen utan ny text ger ingen ny notis.
  if (i.omrade) {
    const nyckel = omradeNyckel(i.omrade);
    if (borta && !state.omrade[nyckel]) { visa.push(omradeNotis(i.omrade, i.url)); state.omrade[nyckel] = true; }
  }

  // Framme: ALLT som ligger uppe stängs (besök, fara och område, också sådant som inte längre väntar) — föraren har kommit till appen.
  visa.sort((a, b) => RANG[a.typ] - RANG[b.typ]);
  return { state, visa, stang: Array.from(new Set(stang)), stangAlla: !borta };
}

// ── TESTNOTIS (STEG 1) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Testnotisen i Inställningar: samma form som besöksnotisen (två knappar, ligger kvar), men säger att den är ett test. Uppfattat i den kvitterar inget — det registreras bara i rapporten. */
export function testNotis(url: string): HyttNotis {
  return {
    typ: 'test', tag: 'hytt-test', titel: 'Testnotis från appen', text: 'Så här ser en notis ut när appen inte är framme. Tryck Uppfattat.', ikon: NOTIS_IKON.test,
    kvarTillTryck: true, renotify: true,
    knappar: [{ action: 'uppfattat', title: 'Uppfattat' }, { action: 'visa', title: 'Öppna kartan' }],
    data: { hytt: true, typ: 'test', url, test: true },
  };
}
