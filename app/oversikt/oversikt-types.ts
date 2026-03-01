export interface Maskin {
  id: string;
  namn: string;
  typ: 'skördare' | 'skotare';
  modell?: string;
  created_at?: string;
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
  typ: 'slutavverkning' | 'gallring';
  status: string;
  volym: number;
  areal: number;
  lat: number | null;
  lng: number | null;
  ar: number | null;
  manad: number | null;
  bolag: string | null;
  markagare: string | null;
  grot_status: string;
  grot_volym: number | null;
  grot_anteckning: string | null;
}

export type TabId = 'karta' | 'objekt' | 'maskiner' | 'grot';
