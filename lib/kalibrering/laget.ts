/**
 * LÄGET — "Är vi godkända och vad ska jag göra?" Räknandet bakom första fliken: domen (Godkänd / Under kravet / För få mätningar),
 * Vidas tre krav som rader, längden som en rad under det stora talet, åtgärdsraderna med träff före → efter, och vilken maskin vyn startar på.
 *
 * SIFFRORNA ÄR INTE NYA: allt här läser samma `BedomningResp` som de gamla flikarna (Senaste, Trend, Rapport) och använder samma
 * `bedomProfil`/`atgardDom`/format som de. Det enda nya är domen, som sätter ihop de två bedömningarna (diameter, längd) till ETT ord.
 * Domen bygger alltid på det rullande fönstret (90 dagar t.o.m. maskinens senaste kontroll) — aldrig på en enda dag.
 */
import { atgardDom, bedomProfil, PROFIL_TON, type AtgDom, type AtgRad, type AtgRiktning, type ToneToken } from './bedomning';
import { fmtDagMan } from './datum';
import { fmtAbs1, fmtKrav, fmtSig1 } from './format';
import { LANGD_MATT, MATT, type MattKey } from './ordlista';
import { cap } from './text';
import type { AlleMaskin, AtgardPost, BedomningResp, FaktKalibrering } from './typer';

// === Domen ===
export type DomStatus = 'godkand' | 'under' | 'for_fa' | 'ingen_profil';
export type Dom = {
  status: DomStatus;
  /** Skärmens rubrik: "Godkänd", "Under kravet", "För få mätningar", "Ingen kravprofil". */
  titel: string;
  /** En mening under rubriken som säger varför. */
  rad: string;
  /** Under kravet = något mått ligger under golvet. Bara det färgar rubriken (varningsikon). */
  avvikelse: boolean;
};

/** "VIDA" → "Vida", "BIOMETRIA" → "Biometria". */
export const profilNamn = (profil: string | null | undefined): string => (profil ? cap(profil) : 'profilens');
/** Genitiv: "Vidas", "Biometrias". */
export const genitiv = (profil: string | null | undefined): string => (profil ? `${profilNamn(profil)}s` : 'profilens');

/**
 * Vilka mått som ligger under golvet (röda) och därmed fäller domen. EN funktion för domen, det stora talet och raderna, så att talet
 * på skärmen alltid är det mått som gjorde domen "Under kravet". Ett mått med för få mått (larmTyst) fäller aldrig.
 */
const fallande = (b: BedomningResp): { diameter: boolean; langd: boolean } => {
  const dia = bedomProfil(b.diameter, 'diameter', b.trosklar);
  const len = bedomProfil(b.langd, 'langd', b.trosklar);
  return { diameter: !dia.larmTyst && dia.status === 'röd', langd: !len.larmTyst && len.status === 'röd' };
};

/**
 * Domen: ETT ord för "är vi godkända?". Diameter och längd bedöms var för sig mot maskinens kravprofil (`bedomProfil`, samma som förr);
 *   - ingen kravprofil / inga krav för diameter → "Ingen kravprofil" (ingen dom går att ställa)
 *   - diametern har för få mått (under profilens larmgräns) → "För få mätningar" — vi dömer aldrig på tunt underlag
 *   - något bedömt mått under golvet (röd) → "Under kravet"
 *   - annars "Godkänd". Orange (över golvet men under målet) är godkänt; raden säger att målet inte nåtts.
 * Längden dömer med bara om den har underlag (larmTyst längd räknas inte — diametern är Vidas huvudmått).
 */
export const kalibreringsDom = (b: BedomningResp): Dom => {
  const harKrav = b.trosklar.some(t => t.variabel === 'diameter');
  if (!b.profil || !harKrav) {
    return { status: 'ingen_profil', titel: 'Ingen kravprofil', rad: 'Maskinen saknar kravprofil — ingen dom går att ställa.', avvikelse: false };
  }
  const dia = bedomProfil(b.diameter, 'diameter', b.trosklar);
  const len = bedomProfil(b.langd, 'langd', b.trosklar);
  if (!b.fonster || dia.larmTyst) {
    const n = b.diameter?.n ?? 0;
    const min = b.trosklar.find(t => t.variabel === 'diameter' && t.metrik === 'traffprocent')?.larm_min_matt ?? null;
    const rad = !b.fonster ? 'Inga kontroller ännu.'
      : min != null ? `${n} mått i perioden — minst ${min} behövs för en dom.` : `${n} mått i perioden — för få för en dom.`;
    return { status: 'for_fa', titel: 'För få mätningar', rad, avvikelse: false };
  }
  const f = fallande(b);
  const under = [f.diameter ? 'diametern' : null, f.langd ? 'längden' : null].filter((x): x is string => !!x);
  if (under.length > 0) {
    return { status: 'under', titel: 'Under kravet', rad: `${cap(under.join(' och '))} ligger under ${genitiv(b.profil)} krav.`, avvikelse: true };
  }
  const underMalet = dia.status === 'orange' || (!len.larmTyst && len.status === 'orange');
  return {
    status: 'godkand', titel: 'Godkänd', avvikelse: false,
    rad: underMalet ? `Över kravet, men under ${genitiv(b.profil)} mål.` : `Mäter inom ${genitiv(b.profil)} krav.`,
  };
};

/** Överst i Läget, i liten text: profilen och fönstret domen bygger på. "Vida · 90 dagar · 23 jul – 21 okt". */
export const fonsterText = (b: BedomningResp): string => {
  const profil = b.profil ? profilNamn(b.profil) : 'Ingen kravprofil';
  if (!b.fonster) return profil;
  return `${profil} · ${b.fonster.dagar} dagar · ${fmtDagMan(b.fonster.fran)} – ${fmtDagMan(b.fonster.till)}`;
};

// === Det stora talet och måttet under det ===
export type Mat = 'diameter' | 'langd';
export type StortTal = { mat: Mat; varde: string; ton: ToneToken; etikett: string; tyst: boolean };

/**
 * Skärmens enda stora tal är det mått som AVGÖR domen. Fäller längden (och bara längden) är det längdens träffprocent; i alla andra fall
 * diameterns — fäller båda eller ingen är diametern Vidas huvudmått. Annars visar skärmen "Under kravet" över ett tal som klarar kravet.
 */
export const avgorandeMatt = (b: BedomningResp): Mat => {
  const f = fallande(b);
  return kalibreringsDom(b).status === 'under' && f.langd && !f.diameter ? 'langd' : 'diameter';
};

/** `tyst` = för få mått för en dom — talet står kvar men dämpat. */
export const stortTal = (b: BedomningResp): StortTal => {
  const mat = avgorandeMatt(b);
  const stat = mat === 'langd' ? b.langd : b.diameter;
  const bed = bedomProfil(stat, mat, b.trosklar);
  const tol = stat?.tolerans;
  const traff = bed.detaljer.find(d => d.metrik === 'traffprocent');
  const etikett = mat === 'langd'
    ? (tol != null ? `av längderna inom ±${fmtKrav(tol)} cm` : 'av längderna träffar rätt')
    : (tol != null ? `av diametermätningarna träffar inom ±${fmtKrav(tol)} mm` : 'av diametermätningarna träffar rätt');
  return {
    mat,
    varde: stat?.traffPct == null ? '–' : `${Math.round(stat.traffPct)} %`,
    ton: bed.larmTyst || !traff ? 'ok' : PROFIL_TON[traff.status],
    etikett,
    tyst: bed.larmTyst,
  };
};

export type MatRad = { varde: string; ton: ToneToken; text: string } | null;
/** Ett mått i en rad: "Längd 94 % inom ±2 cm · 285 mått", "Diameter 77 % inom ±4 mm · 1113 mått". null när måttet saknar underlag. */
export const matRad = (b: BedomningResp, mat: Mat): MatRad => {
  const s = mat === 'langd' ? b.langd : b.diameter;
  if (!s || s.traffPct == null) return null;
  const bed = bedomProfil(s, mat, b.trosklar);
  const traff = bed.detaljer.find(d => d.metrik === 'traffprocent');
  const ton: ToneToken = bed.larmTyst || !traff ? 'ok' : PROFIL_TON[traff.status];
  const enhet = mat === 'langd' ? 'cm' : 'mm';
  const tol = s.tolerans != null ? ` inom ±${fmtKrav(s.tolerans)} ${enhet}` : '';
  const varde = `${Math.round(s.traffPct)} %`;
  return { varde, ton, text: `${mat === 'langd' ? 'Längd' : 'Diameter'} ${varde}${tol} · ${s.n} mått` };
};

/** Längden i en rad (som förut). Tonen är träffprocentens, inte längdens värsta mått — längd bedöms bara på träff. */
export const langdRad = (b: BedomningResp): MatRad => matRad(b, 'langd');

/** Raden under det stora talet: det andra måttet. Är längden stor står diametern här, annars längden. */
export const andraRad = (b: BedomningResp): MatRad => matRad(b, avgorandeMatt(b) === 'langd' ? 'diameter' : 'langd');

// === Vidas krav: tre diameterrader + längden ===
export type KravRad = {
  key: MattKey | 'langd';
  /** Vardagsfrågan ur ordlistan ("Träffar diametern rätt?") — ordlistan styr orden. */
  fraga: string;
  term: string;
  varde: string;
  ton: ToneToken;
  /** Ordet som står bredvid pricken när måttet inte är ok ("under kravet"). */
  ord: string | null;
  krav: string;
};

const TON_ORD: Record<ToneToken, string | null> = { ok: null, cold: null, hi: 'under målet', hot: 'under kravet' };

/**
 * De tre diametertalen mot maskinens krav, exakt som "Så ligger du till" visade dem (samma format, samma bedömning), och som fjärde rad längdens
 * träffprocent mot längdkravet — med SAMMA färgregel, så det syns vilken rad som fäller. Längdraden finns bara när profilen har ett längdkrav.
 */
export const kravRader = (b: BedomningResp): KravRad[] => {
  const stat = b.diameter;
  const tr = b.trosklar;
  const bed = bedomProfil(stat, 'diameter', tr);
  const golvFor = (metrik: string): number | null => {
    const r = tr.find(t => t.variabel === 'diameter' && t.metrik === metrik);
    return r ? Number(r.golv) : null;
  };
  const tonFor = (metrik: string): ToneToken => {
    if (bed.larmTyst) return 'ok';
    const dd = bed.detaljer.find(x => x.metrik === metrik);
    return dd ? PROFIL_TON[dd.status] : 'ok';
  };
  const gT = golvFor('traffprocent'), gS = golvFor('systematisk'), gStd = golvFor('standardavv');
  const rad = (key: MattKey, varde: string, krav: string): KravRad => ({
    key, fraga: MATT[key].fraga, term: MATT[key].term, varde, ton: tonFor(key), ord: TON_ORD[tonFor(key)], krav,
  });
  const rader: KravRad[] = [
    rad('traffprocent', stat?.traffPct == null ? '–' : `${Math.round(stat.traffPct)} %`, gT != null ? `krav ≥ ${fmtKrav(gT)} %` : ''),
    rad('systematisk', stat?.systematisk == null ? '–' : `${fmtSig1(stat.systematisk)} mm`, gS != null ? `krav ≤ ${fmtKrav(gS)} mm` : ''),
    rad('standardavv', stat?.standardavv == null ? '–' : `${fmtAbs1(stat.standardavv)} mm`, gStd != null ? `krav ≤ ${fmtKrav(gStd)} mm` : ''),
  ];
  const langdKrav = tr.find(t => t.variabel === 'langd' && t.metrik === 'traffprocent');
  if (langdKrav) {
    const len = bedomProfil(b.langd, 'langd', tr);
    const traff = len.detaljer.find(x => x.metrik === 'traffprocent');
    const ton: ToneToken = len.larmTyst || !traff ? 'ok' : PROFIL_TON[traff.status];
    rader.push({
      key: 'langd', fraga: LANGD_MATT.fraga, term: LANGD_MATT.term, ton, ord: TON_ORD[ton],
      varde: b.langd?.traffPct == null ? '–' : `${Math.round(b.langd.traffPct)} %`, krav: `krav ≥ ${fmtKrav(Number(langdKrav.golv))} %`,
    });
  }
  return rader;
};

// === Åtgärder: träff före → efter ===
export type AtgardRad = {
  /** Nyckel: datum + källa + text — stabil mellan omritningar. */
  id: string;
  post: AtgardPost;
  /** "18 jul" */
  datumText: string;
  titel: string;
  /** "71 % → 84 %" — eller "För tidigt" när någon sida har under 30 mått. */
  hoger: string;
  /** "↑ 13 · bättre" — eller varför det är för tidigt. */
  hogerUnder: string;
  riktning: 'battre' | 'samre' | 'oforandrad' | null;
  /** Hela domen (de tre talen före/efter) för åtgärdsarket. null = för tidigt. */
  dom: AtgDom | null;
};

const RIKTNING_ORD = { battre: 'bättre', samre: 'sämre', oforandrad: 'oförändrad' } as const;

/** Åtgärderna nyast först. Dubbletter (samma datum, källa och text — en reparation som loggats för både längd och diameter) slås ihop. */
export const atgardRader = (b: BedomningResp | null): AtgardRad[] => {
  const poster = b?.atgarder ?? [];
  const sedda = new Set<string>();
  const rader: AtgardRad[] = [];
  for (const post of poster) {
    const id = `${post.datum}|${post.kalla}|${post.text}`;
    if (sedda.has(id)) continue;
    sedda.add(id);
    const dom = post.forTidigt ? null : atgardDom(post);
    const t = dom?.traff;
    const riktning = t ? t.riktning : null;
    rader.push({
      id, post, datumText: fmtDagMan(post.datum), titel: post.text || (post.kalla === 'reparation' ? 'Reparation av mätsystem' : post.kalla === 'kalibrering' ? 'Kalibrering' : 'Åtgärd'),
      dom,
      riktning,
      hoger: t && t.fore != null && t.efter != null ? `${t.fore} % → ${t.efter} %` : 'För tidigt',
      hogerUnder: !t ? 'för få mått'
        : t.riktning === 'oforandrad' ? '→ oförändrad'
        : `${(t.delta ?? 0) > 0 ? '↑' : '↓'} ${Math.abs(t.delta ?? 0)} · ${RIKTNING_ORD[t.riktning]}`,
    });
  }
  return rader.sort((a, c) => c.post.datum.localeCompare(a.post.datum));
};

// === Vilken maskin vyn startar på ===
/**
 * Maskinen vyn startar på. En sammanslagen bedömning av flera maskiner är ingen Vida-bedömning, så det finns inget "alla": alltid EN maskin.
 *   1. maskinen den här datorn är bunden till (maskindatorn),
 *   2. förarens egen maskin,
 *   3. maskinen med den senaste kontrollen,
 *   4. första aktiva maskinen.
 * Bara aktiva maskiner kommer i fråga (sålda döljs; historiken finns kvar i databasen). Är maskinlistan inte läst än används senaste kontrollens maskin.
 */
export const startMaskin = (args: {
  enhet: string | null; egen: string | null; maskiner: AlleMaskin[]; arAktiv: (id: string) => boolean; allKalib: Pick<FaktKalibrering, 'maskin_id'>[];
}): string | null => {
  const { enhet, egen, maskiner, arAktiv, allKalib } = args;
  // Innan maskinlistan är läst går bara maskiner som har kontroller att lita på — en datorbunden skotare är ingen kalibreringsmaskin.
  const kand = (id: string) => (maskiner.length > 0 ? maskiner.some(m => m.maskin_id === id) : allKalib.some(k => k.maskin_id === id));
  const finns = (id: string | null): id is string => !!id && kand(id) && arAktiv(id);
  if (finns(enhet)) return enhet;
  if (finns(egen)) return egen;
  const senaste = allKalib.find(k => arAktiv(k.maskin_id));
  if (senaste) return senaste.maskin_id;
  return maskiner.find(m => arAktiv(m.maskin_id))?.maskin_id ?? null;
};

// === Ett trädslag: stödtalen under träffprocenten ===
/** Raden under träffprocenten i ett trädslag: längd = toleransen och n; diameter = "Drar den åt ett håll?" och "Flaxar den?" (samma format som gamla Rapport). */
export const tradslagStod = (stat: { n: number; tolerans: number | null; systematisk: number | null; standardavv: number | null }, variabel: 'diameter' | 'langd'): string =>
  variabel === 'langd'
    ? `inom ±${fmtKrav(stat.tolerans)} cm · n ${stat.n}`
    : `${MATT.systematisk.fraga} ${fmtSig1(stat.systematisk)} mm · ${MATT.standardavv.fraga} ${fmtAbs1(stat.standardavv)} mm · n ${stat.n}`;

// === En åtgärd i detalj: "Hjälpte åtgärden?" ===
export type AtgardDetaljRad = {
  key: 'traff' | 'syst' | 'std';
  fraga: string;
  fore: string;
  efter: string;
  /** "↑ 13 · bättre", "↓ 0,6 mm · flaxar mer", "→ oförändrad" */
  text: string;
  riktning: AtgRiktning;
};

const fmtMm = (x: number) => `${fmtSig1(x)} mm`;

/** De tre diametertalen före och efter en åtgärd, exakt som "Hjälpte åtgärden?" i gamla Trend visade dem (samma avrundning, samma ord). */
export const atgardDetalj = (dom: AtgDom): AtgardDetaljRad[] => {
  const pil = (r: AtgRad, dTxt: string, ord: string) =>
    r.riktning === 'oforandrad' ? `→ ${ord}` : `${(r.delta ?? 0) > 0 ? '↑' : '↓'} ${dTxt} · ${ord}`;
  const traffOrd = dom.traff.riktning === 'battre' ? 'bättre' : dom.traff.riktning === 'samre' ? 'sämre' : 'oförändrad';
  const systOrd = dom.syst.riktning === 'battre' ? 'rakare' : dom.syst.riktning === 'samre' ? ((dom.syst.efter ?? 0) > 0 ? 'drar grövre' : 'drar klenare') : 'oförändrad';
  const stdOrd = dom.std.riktning === 'battre' ? 'lugnare' : dom.std.riktning === 'samre' ? 'flaxar mer' : 'oförändrad';
  const v = (x: number | null, f: (n: number) => string) => (x == null ? '–' : f(x));
  return [
    { key: 'traff', fraga: MATT.traffprocent.fraga, fore: v(dom.traff.fore, n => `${Math.round(n)} %`), efter: v(dom.traff.efter, n => `${Math.round(n)} %`),
      text: pil(dom.traff, `${Math.abs(Math.round(dom.traff.delta ?? 0))}`, traffOrd), riktning: dom.traff.riktning },
    { key: 'syst', fraga: MATT.systematisk.fraga, fore: v(dom.syst.fore, fmtMm), efter: v(dom.syst.efter, fmtMm),
      text: pil(dom.syst, `${fmtAbs1(Math.abs(dom.syst.delta ?? 0))} mm`, systOrd), riktning: dom.syst.riktning },
    { key: 'std', fraga: MATT.standardavv.fraga, fore: v(dom.std.fore, n => `${fmtAbs1(n)} mm`), efter: v(dom.std.efter, n => `${fmtAbs1(n)} mm`),
      text: pil(dom.std, `${fmtAbs1(Math.abs(dom.std.delta ?? 0))} mm`, stdOrd), riktning: dom.std.riktning },
  ];
};
