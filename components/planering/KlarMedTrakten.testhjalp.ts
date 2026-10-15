// Delad testdata för "Klar med trakten?": byggs med de RIKTIGA funktionerna i lib/klarTrakt (berakna, harDuVarningar …), så testen
// och skärmbildsriggen visar exakt det sidan skulle visa — inte en handgjord kopia av räkningen.

import { berakna, harDuVarningar, prognosUnderlag, VED_TOM, vedSammanfattning, type HarDuSvar, type KlarIndata, type PrognosIndata, type UtforareVal, type VedDetaljer } from '@/lib/klarTrakt';
import type { KlarMedTraktenProps } from './KlarMedTrakten';

export const EGEN = (id: string): UtforareVal => ({ maskinId: id, utforare: null, externNamn: '' });
export const EXTERN = (namn: string): UtforareVal => ({ maskinId: null, utforare: 'extern', externNamn: namn });
export const INGEN: UtforareVal = { maskinId: null, utforare: null, externNamn: '' };

export interface KlarFixtur {
  namn?: string;
  objektStatus?: string;
  avlaggAntal?: number;
  basvagTexter?: string[];
  /** Vida har en basväg i underlaget (traktgeometrin) */
  basvagForvantad?: boolean;
  barighet?: string | null; terrang?: string | null; skotningsavstand?: string | null;
  skordare?: UtforareVal; skotare?: UtforareVal;
  volym?: number | null; medelstam?: number | null; areal?: number | null;
  skordareTimmar?: number | null; skotareTimmar?: number | null;
  godkand?: boolean;
  harDu?: HarDuSvar;
  restriktioner?: Array<{ type?: string; name?: string }>;
  markeringar?: Array<{ slag: string; typ: string }>;
  ved?: VedDetaljer; markagareVed?: boolean;
  gamlaAnteckningar?: string;
  datalage?: 'ok' | 'migrering-saknas' | 'lasfel';
  bandSkotare?: boolean | null;
  visaKonfiguration?: boolean;
}

/** Skälviken-liknande: ny trakt, bara det Vida levererade (volym, areal, medelstam ur TD). */
export function klarProps(f: KlarFixtur = {}, extra: Partial<KlarMedTraktenProps> = {}): KlarMedTraktenProps {
  const skordare = f.skordare ?? INGEN;
  const skotare = f.skotare ?? INGEN;
  const prognos: PrognosIndata = {
    skordareTimmar: f.skordareTimmar ?? null, skotareTimmar: f.skotareTimmar ?? null, volym: f.volym === undefined ? 1800 : f.volym, medelstam: f.medelstam === undefined ? 0.72 : f.medelstam, areal: f.areal === undefined ? 3.6 : f.areal,
    bandSkordare: null, bandSkotare: f.bandSkotare ?? null, breddat: false, skotningsavstand: f.skotningsavstand ?? null, barighet: f.barighet ?? null, terrang: f.terrang ?? null,
    basvagKravs: false, basvagTimmar: null, skordare, skotare,
  };
  const ind: KlarIndata = {
    avlaggAntal: f.avlaggAntal ?? 0, basvagTexter: f.basvagTexter ?? [], basvagForvantad: f.basvagForvantad ?? false, basvagKravs: false, barighet: f.barighet ?? null, terrang: f.terrang ?? null, skotningsavstand: f.skotningsavstand ?? null,
    skordare, skotare, prognos, prognosGodkandUnderlag: f.godkand ? prognosUnderlag(prognos) : null, harDu: f.harDu ?? {},
  };
  const ved = f.ved ?? { ...VED_TOM };
  return {
    namn: f.namn ?? 'Skälviken',
    status: berakna(ind),
    objektStatus: f.objektStatus ?? 'oplanerad',
    klarSkickadAt: null,
    basvag: { texter: ind.basvagTexter, kravs: false, timmar: '' },
    barighet: ind.barighet, terrang: ind.terrang, skotningsavstand: ind.skotningsavstand,
    skordare, skotare,
    maskiner: { skordare: [{ id: 'R64101', namn: 'Rottne H8E' }, { id: 'PONS20SDJAA270231', namn: 'Ponsse Scorpion Giant 8W' }], skotare: [{ id: 'A110148', namn: 'Ponsse Elephant King AF' }, { id: 'A030353', namn: 'Ponsse Wisent 2015' }] },
    prognos: {
      skordareTimmar: prognos.skordareTimmar != null ? String(prognos.skordareTimmar) : '', skotareTimmar: prognos.skotareTimmar != null ? String(prognos.skotareTimmar) : '',
      volym: prognos.volym != null ? String(prognos.volym) : '', areal: prognos.areal != null ? String(prognos.areal).replace('.', ',') : '', medelstam: prognos.medelstam != null ? String(prognos.medelstam).replace('.', ',') : '',
      forslag: { skordare: 41, skotare: 36, forklaring: 'Medel av 4 liknande trakter, justerat för medelstam.' },
      forutsattningar: [], godkandAv: f.godkand ? 'm1' : null, godkandAt: f.godkand ? '2026-10-15T09:00:00.000Z' : null,
    },
    harDu: ind.harDu,
    varningar: harDuVarningar({ markeringar: f.markeringar ?? [], restriktioner: f.restriktioner ?? [], hansynsytor: 0 }),
    avNamn: (id) => (id === 'm1' ? 'Martin' : null),
    ovrigt: {
      ved: f.markagareVed ?? false, vedText: vedSammanfattning(ved),
      bandSkordare: null, bandParSkordare: null, bandSkotare: f.bandSkotare ?? null, bandParSkotare: null,
      breddat: false, konfiguration: 'bred', visaKonfiguration: f.visaKonfiguration ?? false, risDirekt: false, extraVagn: false,
      trailerIn: true, trailerKommentar: '', manuellFallning: false, manuellFallningText: '',
    },
    ved,
    gamlaAnteckningar: f.gamlaAnteckningar ?? '',
    datalage: f.datalage ?? 'ok', sparFel: null, klarSparar: false,
    onAndra: () => {}, onHarDu: () => {}, onPlaceraAvlagg: () => {}, onRitaBasvag: () => {}, onStammer: () => {}, onAnvandForslag: () => {},
    onVed: () => {}, onSattVedPaKartan: () => {}, onKlarForMaskin: () => {}, onFortsatter: () => {}, onStang: () => {},
    ...extra,
  };
}
