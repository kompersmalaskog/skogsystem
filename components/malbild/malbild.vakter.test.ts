// Källvakter för kopplingen i sidan (app/planering/page.tsx är för stor för en renderingstest): målbilderna ska sitta på varje kort, i larmet, i skotarläget och i
// teckenförklaringen — och sidan får inte ha en egen kopia av en text eller en bild (lib/malbilder.test.ts vaktar själva innehållet).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rot = path.resolve(__dirname, '..', '..');
const las = (f: string) => fs.readFileSync(path.join(rot, f), 'utf8');
const sida = las('app/planering/page.tsx');

describe('målbilderna är kopplade i sidan', () => {
  it('varje KartKort i sidan får sin målbildsRAD (egna markeringar och Vidas objekt) — aldrig den utfällda sektionen', () => {
    const kort = sida.match(/<KartKort\b/g) ?? [];
    const med = sida.match(/<KartKort\b[\s\S]{0,6000}?\n\s*malbild=\{<MalbildRad /g) ?? [];
    expect(sida).not.toMatch(/<MalbildSektion\b/);
    expect(kort.length).toBe(2);
    expect(med.length).toBe(2);
  });
  it('kortet på kartan tar nyckeln ur symbolens, ytans eller linjens typ — aldrig ur ett namn', () => {
    expect(sida).toMatch(/malbildNyckel\('symbol', marker\.type\)/);
    expect(sida).toMatch(/malbildNyckel\('yta', marker\.zoneType\)/);
    expect(sida).toMatch(/malbildNyckel\('linje', marker\.lineType\)/);
    expect(sida).toMatch(/malbildNyckel\(bet\.ikon\.kalla, bet\.ikon\.typ\)/);
  });
  it('larmkortet får roll och Visa; bladet har "✓ Sett" bara för larmet som väntar på kvittering; grindkortet räknar med bildens höjd', () => {
    expect(sida).toMatch(/<LarmKortVy[\s\S]{0,700}roll=\{malbildRoll\}[\s\S]{0,100}onVisaMalbild=\{setLarmMalbildOppen\}/);
    expect(sida).toMatch(/<MalbildBlad[\s\S]{0,900}onSett=\{larm\.settRad && larm\.kort && larm\.settRad\.id === larm\.kort\.id/);
    expect(sida).toMatch(/larmMalbild\(larm\.kort\) \? LARM_MALBILD_RAD_PX : 0/);
  });
  it('"Vad betyder kartan" får maskintypen', () => {
    expect(sida).toMatch(/karta: \{ markeringar: markers, vida: vidaSlagIFeatures\(traktGeo\?\.features\), roll: malbildRoll \}/);
  });
  it('skotarläget: avläggets målbild vid första lasset, utan att röra lossningskortet', () => {
    expect(sida).toMatch(/<AvlaggForstaLasset[\s\S]{0,900}forstaLasset=\{[^}]*arForstaLassetPaTrakten\(sl\.lass, '', valtObjekt\.id, skotarMaskinId\)\}[\s\S]{0,120}position=\{currentPosition\}[\s\S]{0,60}avlagg=\{sl\.avlagg\}/);
    // aldrig samtidigt som lossningskortet eller något annat nertill: raden får bara visas när allt det är borta
    expect(sida).toMatch(/<AvlaggForstaLasset[\s\S]{0,500}kortVisas=\{!!sl\.kort\}[\s\S]{0,60}ledigt=\{!sl\.kort && !sl\.andra && !sl\.nyttAvlagg && !skotarKvarOppet && !skotarFardigOppet && !skotarVantarOppet\}/);
    // samma zon som lossningsupptäckten
    expect(las('components/malbild/AvlaggForstaLasset.tsx')).toMatch(/AVLAGG as LOSSNINGSZON, traffaAvlagg[^\n]*skotarLass\/avlagg/);
    expect(las('components/planering/skotar/LossningsKort.tsx')).not.toMatch(/malbild/i);
  });
  it('maskintypen är enhetens maskin först, därefter admins val, därefter tilldelningen', () => {
    expect(sida).toMatch(/const malbildRoll: Maskinroll \| null = enhetRoll \?\? korvyForceRoll \?\? minRoll \?\? null;/);
  });
  it('sidan har ingen egen SVG eller målbildstext', () => {
    expect(sida).not.toMatch(/Så ska det se ut|Inte så här|Alla regler/);
  });
  it('källorna bor bara i lib/malbilder.ts: målbildskomponenterna har varken en adress eller ett ämnesnamn av egen', () => {
    const komp = las('components/malbild/Malbild.tsx');
    for (const forbjudet of ['skogsstyrelsen.se', 'trafikverket.se', 'Kulturmiljöer', 'Odlingsspår', 'Hänsynskrävande biotoper', 'Körning i skogsmark', 'Upplag av virke', 'Kolningsanläggningar']) {
      expect(komp, forbjudet).not.toContain(forbjudet);
    }
    expect(komp).toContain("malbildKalla(nyckel, variant)");
    expect(komp).toContain("onVariant={setVariant}");
    expect(las('lib/malbilder.ts')).toContain('export const MALBILD_KALLA');
  });
});
