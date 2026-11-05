// MIN PLAN — förarens sida i Översikten (Martin 2026-11-05: "ett ärligt A4: du ska från detta objekt till detta, och statusen på det
// … där ska vara med allt som han måste veta för nästa trakt så han är förberedd").
//
// Ren logik: vad som står på sidan, i ord. Komponenten (MinPlan.tsx) ritar bara. Allt läses ur det Översikten redan har — kön
// (maskin_ko via nasta-v2), objekt-raden (planeringen) och faror/hänsyn (markeringarna) — så planen och kartan kan aldrig säga olika.
// En uppgift som inte är ifylld står inte alls: aldrig en tom rad, aldrig "–" i en lista föraren ska läsa i hytten.

import { barighetText, telHref, type Varning } from './objekt-info';
import type { VarningsSvar } from './markeringar-las';

export type Roll = 'skordare' | 'skotare';

/** Fälten planen läser ur objekt-raden (select('*') — alla är valfria, de flesta trakter har bara några ifyllda). */
export interface PlanObjekt {
  id: string; namn: string; status: string; typ?: string | null; atgard?: string | null;
  areal?: number | null; volym?: number | null; volym_planerad?: number | null;
  barighet?: string | null; terrang?: string | null; skotningsavstand?: string | null;
  transport_trailer_in?: boolean | null;
  skordare_band?: boolean | null; skordare_band_par?: string | number | null;
  skotare_band?: boolean | null; skotare_band_par?: string | number | null; skotare_lastreder_breddat?: boolean | null;
  skordare_manuell_fallning?: boolean | null; skordare_manuell_fallning_text?: string | null;
  markagare?: string | null; markagare_tel?: string | null; markagare_ska_ha_ved?: boolean | null; markagare_ved_text?: string | null;
  anteckningar?: string | null; sortiment?: string[] | string | null; cert?: string | null;
  riskbedomning?: unknown;
  larmkoordinat_beskrivning?: string | null;
  traktdirektiv_url?: string | null; traktkarta_url?: string | null; stamplingslangd_url?: string | null;
}

/** Läget i ett ord — det föraren behöver veta om trakten innan han läser något annat. */
export function statusOrd(o: Pick<PlanObjekt, 'status'>): { text: string; klar: boolean } {
  const s = (o.status || '').toLowerCase();
  if (s === 'pagaende') return { text: 'Pågår', klar: true };
  if (s === 'planerad') return { text: 'Klar att köra', klar: true };
  if (s === 'avslutat') return { text: 'Avslutad', klar: true };
  return { text: 'Planeras fortfarande', klar: false }; // oplanerad: planeraren har inte tryckt "Klar för maskin"
}

const fmtTal = (n: number) => Math.round(n).toLocaleString('sv-SE');

/** "Slutavverkning · 8,2 ha · 610 m³". */
export function faktaRad(o: PlanObjekt): string {
  const atgard = o.atgard || (o.typ === 'gallring' ? 'Gallring' : o.typ === 'grot' ? 'GROT' : o.typ === 'energiklippning' ? 'Energiklippning' : 'Slutavverkning');
  const vol = o.volym_planerad ?? o.volym ?? null;
  return [atgard, o.areal ? `${o.areal.toLocaleString('sv-SE')} ha` : null, vol ? `${fmtTal(vol)} m³` : null].filter(Boolean).join(' · ');
}

const TERRANG: Record<string, string> = { flackt: 'flackt', kuperat: 'kuperat', brant: 'brant' };
const AVSTAND: Record<string, string> = { kort: 'kort skotningsavstånd', medel: 'medellångt skotningsavstånd', langt: 'långt skotningsavstånd', 'långt': 'långt skotningsavstånd' };

export interface ForberedRad { text: string; varning: boolean }
export interface Forbered {
  /** Faror — står först, röda: riskbedömningens risker med sin åtgärd, sedan kartans faror. En risk som också är en fara på kartan
   *  (Kraftledning) står EN gång, med åtgärden och kartans kommentar. */
  faror: Varning[];
  /** false = planeraren har inte gjort riskbedömningen — sidan säger det (en tom lista är aldrig "inga risker"). */
  riskbedomd: boolean;
  /** Kunde farorna inte läsas säger sidan det — en tom lista får aldrig betyda "inga faror". */
  farorOlasta: boolean;
  /** Det planeraren skrivit, ordagrant. */
  planeraren: string | null;
  /** Allt annat, i ordning: marken, trailern, band, fällning, ved, hänsyn, infart, certifiering. */
  rader: ForberedRad[];
  dokument: { namn: string; url: string }[];
  markagare: { namn: string | null; telHref: string | null } | null;
}

/** "Förbered dig" — allt föraren måste veta om trakten innan han kommer dit, för SIN roll. Bara det som är ifyllt. */
export function forbered(o: PlanObjekt, roll: Roll, warn: VarningsSvar): Forbered {
  const rader: ForberedRad[] = [];

  // Marken: bärighet · terräng · skotningsavstånd (skotningsavståndet bara för skotaren — det är hans körning).
  const bar = barighetText(o.barighet);
  const mark = [bar ? `Bärighet ${bar.text.toLowerCase()}` : null, o.terrang ? TERRANG[o.terrang.toLowerCase()] ?? o.terrang : null,
    roll === 'skotare' && o.skotningsavstand ? AVSTAND[o.skotningsavstand.toLowerCase()] ?? o.skotningsavstand : null].filter(Boolean);
  if (mark.length) rader.push({ text: (mark.join(' · ')).replace(/^./, (c) => c.toUpperCase()), varning: !!bar?.begransning });

  if (o.transport_trailer_in === false) rader.push({ text: 'Trailern kan inte köra in', varning: true });
  else if (o.transport_trailer_in === true) rader.push({ text: 'Trailern kan köra in', varning: false });

  const band = roll === 'skordare' ? (o.skordare_band ? o.skordare_band_par : null) : (o.skotare_band ? o.skotare_band_par : null);
  if (roll === 'skordare' ? o.skordare_band : o.skotare_band) rader.push({ text: band ? `Band behövs · ${band} par` : 'Band behövs', varning: true });
  if (roll === 'skotare' && o.skotare_lastreder_breddat) rader.push({ text: 'Breddat lastrede', varning: false });
  if (roll === 'skordare' && o.skordare_manuell_fallning) rader.push({ text: `Manuell fällning${o.skordare_manuell_fallning_text?.trim() ? `: ${o.skordare_manuell_fallning_text.trim()}` : ''}`, varning: true });
  if (o.markagare_ska_ha_ved) rader.push({ text: `Markägaren ska ha ved${o.markagare_ved_text?.trim() ? `: ${o.markagare_ved_text.trim()}` : ''}`, varning: false });

  const ok = warn !== 'laddar' && warn !== 'fel';
  if (ok) for (const h of warn.hansyn) rader.push({ text: `Hänsyn: ${h.label}${h.kommentar ? ` — ${h.kommentar}` : ''}`, varning: false });

  if (o.larmkoordinat_beskrivning?.trim()) rader.push({ text: `Infart: ${o.larmkoordinat_beskrivning.trim()}`, varning: false });

  // Sortimentet visas inte (Martin 2026-11-05: "det stämmer aldrig") — det som står i objekt-raden är inte det maskinen kapar.
  const cert = (o.cert ?? '').trim();
  if (cert && cert.toLowerCase() !== 'none') rader.push({ text: `Certifierad: ${cert.split(/\s+/).join(', ')}`, varning: false });

  const dokument = [
    o.traktdirektiv_url ? { namn: 'Traktdirektiv', url: o.traktdirektiv_url } : null,
    o.traktkarta_url ? { namn: 'Traktkarta', url: o.traktkarta_url } : null,
    o.stamplingslangd_url ? { namn: 'Stämplingslängd', url: o.stamplingslangd_url } : null,
  ].filter((d): d is { namn: string; url: string } => !!d);

  const tel = telHref(o.markagare_tel);
  const markagare = o.markagare?.trim() || tel ? { namn: o.markagare?.trim() || null, telHref: tel } : null;

  const risker = godkandaRisker(o.riskbedomning);
  const kartFaror = ok ? warn.faror : [];
  const lika = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const faror: Varning[] = [
    ...(risker ?? []).map((r) => {
      const kom = kartFaror.find((f) => lika(f.label, r.risk))?.kommentar?.trim();
      const text = [r.atgard, kom && kom !== r.atgard ? kom : null].filter(Boolean).join('\n');
      return { label: r.risk, kommentar: text || null };
    }),
    ...kartFaror.filter((f) => !(risker ?? []).some((r) => lika(f.label, r.risk))),
  ];

  return { faror, riskbedomd: risker != null, farorOlasta: warn === 'fel', planeraren: o.anteckningar?.trim() || null, rader, dokument, markagare };
}

/** "44 km från Bondeskog" — sträckan är maskinens körning från förra trakten, inte från telefonen. Okänd → ingen text. */
export function strackaText(km: number | null | undefined, fran: string | null): string | null {
  if (km == null) return null;
  return fran ? `${Math.round(km)} km från ${fran}` : `${Math.round(km)} km`;
}

export interface PlanRisk { risk: string; atgard: string }
/**
 * Riskerna planeraren GODKÄNT (objekt.riskbedomning.godkand.underlag = exakt listan han tryckte Stämmer på, lib/riskbedomning riskUnderlag).
 * null = ingen bedömning gjord — då säger sidan det, en tom lista får aldrig se ut som "inga risker". [] = godkänt "Inga särskilda risker".
 */
export function godkandaRisker(raw: unknown): PlanRisk[] | null {
  const g = raw && typeof raw === 'object' ? (raw as { godkand?: { underlag?: unknown } | null }).godkand : null;
  const u = g && typeof g.underlag === 'string' ? g.underlag : null;
  if (u == null) return null;
  if (u === 'inga' || !u.trim()) return [];
  return u.split('§').flatMap((del) => {
    const lik = del.indexOf('='); const rest = lik >= 0 ? del.slice(lik + 1) : del;
    const st = rest.indexOf('|');
    const risk = (st >= 0 ? rest.slice(0, st) : rest).trim(); const atgard = st >= 0 ? rest.slice(st + 1).trim() : '';
    return risk ? [{ risk, atgard }] : [];
  });
}
