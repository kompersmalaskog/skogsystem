// Härledning av objektets uppgifter ur datan — så att Martin slipper skriva in dem (Martin 2026-10-23: "allt som är säkert").
//
// Ren logik, inga skrivningar. Ett fält härleds bara när det är TOMT; det som redan står (importens eller en människas)
// rörs aldrig härifrån.
//
// SÄKER = minst två oberoende källor säger samma sak och ingen säger något annat. Bara då får värdet skrivas utan att
// någon trycker (Del 3, via `redigering_fyll_sakra`). En källa, eller källor som säger olika = ett FÖRSLAG, som visas
// förvalt i "Behöver dig" och skrivs först när Martin godkänner.
//
// Källorna (det som finns i datan i dag):
//  - TRAKTEN: Vidas leverans. Fylls redan in av importen/triggern `fyll_dim_fran_trakt` (provenans `auto_ifyllt`), så ett
//    tomt fält betyder oftast att trakten saknas. Tas emot som indata när den finns.
//  - NAMNET: förarnas och Vidas namn bär typ och avtalsform ("Mölleryd RP J-Hus -25", "Rössmåla Ga 2026",
//    "GROT Husjönäs … LRK"). Mätt mot prod 2026-10-23: namnets avtalsform stämde med den ifyllda på alla slutavverkningar
//    utom en (Vällust RP M-R -25 står som Au) — därför är namnet EN källa, aldrig ensam säker.
//  - SKÖRDARENS FIL: `cutting_method`. Bara 'ClearCutting' förekommer, och 2 av 81 sådana objekt är gallringar
//    (Giant körde Gallring Vällust som slutavverkning) — alltså aldrig ensam säker.
//  - SAMMA NAMN: ett annat objekt (annat VO) med exakt samma namn som har värdet ifyllt — samma trakt levererad två
//    gånger eller under ett nytt nummer (Mölleryd 11166477 / 11271883).
//
// Medvetet INTE en källa: VO-numrets form. 11xxxxxx ser ut som Vida men bär också ATA, Karl Hedin och Vida Energi (prod).

export type HarlettFalt = 'huvudtyp' | 'avtalsform' | 'bolag';

export interface HarledRad {
  objekt_id: string;
  object_name?: string | null;
  vo_nummer?: string | null;
  huvudtyp?: string | null;
  avtalsform?: string | null;
  bolag?: string | null;
  cutting_method?: string | null;
}

/** Det trakten (Vidas leverans) säger, när den finns kopplad. */
export type TraktUppgifter = Partial<Record<HarlettFalt, string | null>>;

export interface Harledning {
  falt: HarlettFalt;
  /** Appens bästa gissning; null när källorna säger olika lika starkt. */
  varde: string | null;
  /** Källorna som säger `varde`, i ord ("namnet", "skördarens fil", "objektet med samma namn (VO 11271883)"). */
  kallor: string[];
  /** Två eller fler källor säger samma sak och ingen säger emot. */
  saker: boolean;
  /** Andra värden som någon källa säger — tom när alla är överens. */
  emot: { varde: string; kallor: string[] }[];
}

export const KALLA = {
  trakt: 'trakten',
  namn: 'namnet',
  fil: 'skördarens fil',
  tvilling: (vo: string | null | undefined) => (vo ? `objektet med samma namn (VO ${vo})` : 'objektet med samma namn'),
} as const;

/** Namnets ord i versaler. "Mölleryd RP J-Hus -25" → [MÖLLERYD, RP, J, HUS, 25]. */
export function namnOrd(namn: string | null | undefined): string[] {
  if (!namn) return [];
  return namn.split(/[^A-Za-zÅÄÖåäöÉé0-9]+/).filter(Boolean).map(o => o.toUpperCase());
}

const AVTALSFORM_ORD: Record<string, string> = { AU: 'Au', RP: 'Rp', LRK: 'LRK', VF: 'VF/Bark' };
const GROT_ORD = new Set(['GROT', 'RIS']);
const GALLRING_ORD = new Set(['GA', 'GALLRING', 'GALLR', 'LÖVGALLRING']);
// RP/AU/LRK finns bara på slutavverkning — utom i GROT-namn, där de är virkesobjektets avtalsform ("Ålshult AU 2025 grot").
// VF (vindfälle) säger inget om typen: "Stensjömåla VF" är en gallring.
const SLUT_ORD = new Set(['AU', 'RP', 'LRK', 'SLUTAVVERKNING', 'FÖRYNGRING']);

/** Avtalsformen namnet säger, eller null (inget ord, eller två olika). */
export function namnAvtalsform(namn: string | null | undefined): string | null {
  const hittade = new Set(namnOrd(namn).map(o => AVTALSFORM_ORD[o]).filter(Boolean));
  return hittade.size === 1 ? [...hittade][0] : null;
}

/** Typen namnet säger, eller null när namnet inte säger något entydigt. */
export function namnTyp(namn: string | null | undefined): string | null {
  const ord = namnOrd(namn);
  const grot = ord.some(o => GROT_ORD.has(o));
  const gallring = ord.some(o => GALLRING_ORD.has(o));
  const slut = ord.some(o => SLUT_ORD.has(o));
  if (grot) return gallring ? null : 'Grot';        // "Bastaremåla gallring Ris": säger inget säkert
  if (gallring && slut) return null;                // "Bjällerhult au + ga": både och
  if (gallring) return 'Gallring';
  if (slut) return 'Slutavverkning';
  return null;
}

/** Bolaget namnet säger (bara bolagsnamn som står som ett eget ord). */
export function namnBolag(namn: string | null | undefined): string | null {
  const ord = new Set(namnOrd(namn));
  const hittade = [ord.has('ATA') && 'ATA', ord.has('VIDA') && 'Vida', ord.has('SÖDRA') && 'Södra'].filter(Boolean) as string[];
  return hittade.length === 1 ? hittade[0] : null;
}

function filTyp(cutting: string | null | undefined): string | null {
  return cutting === 'ClearCutting' ? 'Slutavverkning' : null;
}

const tomt = (v: unknown) => v == null || String(v).trim() === '';
const normNamn = (n: string | null | undefined) => (n ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Andra objekt (annat VO) med exakt samma namn som har fältet ifyllt. Säger de olika är de ingen källa. */
function tvillingSignal(falt: HarlettFalt, rad: HarledRad, alla: HarledRad[]): { varde: string; kalla: string } | null {
  const namn = normNamn(rad.object_name);
  if (!namn) return null;
  const tvillingar = alla.filter(o =>
    o.objekt_id !== rad.objekt_id
    && (o.vo_nummer ?? '') !== (rad.vo_nummer ?? '')
    && normNamn(o.object_name) === namn
    && !tomt(o[falt]));
  const varden = new Set(tvillingar.map(o => String(o[falt]).trim()));
  if (varden.size !== 1) return null;
  return { varde: [...varden][0], kalla: KALLA.tvilling(tvillingar[0].vo_nummer) };
}

/**
 * Härled ett TOMT fält. null = fältet är redan ifyllt, eller ingen källa säger något.
 * `alla` = alla objektrader (för samma-namn-källan); `trakt` = traktens uppgifter om den finns.
 */
export function harled(falt: HarlettFalt, rad: HarledRad, alla: HarledRad[], trakt?: TraktUppgifter): Harledning | null {
  if (!tomt(rad[falt])) return null;

  const signaler: { varde: string; kalla: string }[] = [];
  const lagg = (varde: string | null | undefined, kalla: string) => { if (!tomt(varde)) signaler.push({ varde: String(varde).trim(), kalla }); };

  lagg(trakt?.[falt], KALLA.trakt);
  if (falt === 'huvudtyp') { lagg(namnTyp(rad.object_name), KALLA.namn); lagg(filTyp(rad.cutting_method), KALLA.fil); }
  if (falt === 'avtalsform') lagg(namnAvtalsform(rad.object_name), KALLA.namn);
  if (falt === 'bolag') lagg(namnBolag(rad.object_name), KALLA.namn);
  const tv = tvillingSignal(falt, rad, alla);
  if (tv) signaler.push(tv);

  if (signaler.length === 0) return null;

  const perVarde = new Map<string, string[]>();
  for (const s of signaler) perVarde.set(s.varde, [...(perVarde.get(s.varde) ?? []), s.kalla]);
  const rangordnade = [...perVarde.entries()].sort((a, b) => b[1].length - a[1].length);
  const [basta, ...ovriga] = rangordnade;
  const oavgjort = ovriga.length > 0 && ovriga[0][1].length === basta[1].length;

  return {
    falt,
    varde: oavgjort ? null : basta[0],
    kallor: oavgjort ? [] : basta[1],
    saker: ovriga.length === 0 && basta[1].length >= 2,
    emot: (oavgjort ? rangordnade : ovriga).map(([varde, kallor]) => ({ varde, kallor })),
  };
}

/** Källorna i ord för en rad under fältet: "namnet och skördarens fil". */
export function kallorText(kallor: string[]): string {
  if (kallor.length <= 1) return kallor[0] ?? '';
  return `${kallor.slice(0, -1).join(', ')} och ${kallor[kallor.length - 1]}`;
}
