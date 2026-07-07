export const kategoriNamn: Record<string, string> = {
  // ── Underhåll ──────────────────────────────────────────────
  'Planning/follow up':         'Planering & uppföljning',
  'Refilling and lubrication':  'Påfyllning & smörjning',
  'Control and calibration':    'Kontroll & kalibrering',
  'Saw maintenance':             'Sågunderhåll',
  'Preventive maintenance':     'Förebyggande underhåll',
  'Periodic maintenance':       'Periodiskt underhåll',
  'Other maintenance':          'Övrigt underhåll',
  'Machine wash':               'Maskintvätt',

  // ── Störning / Övrigt ──────────────────────────────────────
  'Machine stuck':              'Maskin fast',
  'Ordered stop':               'Beordrat stopp',
  'Miscellaneous / other':      'Övrigt',
  'Administration, telephone':  'Administration & telefon',
  'Weather':                    'Väder',
  // OBS: 'Unproductive terrain work' är INTE körning. Källverifierat (A030353,
  // 116/118 segment i MOM): EngineTime=0 & DrivenDistance=0 — maskinen står STILL.
  // StanForD 2010 = oproduktivt terrängarbete (förarvald kategori, rymmer väntetid);
  // hos oss i praktiken väntan/uppstart vid skiftstart. Fritext (CodeDescription)
  // saknas på samtliga rader — kategorin loggas naken.
  'Unproductive terrain work':  'Oproduktiv terrängtid',
  'Waiting for repair':         'Väntar på reparation',

  // ── Reparation (REPAIR_*) — verifierat mot DB 2026-05 ─────
  'REPAIR_CARRIER_MECHANICAL':          'Mekaniskt haveri, chassis',
  'REPAIR_CARRIER_HYDRAULICS':          'Hydraulhaveri, chassis',
  'REPAIR_HARVESTINGHEAD_MECHANICAL':   'Mekaniskt haveri, aggregat',
  'REPAIR_HARVESTINGHEAD_HYDRAULICS':   'Hydraulhaveri, aggregat',
  'REPAIR_LOADERLINKAGE_MECHANICAL':    'Mekaniskt haveri, kran',
  'REPAIR_LOADERLINKAGE_HYDRAULICS':    'Hydraulhaveri, kran',
  'REPAIR_OTHER':                       'Övrigt haveri',

  // ── Fallback ───────────────────────────────────────────────
  'Default':                    'Ej kategoriserat',
}

export const translateKategori = (kod: string) =>
  kategoriNamn[kod] ?? kod
