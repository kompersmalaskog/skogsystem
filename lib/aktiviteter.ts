// Aktivitetstyper för extra tid och dagsegment — EN lista, delad av
// Arbetsrapport, PeriodForm och synk-avvikelsen. Databasen har samma tio
// värden som domän aktivitet_typ_t (20260814_arbetsdag_segment.sql).

export type AktivitetTyp = 'rotben'|'reservdelar'|'markagare'|'service'|'mote'|'flytt'|'annat'|'utbildning'|'brandkontroll'|'reparation';

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
  { typ:'annat',        label:'Annat',              icon:'more_horiz',           debDefault:false },
];

/** Typer föraren kan välja för extra arbete och perioder. */
export const EXTRA_ARBETE_TYPER: AktivitetTyp[] = ['reservdelar','service','reparation','utbildning','markagare','flytt','brandkontroll','annat'];

export const aktLabel = (typ: string|null|undefined) => AKTIVITETER.find(a=>a.typ===typ)?.label || 'Extra';
export const aktIcon  = (typ: string|null|undefined) => AKTIVITETER.find(a=>a.typ===typ)?.icon  || 'more_horiz';
