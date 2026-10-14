import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Källkodsvakter för prickarna på kartan: planeringssidan (22 000 rader) går inte att montera i vitest. Beteendet är bevisat i objektKarta.test.ts,
// useObjektPrickar.test.tsx, ObjektLista.karta.test.tsx och ObjektKartaTom.test.tsx; vakterna här larmar om KOPPLINGEN bryts — framför allt att
// maskinläget, /maskin och körvyn (som aldrig öppnar listan) förblir helt orörda.
const page = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const lista = readFileSync(new URL('../components/planering/ObjektLista.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const hook = readFileSync(new URL('./hooks/useObjektPrickar.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('prickarna gäller bara planeringsvyn (objektListaVal) — inte maskinläge, /maskin eller körvy', () => {
  it('kartan tar bara trycken när objektListaVal gäller; hooken får ingen karta och är inaktiv annars', () => {
    expect(page).toContain('const objektKartaTryck = objektListaVal && mapLibreReady && !kartLageIgang;');
    expect(page).toContain('map: objektKartaTryck ? mapInstanceRef.current : null,');
    expect(page).toContain('aktiv: objektKartaTryck && objektListaOppen,');
    expect(page).toContain('prickar: objektKartaTryck && objektListaOppen ? listPrickar : null,');
  });

  it('listan öppnas bara via ställen som själva kollar objektListaVal (annars aldrig öppen i maskinläge/körvy)', () => {
    const anrop = page.split('\n').filter((r) => r.includes('setObjektListaOppen(true)'));
    expect(anrop.length).toBe(3);
    for (const r of anrop) expect(r).toContain('if (objektListaVal) setObjektListaOppen(true)');
  });

  it('listan får prickarna och kartlägets besked; den gamla väljaren (ObjektValjare) får inget av det', () => {
    expect(page).toContain('onPrickar={setListPrickar} kartaTryck={objektKartaTryck} />');
    const i = page.indexOf('<ObjektValjare');
    const valjare = page.slice(i, page.indexOf('/>', i));
    expect(valjare).not.toMatch(/onPrickar|kartaTryck|listPrickar/);
  });

  it('pågår ett kartläge (rita, mät, placera, dockan) tar kartan trycken som förut: ingen prickkarta, listan är det gamla arket med fångsten', () => {
    const i = page.indexOf('const kartLageIgang = ');
    const sats = page.slice(i, page.indexOf(';', i));
    for (const lage of ['isDrawMode', 'isZoneMode', 'isArrowMode', 'measureMode', 'measureAreaMode', 'omradeRitning', 'skotningDrawing', 'hornEditActive', 'larmPlacering', 'risaMarkMode', 'selectedSymbol', 'figur', 'plusRadOppen']) {
      expect(sats).toContain(lage);
    }
  });

  it('långtryck (dockan) öppnas inte medan listan är öppen', () => {
    expect(page).toMatch(/langtryckTillatenRef\.current = [^;]*&& !objektListaOppen;/);
  });

  it('valjObjektUrLista: ett ANNAT objekt markerar valet (ingen kameraåtergång), samma objekt gör det inte (kartan går tillbaka)', () => {
    const i = page.indexOf('const valjObjektUrLista = (obj: any) => {');
    const f = page.slice(i, i + 700);
    const samma = f.indexOf('if (valtObjekt?.id === obj.id) return;');
    const markera = f.indexOf('markeraListVal();');
    expect(samma).toBeGreaterThan(-1);
    expect(markera).toBeGreaterThan(samma);
    expect(f.indexOf('setValtObjekt(obj);')).toBeGreaterThan(markera);
  });

  it('tomläget (inget objekt valt) renderar kartan med prickar i stället för den svarta ytan — och bara i planeringsvyn (objektListaVal-grenen)', () => {
    expect((page.match(/<ObjektKartaTom /g) || []).length).toBe(1);
    const i = page.indexOf('<ObjektKartaTom ');
    expect(page.lastIndexOf('if (objektListaVal) {', i)).toBeGreaterThan(page.lastIndexOf('// Visa objektväljaren om inget objekt är valt'));
  });
});

describe('hooken och listan', () => {
  it('hooken lägger trycken i infångningsfasen på kartans container, stoppar vidare spridning och tar bort allt vid stängning', () => {
    expect(hook).toContain("behallare?.addEventListener('click', klickFn, true);");
    expect(hook).toContain('e.stopPropagation();');
    expect(hook).toContain("behallare?.removeEventListener('click', klickFn, true);");
    expect(hook).toContain('if (!map || !aktiv) return;');
  });
  it('listan skickar prickar bara när den är öppen, nollställd och objekten + skotning kvar är lästa; null när den stängs', () => {
    expect(lista).toContain('const prickarKlara = oppen && startad && !laddar && skotKvarKlar;');
    expect(lista).toContain('cb(null)');
  });
  it('tryckfångsten över kartan finns bara kvar när kartan inte tar trycken själv — och stänger aldrig listan', () => {
    expect(lista).toContain('{oppen && kanStangas && !kartaTryck && (');
    const i = lista.indexOf('data-testid="objekt-lista-bakgrund"');
    expect(lista.slice(i, lista.indexOf('/>', i))).not.toMatch(/onClick|onStang/);
  });

  it('ett tryck på kartan stänger inte listan: hooken har varken onStang eller kanStangas, och sidan skickar ingen stängning dit', () => {
    expect(hook).not.toMatch(/onStang|kanStangas|stangRef/);
    const i = page.indexOf('useObjektPrickar({');
    const anrop = page.slice(i, page.indexOf('});', i));
    expect(anrop).not.toMatch(/onStang|setObjektListaOppen/);
  });

  it('arket på telefon: halv ↔ hel via plus-arkets regler, och ett halvt ark som dras ned stänger (valjListdetent)', () => {
    expect(lista).toContain("import { PANEL_BREDD_PX, dragHojd, valjListdetent, type Detent } from '@/lib/plusArk';");
    expect(lista).toContain('const nasta = valjListdetent(detent, e.clientY - d.y0, kanStangas);');
    expect(lista).toContain("if (nasta === 'stang') onStang(); else setDetent(nasta);");
    expect(lista).toContain("const draggbar = kartaTryck && lage === 'ark';");
  });
});
