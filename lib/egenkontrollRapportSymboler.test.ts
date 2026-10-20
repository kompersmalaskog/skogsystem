// A4-rapportens karta och teckenförklaring ritar symbolerna och ytorna med SAMMA form, glyf och färg som appen (lib/symboler, lib/ytaStil).
import { describe, expect, it } from 'vitest';
import { extractText, getDocumentProxy } from 'unpdf';
import type { Egenkontroll } from './egenkontroll';
import { byggRapport, type RapportIndata } from './egenkontrollRapport';
import { skapaRapportPdf } from './egenkontrollRapportPdf';
import { ritaKarta, ritaSnedstreck, ritaSymbol, ritaTeckenforklaring } from './egenkontrollRapportKartaPdf';
import { FORM_PATH, symbolDef } from './symboler';

const ll = (lat: number, lng: number) => ({ lat, lng });
const RUTA = { x: 48, top: 100, b: 499, h: 300 };
const RUNDA = { id: 'e1', objekt_id: 'o1', objekt_typ: 'slutavverkning', status: 'klar', utford_av: 'Martin', startad: '2026-10-12T05:30:00Z', klar: '2026-10-12T11:30:00Z', kommentar: null, vader: null, maskiner: null, skapad: '' } as unknown as Egenkontroll;

async function fake() {
  const lib = await import('pdf-lib');
  const anrop: { metod: string; arg: any; opt: any }[] = [];
  const sida: any = new Proxy({}, { get: (_t, metod: string) => (arg: any, opt: any) => { anrop.push({ metod, arg, opt }); } });
  const font: any = { widthOfTextAtSize: (t: string) => t.length * 4 };
  return { lib, anrop, sida, font };
}
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

describe('symbolerna i PDF:en', () => {
  it.each(['warning', 'landing', 'gate', 'culturestump'])('%s: formen (gruppens) i gruppens färg + glyfen, i vektor', async (typ) => {
    const { lib, sida, anrop } = await fake();
    ritaSymbol(lib, sida, typ, { x: 100, y: 200 }, 10);
    const d = symbolDef(typ);
    const banor = anrop.filter((a) => a.metod === 'drawSvgPath');
    expect(banor.map((b) => b.arg)).toEqual([FORM_PATH[d.form], d.glyf]);
    const fyll = banor[0].opt.color;
    expect([fyll.red, fyll.green, fyll.blue].map((x: number) => +x.toFixed(3))).toEqual(hexRgb(d.farg).map((x) => +x.toFixed(3)));
    expect(banor[0].opt.borderColor).toMatchObject({ red: 1, green: 1, blue: 1 });   // vit kant som på kartan
  });
  it('triangel för Röd (Fara), cirkel för ALLA andra grupper (även Att göra) — samma form som appen', async () => {
    expect(symbolDef('warning').form).toBe('triangel');
    expect(symbolDef('highstump').form).toBe('cirkel');
    expect(symbolDef('felloutside').form).toBe('cirkel');
  });
  it('kartan ritar varje symbol med ritaSymbol (inte den gamla romben)', async () => {
    const { lib, sida, anrop, font } = await fake();
    ritaKarta(lib, sida, { normal: font, fet: font }, RUTA, {
      granser: [[ll(56, 15), ll(56.002, 15), ll(56.002, 15.004)]], stammar: [], pinnar: [],
      markeringar: [{ slag: 'symbol', typ: 'warning', plats: ll(56.001, 15.001) }, { slag: 'symbol', typ: 'gate', plats: ll(56.0015, 15.002) }],
    }, (t) => t, {});
    const banor = anrop.filter((a) => a.metod === 'drawSvgPath').map((a) => a.arg);
    expect(banor).toContain(FORM_PATH.triangel);
    expect(banor).toContain(FORM_PATH.cirkel);
    expect(banor.some((b) => typeof b === 'string' && /^M \S+ \S+ L \S+ \S+ L \S+ \S+ L \S+ \S+ Z$/.test(b) && b.split('L').length === 4 && !b.includes('Q'))).toBe(false);   // ingen romb
  });
});

describe('Stenmuren i PDF:en: gruppens färg med kraftig mörk kant', () => {
  it('en mörk (nästan svart) bana ritas FÖRST och är bredare; sedan murens bana i brunt (Kultur) — ingen andra nyans', async () => {
    const { lib, sida, anrop, font } = await fake();
    const lager = { granser: [[ll(56, 15), ll(56.002, 15), ll(56.002, 15.004)]], stammar: [], pinnar: [], markeringar: [{ slag: 'linje' as const, typ: 'stonewall', punkter: [ll(56.0005, 15.0005), ll(56.0015, 15.0025)] }] };
    ritaKarta(lib, sida, { normal: font, fet: font }, RUTA, lager, (t) => t, {});
    const banor = anrop.filter((c) => c.metod === 'drawSvgPath' && c.opt?.borderWidth != null && c.opt?.color == null);
    const mur = banor.find((b) => Math.abs(b.opt.borderColor.red - 0xB5 / 255) < 0.01);
    expect(mur).toBeTruthy();
    const kant = banor.find((b) => b.opt.borderColor.red < 0.1 && b.opt.borderColor.green < 0.1 && b.opt.borderWidth > mur!.opt.borderWidth + 2);
    expect(kant).toBeTruthy();
    expect(banor.indexOf(kant!)).toBe(banor.indexOf(mur!) - 1);   // kanten ligger direkt under muren
  });
});

describe('ytorna i PDF:en', () => {
  const ring = [ll(56.0005, 15.0005), ll(56.0005, 15.0025), ll(56.0015, 15.0025), ll(56.0015, 15.0005)];
  it('en förbjuden yta (Hänsyn) snedstreckas i gruppens färg; Blött (RISA) är heldragen utan streck', async () => {
    const a = await fake(); const b = await fake();
    const lager = (typ: string) => ({ granser: [[ll(56, 15), ll(56.002, 15), ll(56.002, 15.004)]], stammar: [], pinnar: [], markeringar: [{ slag: 'zon' as const, typ, punkter: ring }] });
    ritaKarta(a.lib, a.sida, { normal: a.font, fet: a.font }, RUTA, lager('protected'), (t) => t, {});
    ritaKarta(b.lib, b.sida, { normal: b.font, fet: b.font }, RUTA, lager('wet'), (t) => t, {});
    const streck = (x: typeof a) => x.anrop.filter((c) => c.metod === 'drawLine' && c.opt === undefined && c.arg?.opacity === 0.9);
    expect(streck(a).length).toBeGreaterThan(5);
    expect(streck(b)).toHaveLength(0);
    const farg = streck(a)[0].arg.color;
    expect([farg.red, farg.green, farg.blue].map((x: number) => +x.toFixed(3))).toEqual(hexRgb('#30D158').map((x) => +x.toFixed(3)));
  });
  it('snedstrecken klipps mot ytans ring (ingen linje utanför)', async () => {
    const { lib, sida, anrop } = await fake();
    ritaSnedstreck(lib, sida, [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 40 }], '#FF453A');
    const ops = anrop.find((a) => a.metod === 'pushOperators');
    expect(ops).toBeTruthy();
  });
  it('teckenförklaringen visar snedstreck på provet för en förbjuden yta', async () => {
    const { lib, sida, anrop, font } = await fake();
    ritaTeckenforklaring(lib, sida, { normal: font }, 48, 500, 499, [{ nyckel: 'zon:protected', etikett: 'Hänsyn' }], (t: string) => t);
    expect(anrop.filter((c) => c.metod === 'drawLine').length).toBeGreaterThan(2);
  });
});

describe('en hel rapport med symboler och ytor blir ett giltigt PDF och nämner namnen i teckenförklaringen', () => {
  it('Kulturlämning (gammal Kulturstubbe), Grind, Jakttorn och Hänsyn', async () => {
    const indata: RapportIndata = {
      objektNamn: 'Aramo', voNummer: '1', runda: RUNDA, punkter: [], observationer: [], foton: [], provytor: [], platser: {},
      traktgrans: [[ll(56, 15), ll(56.002, 15), ll(56.002, 15.004), ll(56, 15.004)]], stammar: [], antalStammar: null, hyttspar: [], areal: 4.8,
      markeringar: [
        { slag: 'symbol', typ: 'culturestump', plats: ll(56.001, 15.001) },
        { slag: 'symbol', typ: 'gate', plats: ll(56.0012, 15.002) },
        { slag: 'symbol', typ: 'huntingtower', plats: ll(56.0014, 15.003) },
        { slag: 'zon', typ: 'protected', punkter: [ll(56.0005, 15.0005), ll(56.0005, 15.0025), ll(56.0015, 15.0025)] },
      ],
    };
    const pdf = await skapaRapportPdf(byggRapport(indata));
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const { text } = await extractText(doc, { mergePages: false });
    const s1 = (text as string[])[0].replace(/\s+/g, ' ');
    for (const namn of ['Kulturlämning', 'Grind', 'Jakttorn', 'Hänsyn']) expect(s1, namn).toContain(namn);
    expect(s1).not.toContain('Kulturstubbe');
  });
});
