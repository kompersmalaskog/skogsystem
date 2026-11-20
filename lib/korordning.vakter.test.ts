// KÖRORDNING — vakter för det som inte får glida (2026-10-25). Beslutet står i CLAUDE.md ("Körordning") och i skiss 50–51:
//   • fast text på kartan: bara siffran och "N m kvar" (de två texterna som körordningen ger) — inget annat nytt
//   • en körd väg blir grå av sig själv, men aldrig i testläget (då sparas ingenting)
//   • de gamla körriktningspilarna tas bort först när planeraren godkänt förslaget, och bara de pilar förslaget bygger på
//   • ingen ny knapp/ruta på skärmen: ingången är en ruta i Rita & mät, resten är kartan
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KOR_SYMBOLLAGER, KOR_SKEN_LAGER, KOR_SIFFRA_LAGER, KOR_KVAR_LAGER, korPunktLager, korSkenLager } from './korordningKarta';
import { SYMBOL_UNDANTAG } from './symbolZoom';
import { arVagKlar } from './kartKlart';

const las = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
const sida = las('app/planering/page.tsx');
const mellan = (s: string, a: string, b: string) => { const i = s.indexOf(a); expect(i, a).toBeGreaterThan(-1); const j = s.indexOf(b, i + a.length); expect(j, b).toBeGreaterThan(-1); return s.slice(i, j); };

describe('lagren', () => {
  it('alla har prefixet line- (med i körvyns och skotarlägets whitelist) och symbollagren klipps inte på zoom', () => {
    for (const l of [korSkenLager('lines-source'), ...korPunktLager()]) expect(l.id.startsWith('line-'), l.id).toBe(true);
    for (const id of KOR_SYMBOLLAGER) expect(SYMBOL_UNDANTAG, id).toContain(id);
  });
  it('fast text: bara siffran och "m kvar"', () => {
    const med = korPunktLager().filter((l) => l.layout?.['text-field']).map((l) => l.id).sort();
    expect(med).toEqual([KOR_KVAR_LAGER, KOR_SIFFRA_LAGER].sort());
    expect(korSkenLager('lines-source').layout?.['text-field']).toBeUndefined();
  });
});

describe('sidan', () => {
  it('väglagren (basväg + stickvägar) bär körordningens uttryck; andra linjer rörs inte', () => {
    const lager = mellan(sida, 'const arVag = isMainRoad || arStickvag(lt.id);', '// === Basväg RISA-delsträcka');
    for (const s of ['korBredd(cwLw)', 'korFarg(', 'KOR_OPACITET', 'KOR_INTE_KLAR', 'korBredd(lw)']) expect(lager, s).toContain(s);
    expect(lager).toContain('arVag ?');
  });
  it('planeringen visar ordningen (siffra, pil) och bara körda vägar grå — status som tjock/sken är körvyns', () => {
    expect(sida).toContain("korEgenskap(korvyActive || korStatus.get(String(m.id)) === 'klar' ? korStatus.get(String(m.id)) : undefined)");
  });
  it('en körd väg sparas bara utanför testläget, och aldrig utan att något täckts', () => {
    const f = mellan(sida, 'Vägen blir grå av sig själv', '// === Maskindator-startsekvens');
    expect(f).toContain('testlageAktivRef.current');
    expect(f).toContain('t.tackt.some(Boolean)');
    expect(f).toContain('saveMarkerToDb(nytt)');
    expect(arVagKlar('2026-10-25T08:00:00Z')).toBe(true);
    expect(arVagKlar(undefined)).toBe(false);
  });
  it('de gamla körriktningspilarna tas bort bara vid Godkänn, och bara de förslaget bygger på', () => {
    expect(sida.match(/deleteMarkerFromDb\(m\.id\)/g)?.length ?? 0).toBeGreaterThan(0);
    const godkann = mellan(sida, 'onGodkann={() => {', '}}\n          />');
    expect(godkann).toContain('fs.pilIdn');
    expect(godkann).toContain('if (!fs) return;');
    // förslaget byggs bara av körriktningspilar (inte fällriktning) och bara när ingen ordning är satt och planeraren inte sagt nej
    expect(sida).toContain("(m.arrowType || 'drivedirection') === 'drivedirection'");
    expect(sida).toContain('rader.length === 0 && !korForslagNej && gamla.length > 0');
  });
  it('Körriktning går inte längre att placera (bara Fällriktning = träd, och Kör upp och backa); befintliga pilar ritas som förut', () => {
    expect(sida).toContain("arrowTypes.filter((t) => t.id === TRAD_TYP || t.id === KORUPP_TYP).map(type => (");
    expect(sida).toContain("{ id: 'drivedirection', name: 'Körriktning', color: LEGEND.vatten },");
  });
  it('ingången är EN ruta i Rita & mät; läget avslutas av avslutaPagaendeLage och vid objektbyte', () => {
    expect(sida).toContain("{ id: 'korordning', titel: 'Körordning', ikon: 'korordning'");
    expect(sida).toContain('setKorLage(false); setKorForslagNej(false); }, [valtObjekt?.id]');
  });
  it('tryck på en väg går via tryckPaVag och sparas via tillampaKor (ingen annan skrivväg)', () => {
    expect(sida).toContain('tillampaKor(tryckPaVag(korVagar, id, ande));');
    expect(sida.match(/medKor\(/g)?.length).toBe(2);   // tillampaKor + körd-vägen
  });
});
