// Kontrolltyper i KOD, inte i DB (#2 i ombyggnaden). Att lägga till en ny sorts
// kontroll ska vara en rad här — ingen migration.
//
// varning_dagar hör hemma PER kontrolltyp (#6): besiktning 30, cistern-/brand-
// kontroll 60. status.ts läser typens värde med global default som fallback.

export type Resurstyp = 'bil' | 'lastbil' | 'slap' | 'maskin' | 'cistern';
export type Kontrolltypnyckel = 'besiktning' | 'service' | 'cisternkontroll' | 'brandskydd';
export type Enhet = 'manader' | 'timmar' | 'km';

export const VARNING_DAGAR_DEFAULT = 30;

export type Kontrolltyp = {
  nyckel: Kontrolltypnyckel;
  etikett: string;
  galler: Resurstyp[];                        // vilka resurstyper kontrollen gäller
  varning_dagar: number;                      // #6: dagar före förfall → status 'snart'
  enhet: (typ: Resurstyp) => Enhet;           // service skiljer sig: timmar (maskin) vs km (bil/lastbil)
  standardintervall: (typ: Resurstyp) => number | null; // i enhetens sort; null = okänt, sätts per kontroll
};

export const KONTROLLTYPER: Record<Kontrolltypnyckel, Kontrolltyp> = {
  besiktning: {
    nyckel: 'besiktning',
    etikett: 'Besiktning',
    galler: ['bil', 'lastbil', 'slap'],
    varning_dagar: 30,
    enhet: () => 'manader',
    standardintervall: () => 12,
  },
  service: {
    nyckel: 'service',
    etikett: 'Service',
    galler: ['bil', 'lastbil', 'maskin'],
    varning_dagar: 30,
    enhet: (typ) => (typ === 'maskin' ? 'timmar' : 'km'),
    standardintervall: (typ) => (typ === 'maskin' ? 500 : 20000),
  },
  cisternkontroll: {
    nyckel: 'cisternkontroll',
    etikett: 'Cisternkontroll',
    galler: ['cistern'],
    varning_dagar: 60,
    enhet: () => 'manader',
    standardintervall: () => null, // intervall varierar per cistern → sätts per kontroll
  },
  brandskydd: {
    nyckel: 'brandskydd',
    etikett: 'Brandskydd',
    galler: ['maskin', 'cistern'],
    varning_dagar: 60,
    enhet: () => 'manader',
    standardintervall: () => null,
  },
};

/** Mätarens enhet härleds ur resurstyp — ingen egen kolumn (#1). */
export function matarenhet(typ: Resurstyp): 'km' | 'timmar' | null {
  if (typ === 'maskin') return 'timmar';
  if (typ === 'bil' || typ === 'lastbil') return 'km';
  return null; // slap, cistern
}

/** Kontrolltyper som gäller en given resurstyp. */
export function kontrolltyperForResurs(typ: Resurstyp): Kontrolltyp[] {
  return Object.values(KONTROLLTYPER).filter((k) => k.galler.includes(typ));
}

/** varning_dagar för en typ, med global fallback (#6). */
export function varningDagar(typ: string): number {
  return (KONTROLLTYPER as Record<string, Kontrolltyp>)[typ]?.varning_dagar ?? VARNING_DAGAR_DEFAULT;
}
