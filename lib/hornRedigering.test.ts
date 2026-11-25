import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { valjHandtag, HORN_REGLER } from './hornRedigering';

const sida = fs.readFileSync(path.join(process.cwd(), 'app/planering/page.tsx'), 'utf8');

describe('valjHandtag', () => {
  const horn = [{ x: 100, y: 100 }, { x: 160, y: 100 }];
  const mitt = [{ x: 130, y: 100 }, { x: 130, y: 140 }];
  it('inget handtag inom träffytan → null (kartan panorerar)', () => {
    expect(valjHandtag(horn, mitt, 130, 60, HORN_REGLER.traffTouch)).toBeNull();
    expect(valjHandtag(horn, mitt, 300, 300, HORN_REGLER.traffTouch)).toBeNull();
  });
  it('närmast vinner, hörn och mittpunkt jämförs på avståndet', () => {
    expect(valjHandtag(horn, mitt, 104, 100, HORN_REGLER.traffTouch)).toEqual({ typ: 'horn', index: 0 });
    expect(valjHandtag(horn, mitt, 127, 100, HORN_REGLER.traffTouch)).toEqual({ typ: 'mitt', kant: 0 });
    // en mittpunkt 12 px bort slår ett hörn 20 px bort (förut vann alltid hörnet inom 22 px)
    expect(valjHandtag([{ x: 100, y: 100 }], [{ x: 118, y: 100 }], 130, 100, HORN_REGLER.traffTouch)).toEqual({ typ: 'mitt', kant: 0 });
  });
  it('lika avstånd: hörnet', () => {
    expect(valjHandtag([{ x: 100, y: 100 }], [{ x: 120, y: 100 }], 110, 100, HORN_REGLER.traffTouch)).toEqual({ typ: 'horn', index: 0 });
  });
  it('mus har mindre träffyta än finger', () => {
    expect(valjHandtag(horn, [], 100, 116, HORN_REGLER.traffTouch)).toEqual({ typ: 'horn', index: 0 });
    expect(valjHandtag(horn, [], 100, 116, HORN_REGLER.traffMus)).toBeNull();
  });
});

// Källvakter: kopplingen i sidan. De hindrar att de gamla felen kommer tillbaka (touchstart + mousedown, håll-in-för-ta-bort, mittpunktstryck som lägger till hörn, gamla analyspanelen).
describe('Redigera hörn och traktanalys — kopplingen i planeringssidan', () => {
  it('hörnen styrs av Pointer Events via lib/hornRedigering, inte av touchstart + mousedown på canvas', () => {
    expect(sida).toMatch(/kopplaHornRedigering\(map as any,/);
    const a = sida.indexOf('// === "Redigera hörn": pekar-handtag');
    const b = sida.indexOf('}, [hornEditActive, mapLibreReady]);', a);
    const block = sida.slice(a, b);
    expect(block).not.toMatch(/touchstart|mousedown|touchmove|mousemove/);
    expect(block).not.toMatch(/longPress|setTimeout/);   // håll-in-för-att-ta-bort är borta
    expect(sida).not.toMatch(/laggTillHorn\(hornEditRingRef/);   // ett tryck lägger aldrig till ett hörn i sidan; det gör bara draget i lib/hornRedigering
  });
  it('Ångra, Spara och Avbryt står i listen; Ta bort hörn är en knapp vid hörnet', () => {
    expect(sida).toContain("testid: 'hornedit-angra'");
    expect(sida).toContain("testid: 'hornedit-spara'");
    expect(sida).toContain("data-testid=\"hornedit-tabort\"");
    expect(sida).toMatch(/onClick=\{hornTaBort\}/);
  });
  it('Spara skickar kön direkt och kvittot säger sanningen (sparad / väntar på nätet)', () => {
    expect(sida).toMatch(/await skickaVantandeForst\(8000\);/);
    expect(sida).toContain("'Gränsen är sparad på enheten · skickas när nätet finns'");
  });
  it('Justera gräns kopierar ALLA traktdelar, kopplar ihop gemensamma hörn och förenklar (2 m, minst 4 hörn) med dem bevarade, och säger före → efter', () => {
    expect(sida).toMatch(/justeraDelar\(delar\.map/);
    expect(sida).toMatch(/\}\), 2, 4\);/);
    expect(sida).toContain('förenklade ${f.fore} → ${f.efter} hörn');
    expect(sida).toContain('Gränsen förenklad: ${f.fore} → ${f.efter} hörn');
    expect(sida).not.toMatch(/forenklaRing\(/);   // den gamla förenklingen av EN ring är borta ur sidan: den kunde glida isär delar som delar gräns
  });
  it('analysen och väg-kontrollen körs om när GEOMETRIN ändras (flyttat hörn), inte bara när antalet hörn ändras', () => {
    expect((sida.match(/ringAvtryck\(bm\.path \|\| \[\]\)/g) || []).length).toBe(2);
    expect(sida).not.toContain("bmId + ':' + (bm.path?.length || 0)");
  });
  it('den gamla Traktanalys-panelen (bottenpanelen med Kör igen / Stäng) är borta och inget öppnar den', () => {
    expect(sida).not.toMatch(/tractAnalysisOpen|setTractAnalysisOpen/);
    expect(sida).not.toContain('TRAKTANALYS PANEL');
    expect(sida).not.toContain('Analyserar trakten mot register');
    expect(sida).not.toContain('Inga kända restriktioner');
    expect(sida).not.toMatch(/Kör igen/);
    // traktkortets rad är kvar och får länkar, varningar och Försök igen
    expect(sida).toMatch(/<TraktAnalysRad status=\{analysStatus\} kontroller=\{kontroller\} onOppnaLank=\{openExternal\} onForsokIgen=/);
  });

  // Traktdelar som sitter ihop (Martin 2026-11-25): Justera gräns kopierar ALLA delar, delarna redigeras tillsammans, kopiorna ritas som Vidas traktdel.
  it('Justera gräns kopierar alla Vida-delar (en markör per del med fromVidaTd) och tar med en redan justerad kopia som den är', () => {
    const a = sida.indexOf('const justeraGrans = (key: string) => {');
    const block = sida.slice(a, sida.indexOf('// Redigera en boundary-markörs (eget område / traktgräns) nummer.', a));
    expect(block).toContain('traktdelDelarRef.current');
    expect(block).toMatch(/fromVidaTd: d\.partKey/);
    expect(block).toMatch(/last: true/);   // redan justerad kopia: hörnen rörs inte
    expect(block).not.toMatch(/forenklaRing|ringLatLon/);
  });
  it('Redigera hörn tar med ALLA justerade delar och bygger topologin (gemensamma hörn är ett hörn)', () => {
    const a = sida.indexOf('const gransGrupp = (marker: any)');
    const block = sida.slice(a, sida.indexOf('// Avsluta corner-drag.', a));
    expect(block).toMatch(/filter\(\(m: any\) => arGrans\(m\) && m\.fromVidaTd\)/);
    expect(block).toContain('byggTopologi(grupp.map');
    expect(block).toMatch(/setRedigeraGransIdn\(grupp\.map/);
  });
  it('Spara skriver bara de delar vars ring ändrats, och kvittot säger sanningen för flera delar', () => {
    expect(sida).toMatch(/ringAvtryck\(svgPath\) === ringAvtryck\(m\.path \|\| \[\]\)\) continue;/);
    expect(sida).toContain("'Gränserna är sparade på enheten · skickas när nätet finns'");
  });
  it('Radera på en justerad del frågar: bara den här eller alla justerade delar (tillbaka till Vidas)', () => {
    expect(sida).toContain('data-testid="trakt-kort-radera-fraga"');
    expect(sida).toContain('testid="trakt-kort-radera-denna"');
    expect(sida).toContain('testid="trakt-kort-radera-alla"');
    expect(sida).toMatch(/bMarker\?\.fromVidaTd && antalJusterade > 1/);
    expect(sida).toMatch(/const raderaJusterade = \(id: string \| number, alla: boolean\)/);
  });
  it('en egen traktgräns ritas i SAMMA stil som Vidas traktdel (TRAKTGRANS_BREDD, kant och färg) — inte två sorters traktgräns', () => {
    expect(sida).toMatch(/const lw = isBoundary\s*\? \[\.\.\.TRAKTGRANS_BREDD\]/);
    expect(sida).toMatch(/const cwLw = isBoundary\s*\? \[\.\.\.TRAKTGRANS_KANT_BREDD\]/);
    expect(sida).toMatch(/casingColor = isBoundary \? TRAKTGRANS_KANT_FARG/);
  });
});
