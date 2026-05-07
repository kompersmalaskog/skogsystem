// Algoritmen är specifik för slutavverkning. Bmav-detektion fungerar inte
// i gallring där Bmav är default-sortiment för klent virke. Bygg inte ihop dem.

export type RotTyp = 'bmav' | 'avkap' | 'grade9' | null;
export type AvkapUtfall = 'lyckad' | 'misslyckad' | 'avkap-igen' | 'övrigt';

export interface MarkagarRapport {
  objekt: {
    objekt_id: string;
    namn: string | null;
    skogsagare: string | null;
    atgard: string | null;
    forsta_datum: string | null;
    operator: string;
    maskin: string;
  };
  oversikt: {
    yta_ha: number | null;
    yta_kalla: 'objekt.areal' | 'dim_objekt.areal_ha' | null;
    stammar: number;
    volym_m3sub: number;
    virkesvarde_kr: number;
  };
  karta: {
    stammar: Array<{
      lat: number;
      lng: number;
      dbh_mm: number | null;
      rot_typ: RotTyp;
      tradslag: string;       // normaliserad: 'GRAN' | 'TALL' | 'BJÖRK' | 'ÖVR LÖV' | ''
    }>;
  };
  tradslag: Array<{
    namn: string;
    volym_m3sub: number;
    andel_pct: number;
    stammar: number;
    medeldiameter_cm: number | null;
  }>;
  rotrota: {
    stammar_med_rot: number;
    bmav_count: number;
    avkap_count: number;
    grade9_count: number;
    pct_av_gran: number;
    rotpaverkad_volym_m3: number;
    rotpaverkad_pct: number;
    vardeforlust_kr: number;
    vardeforlust_pct: number;
    rotandel_pct: number;
  };
  avkap_skicklighet: {
    totalt: number;
    lyckade: number;
    raddat_kr: number;
    raddad_volym_m3: number;        // SUM(stock2.volym) för de lyckade avkap
    utfall: { lyckad: number; misslyckad: number; avkap_igen: number; ovrigt: number };
  };
  fordelning: Array<{
    grupp: string;                  // 'Timmer' | 'Klentimmer' | 'Kubb' | 'Massa' | 'Energi' | 'Övrigt'
    volym_m3sub: number;
    volym_andel_pct: number;
    varde_kr: number;
    varde_andel_pct: number;
  }>;
  timmer_top2: Array<{
    sortiment_namn: string;
    total_volym_m3sub: number;
    dimensioner: Array<{
      dia_klass: string;
      dia_min_mm: number;
      dia_max_mm: number;
      volym_m3sub: number;
      pris_per_m3: number | null;
    }>;
  }>;
  stubbar: { behandlade: number; totalt: number };
  sortiment: Array<{
    sortiment_id: string;
    namn: string;
    tradslag: string;
    klass: string | null;
    stockar: number;
    volym_m3sub: number;
    varde_kr: number;
  }>;
  debug?: {
    massa_pris_per_maskin: Record<string, number>;
    timmer_pris_per_maskin: Record<string, number>;
  };
}

export type AggregateResult =
  | { status: 'ok'; data: MarkagarRapport }
  | { status: 'objekt_saknas' }
  | { status: 'ej_implementerad'; atgard: string | null }
  | { status: 'ingen_data'; reason: 'inga_hpr_filer' | 'ingen_detalj_stock' };
