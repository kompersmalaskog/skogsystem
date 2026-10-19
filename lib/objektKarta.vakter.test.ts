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
    expect(anrop.length).toBe(2);   // namnpillens tryck och tangent — ⓘ öppnar kortet (ObjektInfo), inte listan; skotarens namn byter aldrig objekt
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

  it('tomläget (inget objekt valt) renderar kartan med prickar i stället för den svarta ytan — i planeringsvyn och maskinläget (anvandObjektListaUtanObjekt-grenen)', () => {
    expect((page.match(/<ObjektKartaTom /g) || []).length).toBe(1);
    const i = page.indexOf('<ObjektKartaTom ');
    expect(page.lastIndexOf('if (anvandObjektListaUtanObjekt({ maskinlage, maskinSom: !!maskinSomParam, korvyActive })) {', i))
      .toBeGreaterThan(page.lastIndexOf('// Visa objektväljaren om inget objekt är valt'));
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

describe('markeringarna göms medan listan är öppen, och symbolerna klipps på zoom — bara i planeringsvyn', () => {
  it('gömningen gäller bara när kartan tar trycken OCH listan är öppen (annars som förut); återställs vid stängning/val', () => {
    const i = page.indexOf('const d = skapaLagerDoljare(map);');
    const effekt = page.slice(page.lastIndexOf('useEffect(() => {', i), page.indexOf('}, [objektKartaTryck, objektListaOppen, mapLibreReady]);', i));
    expect(effekt).toContain('!(objektKartaTryck && objektListaOppen)) return;');
    expect(effekt).toContain("map.on('styledata', d.dolj);");
    expect(page).toContain("return () => { try { map.off('styledata', d.dolj); } catch { /* kartan är borta */ } d.aterstall(); };");
  });

  it('symbolklippet: körvyn och /maskin (objektListaVal=false) får bara en återställning som inte rör något, och inga lyssnare', () => {
    const i = page.indexOf("if (!objektListaVal) { tillampaSymbolZoom(map, null); return; }");
    expect(i).toBeGreaterThan(-1);
    const fore = page.slice(i - 200, i);
    expect(fore).toContain('if (!map || !mapLibreReady) return;');
    expect(page.slice(i, i + 500)).toContain("map.on('styledata', kor);");
    expect(page).toContain('}, [objektListaVal, mapLibreReady, symbolTraktM]);');
  });

  it('klippet bygger på traktens riktiga gräns (traktGeo), inte på en gissning', () => {
    expect(page).toContain('const symbolTraktM = useMemo(() => traktStorlekM(traktGeo as any), [traktGeo]);');
  });

  it('gömningen och klippet finns inte i ObjektKartaTom (där finns inga objektlager) eller i hooken', () => {
    const tom = readFileSync(new URL('../components/planering/ObjektKartaTom.tsx', import.meta.url), 'utf8');
    expect(tom).not.toMatch(/skapaLagerDoljare|tillampaSymbolZoom/);
    expect(hook).not.toMatch(/skapaLagerDoljare|tillampaSymbolZoom/);
  });
});

describe('valt objekt → kartan sveper till trakten (bara planeringsvyn)', () => {
  it('svepet körs av useObjektFlyg med aktiv: objektListaVal — körvyn och /maskin får inget svep', () => {
    expect(page).toContain("import { useObjektFlyg } from '../../lib/hooks/useObjektFlyg'");
    const i = page.indexOf('useObjektFlyg({');
    const anrop = page.slice(i, page.indexOf('});', i));
    expect(anrop).toContain('aktiv: objektListaVal,');
    expect(anrop).toContain('geometriHamtadFor: traktGeoHamtadFor,');
    expect(anrop).toContain('kameraUpptagen: () => startKameraLasRef.current || korvyOppenRef.current,');
  });

  it('val i listan: ingen jump till objektet först (kartan står i översikten och sveper) — men direkt-öppning och maskinläge hoppar som förut', () => {
    expect(page).toContain('svepFranListaRef.current = true;');
    expect(page).toContain('if (!startKameraLasRef.current && !korvyOppenRef.current && !svepFranLista) {');
    // flaggan sätts bara när ett ANNAT objekt valts (samma objekt → återgången, inget svep)
    const i = page.indexOf('const valjObjektUrLista = (obj: any) => {');
    const f = page.slice(i, i + 900);
    expect(f.indexOf('if (valtObjekt?.id === obj.id) return;')).toBeLessThan(f.indexOf('svepFranListaRef.current = true;'));
  });

  it('geometri-effektens fitBounds över ALLA features finns kvar bara utanför planeringsvyn (där svepet tar trakten)', () => {
    expect(page).toContain('!startKameraLasRef.current && !korvyOppenRef.current && !objektListaVal) {');
    expect(page).not.toMatch(/Number\.isFinite\(minLng\) && !startKameraLasRef\.current && !korvyOppenRef\.current\) \{/);
  });

  it('flaggan förbrukas högst upp i centreringen (kan inte fastna efter ett objekt utan koordinat)', () => {
    const i = page.indexOf('const centreraPaObjekt = (obj: any) => {');
    const f = page.slice(i, i + 600);
    expect(f.indexOf('svepFranListaRef.current = false;')).toBeGreaterThan(-1);
    expect(f.indexOf('svepFranListaRef.current = false;')).toBeLessThan(f.indexOf('const cc = objektKartCenter(obj);'));
  });
});
