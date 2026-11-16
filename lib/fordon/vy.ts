// Fordon (/kontroller) — all text, alla tal och all gruppering i en ren vymodell. Sidorna ritar bara.
//
// Frågan vyn svarar på: "Behöver något fordon något just nu?" Bara datum: besiktning, försäkring,
// brandskydd och cisternkontroll (lib/kontrolltyper FORDON_KONTROLLER). Service visas inte här.
//
// Status visas alltid som ORD (Försenad, Snart, Datum saknas) — pricken förstärker bara.

import { berakna, laggTillManader, type Kontrollrad } from '@/lib/status';
import { KONTROLLTYPER, arFordonKontroll, type Kontrolltypnyckel } from '@/lib/kontrolltyper';
import {
  GRUPPER, fmtDatumKort, fmtDatumLang, fmtRelativDagar, fordonNamn, fordonUnder, type Resurs,
} from '@/lib/kontroller-format';

export type Ton = 'rod' | 'orange' | 'dampad';
export type Lage = 'forsenad' | 'snart' | 'ok' | 'saknar';

export type Punkt = {
  kontrollId: string;
  resursId: string;
  typ: Kontrolltypnyckel;
  /** "Besiktning", "Försäkring" … */
  kontroll: string;
  fordon: string;
  fordonUnder: string;
  lage: Lage;
  /** Dagar kvar (negativt = sen). Null när datum saknas. */
  dagar: number | null;
  forfall: string | null;
};

/** Ordet och tonen för ett läge. Ok har inget ord — där står datumet. */
export function statusFor(lage: Lage): { ord: string; ton: Ton } | null {
  if (lage === 'forsenad') return { ord: 'Försenad', ton: 'rod' };
  if (lage === 'snart') return { ord: 'Snart', ton: 'orange' };
  if (lage === 'saknar') return { ord: 'Datum saknas', ton: 'dampad' };
  return null;
}

export function kontrollNamn(typ: string): string {
  return (KONTROLLTYPER as Record<string, { etikett: string }>)[typ]?.etikett ?? typ;
}

/** Fordonets kontroller som hör till fordonsvyn (aktiva, inte service). */
export function fordonsKontroller(r: Resurs): any[] {
  return (r.kontroll || []).filter((k: any) => k.aktiv !== false && arFordonKontroll(k.typ));
}

export function punktFor(r: Resurs, k: any): Punkt {
  const b = berakna(k as Kontrollrad, r.typ, r.matarstallning);
  const bas = {
    kontrollId: k.id, resursId: r.id, typ: k.typ as Kontrolltypnyckel, kontroll: kontrollNamn(k.typ),
    fordon: fordonNamn(r), fordonUnder: fordonUnder(r),
  };
  if (b.slag !== 'datum') return { ...bas, lage: 'saknar', dagar: null, forfall: null };
  const lage: Lage = b.status === 'utgangen' ? 'forsenad' : b.status === 'snart' ? 'snart' : 'ok';
  return { ...bas, lage, dagar: b.dagar, forfall: b.forfall };
}

/** "12 dagar sen", "om 24 dagar", "Datum saknas". */
export function tidText(p: Punkt): string {
  if (p.dagar == null) return 'Datum saknas';
  return fmtRelativDagar(p.dagar);
}

const LAGE_ORDNING: Record<Lage, number> = { forsenad: 0, snart: 1, saknar: 2, ok: 3 };

function sortera(punkter: Punkt[]): Punkt[] {
  return [...punkter].sort((a, b) =>
    LAGE_ORDNING[a.lage] - LAGE_ORDNING[b.lage]
    || (a.dagar ?? 1e9) - (b.dagar ?? 1e9)
    || a.fordon.localeCompare(b.fordon, 'sv'));
}

/** Det sämsta läget på ett fordon — styr raden i Alla fordon och fordonets svar. */
export function sammaLage(punkter: Punkt[]): Lage | null {
  if (punkter.length === 0) return null;
  return sortera(punkter)[0].lage;
}

// ── Listan ─────────────────────────────────────────────────────────────────

export type ListSvar =
  | { slag: 'tal'; tal: number; text: string; rad: string | null }
  | { slag: 'rad'; rubrik: string; rad: string | null };

export type FordonRad = { id: string; namn: string; under: string; status: { ord: string; ton: Ton } | null };

export type ListVy = {
  svar: ListSvar;
  forsenade: Punkt[];
  snart: Punkt[];
  saknar: Punkt[];
  senare: Punkt[];
  grupper: { key: string; label: string; fordon: FordonRad[] }[];
  antalFordon: number;
};

export function byggListVy(resurser: Resurs[]): ListVy {
  const punkter: Punkt[] = [];
  const perFordon = new Map<string, Punkt[]>();
  for (const r of resurser) {
    const egna = fordonsKontroller(r).map(k => punktFor(r, k));
    perFordon.set(r.id, egna);
    punkter.push(...egna);
  }
  const ordnade = sortera(punkter);
  const forsenade = ordnade.filter(p => p.lage === 'forsenad');
  const snart = ordnade.filter(p => p.lage === 'snart');
  const saknar = ordnade.filter(p => p.lage === 'saknar');
  const senare = ordnade.filter(p => p.lage === 'ok');

  let svar: ListSvar;
  if (forsenade.length > 0) {
    svar = { slag: 'tal', tal: forsenade.length, text: 'behöver göras nu', rad: snart.length > 0 ? `${snart.length} till snart` : null };
  } else if (snart.length > 0) {
    svar = { slag: 'tal', tal: snart.length, text: 'snart dags', rad: null };
  } else if (resurser.length === 0) {
    svar = { slag: 'rad', rubrik: 'Inga fordon än', rad: null };
  } else if (senare.length > 0) {
    const n = senare[0];
    svar = { slag: 'rad', rubrik: 'Allt är i ordning', rad: `Nästa: ${n.kontroll.toLowerCase()} ${n.fordon} ${fmtDatumKort(n.forfall!)}` };
  } else {
    svar = { slag: 'rad', rubrik: 'Inga datum inlagda', rad: 'Registrera när något senast gjordes, så räknar appen ned.' };
  }

  const grupper = GRUPPER.map(g => ({
    key: g.key,
    label: g.label,
    fordon: resurser
      .filter(r => g.typer.includes(r.typ))
      .map(r => {
        const lage = sammaLage(perFordon.get(r.id) ?? []);
        return { id: r.id, namn: fordonNamn(r), under: fordonUnder(r), status: lage && lage !== 'ok' ? statusFor(lage) : null };
      })
      .sort((a, b) => a.namn.localeCompare(b.namn, 'sv')),
  })).filter(g => g.fordon.length > 0);

  return { svar, forsenade, snart, saknar, senare, grupper, antalFordon: resurser.length };
}

// ── Ett fordon ─────────────────────────────────────────────────────────────

export type FordonSvar = { rubrik: string; rad: string | null; avvikelse: boolean };

export type KontrollRad = { kontrollId: string; titel: string; under: string; status: { ord: string; ton: Ton } | null };

export function byggFordonVy(r: Resurs): { svar: FordonSvar; kontroller: KontrollRad[] } {
  const punkter = sortera(fordonsKontroller(r).map(k => punktFor(r, k)));
  const forst = punkter[0];

  let svar: FordonSvar;
  if (!forst) {
    svar = { rubrik: 'Inga kontroller', rad: null, avvikelse: false };
  } else if (forst.lage === 'forsenad') {
    svar = { rubrik: `${forst.kontroll} är försenad`, rad: `Skulle gjorts ${fmtDatumLang(forst.forfall!)}`, avvikelse: true };
  } else if (forst.lage === 'snart') {
    svar = { rubrik: `${forst.kontroll} ${fmtRelativDagar(forst.dagar!)}`, rad: fmtDatumLang(forst.forfall!), avvikelse: false };
  } else if (forst.lage === 'saknar') {
    svar = { rubrik: 'Datum saknas', rad: 'Registrera när det senast gjordes, så räknar appen ned.', avvikelse: false };
  } else {
    svar = { rubrik: 'Allt är i ordning', rad: `Nästa: ${forst.kontroll.toLowerCase()} ${fmtDatumLang(forst.forfall!)}`, avvikelse: false };
  }

  const kontroller = punkter.map(p => ({
    kontrollId: p.kontrollId,
    titel: p.kontroll,
    under: p.forfall ? `${fmtDatumLang(p.forfall)} · ${tidText(p)}` : 'Datum saknas',
    status: p.lage === 'ok' || p.lage === 'saknar' ? null : statusFor(p.lage),
  }));

  return { svar, kontroller };
}

// ── Registrera ─────────────────────────────────────────────────────────────

/** Nästa datum när kontrollen görs `gjord`: + intervallet. Null = kontrollen har inget intervall, nästa datum måste skrivas. */
export function nastaDatum(k: any, gjord: string): string | null {
  if (!gjord || k?.intervall_manader == null) return null;
  return laggTillManader(gjord, k.intervall_manader);
}

/** Händelsens namn i historiken. Gamla händelser (service, reparation) visas som de heter. */
export const HANDELSE_LABEL: Record<string, string> = {
  besiktning: 'Besiktning',
  forsakring: 'Försäkring',
  brandskydd: 'Brandskydd',
  cisternkontroll: 'Cisternkontroll',
  service: 'Service',
  reparation: 'Reparation',
  byte: 'Byte',
  ovrigt: 'Övrigt',
};
