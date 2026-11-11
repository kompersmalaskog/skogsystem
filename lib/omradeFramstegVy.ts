// Texterna till "hur långt har du kommit" i ⓘ-kortet (lib/omradeFramsteg räknar, den här skriver; komponenten ritar bara).

import type { Framsteg, Raknare } from './omradeFramsteg';
import { datumText } from './skotarLass/kvar';

const ha = (v: number) => v.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface RaknarText { text: string; uppfyllt: boolean }
export interface OmradeRadText { id: string; namn: string; hoger: string; klart: boolean; miljo: RaknarText[] }
export interface FramstegVy {
  /** "Gallring · 14,2 av 20,0 ha klart" — raden under namnet, samma total som områdena. */
  under: string;
  andel: number;
  /** "Klar ca onsdag" / "Klart" / "5,8 ha kvar" / "Inget skördarspår än". */
  rubrik: string;
  /** "Du gallrar ca 2,4 ha per dag (senaste dagarna)" — null utan tempo. */
  tempo: string | null;
  /** Rader per område — tom när trakten bara har ett område (då är det hela trakten). */
  omraden: OmradeRadText[];
  /** Hela trakten: högstubbar och evighetsträd (samma tal som pillen). */
  helaTrakten: RaknarText[];
}

function raknare(namn: string, r: Raknare): RaknarText | null {
  if (r.krav == null) return r.antal > 0 ? { text: `${namn} ${r.antal}`, uppfyllt: false } : null;
  const uppfyllt = r.antal >= r.krav;
  return { text: `${namn} ${r.antal} av ${r.krav}${uppfyllt ? ' ✓' : ''}`, uppfyllt };
}

export function framstegVy(f: Framsteg, o: { typ: string; idag: string; hela: { hogstubbar: Raknare; evighetstrad: Raknare } }): FramstegVy {
  const gallring = o.typ.trim().toLowerCase() === 'gallring';
  const verb = gallring ? 'gallrar' : 'avverkar';
  const typOrd = gallring ? 'Gallring' : o.typ.trim();
  const under = [typOrd, f.harSpar ? `${ha(f.gallratHa)} av ${ha(f.arealHa)} ha klart` : `${ha(f.arealHa)} ha`].filter(Boolean).join(' · ');
  const rubrik = !f.harSpar ? 'Inget skördarspår än'
    : f.klart ? 'Klart'
    : f.klarDatum ? `Klar ca ${datumText(f.klarDatum, o.idag)}`
    : `${ha(f.kvarHa)} ha kvar`;
  const tempo = f.tempoHaPerDag && !f.klart ? `Du ${verb} ca ${ha(f.tempoHaPerDag)} ha per dag (senaste dagarna)` : null;
  const miljo = (h: Raknare, e: Raknare) => [raknare('Högstubbar', h), raknare('Evighetsträd', e)].filter((x): x is RaknarText => !!x);
  return {
    under, andel: f.andel, rubrik, tempo,
    omraden: f.omraden.length > 1 ? f.omraden.map((r) => ({
      id: r.id, namn: r.namn, klart: r.klart,
      hoger: r.klart ? 'Klart ✓' : `${ha(r.gallratHa)} av ${ha(r.arealHa)} ha`,
      miljo: miljo(r.hogstubbar, r.evighetstrad),
    })) : [],
    helaTrakten: miljo(o.hela.hogstubbar, o.hela.evighetstrad),
  };
}
