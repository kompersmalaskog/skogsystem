// @vitest-environment jsdom
// Målbilderna i appen: riktig DOM-rendering av sektionen, bladet, regelsidan, den lilla bilden i larmkortet, kortet på kartan, "Vad betyder kartan" och avläggets första lass.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvlaggForstaLasset } from './AvlaggForstaLasset';
import { MalbildBlad, MalbildLista, MalbildLiten, MalbildRad, MalbildSektion } from './Malbild';
import { KartKort, type KartKortProps } from '@/components/planering/KartKort';
import { LarmKortVy } from '@/components/planering/LarmKort';
import VadBetyderKartan from '@/components/planering/VadBetyderKartan';
import { MALBILDER, MALBILD_ORDNING, malbildInnehall } from '@/lib/malbilder';
import { MALBILD_AVLAGG_SETT_NYCKEL, arForstaLassetPaTrakten } from '@/lib/malbildSett';
import type { LarmKort } from '@/lib/larm/larm';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let ruta: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; document.body.innerHTML = ''; localStorage.clear(); });
beforeEach(() => { localStorage.clear(); });
const montera = (el: React.ReactElement) => { ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta); act(() => { rot!.render(el); }); };
const uppdatera = (el: React.ReactElement) => { act(() => { rot!.render(el); }); };
/** Allt i dokumentet — bladet och regelsidan ligger i body, inte i rutan. */
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
/** innerHTML skriver om <rect/> till <rect></rect>: jämför bilder i den form webbläsaren ger. */
const norm = (svg: string) => { const d = document.createElement('div'); d.innerHTML = svg; return d.innerHTML; };
const klick = (el: Element | null) => { expect(el).not.toBeNull(); act(() => { (el as HTMLElement).click(); }); };

describe('MalbildSektion — varje sort visar sin bild, sina rader och sin felbild', () => {
  for (const nyckel of MALBILD_ORDNING) {
    it(MALBILDER[nyckel].namn, () => {
      montera(<MalbildSektion nyckel={nyckel} roll="skordare" />);
      const i = malbildInnehall(nyckel, 'skordare')!;
      expect(q('malbild')!.dataset.malbild).toBe(nyckel);
      expect(q('malbild-bild')!.innerHTML).toBe(norm(i.bild));
      expect(q('malbild-bild')!.querySelector('svg')!.getAttribute('aria-label')).toBeTruthy();
      expect(qa('malbild-rad').map((r) => r.textContent)).toEqual([...i.rader]);
      expect(q('malbild-fel-bild')!.innerHTML).toBe(norm(i.fel.bild));
      expect(q('malbild-fel-text')!.textContent).toBe(i.fel.text);
      expect(q('malbild')!.textContent).toContain('Så ska det se ut');
      expect(q('malbild-fel')!.textContent).toContain('Inte så här');
      // "Alla regler ›" bara för sorter som har en regelsida
      expect(!!q('malbild-alla-regler')).toBe(!!MALBILDER[nyckel].regler);
      // sort-växeln: bara Kulturlämning har varianter (standard + Kolbotten)
      expect(document.querySelectorAll('[data-testid^="malbild-variant"]').length).toBe(MALBILDER[nyckel].varianter ? 2 : 0);
    });
  }
  it('inga bilder hämtas utifrån: ingen <img>, inga externa adresser i det som ritas', () => {
    montera(<MalbildSektion nyckel="avlagg" roll="skotare" />);
    expect(document.querySelectorAll('img').length).toBe(0);
    expect(document.body.innerHTML).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });
  it('en sort utan målbild (eller ingen nyckel) ger ingen sektion alls', () => {
    montera(<MalbildSektion nyckel={null} roll="skordare" />);
    expect(q('malbild')).toBeNull();
    act(() => { rot!.render(<MalbildSektion nyckel="finns-inte" roll="skordare" />); });
    expect(q('malbild')).toBeNull();
    expect(ruta!.textContent).toBe('');
  });
  it('Blött: skördaren och skotaren får var sin bild, sina rader och sin felbild', () => {
    montera(<MalbildSektion nyckel="blott" roll="skordare" />);
    const skord = { rader: qa('malbild-rad').map((r) => r.textContent), fel: q('malbild-fel-text')!.textContent, bild: q('malbild-bild')!.innerHTML };
    expect(q('malbild')!.dataset.roll).toBe('skordare');
    act(() => { rot!.render(<MalbildSektion nyckel="blott" roll="skotare" />); });
    expect(q('malbild')!.dataset.roll).toBe('skotare');
    expect(qa('malbild-rad').map((r) => r.textContent)).not.toEqual(skord.rader);
    expect(qa('malbild-rad')[0].textContent).toMatch(/risa direkt/);
    expect(q('malbild-fel-text')!.textContent).not.toBe(skord.fel);
    expect(q('malbild-fel-text')!.textContent).toMatch(/Körde vidare/);
    expect(q('malbild-bild')!.innerHTML).not.toBe(skord.bild);
    expect(skord.rader[0]).toMatch(/risbädd/);
  });
  it('Kulturlämning: Kolbotten byter bild, rader och felbild med en växel; standard kommer först', () => {
    montera(<MalbildSektion nyckel="kulturlamning" roll="skordare" />);
    const standard = { rader: qa('malbild-rad').map((r) => r.textContent), fel: q('malbild-fel-text')!.textContent, bild: q('malbild-bild')!.innerHTML };
    expect(q('malbild-variant-standard')!.getAttribute('aria-pressed')).toBe('true');
    klick(q('malbild-variant-kolbotten'));
    expect(q('malbild')!.dataset.variant).toBe('kolbotten');
    expect(q('malbild-variant-kolbotten')!.getAttribute('aria-pressed')).toBe('true');
    expect(qa('malbild-rad').map((r) => r.textContent)).toEqual([...MALBILDER.kulturlamning.varianter![0].innehall.rader]);
    expect(q('malbild-fel-text')!.textContent).toBe(MALBILDER.kulturlamning.varianter![0].innehall.fel.text);
    expect(q('malbild-bild')!.innerHTML).not.toBe(standard.bild);
    klick(q('malbild-variant-standard'));
    expect(qa('malbild-rad').map((r) => r.textContent)).toEqual(standard.rader);
  });
  it('växelns knappar är minst 44 px höga och rader och knappar har träffyta', () => {
    montera(<MalbildSektion nyckel="kulturlamning" roll="skordare" />);
    expect(parseInt(q('malbild-variant-kolbotten')!.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
  });
});

describe('Alla regler ›', () => {
  it('Avlägg: egen sida med tillbaka-pil, bilden, grupperna, kraftledningsrutorna och källan; tillbaka stänger den', () => {
    montera(<MalbildSektion nyckel="avlagg" roll="skotare" />);
    expect(q('malbild-regler')).toBeNull();
    klick(q('malbild-alla-regler'));
    const sida = q('malbild-regler')!;
    expect(sida.parentElement).toBe(document.body);   // i body, inte i kortet (kortets transform gör fixed relativt kortet)
    expect(q('malbild-regler-titel')!.textContent).toBe('Avlägg – alla regler');
    expect(sida.querySelector('svg')).not.toBeNull();
    expect(qa('malbild-regler-grupp').map((g) => g.firstElementChild!.textContent)).toEqual(['Traven', 'Till vägkanten', 'Inte här', 'Efteråt']);
    expect(qa('malbild-regler-rutor')).toHaveLength(1);
    expect(q('malbild-regler-rutor')!.textContent).toContain('6 m');
    expect(sida.textContent).toContain('Allmän väg 60–80 km/h');
    expect(sida.textContent).toContain('Trafikverket, Skogforsk');
    klick(q('malbild-regler-tillbaka'));
    expect(q('malbild-regler')).toBeNull();
    expect(q('malbild')).not.toBeNull();   // kortet finns kvar under
  });
  it('Blött: varningen överst och de fyra grupperna; samma sida för skördare och skotare', () => {
    for (const roll of ['skordare', 'skotare'] as const) {
      montera(<MalbildSektion nyckel="blott" roll={roll} />);
      klick(q('malbild-alla-regler'));
      expect(q('malbild-regler-varning')!.textContent).toContain('Laga inte spår nära vatten själv');
      expect(qa('malbild-regler-grupp').map((g) => g.firstElementChild!.textContent)).toEqual(['Risa och kör', 'Diken', 'Vatten', 'Allvarlig körskada']);
      expect(q('malbild-regler-titel')!.textContent).toBe('Blött – alla regler');
      act(() => { rot?.unmount(); }); ruta?.remove(); document.body.innerHTML = '';
    }
  });
  it('en sort utan regelsida har ingen "Alla regler"-knapp', () => {
    montera(<MalbildSektion nyckel="stenmur" roll="skordare" />);
    expect(q('malbild-alla-regler')).toBeNull();
  });
});

describe('KartKort — målbilden är EN rad under kommentaren (aldrig utfälld); sorter utan målbild har ingen rad', () => {
  const props = (p: Partial<KartKortProps> = {}): KartKortProps => ({
    ikon: <span>i</span>, namn: 'Stenmur', grupp: 'kultur', larmRegel: 'Larmar tills du kvitterat', mening: 'Stenmur – kör inte över.',
    kommentarer: [{ id: 'k1', text: 'Muren är rasad i södra änden.', forfattare: 'Martin · i går 16:20', vantar: false, kanAndra: false, kanRadera: false }], kanKommentera: false, foton: [], onStang: () => {}, ...p,
  });
  it('med målbild: kommentaren direkt under huvudet, sedan EN rad (miniatyr + "Så ska det se ut ›"), sedan typens delar — ingen utfälld sektion i kortet', () => {
    montera(<KartKort {...props({ malbild: <MalbildRad nyckel="stenmur" roll="skordare" /> })}><div data-testid="del">typens del</div></KartKort>);
    const ordning = Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid'));
    expect(ordning.indexOf('kartkort-mening')).toBeLessThan(ordning.indexOf('kartkort-kommentar'));
    expect(ordning.indexOf('kartkort-kommentar')).toBeLessThan(ordning.indexOf('malbild-rad-kort'));
    expect(ordning.indexOf('malbild-rad-kort')).toBeLessThan(ordning.indexOf('del'));
    const rad = q('malbild-rad-kort')!;
    expect(rad.textContent).toContain('Så ska det se ut');
    expect(rad.textContent).toContain('›');
    expect(rad.querySelector('[data-testid="malbild-miniatyr"] svg')).not.toBeNull();
    // inget utfällt: varken bild, rader eller "Inte så här" i kortet, och inget blad öppet
    expect(q('malbild-bild')).toBeNull();
    expect(qa('malbild-rad')).toHaveLength(0);
    expect(q('kartkort')!.textContent).not.toContain('Inte så här');
    expect(q('malbild-blad')).toBeNull();
  });
  it('tryck på raden öppnar bladet (bild, rader, "Inte så här", Stäng i foten) utan att stänga kortet; Stäng tar tillbaka kortet', () => {
    const stangKort = vi.fn();
    montera(<KartKort {...props({ onStang: stangKort, malbild: <MalbildRad nyckel="stenmur" roll="skordare" /> })} />);
    klick(q('malbild-rad-kort'));
    expect(q('malbild-blad')).not.toBeNull();
    expect(q('malbild-blad-sektion')!.dataset.malbild).toBe('stenmur');
    expect(qa('malbild-rad')).toHaveLength(3);
    expect(q('malbild-fel')).not.toBeNull();
    expect(q('malbild-blad-sett')).toBeNull();   // Sett finns bara när bladet öppnats från ett larm
    klick(q('malbild-blad-fot')!.querySelector('[data-testid="malbild-blad-stang"]'));
    expect(q('malbild-blad')).toBeNull();
    expect(q('kartkort')).not.toBeNull();
    expect(stangKort).not.toHaveBeenCalled();
  });
  it('raden följer maskintypen: skotarens Blött öppnar skotarens bild och rader', () => {
    montera(<KartKort {...props({ namn: 'Blött', grupp: 'blott', malbild: <MalbildRad nyckel="blott" roll="skotare" /> })} />);
    expect(q('malbild-miniatyr')!.innerHTML).toBe(norm(malbildInnehall('blott', 'skotare')!.bild));
    klick(q('malbild-rad-kort'));
    expect(q('malbild-blad-sektion')!.dataset.roll).toBe('skotare');
  });
  it('utan målbild (Fara, Info): ingen rad, ingen rubrik', () => {
    montera(<KartKort {...props({ namn: 'El-ledning', grupp: 'fara', malbild: <MalbildRad nyckel={null} roll="skordare" /> })} />);
    expect(q('malbild-rad-kort')).toBeNull();
    expect(q('kartkort')!.textContent).not.toContain('Så ska det se ut');
  });
});

describe('MalbildBlad och den lilla bilden', () => {
  it('bladet: namn · grupp, hela målbilden, Stäng — och "✓ Sett" bara när bladet fått en sådan', () => {
    const stang = vi.fn(), sett = vi.fn();
    montera(<MalbildBlad nyckel="nyckelbiotop" roll="skordare" onStang={stang} />);
    expect(q('malbild-blad-namn')!.textContent).toBe('Nyckelbiotop · Natur');
    expect(q('malbild-blad-sektion')).not.toBeNull();
    expect(q('malbild-blad-sett')).toBeNull();
    klick(q('malbild-blad-stang'));
    expect(stang).toHaveBeenCalledTimes(1);
    act(() => { rot!.render(<MalbildBlad nyckel="nyckelbiotop" roll="skordare" onStang={stang} onSett={sett} />); });
    klick(q('malbild-blad-sett'));
    expect(sett).toHaveBeenCalledTimes(1);
  });
  it('maskindatorn (1280×800): Sett och Stäng ligger i en fast fot UTANFÖR det som scrollar, så Sett syns utan att scrolla', () => {
    montera(<MalbildBlad nyckel="avlagg" roll="skotare" onStang={() => {}} onSett={() => {}} />);
    const fot = q('malbild-blad-fot')!;
    expect(fot.contains(q('malbild-blad-sett'))).toBe(true);
    expect(fot.contains(q('malbild-blad-stang'))).toBe(true);
    for (let e: HTMLElement | null = fot; e && e !== document.body; e = e.parentElement) expect(e.style.overflowY).not.toBe('auto');
    expect((q('malbild-blad-sektion')!.parentElement as HTMLElement).style.overflowY).toBe('auto');
    expect(fot.parentElement!.lastElementChild).toBe(fot);
  });
  it('bred, låg skärm: bilden bredvid raderna och felbilden i en rad — stilen finns i sektionen och bladet blir bredare', () => {
    montera(<MalbildBlad nyckel="hansyn" roll="skordare" onStang={() => {}} />);
    const css = Array.from(document.querySelectorAll('style')).map((x) => x.textContent).join('\n');
    expect(css).toContain('@media (min-width: 900px) and (max-height: 900px)');
    expect(css).toMatch(/\.mb-sektion\{display:grid!important;grid-template-columns:/);
    expect(css).toMatch(/\.mb-ark\{max-width:880px!important\}/);
    // Windows-skalning 125 % (1024×640): tätare nivå så bilden och "Inte så här" syns över vikningen
    expect(css).toContain('@media (min-width: 900px) and (max-height: 700px)');
    expect(css).toMatch(/\.mb-sektion\{grid-template-columns:minmax\(0,min\(300px,43%\)\) minmax\(0,1fr\)!important/);
    expect(css).toMatch(/\.mb-rader>li\{min-height:\d+px!important/);
    // sortväljaren (Kulturlämning/Kolbotten) står på samma rad som etiketten på låga skärmar, inte ovanför bilden
    expect(css).toMatch(/\.mb-huvud\{flex-direction:row!important/);
    expect(css).toMatch(/\.mb-val\{flex-wrap:nowrap!important\}/);
    expect(css).toMatch(/\.mb-fel\{grid-template-columns:140px minmax\(0,1fr\)!important\}/);
    expect(q('malbild-bild')!.parentElement!.className).toBe('mb-bild');
    expect(q('malbild-rader')!.className).toBe('mb-rader');
    expect(q('malbild-blad-sektion')!.querySelector('.mb-huvud')).not.toBeNull();
    expect(q('malbild-fel')!.className).toBe('mb-fel');
    expect(q('malbild-blad')!.querySelector('.mb-ark')).not.toBeNull();
  });
  it('bladet för en sort som inte finns visar ingenting', () => {
    montera(<MalbildBlad nyckel="finns-inte" onStang={() => {}} />);
    expect(q('malbild-blad')).toBeNull();
  });
  it('den lilla bilden: bild + "Så ska det se ut" + Visa som skickar sorten; ingenting för en sort utan målbild', () => {
    const visa = vi.fn();
    montera(<MalbildLiten nyckel="hansyn" roll="skordare" onVisa={visa} />);
    expect(q('larm-malbild-bild')!.querySelector('svg')).not.toBeNull();
    expect(q('larm-malbild')!.textContent).toContain('Så ska det se ut');
    klick(q('larm-malbild-visa'));
    expect(visa).toHaveBeenCalledWith('hansyn');
    act(() => { rot!.render(<MalbildLiten nyckel={null} onVisa={visa} />); });
    expect(q('larm-malbild')).toBeNull();
  });
  it('"Alla målbilder": alla tretton i ordning, tryck öppnar den sorten (också de som appen ritar själv)', () => {
    const visa = vi.fn();
    montera(<MalbildLista onVisa={visa} />);
    expect(Array.from(document.querySelectorAll('[data-testid^="malbild-lista-"]')).map((e) => e.getAttribute('data-testid'))).toEqual(MALBILD_ORDNING.map((n) => `malbild-lista-${n}`));
    klick(q('malbild-lista-kantzon'));
    klick(q('malbild-lista-vattenskydd'));
    expect(visa.mock.calls.map((c) => c[0])).toEqual(['kantzon', 'vattenskydd']);
  });
});

describe('LarmKortVy — den lilla bilden första gången', () => {
  const kort = (p: Partial<LarmKort> = {}): LarmKort => ({
    id: '1', kalla: 'yta', typ: 'protected', grupp: 'natur', farg: '#30D158', namn: 'Hänsyn', text: 'Du är inne i ytan', avstandM: null, bearing: null, pulserar: false, forbjuden: true, okvitterad: true, ...p,
  });
  it('okvitterat och med målbild: liten bild + Visa; Visa skickar sorten', () => {
    const visa = vi.fn();
    montera(<LarmKortVy kort={kort()} riktning={null} top="0px" roll="skordare" onVisaMalbild={visa} />);
    expect(q('larm-malbild')!.dataset.malbild).toBe('hansyn');
    klick(q('larm-malbild-visa'));
    expect(visa).toHaveBeenCalledWith('hansyn');
    expect(q('larm-kort')!.contains(q('larm-malbild'))).toBe(true);   // i SAMMA kort, ingen andra ruta
  });
  it('kvitterat: ingen bild', () => {
    montera(<LarmKortVy kort={kort({ okvitterad: false })} riktning={null} top="0px" onVisaMalbild={() => {}} />);
    expect(q('larm-malbild')).toBeNull();
  });
  it('Fara (ingen målbild): ingen bild, även okvitterad', () => {
    montera(<LarmKortVy kort={kort({ kalla: 'symbol', typ: 'powerline', grupp: 'fara', namn: 'El-ledning', forbjuden: false })} riktning={null} top="0px" onVisaMalbild={() => {}} />);
    expect(q('larm-malbild')).toBeNull();
  });
  it('utan hanterare visas ingen bild', () => {
    montera(<LarmKortVy kort={kort()} riktning={null} top="0px" />);
    expect(q('larm-malbild')).toBeNull();
  });
  it('Blött i skotarläget: skotarens bild; i skördarläget skördarens', () => {
    montera(<LarmKortVy kort={kort({ kalla: 'symbol', typ: 'wet', grupp: 'blott', farg: '#0A84FF', namn: 'Fuktig mark', forbjuden: false })} riktning={null} top="0px" roll="skotare" onVisaMalbild={() => {}} />);
    expect(q('larm-malbild-bild')!.innerHTML).toBe(norm(malbildInnehall('blott', 'skotare')!.bild));
    act(() => { rot!.render(<LarmKortVy kort={kort({ kalla: 'symbol', typ: 'wet', grupp: 'blott', farg: '#0A84FF', namn: 'Fuktig mark', forbjuden: false })} riktning={null} top="0px" roll="skordare" onVisaMalbild={() => {}} />); });
    expect(q('larm-malbild-bild')!.innerHTML).toBe(norm(malbildInnehall('blott', 'skordare')!.bild));
  });
});

describe('Vad betyder kartan — tryck på en rad öppnar målbilden', () => {
  const visa = (markeringar: any[], vida: any[] = [], roll: 'skordare' | 'skotare' | null = null) =>
    montera(<VadBetyderKartan objektNamn="Skälviken" markeringar={markeringar} vida={vida} roll={roll} onTillbaka={() => {}} onStang={() => {}} />);
  it('en rad med målbild är en knapp med ›; tryck öppnar bladet med rätt sort', () => {
    visa([{ isMarker: true, type: 'eternitytree' }, { isZone: true, zoneType: 'protected' }, { isLine: true, lineType: 'stonewall' }]);
    for (const [rad, sort] of [['symbol:eternitytree', 'evighetstrad'], ['yta:protected', 'hansyn'], ['linje:stonewall', 'stenmur']] as const) {
      const r = q(`teckenforklaring-rad-${rad}`)!;
      expect(r.tagName, rad).toBe('BUTTON');
      expect(r.dataset.malbild).toBe(sort);
      klick(r);
      expect(q('malbild-blad')).not.toBeNull();
      expect(q('malbild-blad-sektion')!.dataset.malbild).toBe(sort);
      klick(q('malbild-blad-stang'));
      expect(q('malbild-blad')).toBeNull();
    }
  });
  it('Vidas hänsynsyta och nyckelbiotop når sina målbilder', () => {
    visa([], ['hansynsyta', 'nyckelbiotop']);
    klick(q('teckenforklaring-rad-yta:protected'));
    expect(q('malbild-blad-sektion')!.dataset.malbild).toBe('hansyn');
    klick(q('malbild-blad-stang'));
    klick(q('teckenforklaring-rad-vida:nyckelbiotop'));
    expect(q('malbild-blad-sektion')!.dataset.malbild).toBe('nyckelbiotop');
  });
  it('en rad utan målbild (Fara) är ingen knapp och har ingen ›', () => {
    visa([{ isMarker: true, type: 'powerline' }, { isMarker: true, type: 'gate' }]);
    for (const rad of ['symbol:powerline', 'symbol:gate']) {
      const r = q(`teckenforklaring-rad-${rad}`)!;
      expect(r.tagName, rad).toBe('DIV');
      expect(r.textContent).not.toContain('›');
      klick(r);
      expect(q('malbild-blad')).toBeNull();
    }
  });
  it('"Alla målbilder" finns även när trakten är tom, och öppnar t.ex. Kantzon', () => {
    visa([]);
    expect(q('teckenforklaring-tom')).not.toBeNull();
    expect(qa('malbild-lista')).toHaveLength(1);
    klick(q('malbild-lista-kantzon'));
    expect(q('malbild-blad-namn')!.textContent).toBe('Kantzon mot vatten · Blött');
  });
  it('roll skotare: Blött öppnas med skotarens version', () => {
    visa([{ isMarker: true, type: 'wet' }], [], 'skotare');
    klick(q('teckenforklaring-rad-symbol:wet'));
    expect(q('malbild-blad-sektion')!.dataset.roll).toBe('skotare');
    expect(q('malbild-fel-text')!.textContent).toMatch(/Körde vidare/);
  });
});

describe('AvlaggForstaLasset — FÖRE första lossningen, när maskinen kommer in i avläggets zon; aldrig samtidigt som lossningskortet', () => {
  type P = React.ComponentProps<typeof AvlaggForstaLasset>;
  const AVL = [{ id: 'vida:01-1', nummer: '01-1', kalla: 'vida' as const, lat: 57.0, lng: 15.0 }];
  const PA = { lat: 57.0, lon: 15.0 };                 // på avlägget
  const NARA = { lat: 57.0 + 45 / 111_320, lon: 15.0 };   // 45 m bort: inne i zonen (50 m)
  const UTANFOR = { lat: 57.0 + 75 / 111_320, lon: 15.0 };   // 75 m bort: utanför även med marginal
  const rad = (p: Partial<P> = {}) => <AvlaggForstaLasset objektId="o1" kortVisas={false} ledigt forstaLasset position={PA} avlagg={AVL} {...p} />;
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T10:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });
  const tid = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  it('maskinen kommer in i zonen på trakten utan lass: raden syns; Visa öppnar avläggets målbild och förbrukar den på trakten', () => {
    montera(rad({ position: UTANFOR }));
    expect(q('avlagg-forsta-lasset')).toBeNull();
    uppdatera(rad({ position: NARA }));
    expect(q('avlagg-forsta-lasset')).not.toBeNull();
    klick(q('larm-malbild-visa'));
    expect(q('malbild-blad-sektion')!.dataset.malbild).toBe('avlagg');
    expect(q('avlagg-forsta-lasset')).toBeNull();
    expect(JSON.parse(localStorage.getItem(MALBILD_AVLAGG_SETT_NYCKEL)!)).toEqual(['o1']);
    uppdatera(rad({ position: PA }));
    expect(q('avlagg-forsta-lasset')).toBeNull();
  });
  it('lossningskortet vinner alltid platsen: kommer kortet försvinner raden, och första kortet förbrukar målbilden på trakten (kommer inte tillbaka)', () => {
    montera(rad());
    expect(q('avlagg-forsta-lasset')).not.toBeNull();
    uppdatera(rad({ kortVisas: true, ledigt: false, forstaLasset: false }));   // efter 3 min stilla: lossningskortet (och lasset finns nu)
    expect(q('avlagg-forsta-lasset')).toBeNull();
    expect(JSON.parse(localStorage.getItem(MALBILD_AVLAGG_SETT_NYCKEL)!)).toEqual(['o1']);
    uppdatera(rad({ kortVisas: false, ledigt: true, forstaLasset: true }));   // även om villkoren skulle gälla igen
    expect(q('avlagg-forsta-lasset')).toBeNull();
    act(() => { rot!.unmount(); }); ruta!.remove();
    montera(rad());   // omladdning läser minnet
    expect(q('avlagg-forsta-lasset')).toBeNull();
  });
  it('aldrig samtidigt som något annat nertill (Ändra, nytt avlägg, ark: ledigt=false) — och kommer när det är borta om maskinen fortfarande är i zonen', () => {
    montera(rad({ ledigt: false }));
    expect(q('avlagg-forsta-lasset')).toBeNull();
    uppdatera(rad());
    expect(q('avlagg-forsta-lasset')).not.toBeNull();
    uppdatera(rad({ ledigt: false }));
    expect(q('avlagg-forsta-lasset')).toBeNull();
  });
  it('inte första lasset (maskinen har redan ett lass på trakten) ger aldrig någon rad', () => {
    montera(rad({ forstaLasset: false }));
    expect(q('avlagg-forsta-lasset')).toBeNull();
    expect(localStorage.getItem(MALBILD_AVLAGG_SETT_NYCKEL)).toBeNull();
  });
  it('lämnar maskinen zonen utan att lossa göms raden — och kommer tillbaka nästa gång den kör in (inte förbrukad)', () => {
    montera(rad());
    expect(q('avlagg-forsta-lasset')).not.toBeNull();
    uppdatera(rad({ position: UTANFOR }));
    expect(q('avlagg-forsta-lasset')).toBeNull();
    expect(localStorage.getItem(MALBILD_AVLAGG_SETT_NYCKEL)).toBeNull();
    uppdatera(rad({ position: NARA }));
    expect(q('avlagg-forsta-lasset')).not.toBeNull();
  });
  it('lite marginal ut: precis utanför 50 m men innanför 60 m behåller raden som redan visas, men visar den inte först', () => {
    const jUt = { lat: 57.0 + 55 / 111_320, lon: 15.0 };
    montera(rad({ position: jUt }));
    expect(q('avlagg-forsta-lasset')).toBeNull();
    uppdatera(rad({ position: NARA }));
    expect(q('avlagg-forsta-lasset')).not.toBeNull();
    uppdatera(rad({ position: jUt }));
    expect(q('avlagg-forsta-lasset')).not.toBeNull();
  });
  it('bara en färsk fix räknas: blir positionen äldre än 10 s (inga nya fixar) försvinner raden', () => {
    montera(rad());
    expect(q('avlagg-forsta-lasset')).not.toBeNull();
    tid(8_000);
    expect(q('avlagg-forsta-lasset')).not.toBeNull();
    tid(6_000);
    expect(q('avlagg-forsta-lasset')).toBeNull();
    uppdatera(rad({ position: { ...PA } }));   // ny fix
    expect(q('avlagg-forsta-lasset')).not.toBeNull();
  });
  it('✕ förbrukar målbilden på trakten; en annan trakt får sin egen första gång; ingen position ger ingen rad', () => {
    montera(rad());
    klick(q('avlagg-forsta-lasset-stang'));
    expect(q('avlagg-forsta-lasset')).toBeNull();
    expect(JSON.parse(localStorage.getItem(MALBILD_AVLAGG_SETT_NYCKEL)!)).toEqual(['o1']);
    uppdatera(rad({ objektId: 'o2' }));
    expect(q('avlagg-forsta-lasset')).not.toBeNull();
    uppdatera(rad({ objektId: 'o2', position: null }));
    expect(q('avlagg-forsta-lasset')).toBeNull();
  });
  it('ett strukit lass räknas inte som första lass (regeln i arForstaLassetPaTrakten) och inget avlägg i zonen ger ingen rad', () => {
    expect(arForstaLassetPaTrakten([{ id: 'l1', objektId: 'o1', maskinId: 'M', status: 'struket' }], '', 'o1', 'M')).toBe(true);
    expect(arForstaLassetPaTrakten([{ id: 'l1', objektId: 'o1', maskinId: 'M', status: 'bekraftat' }], '', 'o1', 'M')).toBe(false);
    montera(rad({ avlagg: [] }));
    expect(q('avlagg-forsta-lasset')).toBeNull();
  });
  it('raden ligger ovanför "Lossa här"-raden (mäter dess överkant) och använder skotarens bild', () => {
    const nedre = document.createElement('div'); nedre.dataset.testid = 'skotar-nedre-rad';
    nedre.getBoundingClientRect = () => ({ top: window.innerHeight - 80, bottom: window.innerHeight - 16, left: 0, right: 0, width: 0, height: 64, x: 0, y: 0, toJSON: () => ({}) });
    document.body.appendChild(nedre);
    try {
      montera(rad());
      expect((q('avlagg-forsta-lasset') as HTMLElement).style.bottom).toBe('88px');   // 80 (nedre radens höjd över skärmbotten) + 8 luft
      expect(q('larm-malbild-bild')!.innerHTML).toBe(norm(malbildInnehall('avlagg', 'skotare')!.bild));
    } finally { nedre.remove(); }
  });
});
