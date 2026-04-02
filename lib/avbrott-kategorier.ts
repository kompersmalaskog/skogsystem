export const kategoriNamn: Record<string, string> = {
  'Planning/follow up': 'Planering & uppföljning',
  'Refilling and lubrication': 'Påfyllning & smörjning',
  'Control and calibration': 'Kontroll & kalibrering',
  'Saw maintenance': 'Sågunderhåll',
  'Preventive maintenance': 'Förebyggande underhåll',
  'Periodic maintenance': 'Periodiskt underhåll',
  'Other maintenance': 'Övrigt underhåll',
  'Machine wash': 'Maskintvätt',
  'Machine stuck': 'Maskin fast',
  'Ordered stop': 'Beordrat stopp',
  'Miscellaneous / other': 'Övrigt',
  'Administration, telephone': 'Administration & telefon',
  'Weather': 'Väder',
}

export const translateKategori = (kod: string) =>
  kategoriNamn[kod] ?? kod
