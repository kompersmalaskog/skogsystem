import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsaLasning, tal, UTDATA_SCHEMA, type Lasning } from './rapport';
import { kontrollera, slagTyp, volymTolerans, misstankta, tillLangdText, stammerRader } from './kontroll';
import { tolkaLangd } from '../berakna';

// Facit: vad en KORREKT läsning av de två riktiga rapporterna ser ut som.
//  - jeppshoka.json är byggd ur PDF:ens textlager (gran 4 186, tall 27, övrigt barr 2).
//  - bagskyttebanan.json är avskriven ur de inskannade sidorna (tall 1 035, gran 446, en torr utanför).
// De testar kontrollkoden. Själva läsningen med Claude testas inte här — den kräver en API-nyckel.
const las = (fil: string): Lasning => JSON.parse(readFileSync(join(__dirname, '__fixtures__', fil), 'utf-8'));
const kopia = (l: Lasning): Lasning => JSON.parse(JSON.stringify(l));
const slag = (l: Lasning, namn: string) => l.tradslag.find(t => t.namn === namn)!;
// toLocaleString('sv-SE') skriver tusental med hårt mellanslag (NBSP); testerna jämför med vanligt.
const ren = (s: string) => s.replace(/ /g, ' ');

describe('Jeppshoka (textlager)', () => {
  const l = las('jeppshoka.json');
  const k = kontrollera(l);
  it('antalen stämmer exakt: gran 4 186, tall 27, övrigt barr 2', () => {
    const per = Object.fromEntries(k.tradslag.map(t => [t.namn, t]));
    expect(per['Gran']).toMatchObject({ summaAntal: 4186, tryktAntal: 4186, diffAntal: 0, antalOk: true });
    expect(per['Tall']).toMatchObject({ summaAntal: 27, tryktAntal: 27, antalOk: true });
    expect(per['Övrigt barr']).toMatchObject({ summaAntal: 2, tryktAntal: 2, antalOk: true });
  });
  it('volymen stämmer inom avrundning (gran 3 256,57 mot 3 256,56)', () => {
    const g = k.tradslag.find(t => t.namn === 'Gran')!;
    expect(g.summaVolym).toBeCloseTo(3256.57, 2);
    expect(Math.abs(g.diffVolym as number)).toBeLessThan(g.tolVolym as number);
    expect(k.tradslag.every(t => t.volymOk === true)).toBe(true);
  });
  it('klart: allt stämmer, ingen åtgärd behövs, totalen 3 283,3 stämmer mot trädslagens summor', () => {
    expect(k.klart).toBe(true); expect(k.atgard).toEqual([]);
    expect(k.total).toMatchObject({ tryckt: 3283.3, ok: true });
    expect(stammerRader(k)).toHaveLength(3);
  });
  it('rapportens uppgifter finns överst', () => {
    expect(l.post).toMatchObject({ namn: 'Jeppshoka 2025', forrattare: 'Johan Ardegård', datum: '2025-05-07', total_volym_m3sk: 3283.3 });
  });
  it('går rakt in i stämplingsvyns text: 4 215 träd', () => {
    const t = tillLangdText(l);
    const rader = [...tolkaLangd(t.tall, 'tall'), ...tolkaLangd(t.gran, 'gran'), ...tolkaLangd(t.ovrigt_barr, 'ovrigt_barr')];
    expect(rader.reduce((s, r) => s + r.antal, 0)).toBe(4215);
    expect(tolkaLangd(t.gran, 'gran').reduce((s, r) => s + r.antal, 0)).toBe(4186);
  });
});

describe('Bågskyttebanan (inskannad)', () => {
  const l = las('bagskyttebanan.json');
  const k = kontrollera(l);
  it('tall 1 035 och gran 446 stämmer på antal; volym 1 433 och 450 inom avrundning', () => {
    const t = k.tradslag.find(x => x.namn === 'Tall')!, g = k.tradslag.find(x => x.namn === 'Gran')!;
    expect(t).toMatchObject({ summaAntal: 1035, tryktAntal: 1035, antalOk: true, volymOk: true });
    expect(g).toMatchObject({ summaAntal: 446, tryktAntal: 446, antalOk: true, volymOk: true });
    expect(t.summaVolym).toBeCloseTo(1433.3, 1); expect(g.summaVolym).toBeCloseTo(449.7, 1);
  });
  it('den torra tallen ligger utanför beräkningen — nämnd, inte tyst, och blockerar inte', () => {
    expect(k.klart).toBe(true);
    expect(k.ejIModellen).toHaveLength(1);
    expect(ren(k.ejIModellen[0])).toMatch(/Torra: 1 träd, 0,8 m³sk — ingår inte i beräkningen/);
    expect(k.tradslag.find(x => x.namn === 'Torra')).toMatchObject({ typ: 'torr', iModellen: false });
  });
  it('postens totala volym 1 884 stämmer mot tall + gran + torra', () => {
    expect(k.total).toMatchObject({ tryckt: 1884, summaTryckta: 1884, ok: true });
  });
  it('texten till modellen innehåller bara tall och gran: 1 481 träd', () => {
    const t = tillLangdText(l);
    expect(tolkaLangd(t.tall, 'tall').reduce((s, r) => s + r.antal, 0)).toBe(1035);
    expect(tolkaLangd(t.gran, 'gran').reduce((s, r) => s + r.antal, 0)).toBe(446);
    expect(t.ovrigt_barr).toBe('');
  });
});

describe('ett läsfel stoppar — ÅTGÄRD BEHÖVS med trädslag och differens', () => {
  it('antal fel på en rad: gran 408 i stället för 406 → +2, volymen ok, inte klart', () => {
    const l = kopia(las('jeppshoka.json'));
    slag(l, 'Gran').klasser.find(c => c.diameter_cm === 28)!.antal = 408;
    const k = kontrollera(l);
    expect(k.klart).toBe(false);
    const g = k.tradslag.find(t => t.namn === 'Gran')!;
    expect(g).toMatchObject({ antalOk: false, diffAntal: 2, volymOk: true, ok: false });
    expect(k.atgard).toHaveLength(1);
    expect(k.atgard[0].tradslag).toBe('Gran');
    expect(ren(k.atgard[0].text)).toMatch(/Gran: antalet summerar till 4 188 men rapporten säger 4 186 \(\+2 träd\)/);
  });
  it('volym fel på en rad (144,7 läst som 114,7): antalet stämmer men volymen avviker → stoppar ändå', () => {
    const l = kopia(las('bagskyttebanan.json'));
    slag(l, 'Tall').klasser.find(c => c.diameter_cm === 36)!.volym_m3sk = 114.7;
    const k = kontrollera(l);
    const t = k.tradslag.find(x => x.namn === 'Tall')!;
    expect(t).toMatchObject({ antalOk: true, volymOk: false });
    expect(t.diffVolym).toBeCloseTo(-29.7, 1);               // 1 403,3 mot tryckt 1 433
    expect(k.klart).toBe(false);
    expect(ren(k.atgard[0].text)).toMatch(/Tall: volymen summerar till 1 403,3 m³sk men rapporten säger 1 433,0 \(−29,7/);
  });
  it('en missad rad stoppar (en 5-cm-rad bortglömd)', () => {
    const l = kopia(las('bagskyttebanan.json'));
    slag(l, 'Gran').klasser = slag(l, 'Gran').klasser.filter(c => c.diameter_cm !== 78);
    const k = kontrollera(l);
    expect(k.klart).toBe(false);
    expect(k.tradslag.find(x => x.namn === 'Gran')).toMatchObject({ diffAntal: -1, antalOk: false });
  });
  it('en rättad rad släpper igenom: samma kontroll, rätt värde → klart', () => {
    const l = kopia(las('jeppshoka.json'));
    const rad = slag(l, 'Gran').klasser.find(c => c.diameter_cm === 28)!;
    rad.antal = 408; expect(kontrollera(l).klart).toBe(false);
    rad.antal = 406; expect(kontrollera(l).klart).toBe(true);
  });
  it('saknas rapportens egen summa kan antalet inte kontrolleras → stoppar, gissas aldrig', () => {
    const l = kopia(las('jeppshoka.json'));
    slag(l, 'Tall').tryckt_antal = null; l.sammanfattning = [];
    const k = kontrollera(l);
    expect(k.klart).toBe(false);
    expect(k.atgard[0].text).toMatch(/Tall: rapportens egen summa för antal träd saknas/);
  });
  it('saknad tabellsumma faller tillbaka på sammanfattningen (och säger det)', () => {
    const l = kopia(las('jeppshoka.json'));
    slag(l, 'Gran').tryckt_antal = null; slag(l, 'Gran').tryckt_volym_m3sk = null;
    const g = kontrollera(l).tradslag.find(t => t.namn === 'Gran')!;
    expect(g).toMatchObject({ tryktAntal: 4186, tryktKalla: 'sammanfattning', antalOk: true });
  });
  it('rapporten har volymsumma men raderna saknar volym → volymen kan inte kontrolleras → stoppar', () => {
    const l = kopia(las('jeppshoka.json'));
    for (const c of slag(l, 'Gran').klasser) c.volym_m3sk = null;
    const k = kontrollera(l);
    expect(k.klart).toBe(false);
    expect(k.atgard.some(a => /raderna saknar volym per klass/.test(a.text))).toBe(true);
  });
  it('okänt trädslagsnamn gissas inte: det stoppar tills namnet rättats', () => {
    const l = kopia(las('jeppshoka.json'));
    slag(l, 'Övrigt barr').namn = 'Xyz';
    const k = kontrollera(l);
    expect(k.klart).toBe(false);
    expect(k.atgard.some(a => /"Xyz" känns inte igen/.test(a.text))).toBe(true);
  });
  it('postens totalvolym som inte går ihop är en varning, inte en spärr', () => {
    const l = kopia(las('bagskyttebanan.json'));
    l.post.total_volym_m3sk = 2400;
    const k = kontrollera(l);
    expect(k.klart).toBe(true);
    expect(k.total!.ok).toBe(false);
    expect(k.varningar.some(v => /postens totala volym är 2 400,0/.test(ren(v)))).toBe(true);
  });
  it('AI:ns egna osäkerheter visas men spärrar inte ensamma', () => {
    const l = kopia(las('bagskyttebanan.json'));
    l.osakerheter = ['Sida 7, Tall 54 cm: 13 eller 18'];
    const k = kontrollera(l);
    expect(k.klart).toBe(true); expect(k.varningar).toContain('AI:n var osäker: Sida 7, Tall 54 cm: 13 eller 18');
  });
  it('inget att räkna på alls (bara torra träd) → stoppar', () => {
    const l = kopia(las('bagskyttebanan.json'));
    l.tradslag = l.tradslag.filter(t => t.namn === 'Torra');
    const k = kontrollera(l);
    expect(k.klart).toBe(false); expect(k.atgard[0].text).toMatch(/Ingen tall, gran eller övrigt barr/);
  });
});

describe('misstänkta rader — stöd vid rättning, inte spärr', () => {
  it('två antal som bytt plats tar ut sig på summan men bryter volym per träd', () => {
    const l = kopia(las('jeppshoka.json'));
    const g = slag(l, 'Gran').klasser;
    const a = g.find(c => c.diameter_cm === 28)!, b = g.find(c => c.diameter_cm === 30)!;
    [a.antal, b.antal] = [b.antal, a.antal];
    const k = kontrollera(l);
    expect(k.klart).toBe(true);                                     // summorna stämmer — det är problemet
    expect(k.tradslag.find(t => t.namn === 'Gran')!.misstankta).toContain(30);
  });
  it('rena rapporter har inga misstänkta rader', () => {
    for (const f of ['jeppshoka.json', 'bagskyttebanan.json']) for (const t of kontrollera(las(f)).tradslag) expect(t.misstankta).toEqual([]);
  });
  it('funktionen ensam: tunnare klass som väger mer per träd flaggas inte, grövre som väger mindre gör det', () => {
    expect(misstankta([{ diameter_cm: 20, antal: 10, volym_m3sk: 3 }, { diameter_cm: 22, antal: 10, volym_m3sk: 4 }])).toEqual([]);
    expect(misstankta([{ diameter_cm: 20, antal: 10, volym_m3sk: 4 }, { diameter_cm: 22, antal: 10, volym_m3sk: 3 }])).toEqual([22]);
  });
});

describe('toleransen', () => {
  it('halv enhet i summans sista decimal plus halv enhet i radens per rad', () => {
    const rader = Array.from({ length: 22 }, (_, i) => ({ diameter_cm: 20 + i, antal: 1, volym_m3sk: 1.5 }));
    expect(volymTolerans(rader, 1433)).toBeCloseTo(0.5 + 22 * 0.05, 6);
    const tva = Array.from({ length: 25 }, (_, i) => ({ diameter_cm: 12 + i, antal: 1, volym_m3sk: 1.25 }));
    expect(volymTolerans(tva, 3256.56)).toBeCloseTo(0.005 + 25 * 0.005, 6);
  });
  it('antalet har ingen tolerans: en enda träd fel stoppar', () => {
    const l = kopia(las('bagskyttebanan.json'));
    slag(l, 'Tall').klasser[0].antal = 2;
    expect(kontrollera(l).klart).toBe(false);
  });
});

describe('trädslagsnamn', () => {
  it('tolkas av koden, inte av AI:n', () => {
    expect(['Tall', 'Gran', 'Övrigt barr', 'Torra', 'Torrträd', 'Torr tall', 'Contorta', 'Björk', 'Löv', 'Xyz'].map(slagTyp))
      .toEqual(['tall', 'gran', 'ovrigt_barr', 'torr', 'torr', 'torr', 'ovrigt_barr', 'lov', 'lov', 'okand']);
  });
});

describe('parsaLasning', () => {
  it('tar tal med komma och tusentalsmellanrum, och avrundar antal', () => {
    expect(tal('1 035')).toBe(1035); expect(tal('24,9')).toBe(24.9); expect(tal(' 0,8 ')).toBe(0.8); expect(tal('abc')).toBeNull(); expect(tal(NaN)).toBeNull();
  });
  it('en välformad läsning går igenom oförändrad', () => {
    const { lasning, varningar } = parsaLasning(las('bagskyttebanan.json'));
    expect(varningar).toEqual([]);
    expect(lasning.tradslag.map(t => t.namn)).toEqual(['Tall', 'Gran', 'Torra']);
    expect(lasning.post.datum).toBe('2025-03-26');
  });
  it('strängar blir tal; en rad utan läsbart antal tas bort MED varning (inte tyst)', () => {
    const { lasning, varningar } = parsaLasning({
      post: { namn: 'X', datum: '26 mars 2025', total_volym_m3sk: '1 884' },
      tradslag: [{ namn: 'Tall', klasser: [{ diameter_cm: '26', antal: '3', volym_m3sk: '1,5' }, { diameter_cm: 28, antal: 'x', volym_m3sk: 2 }], tryckt_antal: '3', tryckt_volym_m3sk: null }],
    });
    expect(lasning.tradslag[0].klasser).toEqual([{ diameter_cm: 26, antal: 3, volym_m3sk: 1.5 }]);
    expect(lasning.post.total_volym_m3sk).toBe(1884); expect(lasning.post.datum).toBeNull();
    expect(varningar.join(' ')).toMatch(/Datumet/); expect(varningar.join(' ')).toMatch(/Tall: en rad utan läsbar/);
  });
  it('ett svar utan trädslag är ett FEL, aldrig ett tyst tomt resultat', () => {
    expect(() => parsaLasning(null)).toThrow(); expect(() => parsaLasning({})).toThrow(); expect(() => parsaLasning({ tradslag: [] })).toThrow();
  });
  it('schemat kräver exakt det kontrollen behöver', () => {
    const s = UTDATA_SCHEMA as any;
    expect(s.required).toEqual(['post', 'tradslag', 'sammanfattning', 'osakerheter']);
    expect(s.properties.tradslag.items.required).toEqual(['namn', 'klasser', 'tryckt_antal', 'tryckt_volym_m3sk']);
  });
  it('schemat följer reglerna för strukturerade utdata: additionalProperties:false på varje objekt, inga min/max-villkor, alla required finns', () => {
    const OTILLATNA = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'pattern', '$ref'];
    let objekt = 0;
    const gå = (n: any, stig: string) => {
      if (Array.isArray(n)) return n.forEach((x, i) => gå(x, `${stig}[${i}]`));
      if (!n || typeof n !== 'object') return;
      for (const k of OTILLATNA) expect(n, `${stig}: ${k} stöds inte`).not.toHaveProperty(k);
      if (n.type === 'object') {
        objekt++;
        expect(n.additionalProperties, `${stig}: additionalProperties`).toBe(false);
        for (const r of n.required ?? []) expect(Object.keys(n.properties), `${stig}: required ${r}`).toContain(r);
      }
      for (const [k, v] of Object.entries(n)) gå(v, `${stig}.${k}`);
    };
    gå(UTDATA_SCHEMA, 'schema');
    expect(objekt).toBe(5);   // rot, post, trädslag, klass, sammanfattning
  });
});
