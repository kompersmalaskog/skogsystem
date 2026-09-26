// Aktivitetstyper för extra tid och dagsegment — EN lista, delad av
// Arbetsrapport, PeriodForm och synk-avvikelsen. Databasen har samma tretton
// värden som domän aktivitet_typ_t (20260814_arbetsdag_segment.sql +
// 20260926_aktivitet_typ_planering_restid_manuellt_APPLICERAD.sql).

export type AktivitetTyp = 'rotben'|'reservdelar'|'markagare'|'service'|'mote'|'flytt'|'annat'|'utbildning'|'brandkontroll'|'reparation'|'planering'|'restid'|'manuellt';

export const AKTIVITETER: { typ: AktivitetTyp; label: string; icon: string; debDefault: boolean }[] = [
  { typ:'rotben',       label:'Kapa rotben',        icon:'content_cut',          debDefault:false },
  { typ:'reservdelar',  label:'Hämta reservdelar',  icon:'build',                debDefault:false },
  { typ:'service',      label:'Service',            icon:'engineering',          debDefault:false },
  { typ:'reparation',   label:'Reparation',         icon:'handyman',             debDefault:false },
  { typ:'utbildning',   label:'Utbildning',         icon:'school',               debDefault:false },
  { typ:'markagare',    label:'Markägarmöte',       icon:'handshake',            debDefault:true  },
  { typ:'flytt',        label:'Flytt av maskin',    icon:'local_shipping',       debDefault:true  },
  { typ:'brandkontroll',label:'Brandkontroll',      icon:'local_fire_department',debDefault:false },
  { typ:'mote',         label:'Möte',               icon:'groups',               debDefault:false },
  // Tid utan maskinpass (Joacims dagar). Planering och manuellt arbete
  // faktureras per trakt som default (art 10 resp. art 9 i radmodellen) —
  // `debiterbar=false` med samma typ och objekt är planering som egen kostnad.
  // Restid är arbetstid men hör inte till en trakt: objektlös, faktureras inte.
  { typ:'planering',    label:'Planering',          icon:'map',                  debDefault:true  },
  { typ:'restid',       label:'Restid',             icon:'directions_car',       debDefault:false },
  { typ:'manuellt',     label:'Manuellt arbete',    icon:'forest',               debDefault:true  },
  { typ:'annat',        label:'Annat',              icon:'more_horiz',           debDefault:false },
];

/** Typer föraren kan välja för extra arbete och perioder. `mote` låg i
 *  domänen men gick inte att välja — bifynd 2026-09-26. */
export const EXTRA_ARBETE_TYPER: AktivitetTyp[] = ['planering','restid','manuellt','mote','markagare','flytt','reservdelar','service','reparation','utbildning','brandkontroll','annat'];

export const aktLabel = (typ: string|null|undefined) => AKTIVITETER.find(a=>a.typ===typ)?.label || 'Extra';
export const aktIcon  = (typ: string|null|undefined) => AKTIVITETER.find(a=>a.typ===typ)?.icon  || 'more_horiz';
