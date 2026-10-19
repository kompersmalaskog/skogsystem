// Vilken maskin låg på bilen? Ett FÖRSLAG med säkerhet — aldrig en gissning som får bli en flytt.
//
//  Hög    Maskinens eget GPS-spår (detalj_gps_spar) följde bilen medan den var lastad. Skördarna går under transporten: Giants dator
//         loggar hela vägen (median 12–29 m från bilen i varje lass den var med på). H8E har datorn avstängd under transport, så den
//         syns i stället som "sist arbetande vid lastplatsen" OCH "först igång vid lossningsplatsen". Bara Hög skapar en flytt av sig själv.
//  Medel  Skotningshistoriken passar i BÅDA ändarna: maskinen skotade på lastplatsen dagarna före och på lossningsplatsen dagarna efter
//         (fakt_lass / hyttspar) — eller en påbörjad flytt i appen och en passande senaste position. Frågar "Vilken maskin?" med förslaget förvalt.
//  Låg    Ett enda stöd, eller det enda som återstår efter att de andra uteslutits. Samma fråga, förslaget märkt osäkert.
//  Okänd  Ingenting pekar ut någon. Frågan utan förval.
//
// Vikten används INTE för att välja maskin: viktgivaren svajar ±5 t (Giant lastas 21–34 t) och dim_maskin har ingen maskinvikt.
// Ren modul: bevisen läses av kor.ts, poängen och texterna sätts här.

export type Sakerhet = 'hog' | 'medel' | 'lag' | 'okand';

export interface MaskinInfo { maskin_id: string; namn: string; typ?: string | null }

/** Det som är läst om EN maskin för ETT lass. Allt valfritt: ett saknat bevis är bara ett bevis mindre. */
export interface MaskinBevis {
  maskin_id: string;
  /** Maskinens GPS mot bilens lastade punkter: `punkter` = lastade punkter där maskinen loggade, `traffar` = av dem inom 150 m. */
  gps?: { punkter: number; traffar: number; medianM: number | null };
  /** Meter från lossningsplatsen till maskinens första GPS-punkt efter lossningen (null = ingen punkt). */
  ankomstM?: number | null;
  /** Meter från lastplatsen till maskinens sista GPS-punkt före lastningen (null = ingen punkt). */
  avgangM?: number | null;
  /** Skotade/arbetade på lastplatsens trakt de tre dagarna före lasset (och samma dag). */
  kedjaFran?: { dag: string; trakt: string } | null;
  /** Skotade/arbetade på lossningsplatsens trakt samma dag och de tre dagarna efter. */
  kedjaTill?: { dag: string; trakt: string } | null;
  /** En påbörjad (avbruten eller öppen) flytt i appen med den här maskinen överlappar lasset. */
  paborjadFlytt?: boolean;
  /** Senast kända position (maskin_position) ligger inom 3 km från lastplatsen. */
  positionNara?: boolean;
}

export type Skal =
  | { kod: 'gps_foljer'; punkter: number; traffar: number; medianM: number | null }
  | { kod: 'gps_ankomst_avgang'; ankomstM: number; avgangM: number }
  | { kod: 'gps_ankomst'; ankomstM: number }
  | { kod: 'gps_avgang'; avgangM: number }
  | { kod: 'kedja_fran'; dag: string; trakt: string }
  | { kod: 'kedja_till'; dag: string; trakt: string }
  | { kod: 'paborjad_flytt' }
  | { kod: 'position_nara' }
  | { kod: 'foljer_inte'; medianM: number };

export interface Kandidat { maskin_id: string; poang: number; skal: Skal[]; utesluten: boolean }

export interface MaskinBedomning {
  forslag: string | null;
  sakerhet: Sakerhet;
  /** Rangordnade: bästa först, uteslutna sist. */
  kandidater: Kandidat[];
  /** Två maskiner uppfyllde Hög-kravet: ingen automatik. */
  konflikt: boolean;
}

export const GPS = {
  /** Punkt inom så här långt från bilen = "följer". */
  FOLJER_M: 150,
  /** Maskinens första punkt efter lossning / sista före lastning: så nära platsen. */
  ANKOMST_M: 300,
  AVGANG_M: 500,
  /** GPS finns men ligger så här långt bort under hela transporten = uteslutande. */
  UTESLUTEN_M: 2_000,
} as const;

/** Maskinens GPS följde bilen: minst 60 % av de lastade punkterna den loggade vid, och mediankollen. En enda punkt kräver ≤ 50 m. */
export function gpsFoljer(g: MaskinBevis['gps']): boolean {
  if (!g || g.punkter < 1 || g.medianM == null) return false;
  if (g.punkter === 1) return g.traffar === 1 && g.medianM <= 50;
  return g.traffar >= Math.max(2, Math.ceil(g.punkter * 0.6)) && g.medianM <= GPS.FOLJER_M;
}

/** GPS finns och låg långt från bilen genom hela lasset: maskinen var inte på bilen. */
export function gpsUtesluten(g: MaskinBevis['gps']): boolean {
  return !!g && g.punkter >= 2 && g.traffar === 0 && g.medianM != null && g.medianM > GPS.UTESLUTEN_M;
}

const ankAvgHog = (b: MaskinBevis): boolean =>
  b.ankomstM != null && b.ankomstM <= GPS.ANKOMST_M && b.avgangM != null && b.avgangM <= GPS.AVGANG_M;

function poangOchSkal(b: MaskinBevis): { poang: number; skal: Skal[]; hog: boolean; utesluten: boolean } {
  const skal: Skal[] = [];
  let poang = 0;
  const foljer = gpsFoljer(b.gps);
  const ankAvg = ankAvgHog(b);
  const utesluten = !foljer && !ankAvg && gpsUtesluten(b.gps);

  if (foljer && b.gps) { skal.push({ kod: 'gps_foljer', punkter: b.gps.punkter, traffar: b.gps.traffar, medianM: b.gps.medianM }); poang += 100; }
  if (ankAvg) { skal.push({ kod: 'gps_ankomst_avgang', ankomstM: b.ankomstM as number, avgangM: b.avgangM as number }); poang += 90; }
  else {
    if (b.ankomstM != null && b.ankomstM <= GPS.ANKOMST_M) { skal.push({ kod: 'gps_ankomst', ankomstM: b.ankomstM }); poang += 2; }
    if (b.avgangM != null && b.avgangM <= GPS.AVGANG_M) { skal.push({ kod: 'gps_avgang', avgangM: b.avgangM }); poang += 2; }
  }
  if (b.kedjaFran) { skal.push({ kod: 'kedja_fran', ...b.kedjaFran }); poang += 3; }
  if (b.kedjaTill) { skal.push({ kod: 'kedja_till', ...b.kedjaTill }); poang += 3; }
  if (b.paborjadFlytt) { skal.push({ kod: 'paborjad_flytt' }); poang += 3; }
  if (b.positionNara) { skal.push({ kod: 'position_nara' }); poang += 2; }
  if (utesluten && b.gps?.medianM != null) skal.push({ kod: 'foljer_inte', medianM: Math.round(b.gps.medianM) });
  return { poang, skal, hog: foljer || ankAvg, utesluten };
}

export function bedomMaskin(bevis: readonly MaskinBevis[]): MaskinBedomning {
  const rader = bevis.map(b => ({ b, ...poangOchSkal(b) }));
  const kandidater: Kandidat[] = rader
    .map(r => ({ maskin_id: r.b.maskin_id, poang: r.utesluten ? 0 : r.poang, skal: r.skal, utesluten: r.utesluten }))
    .sort((a, b) => Number(a.utesluten) - Number(b.utesluten) || b.poang - a.poang || a.maskin_id.localeCompare(b.maskin_id));

  const hoga = rader.filter(r => r.hog && !r.utesluten);
  if (hoga.length === 1) return { forslag: hoga[0].b.maskin_id, sakerhet: 'hog', kandidater, konflikt: false };
  if (hoga.length > 1) {
    // Två maskiner ser ut att ha följt bilen (t.ex. båda på bilen): ingen automatik, bästa som förslag.
    return { forslag: kandidater[0].maskin_id, sakerhet: 'lag', kandidater, konflikt: true };
  }

  const kvar = kandidater.filter(k => !k.utesluten);
  const top = kvar[0];
  const tvaa = kvar[1];
  if (!top || top.poang < 2) return { forslag: null, sakerhet: 'okand', kandidater, konflikt: false };
  const marginal = top.poang - (tvaa?.poang ?? 0);
  if (top.poang >= 5 && marginal >= 3) return { forslag: top.maskin_id, sakerhet: 'medel', kandidater, konflikt: false };
  if (marginal >= 1) return { forslag: top.maskin_id, sakerhet: 'lag', kandidater, konflikt: false };
  return { forslag: null, sakerhet: 'okand', kandidater, konflikt: false };
}

// ── Texter (svenska, för sheeten) ────────────────────────────────────────────────────────────────────

const DAGAR = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];
const MANADER = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "2026-10-12" → "12 okt". */
export function dagText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MANADER[Number(m[2]) - 1]}`;
}
export const veckodag = (iso: string): string => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : DAGAR[d.getUTCDay()];
};

/** En rad per skäl, kort: det en förare/planerare kan kontrollera mot sin egen bild. */
export function skalText(s: Skal): string {
  switch (s.kod) {
    case 'gps_foljer': return `GPS-spåret följde bilen (${s.traffar} av ${s.punkter} punkter${s.medianM != null ? `, cirka ${Math.round(s.medianM)} m` : ''})`;
    case 'gps_ankomst_avgang': return 'Arbetade vid lastplatsen och startades vid lossningsplatsen';
    case 'gps_ankomst': return 'Startades vid lossningsplatsen';
    case 'gps_avgang': return 'Arbetade vid lastplatsen före lastningen';
    case 'kedja_fran': return `Skotade ${s.trakt} ${dagText(s.dag)}`;
    case 'kedja_till': return `Skotar ${s.trakt} från ${dagText(s.dag)}`;
    case 'paborjad_flytt': return 'En påbörjad flytt i appen';
    case 'position_nara': return 'Senast kända plats ligger vid lastplatsen';
    case 'foljer_inte': return `Följde inte bilen (GPS cirka ${s.medianM < 1000 ? `${s.medianM} m` : `${Math.round(s.medianM / 100) / 10} km`} bort)`;
  }
}

/** Raden under förslaget i sheeten: de två bästa skälen. */
export function skalRad(skal: readonly Skal[], max = 2): string {
  return skal.filter(s => s.kod !== 'foljer_inte').slice(0, max).map(skalText).join(' · ');
}
