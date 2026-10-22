// Källvakter för "Larmregler: fara utan Sett + Övrigt är inte hänsyn" (Martin 2026-10-22). Sidan monteras inte i tester — här läses koden som kopplar ihop reglerna.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { SYMBOL_LAGER } from '../symbolZoom';
import { ALLA_KLICK_LAGER } from '../klickPrioritet';

const rot = join(__dirname, '..', '..');
const las = (rel: string) => readFileSync(join(rot, rel), 'utf8');
const sida = las('app/planering/page.tsx');
const larm = las('lib/larm/larm.ts');

const filer = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  if (n === 'node_modules' || n === '.next') return [];
  const p = join(dir, n);
  return statSync(p).isDirectory() ? filer(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
});

describe('ingen Sett på fara', () => {
  it('Sett-raden gäller aldrig en Röd (harSettRad stänger ute fara) och stegaLarm bortser från kvittens och sett på en Röd', () => {
    expect(larm).toContain('return !arFara(o) && larmar({ ...o, undantagen: false }, false) && !o.undantagen;');
    expect(larm).toContain('const kvitterad = !fara && arKvitterad(o, inp.kvitt, inp.forareId);');
    expect(larm).toContain('if (inp.state.sett[o.id] && !fara) nyaSett[o.id] = true;');
    expect(larm).toContain('sett: !fara && !!inp.state.sett[o.id]');
  });
  it('en Röd sjunker aldrig av "Sett": rangordningen sänker bara det som fått Sett i passagen', () => {
    expect(larm).toContain('const harSjunkit = (a: Rangbar) => !!a.sett;');
  });
  it('sidan ritar Sett-raden bara ur larm.settRad, och instruktionen väntar på en Röd även i "+"-raden', () => {
    expect(sida).toContain('{korvyActive && larm.settRad && (');
    expect(sida).toContain("arFara: larm.kort?.grupp === 'fara' || larm.fler.some((x) => x.grupp === 'fara')");
  });
  it('larmkortet har ingen Sett-knapp (bara SettRad har den)', () => {
    const kort = las('components/planering/LarmKort.tsx');
    const kortVy = kort.slice(kort.indexOf('export function LarmKortVy'), kort.indexOf('function FlerRad'));
    expect(kortVy).not.toMatch(/larm-sett|onSett|Sett/);
  });
});

describe('Övrigt (Vidas TYP 71) är inte hänsyn', () => {
  it('koden 71 står på EN plats (lib/vidaYtaTyp) — ingen annan fil jämför TYP mot 71', () => {
    const traffar = filer(join(rot, 'lib')).concat(filer(join(rot, 'app')), filer(join(rot, 'components')))
      .filter((f) => !/\.test\.|__fixtures__|\.fixtur\.|vidaYtaTyp\.ts$|malbilder\.ts$|\.svg/.test(f))
      .filter((f) => /\bTYP\b[^\n]{0,40}['"]71['"]|['"]71['"][^\n]{0,40}\bTYP\b/.test(readFileSync(f, 'utf8')));
    expect(traffar.map((f) => f.replace(rot + '/', ''))).toEqual([]);
  });
  it('hänsynslagen använder HANSYNSYTA_FILTER (aldrig bara _typ), Övrigt har egna lager med streckad kant utan snedstreckning', () => {
    for (const l of ['trakt-hansyn-fill', 'trakt-hansyn-hatch', 'trakt-hansyn-line', 'trakt-hansyn-label']) {
      const rad = sida.split('\n').find((r) => r.includes(`id: '${l}'`))!;
      expect(rad, l).toMatch(/filter: (fokusEtikettFilter\()?HANSYNSYTA_FILTER as any/);   // etikettlagret lindar filtret med fokusEtikettFilter (Fokus på trakten)
    }
    for (const l of ['trakt-ovrigt-fill', 'trakt-ovrigt-line', 'trakt-ovrigt-label']) {
      const rad = sida.split('\n').find((r) => r.includes(`id: '${l}'`))!;
      expect(rad, l).toMatch(/filter: (fokusEtikettFilter\()?OVRIGT_YTA_FILTER as any/);
    }
    const ovr = sida.split('\n').filter((r) => r.includes("id: 'trakt-ovrigt-")).join('\n');
    expect(ovr).toContain("'line-dasharray': [...OVRIGT_YTA_STIL.streck]");
    expect(ovr).not.toMatch(/fill-pattern|snedstreck|FARG_NATUR/);
    expect(sida).not.toContain("id: 'trakt-ovrigt-hatch'");
  });
  it('Övrigt-lagren följer lagerknappen, går att trycka på och är klippta på zoom som övriga etiketter', () => {
    for (const l of ['trakt-ovrigt-fill', 'trakt-ovrigt-line', 'trakt-ovrigt-label']) expect(sida).toContain(`set('${l}', !!overlays.hansyn);`);
    expect(ALLA_KLICK_LAGER).toContain('trakt-ovrigt-fill');
    expect(SYMBOL_LAGER).toContain('trakt-ovrigt-label');
    expect(sida).toContain("'trakt-raa-line', 'trakt-hansyn-fill', 'trakt-ovrigt-fill',");
  });
  it('hänsynsräkningarna i sidan är hänsyn (arHansynsyta / kategori hansyn), numreringen räknar Vidas löpnummer även för Övrigt', () => {
    expect(sida).toContain('if (arHansynsyta(p) && aK) { hansynA');
    expect(sida).toContain("return k === 'hansyn' || k === 'ovrigt';");
    expect(sida).toContain("typer.add(arOvrigYta(f?.properties) ? 'ovrigtyta' : t);");   // lagerknappen "Hänsynsytor" visas inte för en trakt med bara Övrigt
    expect(sida).toContain("hansynsytor: (traktGeo?.features || []).filter((f: any) => klassaTraktFeature(f?.properties || {}).kategori === 'hansyn').length,");
    expect(sida).toContain("typ: arOvrigt ? 'ovrigt' : 'hansyn', typLabel: arOvrigt ? 'Övrigt' : 'Hänsynsyta'");
  });
  it('Övrigt larmar inte: vidaSlag släpper bara hänsynsytor (arHansynsyta)', () => {
    expect(las('lib/larm/objekt.ts')).toContain("if (yta && arHansynsyta(props)) return 'hansynsyta';");
  });
});
