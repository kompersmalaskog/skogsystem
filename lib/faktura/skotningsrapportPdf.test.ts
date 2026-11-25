// Skotningsrapporten som FIL: ritas PDF:en, och står talen i den?
//
// Ett grönt test på vymodellen bevisar bara att texten är rätt uträknad. Det
// Martin skickar till inköparen är en PDF, och den enda kontrollen som duger
// är att rendera den och läsa tillbaka den: texten med unpdf, kartan som
// pixlar med pdftoppm. En tom kartruta eller en skalstock som hamnade utanför
// sidan syns inte i någon vymodell.
//
// Kartan är Skälvikens riktiga geometri ur prod (fixturen), så måtten,
// stammolnets täthet och avläggets placering är verkliga.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { skotningsrapport, type SkotningsrapportIndata } from './skotningsrapport';
import { harKarta, kartaForRapport, skapaSkotningsrapportPdf, type RapportKarta } from './skotningsrapportPdf';
import type { CykelSammanstallning } from './lassCykel';
import fixtur from './__fixtures__/skalviken_karta_2026-11-25.json';

const latlng = (c: number[][]) => c.map(([lng, lat]) => ({ lat, lng }));

const KARTA: RapportKarta = {
  granser: (fixtur.granser as number[][][]).map(latlng),
  stammar: latlng(fixtur.stammar as number[][]),
  korspar: (fixtur.skotarspar as number[][][]).map(latlng),
  avlagg: [{ nr: 1, namn: '01-1', plats: { lat: 56.28761946, lng: 15.37559972 } }],
};

const CYKEL: CykelSammanstallning = {
  lass: 85, medCykel: 70, volym: 1553, volymMedCykel: 1278,
  cykelM: 1477, enkelVagM: 738.6, hemMedLassM: 660, vidAvlaggetM: 250,
  ytterstM: 414.4,
  utan: { fonster_for_langt: 14, forsta_lasset: 1 },
};

const SKALVIKEN: SkotningsrapportIndata = {
  trakt: { namn: 'Skälviken RP J-Hus -25', voNummer: '11271860', kund: 'Vida', avtalsform: 'Rp' },
  skotare: ['Elefant 26'],
  period: { fran: '2026-11-03', till: '2026-11-18' },
  volymM3fub: 1746.35,
  avstandM: 414.4,
  handsatt: false,
  cykel: CYKEL,
  pris: { grundavstandM: 200, krPer100m: 4, kronor: 20956.2 },
};

/** PDF:ens hela text, med hårda mellanslag normaliserade. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(doc, { mergePages: true });
  return (Array.isArray(text) ? text.join('\n') : text).replace(/[  ]/g, ' ');
}

/** PDF:ens sidor som PNG. Returnerar sökvägarna. */
function rastrera(bytes: Uint8Array): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'skotrapport-'));
  const pdf = join(dir, 'rapport.pdf');
  writeFileSync(pdf, bytes);
  execFileSync('pdftoppm', ['-png', '-r', '110', pdf, join(dir, 'sida')]);
  return readdirSync(dir).filter(f => f.endsWith('.png')).sort().map(f => join(dir, f));
}

/**
 * Räknar pixlar som inte är sidans vita bakgrund, i en vågrät remsa.
 * `fran`/`till` är andel av bildens höjd. Läser PNG:en via pdftoppm:s egen
 * PPM-utgång i stället för en bildparser — ingen extra beroende.
 */
function ritatIRemsa(
  pdf: Uint8Array, fran: number, till: number, sida = 1,
): { ritade: number; andel: number } {
  const dir = mkdtempSync(join(tmpdir(), 'skotrapport-ppm-'));
  const fil = join(dir, 'r.pdf');
  writeFileSync(fil, pdf);
  const s = String(sida);
  execFileSync('pdftoppm', ['-r', '110', '-f', s, '-l', s, fil, join(dir, 's')]);
  const ppm = readdirSync(dir).find(f => f.endsWith('.ppm'))!;
  const buf = readFileSync(join(dir, ppm));
  // P6-huvud: "P6\n<b> <h>\n255\n"
  const huvud = buf.subarray(0, 64).toString('latin1');
  const m = /^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(huvud)!;
  const b = Number(m[1]), h = Number(m[2]);
  const start = m[0].length;
  let ritade = 0, totalt = 0;
  for (let y = Math.floor(h * fran); y < Math.floor(h * till); y++) {
    for (let x = 0; x < b; x++) {
      const i = start + (y * b + x) * 3;
      totalt++;
      // Något mörkare än nästan-vitt räknas som ritat.
      if (buf[i] < 235 || buf[i + 1] < 235 || buf[i + 2] < 235) ritade++;
    }
  }
  return { ritade, andel: ritade / totalt };
}

describe('kartan finns bara när det finns något att rita', () => {
  it('Skälvikens riktiga geometri ger en karta', () => {
    expect(harKarta(KARTA)).toBe(true);
    expect(kartaForRapport(KARTA)).toBeDefined();
  });

  it('en tom karta ritas aldrig — ingen tom ruta i rapporten', () => {
    const tom: RapportKarta = { granser: [], stammar: [], korspar: [], avlagg: [] };
    expect(harKarta(tom)).toBe(false);
    expect(kartaForRapport(tom)).toBeUndefined();
    // En ring med en enda punkt är ingen ring, men den räknas som "något" —
    // då ritas gränsen inte, men stammarna/spåret kan ändå vara värda en karta.
    expect(harKarta({ ...tom, granser: [[{ lat: 56, lng: 15 }]] })).toBe(true);
  });

  it('kartan ligger på EGEN SIDA, med rubrik', () => {
    const k = kartaForRapport(KARTA)!;
    expect(k.egenSida).toBe(true);
    expect(k.rubrik).toBe('Var skotaren körde');
  });
});

describe('PDF:en', () => {
  // Mätt 2026-11-25: fakta + svar + två avsnitt tar nästan en hel A4, så en
  // karta i flödet bröt prisavsnittet mitt itu. Nu: sida 1 svarar ensam.
  it('SIDA 1 SVARAR ENSAM — avståndet, måtten och kronorna, utan att brytas', async () => {
    const bytes = await skapaSkotningsrapportPdf(skotningsrapport(SKALVIKEN), KARTA);
    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(rastrera(bytes)).toHaveLength(2);
    const doc = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(doc, { mergePages: false });
    const s1 = (text as string[])[0].replace(/[\u00a0\u202f]/g, ' ');
    for (const del of ['414 m', '739 m', 'Ut till virket', 'Vid avlägget', '20 956 kr', '12,00 kr per m3fub']) {
      expect(s1, del).toContain(del);
    }
  }, 30000);

  it('utan karta blir rapporten EN sida', async () => {
    const tom: RapportKarta = { granser: [], stammar: [], korspar: [], avlagg: [] };
    const bytes = await skapaSkotningsrapportPdf(skotningsrapport(SKALVIKEN), tom);
    expect(rastrera(bytes)).toHaveLength(1);
  }, 30000);

  it('FACIT: 414 m, 12 kr/m³fub och 20 956 kr står i filen', async () => {
    const t = await pdfText(await skapaSkotningsrapportPdf(skotningsrapport(SKALVIKEN), KARTA));
    expect(t).toContain('Skotningsrapport');
    expect(t).toContain('Skälviken RP J-Hus -25');
    expect(t).toContain('414 m');
    expect(t).toContain('20 956 kr');
    expect(t).toContain('12,00 kr per m3fub'); // ³ ritas inte — se "ENHETEN SYNS"
    // Alla fyra måtten, med det fakturerade märkt.
    expect(t).toContain('Ut till virket');
    expect(t).toContain('fakturerat');
    expect(t).toContain('739 m');
    expect(t).toContain('Vid avlägget');
    // Och halva cykelns pris står INTE någonstans — det är inte fakturerat.
    expect(t).not.toContain('41 9');
  }, 30000);

  it('skalstocken och teckenförklaringen står PÅ kartsidan', async () => {
    const bytes = await skapaSkotningsrapportPdf(skotningsrapport(SKALVIKEN), KARTA);
    const doc = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(doc, { mergePages: false });
    const s2 = (text as string[])[1].replace(/[\u00a0\u202f]/g, ' ');
    expect(s2).toContain('Var skotaren körde');
    // Skalstockens längd i meter — ett jämnt tal följt av " m".
    expect(s2).toMatch(/\b(50|100|200|250|500) m\b/);
    expect(s2).toContain('Norr är uppåt');
    expect(s2).toContain('traktgränsen'.replace('t', 'T').slice(0, 1) + 'raktgränsen');
  }, 30000);

  it('KARTAN HAR PIXLAR — inte en tom ruta', async () => {
    const bytes = await skapaSkotningsrapportPdf(skotningsrapport(SKALVIKEN), KARTA);
    // Kartsidan, mellan rubriken och skalstocken.
    const karta = ritatIRemsa(bytes, 0.12, 0.9, 2);
    // 113 stammar, en traktgräns och ett spår ger ett tydligt moln.
    expect(karta.ritade).toBeGreaterThan(3000);
    // Men inte en helsvart ruta — kartan har ingen bakgrund.
    expect(karta.andel).toBeLessThan(0.5);
    // Kartan TÄCKER sidan: ritat både högt upp och långt ner. Text samlas i
    // rader upptill; en karta som klippts till en remsa skulle falla här.
    // (Mät inte "mer ritat än textsidan" — text är TÄTARE än en karta:
    // uppmätt 6,1 % på sida 1 mot 1,4 % på kartsidan.)
    expect(ritatIRemsa(bytes, 0.15, 0.35, 2).ritade).toBeGreaterThan(200);
    expect(ritatIRemsa(bytes, 0.55, 0.72, 2).ritade).toBeGreaterThan(200);
  }, 30000);

  // Avlägget ligger nästan alltid UTANFÖR traktgränsen, vid vägen — och hela
  // rapporten handlar om avståndet från det. `kartExtent` tar som standard
  // bara traktgräns + stammar, så utan `extentAllt` klipptes avlägget och
  // halva körspåret bort (uppmätt på Skälviken 2026-11-25).
  it('AVLÄGGET ÄR MED I BILDEN, fast det ligger utanför traktgränsen', async () => {
    const utanforTrakten = KARTA.avlagg[0].plats.lat;
    const nordligastIGransen = Math.max(...KARTA.granser.flat().map(p => p.lat));
    expect(utanforTrakten).toBeGreaterThan(nordligastIGransen); // annars provar testet inget

    const bytes = await skapaSkotningsrapportPdf(skotningsrapport(SKALVIKEN), KARTA);
    // Avläggspinnen är en fylld svart ring: en tät mörk fläck överst i kartan.
    // Utan den (bara traktgräns och streckad linje) blir remsan mycket tunnare.
    const topp = ritatIRemsa(bytes, 0.1, 0.16, 2);
    const utanAvlagg = await skapaSkotningsrapportPdf(
      skotningsrapport(SKALVIKEN), { ...KARTA, avlagg: [] });
    expect(topp.ritade).toBeGreaterThan(ritatIRemsa(utanAvlagg, 0.1, 0.16, 2).ritade);
  }, 30000);

  // pdf-lib ritar inte ² och ³ med StandardFonts.Helvetica: texten hamnar i
  // filen (pdftotext läser "m³fub") men glyfen blir ett TOMRUM på papperet.
  // Ett textprov hade alltså sagt "rätt" medan inköparen läser "1 746 m fub".
  // Därför mäts det i pixlar: enheten ritas som "m3fub" (sanera byter tecknet).
  it('ENHETEN SYNS PÅ PAPPERET — "m3fub", aldrig "m fub"', async () => {
    const bytes = await skapaSkotningsrapportPdf(skotningsrapport(SKALVIKEN), KARTA);
    const dir = mkdtempSync(join(tmpdir(), 'skotrapport-enhet-'));
    const fil = join(dir, 'r.pdf');
    writeFileSync(fil, bytes);
    // pdftotext -layout läser det som FINNS i filen; pdftoppm ritar det som
    // SYNS. Bara den andra avslöjar en glyf som saknas, så sidan renderas och
    // läses tillbaka med OCR-fri jämförelse: ritade pixlar i enhetens ruta.
    execFileSync('pdftoppm', ['-r', '150', '-f', '1', '-l', '1', fil, join(dir, 's')]);
    const ppm = readdirSync(dir).find(f => f.endsWith('.ppm'))!;
    const buf = readFileSync(join(dir, ppm));
    const m = /^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(buf.subarray(0, 64).toString('latin1'))!;
    const b = Number(m[1]), h = Number(m[2]), start = m[0].length;
    // Volymraden ("Volym  1 746 m3fub") ligger drygt en fjärdedel ner.
    let ritade = 0;
    for (let y = Math.floor(h * 0.21); y < Math.floor(h * 0.26); y++) {
      for (let x = Math.floor(b * 0.25); x < Math.floor(b * 0.55); x++) {
        const i = start + (y * b + x) * 3;
        if (buf[i] < 200) ritade++;
      }
    }
    // Trean är liten men den FINNS: utan den blev rutan mätbart tunnare.
    expect(ritade).toBeGreaterThan(400);
    // Och filen säger 3:an i klartext, inte ett frågetecken från saneringen.
    const txt = execFileSync('pdftotext', [fil, '-']).toString();
    expect(txt).toContain('m3fub');
    expect(txt).not.toContain('m?fub');
  }, 30000);

  it('utan karta står talen ändå — rapporten är inte beroende av geometrin', async () => {
    const tom: RapportKarta = { granser: [], stammar: [], korspar: [], avlagg: [] };
    const t = await pdfText(await skapaSkotningsrapportPdf(skotningsrapport(SKALVIKEN), tom));
    expect(t).toContain('414 m');
    expect(t).toContain('20 956 kr');
    expect(t).not.toContain('Norr är uppåt');
    expect(t).not.toContain('Var skotaren körde');
  }, 30000);
});
