// Källvakter för "ⓘ enkel + påminnelse i ytan" (Martin 2026-10-22). Sidan monteras inte i tester — här läses koden som kopplar ihop reglerna.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { vidaYtaNamn } from './ytaNamn';
import { VIDA_ETIKETT } from './ytaStil';

const rot = join(__dirname, '..');
const las = (rel: string) => readFileSync(join(rot, rel), 'utf8');
const sida = las('app/planering/page.tsx');
const filer = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  if (n === 'node_modules' || n === '.next') return [];
  const p = join(dir, n);
  return statSync(p).isDirectory() ? filer(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
});

describe('samma namn på kartan och i listan', () => {
  it('kartans etikett byggs av VIDA_ETIKETT + LOPNR — brickan är samma ord och nummer', () => {
    expect(sida).toContain("'text-field': ['concat', VIDA_ETIKETT.hansynsyta, ' ', ['to-string', ['coalesce', ['get', 'LOPNR'], '']]]");
    expect(sida).toContain("'text-field': ['concat', VIDA_ETIKETT.ovrigt, ' ', ['to-string', ['coalesce', ['get', 'LOPNR'], '']]]");
    const h = vidaYtaNamn({ _lager: 'L_TILLAGGSYTOR', TYP: '24', LOPNR: 12, FLBESKR: 'x O' })!;
    expect(h.bricka.toLocaleUpperCase('sv-SE')).toBe(`${VIDA_ETIKETT.hansynsyta} 12`);
  });
  it('kartkortet (tryck på ytan) och Om traktens ytkort använder byggTraktKort — samma rubrik som listan och instruktionskortet', () => {
    expect(sida).toContain("kort = { ...kort, kalla: 'Vida', nr: '' };");
    expect(sida).toContain("oppnaYtaKort({ ...byggTraktKort(p), kalla: 'Vida', rader, nr: '' }, nyckel, null);");
    expect(sida).not.toContain('`Hänsynsyta ${');
  });
  it('Vidas " O"/" F" visas aldrig: sidans texter går genom rensaVidaNamn', () => {
    expect(sida).toContain("hBeskr.add(rensaVidaNamn(p.FLBESKR))");
    expect(sida).toContain("const vidaText = foersta(rensaVidaNamn(p.FLBESKR)) || foersta(p.ATGARD) || null;");
    expect(sida).toContain("if (rensaVidaNamn(p.FLBESKR)) rader.push({ text: rensaVidaNamn(p.FLBESKR) });");
    expect(las('lib/traktGeometri.ts')).toContain('vidaYtaNamn(props)');
    expect(las('lib/objekt/filenGav.ts')).toContain('rensaVidaNamn(text)');
  });
  it('ingen annan fil än lib/ytaNamn bygger brickan eller rensar suffixet för hand', () => {
    const traffar = filer(join(rot, 'lib')).concat(filer(join(rot, 'app')), filer(join(rot, 'components')))
      .filter((f) => !/\.test\.|__fixtures__/.test(f) && !/lib\/ytaNamn\.ts$/.test(f))
      .filter((f) => /replace\(\/\\s\+\[OF\]\$\/|\[OF\]\$/.test(readFileSync(f, 'utf8')));
    expect(traffar.map((f) => f.replace(rot + '/', ''))).toEqual([]);
  });
});

describe('ⓘ-panelen för föraren (maskinläget)', () => {
  it('sidan ger enkel-propen bara i maskinläget (instruktionerAktiv) — planeringsläget har det vanliga kortet', () => {
    expect(sida).toContain('enkel: instruktionerAktiv ? (() => {');
    expect(las('components/planering/ObjektInfo.tsx')).toContain('&& enkel ? (\n          <ObjektKortEnkel');
  });
  it('framsteg: stapeln gäller skördaren (skördarspåret), aldrig skotaren; GROT-raden efter maskinens roll', () => {
    expect(sida).toContain("klartHa: maskinSlag === 'skordare' && avverkat?.harSpar ? avverkat.ha : null");
    expect(sida).toContain('grot: grotRad(valtObjekt.grot ?? null, maskinSlag),');
  });
  it('raderna kommer ur Vidas ytor + instruktionerna (ytaRader); ett tryck flyger kartan dit och ytan pulserar kort (larmens puls)', () => {
    expect(sida).toContain('const rader = ytaRader(traktGeo?.features, inst.paTrakten);');
    expect(sida).toContain('const geo = ytaGeo({ nyckel, features: traktGeo?.features, markers: markers as any[], svgToLatLon });');
    expect(sida).toContain('map.fitBounds(geo.bounds, {');
    expect(sida).toContain('padding: ytaKameraPadding(lage,');
    expect(sida).toContain('maxZoom: YTA_MAX_ZOOM, duration: 800,');
    expect(sida).toContain("setYtaPuls({ id: `yta:${nyckel}`, farg: brickaFarg(rad?.grupp ?? 'ovrigt'), geometri: geo.geometri });");
    expect(sida).toContain('setTimeout(() => setYtaPuls(null), YTA_PULS_MS)');
    expect(sida).toContain('const pulsNu = korvyActive ? (larm.puls ?? ytaPuls) : null;');   // larmets puls går före
  });
  it('Vidas traktdirektiv har ingen rad och ingen flygning: ytaRader hoppar över direktivet', () => {
    expect(las('lib/ytaRader.ts')).toContain('o.nyckel !== DIREKTIV_NYCKEL');
  });
  it('bort för föraren: enkel-kortet använder varken faktabrickor, "På trakten" eller "Instruktioner på trakten"-raden', () => {
    const k = las('components/planering/ObjektKortEnkel.tsx');
    const kod = k.split('\n').filter((r) => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');
    expect(kod).not.toMatch(/kort-brickor|kort-pa-trakten|kort-instruktioner|paTrakten|faktaBrickor/);
    expect(kod).toContain('Det här gäller här');
    expect(kod).toContain('Om något händer – ring 112');
    expect(kod).toContain('Kartans färger');
  });
});

describe('påminnelsen i ytan', () => {
  it('sidan visar den på instruktionskortets plats, och larm/lossning går före (blockeradPaminnelse räknar även ett larmkort som redan setts)', () => {
    expect(sida).toContain('blockeradPaminnelse: !!larm.kort || lossningVisas || besokKortSynligt,');
    expect(sida).toContain('<YtaPaminnelseVy paminnelse={inst.paminnelse} top={instruktionTop} onTryck={() => setPaminnelseOppen(inst.paminnelse!.nyckel)} />');
    expect(sida).toContain('utanSett={{ onStang: () => setPaminnelseOppen(null) }}');
    expect(sida).toContain('useEffect(() => { if (!inst.paminnelse) setPaminnelseOppen(null); }, [inst.paminnelse]);');
  });
  it('en ny/ändrad instruktion ger fortfarande det stora kortet med Sett (hash av texten): påminnelsen gäller bara när allt är sett', () => {
    const l = las('lib/instruktioner/instruktioner.ts');
    expect(l).toContain('if (start == null || osedda(o, sett).length > 0 || !o.instruktioner.length) continue;');
    expect(l).toContain('if (ar && nya === 0) {');
  });
  it('inget ljud och ingen Sett i påminnelsen', () => {
    const p = las('components/planering/YtaPaminnelse.tsx');
    const kod = p.split('\n').filter((r) => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');
    expect(kod).not.toMatch(/navigator\.vibrate|new Audio|AudioContext|SettKnapp|onSett/);
  });
});
