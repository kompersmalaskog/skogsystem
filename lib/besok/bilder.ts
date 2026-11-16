// Små bilder till korten "Det här kommer du att se" på markägarens länk (Martin 2026-11-16: en bild förstår man direkt, en textrad måste man läsa).
// Avsiktligt enkla: mark, stam, krona — en sak per bild, ingen text i bilden. Den detaljerade bilden ("Så ska det se ut", lib/malbilder) ligger kvar i arket bakom kortet.
// SVG som text, byggd bara ur konstanterna här (aldrig användartext): inga externa filer, fungerar utan täckning. Färgerna är bildens egna, som i lib/malbilder.

import type { SkogRadId } from './skogen';

const MARK = '#3a3a3c';
const STAM = '#8b5a2b';
const GRON = '#30d158';
const GRON2 = '#248a3d';
const STEN = '#8e8e93';
const STEN2 = '#aeaeb2';
const VATTEN = '#0a84ff';
const RIS = '#a2845e';

const ram = (inre: string, titel: string) =>
  `<svg viewBox="0 0 100 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${titel}"><rect x="0" y="54" width="100" height="10" fill="${MARK}"/>${inre}</svg>`;

const gran = (x: number, topp: number, bredd = 16) =>
  `<rect x="${x - 2.5}" y="${topp + 24}" width="5" height="${54 - topp - 24}" fill="${STAM}"/><polygon points="${x},${topp} ${x - bredd},${topp + 28} ${x + bredd},${topp + 28}" fill="${GRON}"/>`;
const stubbe = (x: number, hojd = 5, bredd = 7) => `<rect x="${x - bredd / 2}" y="${54 - hojd}" width="${bredd}" height="${hojd}" fill="${STAM}"/>`;

export const SKOG_BILD: Readonly<Record<SkogRadId, string>> = {
  evighetstrad: ram(`${gran(50, 6)}${stubbe(20)}${stubbe(80)}`, 'Ett träd står kvar bland stubbarna'),
  hogstubbe: ram(`<polygon points="45,54 45,14 48,18 51,12 54,17 55,54" fill="${STAM}"/>${stubbe(22)}${stubbe(78)}`, 'En hög stubbe bland låga stubbar'),
  kulturstubbe: ram(
    `<rect x="36" y="44" width="10" height="10" rx="3" fill="${STEN}"/><rect x="47" y="46" width="9" height="8" rx="3" fill="${STEN2}"/><rect x="57" y="43" width="9" height="11" rx="3" fill="${STEN}"/>${stubbe(23, 20)}${stubbe(79, 20)}`,
    'Stubbar i brösthöjd på var sida om en stenlämning',
  ),
  toppar: ram(`<polygon points="16,52 80,46 80,54 16,54" fill="${STAM}"/><polygon points="48,49 86,36 88,54 48,54" fill="${GRON}"/>${stubbe(8)}`, 'En grov topp ligger kvar på marken'),
  ris: ram(
    `<path d="M14 54 L26 44 M22 54 L38 42 M34 54 L46 45 M44 54 L60 42 M56 54 L68 46 M66 54 L82 43 M76 54 L88 47" stroke="${RIS}" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M30 54 L40 48 M52 54 L62 49 M72 54 L80 49" stroke="${GRON2}" stroke-width="2.5" stroke-linecap="round" fill="none"/>`,
    'Ris ligger kvar på marken',
  ),
  kantzon: ram(`<rect x="0" y="54" width="34" height="10" fill="${VATTEN}"/>${gran(46, 18, 10)}${gran(60, 12, 11)}${stubbe(80)}${stubbe(92)}`, 'Träd står kvar närmast vattnet'),
  spridda: ram(`${gran(18, 22, 9)}${gran(50, 16, 10)}${gran(82, 22, 9)}${stubbe(34)}${stubbe(66)}`, 'Träd står utspridda över hygget'),
  stickvagar: ram(
    `${gran(12, 16, 9)}${gran(30, 20, 8)}${gran(70, 20, 8)}${gran(88, 16, 9)}<path d="M44 54 L47 30 M56 54 L53 30" stroke="${STEN2}" stroke-width="2" stroke-dasharray="4 3" fill="none"/>`,
    'En väg genom skogen mellan träden',
  ),
  basta: ram(`${gran(26, 8, 14)}${gran(72, 8, 14)}${stubbe(8)}${stubbe(49)}${stubbe(92)}`, 'De bästa träden står kvar med luft omkring sig'),
};

// Säkerhetens bilder (Martin 2026-11-16): varje bild visar det man INTE får göra, med ett rött kryss över. Rött används bara här — det är fara.
// Samma regel som ovan: en sak per bild, ingen text i bilden; texten bredvid säger varför.
const FARA = '#ff453a';
const MANNISKA = '#f2f2f7';
const MASKIN = '#636366';
const HJUL = '#1c1c1e';

const person = (x: number, liten = false) => {
  const h = liten ? 14 : 20;
  const y = 54 - h;
  return `<circle cx="${x}" cy="${y}" r="${liten ? 2.6 : 3.4}" fill="${MANNISKA}"/><path d="M${x} ${y + 4} L${x} ${y + h * 0.62} M${x} ${y + h * 0.62} L${x - 3.5} 54 M${x} ${y + h * 0.62} L${x + 3.5} 54 M${x - 4} ${y + h * 0.4} L${x + 4} ${y + h * 0.4}" stroke="${MANNISKA}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`;
};
const kryss = (x: number, y: number, r = 11) =>
  `<path d="M${x - r} ${y - r} L${x + r} ${y + r} M${x + r} ${y - r} L${x - r} ${y + r}" stroke="${FARA}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`;
const maskin = (x: number, bredd = 34) =>
  `<rect x="${x}" y="30" width="${bredd}" height="18" rx="3" fill="${MASKIN}"/><rect x="${x + 4}" y="20" width="13" height="12" rx="2" fill="${MASKIN}"/><circle cx="${x + 7}" cy="50" r="5" fill="${HJUL}" stroke="${STEN}" stroke-width="1.5"/><circle cx="${x + bredd - 7}" cy="50" r="5" fill="${HJUL}" stroke="${STEN}" stroke-width="1.5"/>`;

export type SakerhetBildId = 'skordare' | 'skotare' | 'motorsag' | 'lastbil' | 'travar';

export const SAKERHET_BILD: Readonly<Record<SakerhetBildId, string>> = {
  skordare: ram(
    `${maskin(8)}<path d="M40 26 L62 16 L66 34" stroke="${MASKIN}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><ellipse cx="50" cy="54" rx="46" ry="7" fill="none" stroke="${FARA}" stroke-width="1.8" stroke-dasharray="5 4"/>${person(80)}${kryss(80, 42)}`,
    'Gå inte in i ringen runt skördaren',
  ),
  skotare: ram(
    `${maskin(44, 46)}<rect x="66" y="22" width="22" height="8" rx="3" fill="${STAM}"/><rect x="66" y="14" width="22" height="7" rx="3" fill="${STAM}"/>${person(20)}${kryss(20, 42)}`,
    'Stå inte bakom skotaren',
  ),
  motorsag: ram(
    `${stubbe(78, 6)}<path d="M76 47 L44 22" stroke="${STAM}" stroke-width="5" stroke-linecap="round"/><polygon points="30,11 60,20 44,40" fill="${GRON}"/><path d="M64 14 L58 20 M70 20 L63 25" stroke="${STEN2}" stroke-width="1.8" stroke-linecap="round"/>${person(22)}${kryss(22, 42)}`,
    'Stå inte där trädet faller',
  ),
  lastbil: ram(
    `<rect x="34" y="34" width="46" height="5" fill="${MASKIN}"/><rect x="80" y="24" width="14" height="24" rx="3" fill="${MASKIN}"/><circle cx="42" cy="50" r="5" fill="${HJUL}" stroke="${STEN}" stroke-width="1.5"/><circle cx="66" cy="50" r="5" fill="${HJUL}" stroke="${STEN}" stroke-width="1.5"/><circle cx="87" cy="50" r="5" fill="${HJUL}" stroke="${STEN}" stroke-width="1.5"/><path d="M76 34 L58 8 L44 18" stroke="${MASKIN}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><rect x="34" y="18" width="20" height="5" rx="2.5" fill="${STAM}"/>${person(16)}${kryss(16, 42)}`,
    'Stå inte nära timmerbilen när den lastar',
  ),
  travar: ram(
    `<circle cx="40" cy="48" r="6" fill="${STAM}"/><circle cx="52" cy="48" r="6" fill="${STAM}"/><circle cx="64" cy="48" r="6" fill="${STAM}"/><circle cx="76" cy="48" r="6" fill="${STAM}"/><circle cx="46" cy="38" r="6" fill="${STAM}"/><circle cx="58" cy="38" r="6" fill="${STAM}"/><circle cx="70" cy="38" r="6" fill="${STAM}"/><circle cx="52" cy="28" r="6" fill="${STAM}"/><circle cx="64" cy="28" r="6" fill="${STAM}"/><g transform="translate(0 -32)">${person(58, true)}</g>${kryss(58, 18, 10)}`,
    'Klättra inte på virkestravarna',
  ),
};
