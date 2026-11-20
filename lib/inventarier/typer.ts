// Inventarievyns datatyper — speglar tabellerna i migrationerna 20261021131728_inventarier_grund.sql och
// 20261021132841_inventarier_reservdel_maskin.sql. Inga beräknade fält lagras: allt som visas räknas i lib/inventarier/vy.ts.

export type PlatsTyp = 'hall' | 'verkstad' | 'bil' | 'skap';
export type ArtikelTyp = 'forbrukning' | 'utrustning';

export type Plats = {
  id: string;
  namn: string;
  typ: PlatsTyp;
  /** Skotaren ett depåskåp följer (dim_maskin.maskin_id). */
  maskin_id: string | null;
  /** Den som kör bilen och håller listan. */
  ansvarig_medarbetare_id: string | null;
  senast_kollad: string | null;
  senast_kollad_av: string | null;
  ordning: number;
  aktiv: boolean;
};

export type Artikel = {
  id: string;
  namn: string;
  typ: ArtikelTyp;
  enhet: string;
  leverantor: string | null;
  artikelnr: string | null;
  anteckning: string | null;
  aktiv: boolean;
  /** Reservdel till en viss maskin (hydraulslang). */
  maskin_id: string | null;
  /** Var på maskinen delen sitter ("Hjularm vänster"). */
  sitter_pa: string | null;
};

/** En artikel på en plats. `antal` null = utrustning ("finns här") eller två lådor. `id` är det som står i QR-koden (/i/<id>). */
export type InvRad = {
  id: string;
  artikel_id: string;
  plats_id: string;
  hylla: string | null;
  antal: number | null;
  min_antal: number | null;
  bestalld_tid: string | null;
  uppdaterad: string;
  /** Två lådor: räknas inte (antal och min NULL). Beställsignalen är att reservlådan påbörjas (QR på reservlådan). */
  tva_lador: boolean;
  /** Reservlådan påbörjad och inget har kommit in än. */
  reserv_oppnad_tid: string | null;
  reserv_oppnad_av: string | null;
};

export type Maskin = { maskin_id: string; visningsnamn: string | null; maskin_typ: string | null; aktiv: boolean };
export type Person = { id: string; namn: string };

export type Inventarier = {
  platser: Plats[];
  artiklar: Artikel[];
  rader: InvRad[];
  maskiner: Maskin[];
  /** Bara de namn den inloggade får läsa (RLS: förare ser sig själv, admin alla). */
  personer: Person[];
};

/** En rad med allt som behövs för att visa den — artikel, plats och maskin uppslagna. */
export type VisadRad = {
  rad: InvRad;
  artikel: Artikel;
  plats: Plats;
  maskin: Maskin | null;
};
