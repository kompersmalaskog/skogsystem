import { describe, expect, it } from 'vitest';
import {
  FOTO_ETIKETT_MAX_RADER, FOTO_ETIKETT_PAD_EM, FOTO_ETIKETT_PDF_ANDEL, FOTO_ETIKETT_RADHOJD_EM, FOTO_ETIKETT_SKARM_GOLV_PX, fotoAnkare, fotoEtikettMatt, fotoKoordinaterGiltiga,
  pdfEtikettAldrigStorreAnSkarm, planeraFotoEtiketter, skarmEtikettAndel, skarmEtikettPx, tryckTillUV, type FotoNoteringForm,
} from './egenkontrollFotoEtikett';
import { klamEtikett } from './egenkontrollNotering';
import { helveticaBreddEm } from './helveticaBredd';

const TEXTER = [
  'Stenmur.', 'Kulturlämning', 'Basvägen skulle gått här.', 'Överfart över stenmur, ca 12 m bred, markägarens egen',
  'Ett mycket långt ord som inte ryms: Överkörningsskadekontrollkommentarsuppföljning',
  'Så här blev det: skotaren körde ut över fuktstråket vid avlägget, spåret är djupt och måste läggas med ris innan nästa vecka',
  '😀', 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
];

describe('skärmens etikettstorlek', () => {
  it('golvet 13 px gäller på en telefon: 3,2 % av 390 px är 12,5', () => {
    expect(0.032 * 390).toBeLessThan(13);
    expect(skarmEtikettPx(390)).toBe(FOTO_ETIKETT_SKARM_GOLV_PX);
    expect(skarmEtikettPx(360)).toBe(13);
  });
  it('över golvet följer den 3,2 % av visad bredd', () => {
    expect(skarmEtikettPx(1000)).toBeCloseTo(32, 9);
    expect(skarmEtikettAndel(1000)).toBeCloseTo(0.032, 12);
  });
  it('PDF-andelen är 3,2 %: 15,9 pt på layout E:s 496,4 pt', () => {
    expect(FOTO_ETIKETT_PDF_ANDEL).toBe(0.032);
    expect(FOTO_ETIKETT_PDF_ANDEL * 496.4).toBeCloseTo(15.88, 1);
  });
});

describe('PDF-etiketten är ALDRIG större än skärmetiketten (Martins krav: räknat, inte resonerat)', () => {
  it('för varje text vid varje visad bredd från 200 till 3000 px: samma rader, rutan i PDF ≤ rutan på skärmen', () => {
    for (const t of TEXTER) {
      for (let px = 200; px <= 3000; px += 7) expect(pdfEtikettAldrigStorreAnSkarm(t, px), `${t.slice(0, 20)} @ ${px}px`).toBe(true);
    }
  });

  it('ett förskjutningsvärde klämt mot skärmens ruta är redan giltigt i PDF:ens mindre ruta (idempotent: PDF:ens klämning ändrar inget)', () => {
    const bildHojd = 4 / 3;
    for (const t of TEXTER) {
      for (const px of [320, 390, 430, 820, 1280]) {
        const skarm = fotoEtikettMatt(t, skarmEtikettAndel(px))!;
        const pdf = fotoEtikettMatt(t, FOTO_ETIKETT_PDF_ANDEL)!;
        for (const [u, v] of [[0.02, 0.02], [0.5, 0.5], [0.98, 0.98], [0.02, 0.98], [0.98, 0.02], [0.5, 0.01]]) {
          for (const [dx, dy] of [[-2, -2], [2, 2], [0.3, -0.2], [0, 0], [-0.05, 0.9]]) {
            const sparad = klamEtikett({ u, v, bildHojd, dx, dy, ruta: skarm.ruta });
            const iPdf = klamEtikett({ u, v, bildHojd, dx: sparad.dx, dy: sparad.dy, ruta: pdf.ruta });
            expect(iPdf, `${t.slice(0, 12)} ${px}px u${u} v${v} d${dx},${dy}`).toEqual(sparad);
          }
        }
      }
    }
  });

  it('provet är inte tomt: en skärmandel som är MINDRE än PDF:ens skulle fångas', () => {
    // Kontroll av kontrollen: med en skärmandel under PDF:ens måste samma jämförelse falla.
    const pdf = fotoEtikettMatt('Kulturlämning', FOTO_ETIKETT_PDF_ANDEL)!;
    const mindre = fotoEtikettMatt('Kulturlämning', FOTO_ETIKETT_PDF_ANDEL * 0.9)!;
    expect(pdf.ruta.bredd <= mindre.ruta.bredd).toBe(false);
  });
});

describe('fotoEtikettMatt: rutan', () => {
  it('bredden är textens bredd i em PLUS luft på båda sidor, höjden raderna × 1,25 em plus luft — båda gånger textandelen', () => {
    const a = 0.032;
    const m = fotoEtikettMatt('Kulturlämning', a)!;
    const em = helveticaBreddEm('Kulturlämning');
    expect(m.ruta.bredd).toBeCloseTo((em + 2 * FOTO_ETIKETT_PAD_EM) * a, 12);
    expect(m.ruta.hojd).toBeCloseTo((1 * FOTO_ETIKETT_RADHOJD_EM + 2 * FOTO_ETIKETT_PAD_EM) * a, 12);
    const tva = fotoEtikettMatt('Så här blev det: stenmuren är skadad på två ställen', a)!;
    expect(tva.rader.length).toBeGreaterThan(1);
    expect(tva.ruta.hojd).toBeCloseTo((tva.rader.length * FOTO_ETIKETT_RADHOJD_EM + 2 * FOTO_ETIKETT_PAD_EM) * a, 12);
  });
});

describe('fotoEtikettMatt', () => {
  it('en kort text är en rad; en lång text kortas efter tre rader med …', () => {
    expect(fotoEtikettMatt('Stenmur.', 0.032)!.rader).toEqual(['Stenmur.']);
    const lang = fotoEtikettMatt(TEXTER[5], 0.032)!;
    expect(lang.rader.length).toBeLessThanOrEqual(FOTO_ETIKETT_MAX_RADER);
    expect(lang.avkortad).toBe(true);
    expect(lang.rader[lang.rader.length - 1].endsWith('…')).toBe(true);
  });
  it('tom text ger ingen etikett', () => {
    expect(fotoEtikettMatt('   ', 0.032)).toBeNull();
  });
  it('en kort text är inte avkortad', () => {
    expect(fotoEtikettMatt('Kulturlämning', 0.032)!.avkortad).toBe(false);
  });
});

describe('koordinater', () => {
  it('foto: par av tal 0..1; punkt = ett par, linje 2..500', () => {
    expect(fotoKoordinaterGiltiga('punkt', [[0.5, 0.5]])).toBe(true);
    expect(fotoKoordinaterGiltiga('punkt', [[0.5, 0.5], [0.1, 0.1]])).toBe(false);
    expect(fotoKoordinaterGiltiga('linje', [[0, 0], [1, 1]])).toBe(true);
    expect(fotoKoordinaterGiltiga('linje', [[0, 0]])).toBe(false);
    expect(fotoKoordinaterGiltiga('punkt', [[1.01, 0.5]])).toBe(false);
    expect(fotoKoordinaterGiltiga('punkt', [[-0.01, 0.5]])).toBe(false);
    expect(fotoKoordinaterGiltiga('punkt', [[Number.NaN, 0.5]])).toBe(false);
    expect(fotoKoordinaterGiltiga('linje', Array.from({ length: 501 }, () => [0.5, 0.5]))).toBe(false);
  });
  it('ett tryck utanför bilden är inget tryck på bilden', () => {
    const r = { x: 10, y: 20, b: 200, h: 300 };
    expect(tryckTillUV(110, 170, r)).toEqual([0.5, 0.5]);
    expect(tryckTillUV(9, 170, r)).toBeNull();
    expect(tryckTillUV(110, 321, r)).toBeNull();
    expect(tryckTillUV(10, 20, r)).toEqual([0, 0]);
  });
});

describe('planeraFotoEtiketter', () => {
  const H = 4 / 3;
  const punkt = (id: string, u: number, v: number, text = 'Stenmur.', dx: number | null = null, dy: number | null = null): FotoNoteringForm =>
    ({ id, typ: 'punkt', pil: false, etikett: text, punkter: [[u, v]], dx, dy });

  it('en etikett utan förskjutning föreslås innanför bilden, bredvid ankaret', () => {
    const m = planeraFotoEtiketter([punkt('a', 0.5, 0.5)], H, 0.032).get('a')!;
    expect(m.rekt.x0).toBeGreaterThanOrEqual(0);
    expect(m.rekt.x1).toBeLessThanOrEqual(1);
    expect(m.rekt.y0).toBeGreaterThanOrEqual(0);
    expect(m.rekt.y1).toBeLessThanOrEqual(H);
    expect(m.rekt.x0).toBeGreaterThanOrEqual(m.ankare.x - 1e-9);   // uppåt höger = första läget
  });

  it('ett ankare vid bildens kant får en etikett som ändå ligger helt i bilden', () => {
    for (const [u, v] of [[0, 0], [1, 1], [1, 0], [0, 1], [0.99, 0.5], [0.5, 0.995]]) {
      const m = planeraFotoEtiketter([punkt('a', u, v, 'Kulturlämning')], H, 0.032).get('a')!;
      expect(m.rekt.x0).toBeGreaterThanOrEqual(-1e-9);
      expect(m.rekt.x1).toBeLessThanOrEqual(1 + 1e-9);
      expect(m.rekt.y0).toBeGreaterThanOrEqual(-1e-9);
      expect(m.rekt.y1).toBeLessThanOrEqual(H + 1e-9);
    }
  });

  it('två noteringar intill varandra får inte etiketter ovanpå varandra', () => {
    const m = planeraFotoEtiketter([punkt('a', 0.5, 0.5, 'Stenmur.'), punkt('b', 0.52, 0.5, 'Körspår.')], H, 0.032);
    const a = m.get('a')!.rekt, b = m.get('b')!.rekt;
    const skar = a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    expect(skar).toBe(false);
  });

  it('en sparad förskjutning behålls (klämd) och knuffas aldrig av en ny etikett', () => {
    const fast = planeraFotoEtiketter([punkt('a', 0.5, 0.5, 'Stenmur.', 0.2, -0.1)], H, 0.032).get('a')!;
    const efter = planeraFotoEtiketter([punkt('a', 0.5, 0.5, 'Stenmur.', 0.2, -0.1), punkt('b', 0.6, 0.45, 'Körspår.')], H, 0.032).get('a')!;
    expect(efter.rekt).toEqual(fast.rekt);
    expect(fast.dx).toBeCloseTo(0.2, 4);
    expect(fast.dy).toBeCloseTo(-0.1, 4);
  });

  it('en förskjutning utanför bilden klämmer in etiketten i bilden', () => {
    const m = planeraFotoEtiketter([punkt('a', 0.9, 0.9, 'Stenmur.', 1.5, 1.5)], H, 0.032).get('a')!;
    expect(m.rekt.x1).toBeLessThanOrEqual(1 + 1e-9);
    expect(m.rekt.y1).toBeLessThanOrEqual(H + 1e-9);
  });

  it('deterministiskt: samma indata ger samma plats', () => {
    const i = [punkt('a', 0.3, 0.3), punkt('b', 0.7, 0.6, 'Kulturlämning')];
    expect(planeraFotoEtiketter(i, H, 0.032)).toEqual(planeraFotoEtiketter(i, H, 0.032));
  });

  it('ankaret för en linje är mitt på den, längs den', () => {
    const a = fotoAnkare({ typ: 'linje', punkter: [[0.1, 0.1], [0.1, 0.5], [0.9, 0.5]] }, H)!;
    // Längd: 0.4 * 4/3 = 0.5333 + 0.8 = 1.3333; halva = 0.6667 → 0.5333 ner, sedan 0.1333 åt höger.
    expect(a.x).toBeCloseTo(0.1 + 0.1333, 3);
    expect(a.y).toBeCloseTo(0.5 * H, 6);
  });

  it('en etikett med tom text ritas inte', () => {
    expect(planeraFotoEtiketter([punkt('a', 0.5, 0.5, '  ')], H, 0.032).has('a')).toBe(false);
  });
});

describe('en lång linje med en etikett intill: provar längre bort i stället för att dölja linjen', () => {
  const H = 4 / 3;
  it('etiketten ligger aldrig ovanpå pilens spets när det finns fritt längre bort (provat på bilagans prov-bild)', () => {
    const n = (id: string, over: Partial<FotoNoteringForm>): FotoNoteringForm => ({ id, typ: 'punkt', pil: false, etikett: 'Stenmur, skadad', punkter: [[0.33, 0.7]], dx: null, dy: null, ...over });
    const lista = [
      n('n1', {}),
      n('n2', { typ: 'linje', pil: true, etikett: 'Basvägen skulle gått här, 12 m från muren, längs det gamla diket', punkter: [[0.15, 0.85], [0.5, 0.78], [0.85, 0.8]] }),
    ];
    const m = planeraFotoEtiketter(lista, H, 0.032).get('n2')!;
    const spets = { x: 0.85, y: 0.8 * H };
    const over = spets.x > m.rekt.x0 && spets.x < m.rekt.x1 && spets.y > m.rekt.y0 && spets.y < m.rekt.y1;
    expect(over).toBe(false);
  });
});
