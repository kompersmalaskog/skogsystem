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
  // GROT
  grot_status: string;
  grot_volym: number | null;
  grot_anteckning: string | null;
  grot_deadline: string | null;
}

export type TabId = 'karta' | 'objekt' | 'maskiner' | 'grot';

/* Design tokens matching mockup exactly */
export const C = {
  bg: '#09090b',
  card: '#111113',
  border: 'rgba(255,255,255,0.05)',
  t1: '#fafafa',
  t2: 'rgba(255,255,255,0.55)',
  t3: 'rgba(255,255,255,0.25)',
  t4: 'rgba(255,255,255,0.1)',
  yellow: '#eab308',
  green: '#22c55e',
  orange: '#f97316',
  blue: '#3b82f6',
  red: '#ef4444',
  yd: 'rgba(234,179,8,0.1)',
  gd: 'rgba(34,197,94,0.1)',
  bd: 'rgba(59,130,246,0.1)',
  od: 'rgba(249,115,22,0.1)',
  rd: 'rgba(239,68,68,0.1)',
};

export const ST: Record<string, { l: string; c: string; bg: string }> = {
  importerad: { l: 'Importerad', c: '#71717a', bg: 'rgba(113,113,122,0.08)' },
  planerad: { l: 'Planerad', c: '#71717a', bg: 'rgba(113,113,122,0.08)' },
  pagaende: { l: 'Pågående', c: C.yellow, bg: C.yd },
  skordning: { l: 'Skördning', c: C.yellow, bg: C.yd },
  skotning: { l: 'Skotning', c: C.orange, bg: 'rgba(249,115,22,0.08)' },
  klar: { l: 'Klar', c: C.green, bg: C.gd },
};

export const TF: Record<string, string> = {
  slutavverkning: C.yellow,
  gallring: C.green,
  slut: C.yellow,
};
