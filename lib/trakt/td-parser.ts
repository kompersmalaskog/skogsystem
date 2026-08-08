import proj4 from 'proj4';

// TD-parsern (Vidas traktdirektiv-PDF -> fält). Flyttad HIT ur app/api/import-trakt/route.ts
// så det finns EN parser — route.ts importerar denna, ingen kopia kvar. Regexarna är oförändrade
// mot originalet; beteendet ska vara identiskt för zip-vägen.

const SWEREF99TM = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
function sweref99ToWgs84(n: number, e: number): { lat: number; lng: number } {
  const [lng, lat] = proj4(SWEREF99TM, 'WGS84', [e, n]);
  return { lat, lng };
}

// Larmkoordinat ur TD — ENDAST via "Larmkoordinat:"-etiketten, aldrig som första koordinaten.
// Disambiguerar på MAGNITUD (northing 6,0–7,8 Mm = 7 siffror, easting 150 k–1 Mm), inte etikett.
// Sverige-box som sista spärr. Saknas etiketten/talpar -> null.
export function parseLarmkoordinatFromTd(text: string): { lat: number; lng: number } | null {
  const idx = text.search(/larmkoordinat/i);
  if (idx < 0) return null;
  const fonster = text.slice(idx, idx + 160);
  const m = fonster.match(/(\d{6,7})\s+(\d{6,7})/);
  if (!m) return null;
  const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
  const arNorthing = (v: number) => v >= 6_000_000 && v <= 7_800_000;
  const arEasting = (v: number) => v >= 150_000 && v <= 1_000_000;
  let northing: number, easting: number;
  if (arNorthing(a) && arEasting(b)) { northing = a; easting = b; }
  else if (arNorthing(b) && arEasting(a)) { northing = b; easting = a; }
  else return null;
  const { lat, lng } = sweref99ToWgs84(northing, easting);
  if (lat < 55 || lat > 70 || lng < 10 || lng > 25) return null;
  return { lat, lng };
}

export interface TdFalt {
  namn: string;
  traktnr: string;
  vo_nummer: string;
  markagare: string;
  markagare_epost: string;
  markagare_tel: string;
  inkopare: string;
  inkopare_tel: string;
  cert: string;
  typ: string;
  volym: number;
  areal: number | null;
  lat: number | null;                 // generisk koordinat ur texten (kartpin-kandidat, zip-vägen)
  lng: number | null;
  larmkoordinat: { lat: number; lng: number } | null;
  grot: boolean;
  anteckningar: string;
  sortiment: string[];
}

export function parseTraktdirektivText(text: string, traktnrFromFilename = ''): TdFalt {
  // Namn - efter "Traktdirektiv -"
  let namn = '';
  const namnMatch = text.match(/Traktdirektiv\s*[-–]\s*([A-Za-zÅÄÖåäö0-9\s]+?)(?=\s*Traktnr|\n)/i);
  if (namnMatch) namn = namnMatch[1].trim();
  if (!namn || namn.length > 50) {
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.includes('Traktdirektiv') && line.includes('-')) {
        const parts = line.split(/[-–]/);
        if (parts.length > 1) { namn = parts[1].trim().substring(0, 50); break; }
      }
    }
  }

  // Traktnr
  let traktnr = traktnrFromFilename;
  if (!traktnr) { const traktMatch = text.match(/(\d{6})/); traktnr = traktMatch ? traktMatch[1] : ''; }

  // VO-nummer - 8 siffror (börjar med 11) efter "Virkesorder"
  let vo_nummer = '';
  const voMatch = text.match(/Virkesorder[\s\S]{0,100}?(11\d{6})/i);
  if (voMatch) vo_nummer = voMatch[1];

  // Markägare - namn i VERSALER efter "VIDA"
  let markagare = '';
  const markagareMatch = text.match(/VIDA\s+([A-ZÅÄÖ][A-ZÅÄÖ]+(?:\s+[A-ZÅÄÖ]+)+)/);
  if (markagareMatch) {
    markagare = markagareMatch[1].trim().split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  // E-post - första e-postadressen (markägarens)
  const epostMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/);
  const markagare_epost = epostMatch ? epostMatch[1] : '';

  // Inköpare - namn efter e-post
  let inkopare = '';
  const inkopareMatch = text.match(/@[a-zA-Z0-9._-]+\.[a-z]+\s+([A-ZÅÄÖ][a-zåäö]+(?:-[A-ZÅÄÖ][a-zåäö]+)?\s+[A-ZÅÄÖ][a-zåäö]+)/);
  if (inkopareMatch) inkopare = inkopareMatch[1].trim();

  // Telefonnummer - alla 07X-nummer
  const allaTelefoner = text.match(/07\d[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2}/g) || [];
  const renaTelefoner = allaTelefoner.map((t) => t.replace(/[\s-]/g, ''));
  const markagare_tel = renaTelefoner.find((t) => t !== '0702327410') || '';
  const inkopare_tel = renaTelefoner.find((t) => t === '0702327410') || '';

  // Cert
  let cert = 'Ej certifierad';
  if (text.includes('FSC PEFC') || (text.includes('FSC') && text.includes('PEFC'))) cert = 'FSC PEFC';
  else if (text.includes('FSC')) cert = 'FSC';
  else if (text.includes('PEFC')) cert = 'PEFC';

  // Typ
  const typ = /[Ff]öryngringsavverkning/.test(text) ? 'slutavverkning'
    : /[Gg]allring/.test(text) ? 'gallring' : 'slutavverkning';

  // Volym
  let volym = 0;
  const volymMatch = text.match(/(\d{3,5})\s*m3fub/i) || text.match(/Total[\s\S]{0,100}?(\d{3,5})\s*\n/);
  if (volymMatch) volym = parseInt(volymMatch[1]);

  // Areal
  let areal: number | null = null;
  const arealMatch = text.match(/Total\s+(\d+[,.]?\d*)\s/);
  if (arealMatch) areal = parseFloat(arealMatch[1].replace(',', '.'));

  // Koordinater (generisk)
  let lat: number | null = null;
  let lng: number | null = null;
  const nordMatch = text.match(/(\d{7})\s+(\d{6})/);
  if (nordMatch) {
    const coords = sweref99ToWgs84(parseInt(nordMatch[1]), parseInt(nordMatch[2]));
    lat = coords.lat; lng = coords.lng;
  }

  const larmkoordinat = parseLarmkoordinatFromTd(text);

  // GROT
  let grot = false;
  const grotMatch = text.match(/GROT-anpassa avverkningen\s+(Ja|Nej)/i);
  if (grotMatch) grot = grotMatch[1].toLowerCase() === 'ja';

  // Anteckningar
  let anteckningar = '';
  const antMatch = text.match(/Anteckningar:\s*([\s\S]+?)(?=\s*Sida\s+\d|$)/i);
  if (antMatch) anteckningar = antMatch[1].trim().substring(0, 500);

  // Sortiment - format måste matcha appen: "Grupp · Typ"
  const sortiment: string[] = [];
  if (/Tallsågtimmer/i.test(text)) sortiment.push('Tall timmer · Urshult');
  if (/Gransågtimmer/i.test(text)) sortiment.push('Gran timmer · Urshult');
  if (/Tallkubb/i.test(text)) sortiment.push('Kubb · Tall');
  if (/Grankubb/i.test(text)) sortiment.push('Kubb · Gran');
  if (/Barrmassa/i.test(text)) sortiment.push('Massa · Barr');
  if (/Björkmassa/i.test(text)) sortiment.push('Massa · Björk');
  if (/Bränsle/i.test(text)) sortiment.push('Energi · Bränsleved');

  return {
    namn, traktnr, vo_nummer, markagare, markagare_epost, markagare_tel,
    inkopare, inkopare_tel, cert, typ, volym, areal, lat, lng, larmkoordinat,
    grot, anteckningar, sortiment,
  };
}
