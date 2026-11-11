// PRODUKTION — sidan som öppnas när föraren trycker på objektets namn i maskinläget (Martin 2026-11-11: "så enkelt så ett barn förstår").
// Som Apple/SpaceX: EN ring med svaret (hur långt, när klart), bara det som AVVIKER i orange, allt annat bakom "Detaljer".
// Den här filen skriver all text; komponenten (components/planering/Produktion) ritar bara.

import type { Framsteg, OmradeRad, Raknare } from './omradeFramsteg';
import type { Kvar, KvarSammanfattning } from './skotarLass/kvar';
import { datumText } from './skotarLass/kvar';

const ha = (v: number) => v.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface Avvikelse { id: string; titel: string; under: string }
export interface DetaljRad { id: string; titel: string; under: string; hoger: string; dampad: boolean }

export interface ProduktionVy {
  /** I ringen: "1,9 ha" / "~312 m³". */
  tal: string;
  /** Under talet i ringen: "av 37,7 ha" / "kvar att skota". */
  talUnder: string;
  /** Ringens fyllning 0..1 (hur långt det kommit). */
  andel: number;
  /** "Klar ca 1 jan" / "5,8 ha kvar" / "Klart" / "Inget skördarspår än". */
  svar: string;
  /** "ca 0,9 ha per dag" — null utan underlag. */
  tempo: string | null;
  /** Bara det som avviker (orange). Tomt = inget att titta på. */
  avvikelser: Avvikelse[];
  /** När inget avviker OCH något faktiskt kontrollerats: "Högstubbar och evighetsträd i fas". null = säg ingenting. */
  iFas: string | null;
}

/** "Evighetsträd efter i område 8 · 0 satta – borde vara 19 för det du gallrat". */
function efter(namn: string, omrade: string, r: Raknare): string | null {
  if (r.nu <= 0 || r.borde == null) return null;
  return `${namn} efter i ${omrade.toLowerCase()}`;
}

export function skordareVy(f: Framsteg, o: { typ: string; idag: string }): ProduktionVy {
  const gallring = o.typ.trim().toLowerCase() === 'gallring';
  const avv: Avvikelse[] = [];
  for (const r of f.omraden) {
    for (const [namn, rk] of [['Högstubbar', r.hogstubbar], ['Evighetsträd', r.evighetstrad]] as const) {
      const t = efter(namn, r.namn, rk);
      if (t) avv.push({ id: `${r.id}:${namn}`, titel: t, under: `${rk.antal} satta – borde vara ${rk.borde} för det du ${gallring ? 'gallrat' : 'avverkat'}` });
    }
  }
  const kontrollerat = f.harSpar && f.omraden.some((r) => r.hogstubbar.krav != null);
  return {
    tal: `${ha(f.gallratHa)} ha`,
    talUnder: `av ${ha(f.arealHa)} ha`,
    andel: f.andel,
    svar: !f.harSpar ? 'Inget skördarspår än' : f.klart ? 'Klart' : f.klarDatum ? `Klar ca ${datumText(f.klarDatum, o.idag)}` : `${ha(f.kvarHa)} ha kvar`,
    tempo: f.tempoHaPerDag && !f.klart ? `ca ${ha(f.tempoHaPerDag)} ha per dag` : null,
    avvikelser: avv,
    iFas: avv.length === 0 && kontrollerat ? 'Högstubbar och evighetsträd i fas' : null,
  };
}

/** Raderna i Detaljer › Områden: det du kör i nu först, sedan påbörjade, inte börjat, klara sist (dämpade). */
export function omradeRader(f: Framsteg, harNuId: string | null): DetaljRad[] {
  const lage = (r: OmradeRad) => (r.id === harNuId ? 0 : r.klart ? 3 : r.gallratHa >= 0.05 ? 1 : 2);
  return [...f.omraden]
    .sort((a, b) => lage(a) - lage(b) || a.namn.localeCompare(b.namn, 'sv', { numeric: true }))
    .map((r) => ({
      id: r.id,
      titel: r.namn,
      under: r.id === harNuId ? 'Här nu' : r.klart ? 'Klart' : r.gallratHa >= 0.05 ? 'Pågår' : 'Inte börjat',
      hoger: r.klart ? '✓' : r.gallratHa >= 0.05 ? `${ha(r.gallratHa)} av ${ha(r.arealHa)} ha` : `${ha(r.arealHa)} ha`,
      dampad: r.klart,
    }));
}

/** "Högstubbar 6 ✓" / "Evighetsträd 0 · 2 nu" — en rad i Detaljer › Här nu. */
export function raknareText(r: Raknare): { varde: string; efter: boolean } {
  if (r.nu > 0) return { varde: `${r.antal} · ${r.nu} nu`, efter: true };
  if (r.borde != null && r.borde > 0 && r.antal >= r.borde) return { varde: `${r.antal} ✓`, efter: false };
  return { varde: `${r.antal}`, efter: false };
}

export function skotareVy(kvar: Kvar, s: KvarSammanfattning): ProduktionVy {
  return {
    tal: `~${s.kvarM3} m³`,
    talUnder: 'kvar att skota',
    andel: kvar.skordat > 0 ? Math.max(0, Math.min(1, kvar.skotat / kvar.skordat)) : 0,
    svar: s.kvarM3 <= 0 ? 'Klart' : s.klarText ? s.klarText.replace(/^Klar ~/, 'Klar ca ') : `~${s.kvarM3} m³ kvar`,
    tempo: null,
    avvikelser: [],
    iFas: null,
  };
}
