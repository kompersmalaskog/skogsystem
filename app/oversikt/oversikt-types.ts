import React from 'react';

export interface Maskin {
  maskin_id: string;
  tillverkare: string;
  modell: string;
  modell_ar?: string;
  aggregat_tillverkare?: string;
  aggregat?: string;
  aggregat_ar?: string;
  namn?: string;
  typ?: string;
  marke?: string;
  aktiv?: boolean;
}

export interface MaskinKoItem {
  id: string;
  maskin_id: string;
  objekt_id: string;
  ordning: number;
}

export interface OversiktObjekt {
  id: string;
  namn: string;
  vo_nummer?: string;
  typ: 'slutavverkning' | 'gallring';
  atgard?: string;
  status: string;
  volym: number;
  areal: number;
  lat: number | null;
  lng: number | null;
  ar: number | null;
  manad: number | null;
  bolag: string | null;
  markagare: string | null;
  // Planning fields
  barighet?: string;
  terrang?: string;
  skordare_maskin?: string;
  skordare_band?: boolean;
  skordare_band_par?: string;
  skordare_manuell_fallning?: boolean;
  skordare_manuell_fallning_text?: string;
  skotare_maskin?: string;
  skotare_band?: boolean;
  skotare_band_par?: string;
  skotare_lastreder_breddat?: boolean;
  skotare_ris_direkt?: boolean;
  transport_trailer_in?: boolean;
  transport_kommentar?: string;
  markagare_ska_ha_ved?: boolean;
  markagare_ved_text?: string;
  info_anteckningar?: string;
  kontakt_namn?: string;
  kontakt_telefon?: string;
  trailer_behovs?: boolean;
  ovrigt_info?: string;
  // Dates
  faktisk_slut: string | null;
  // GROT
  grot_status: string;
  grot_volym: number | null;
  grot_anteckning: string | null;
  grot_deadline: string | null;
  // Beräknad data
  trakt_data?: {
    volym?: number;
    areal?: number;
    beraknad?: {
      tradslag?: { namn: string; volymHa: number; totalVolym: number; andel: number }[];
      jordart?: string;
      jordartFordelning?: { namn: string; andel: number }[];
      medelLutning?: number;
      medeldiameter?: number;
      medelhojd?: number;
      restriktioner?: { type: string; name: string; details?: string; warning?: string }[];
      beraknadAt?: number;
    };
  };
}

export type TabId = 'karta' | 'maskiner' | 'grot';

/* Design tokens — matched to UppfoljningVy design language */
export const C = {
  bg: '#070708',
  surface: '#0f0f10',
  surface3: '#1a1a1c',
  card: '#0f0f10',
  cardGrad: 'linear-gradient(160deg, #1a1a1c 0%, #0f0f10 100%)',
  border: 'rgba(255,255,255,0.07)',
  borderTop: 'rgba(255,255,255,0.18)',
  borderStrong: 'rgba(255,255,255,0.13)',
  shadowSm: '0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.6)',
  shadowMd: '0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.7)',
  t1: '#f5f5f7',
  t2: '#a1a1a6',
  t3: '#6e6e73',
  t4: 'rgba(255,255,255,0.2)',
  yellow: '#FFD60A',
  green: '#30D158',
  orange: '#FF9F0A',
  blue: '#0A84FF',
  red: '#FF453A',
  yd: 'rgba(255,214,10,0.12)',
  gd: 'rgba(48,209,88,0.12)',
  bd: 'rgba(10,132,255,0.12)',
  od: 'rgba(255,159,10,0.12)',
  rd: 'rgba(255,69,58,0.12)',
};

export const ST: Record<string, { l: string; c: string; bg: string }> = {
  importerad: { l: 'Importerad', c: C.blue, bg: C.bd },
  planerad: { l: 'Planerad', c: C.t3, bg: 'rgba(113,113,122,0.1)' },
  pagaende: { l: 'Pågående', c: C.green, bg: C.gd },
  skordning: { l: 'Skördning', c: C.yellow, bg: C.yd },
  skotning: { l: 'Skotning', c: C.orange, bg: C.od },
  klar: { l: 'Klar', c: C.t3, bg: 'rgba(113,113,122,0.1)' },
};

export const TF: Record<string, string> = {
  slutavverkning: C.yellow,
  gallring: C.green,
  slut: C.yellow,
};

/* ── Typography system ── */
export const T = {
  h1: { fontSize: 22, fontWeight: 700, color: C.t1, letterSpacing: '-0.02em', lineHeight: 1.2 } as React.CSSProperties,
  h2: { fontSize: 18, fontWeight: 600, color: C.t1, letterSpacing: '-0.01em', lineHeight: 1.3 } as React.CSSProperties,
  body: { fontSize: 15, fontWeight: 500, color: C.t1 } as React.CSSProperties,
  caption: { fontSize: 12, fontWeight: 400, color: C.t3 } as React.CSSProperties,
  label: { fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties,
};

/* ── Button styles ── */
export const BTN = {
  primary: {
    minHeight: 44, padding: '0 20px', borderRadius: 12,
    background: 'rgba(255,255,255,0.1)', border: `1px solid ${C.borderStrong}`,
    color: C.t1, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  } as React.CSSProperties,
  secondary: {
    minHeight: 44, padding: '0 20px', borderRadius: 12,
    background: 'transparent', border: `1px solid ${C.border}`,
    color: C.t2, fontSize: 14, fontWeight: 500,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  } as React.CSSProperties,
};

/* ── Spacing scale ── */
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
