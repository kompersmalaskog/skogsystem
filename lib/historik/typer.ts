// Historikvyn (admin): typer för raderna ur vy_hist_maskin_ar och vy_hist_objekt_lista.
// Siffror kan komma som tal eller text (numeric) ur PostgREST — `tal()` gör om; saknat värde är null, aldrig 0.

export type MaskinTyp = "skördare" | "skotare";
export type AtgardKod = "gallring" | "slutavverkning" | "skada" | "special" | "okand";
/** namn = åtgärd ur namn/ämne/rapportkategori/korrigering/regler. alla = namn + obekräftad maskinstandard ("antagna"). */
export type Urval = "namn" | "alla";

export type MaskinArRad = {
  maskin: string;
  typ: MaskinTyp;
  /** null = alla åtgärder tillsammans */
  atgard: AtgardKod | null;
  /** null = hela perioden */
  ar: number | null;
  urval: Urval;
  antal_objekt: number;
  antal_med_g15: number;
  volym_m3fub: number | null;
  g15_h: number | null;
  m3_per_g15: number | null;
  stammar_per_g15: number | null;
  medelstam: number | null;
  antal_med_index: number;
  viktat_index: number | null;
  antal_rapporter_med_stopp: number;
  andel_rapporter_med_stopp: number | null;
  tu: number | null;
  reparationsgrad: number | null;
  servicegrad: number | null;
  storningsgrad: number | null;
  bransle_l_per_m3: number | null;
  lass_per_g15: number | null;
  antal_med_lass: number;
  antal_volym_osaker: number;
  tu_rapporterad: number | null;
  antal_med_tu_rapporterad: number;
  bransle_l_per_g15: number | null;
  /** G15 / Ponsses timräknare (bara åtgärd = alla, ett år). Visas bara på maskinsidan. */
  g15_per_timraknare: number | null;
  antal_volym_harledd: number;
  volym_harledd_m3: number | null;
  /** G15 på objekt som har volym; m³/G15 bygger bara på dem. */
  g15_med_volym: number | null;
};

export type ObjektRad = {
  sha256: string;
  maskin: string;
  typ: MaskinTyp;
  ar: number;
  atgard: AtgardKod;
  atgard_kalla: string | null;
  urval: "namn" | "standard";
  objekt: string | null;
  startdatum: string | null;
  slutdatum: string | null;
  rapportdatum: string | null;
  stammar: number | null;
  volym_m3fub: number | null;
  g15_h: number | null;
  medelstam: number | null;
  m3_per_g15: number | null;
  forvantad_m3_per_g15: number | null;
  index: number | null;
  /** Slutavverkning med medelstam utanför det området kurvan är anpassad på (vy_hist_objekt_index.utanfor_normalomrade). Indexet finns ändå. */
  utanfor_normalomrade: boolean;
  forare: string | null;
  forare_andel: number | null;
  forare_andel_kalla: string | null;
  avbrott_registrerade: string | null;
  volym_kvalitet: string | null;
  storage_path: string | null;
  filtyp: string | null;
  format: string | null;
  filnamn: string | null;
  mejldatum: string | null;
  antal_andra_utskrifter: number;
};

export function tal(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function tillMaskinAr(r: Record<string, unknown>): MaskinArRad {
  return {
    maskin: String(r.maskin),
    typ: r.typ as MaskinTyp,
    atgard: (r.atgard ?? null) as AtgardKod | null,
    ar: tal(r.ar),
    urval: r.urval as Urval,
    antal_objekt: tal(r.antal_objekt) ?? 0,
    antal_med_g15: tal(r.antal_med_g15) ?? 0,
    volym_m3fub: tal(r.volym_m3fub),
    g15_h: tal(r.g15_h),
    m3_per_g15: tal(r.m3_per_g15),
    stammar_per_g15: tal(r.stammar_per_g15),
    medelstam: tal(r.medelstam),
    antal_med_index: tal(r.antal_med_index) ?? 0,
    viktat_index: tal(r.viktat_index),
    antal_rapporter_med_stopp: tal(r.antal_rapporter_med_stopp) ?? 0,
    andel_rapporter_med_stopp: tal(r.andel_rapporter_med_stopp),
    tu: tal(r.tu),
    reparationsgrad: tal(r.reparationsgrad),
    servicegrad: tal(r.servicegrad),
    storningsgrad: tal(r.storningsgrad),
    bransle_l_per_m3: tal(r.bransle_l_per_m3),
    lass_per_g15: tal(r.lass_per_g15),
    antal_med_lass: tal(r.antal_med_lass) ?? 0,
    antal_volym_osaker: tal(r.antal_volym_osaker) ?? 0,
    tu_rapporterad: tal(r.tu_rapporterad),
    antal_med_tu_rapporterad: tal(r.antal_med_tu_rapporterad) ?? 0,
    bransle_l_per_g15: tal(r.bransle_l_per_g15),
    g15_per_timraknare: tal(r.g15_per_timraknare),
    antal_volym_harledd: tal(r.antal_volym_harledd) ?? 0,
    volym_harledd_m3: tal(r.volym_harledd_m3),
    g15_med_volym: tal(r.g15_med_volym),
  };
}

export function tillObjekt(r: Record<string, unknown>): ObjektRad {
  return {
    sha256: String(r.sha256),
    maskin: String(r.maskin),
    typ: r.typ as MaskinTyp,
    ar: tal(r.ar) ?? 0,
    atgard: r.atgard as AtgardKod,
    atgard_kalla: (r.atgard_kalla ?? null) as string | null,
    urval: (r.urval ?? "namn") as "namn" | "standard",
    objekt: (r.objekt ?? null) as string | null,
    startdatum: (r.startdatum ?? null) as string | null,
    slutdatum: (r.slutdatum ?? null) as string | null,
    rapportdatum: (r.rapportdatum ?? null) as string | null,
    stammar: tal(r.stammar),
    volym_m3fub: tal(r.volym_m3fub),
    g15_h: tal(r.g15_h),
    medelstam: tal(r.medelstam),
    m3_per_g15: tal(r.m3_per_g15),
    forvantad_m3_per_g15: tal(r.forvantad_m3_per_g15),
    index: tal(r.index),
    utanfor_normalomrade: r.utanfor_normalomrade === true,
    forare: (r.forare ?? null) as string | null,
    forare_andel: tal(r.forare_andel),
    forare_andel_kalla: (r.forare_andel_kalla ?? null) as string | null,
    avbrott_registrerade: (r.avbrott_registrerade ?? null) as string | null,
    volym_kvalitet: (r.volym_kvalitet ?? null) as string | null,
    storage_path: (r.storage_path ?? null) as string | null,
    filtyp: (r.filtyp ?? null) as string | null,
    format: (r.format ?? null) as string | null,
    filnamn: (r.filnamn ?? null) as string | null,
    mejldatum: (r.mejldatum ?? null) as string | null,
    antal_andra_utskrifter: tal(r.antal_andra_utskrifter) ?? 0,
  };
}
