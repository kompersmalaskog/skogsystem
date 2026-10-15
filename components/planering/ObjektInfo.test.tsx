// @vitest-environment jsdom
// Objektinfon (ⓘ): kortet, Om trakten och Mer — ark under 900 px, panel från 900 px. Verkligt DOM-beteende (jsdom); planeringssidan själv monteras inte.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}), storage: { from: () => ({}) } } }));
const smhi = vi.hoisted(() => ({ fel: false }));
// Fotokön (IndexedDB finns inte i jsdom): det lokala fotot som väntar på uppladdning.
const kon = vi.hoisted(() => ({ blob: null as Blob | null }));
vi.mock('@/lib/markeringFotoKo', () => ({ lokaltMarkeringFoto: vi.fn(async () => kon.blob), prenumereraFotoKo: () => () => {} }));
vi.mock('@/lib/smhi-brandrisk', () => {
  const idag = new Date();
  const daily = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(idag.getTime() + i * 86400e3);
    return { date: d.toISOString().split('T')[0], dayName: ['Idag', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre'][i], fwiIndex: [2, 3, 4, 5, 3, 1][i], fwi: 10, peakHour: 14, temp: 10, wind: '', windLevel: '', humidity: '', humLevel: '', rain: false, hourlyIdx: [] };
  });
  return { fetchSmhiFwi: vi.fn(async () => { if (smhi.fel) throw new Error('SMHI nere'); return { daily }; }) };
});

import ObjektInfo, { type ObjektInfoProps } from './ObjektInfo';
import { sattBredd } from './PlusRad.testhjalp';
import { byggMerGrupper, kortKnappar, faktaBrickor, tillForaren, objektRad, gpsNu, type KartMarkering } from '@/lib/objektKort';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null;
let behallare: HTMLElement | null = null;
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
const q = (id: string) => behallare!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => Array.from(behallare!.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
const klicka = (el: Element | null) => { expect(el, 'elementet finns').not.toBeNull(); act(() => { (el as HTMLElement).click(); }); };
// Greppet reagerar på pekarhändelser (inte click): ett tryck = pointerdown + pointerup utan att fingret flyttats.
const trycka = (el: Element | null) => {
  expect(el, 'elementet finns').not.toBeNull();
  act(() => { el!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 300 })); });
  act(() => { el!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientY: 300 })); });
};
const skriv = (el: HTMLInputElement, v: string) => act(() => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
});

const M = (o: Partial<KartMarkering> & { id: string }): KartMarkering => ({ slag: 'symbol', typ: 'highstump', namn: 'Högstubbe', comment: '', lat: null, lng: null, skapad: null, ordning: 0, ...o });
const FOTO = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const MARKERINGAR: KartMarkering[] = [
  M({ id: 'lang', typ: 'wet', namn: 'Fuktig mark', comment: 'Blött vid bäcken', lat: 56.41, lng: 14.7, skapad: 100 }),
  M({ id: 'nara', typ: 'landing', namn: 'Avlägg', comment: 'Plats för tre bilar', lat: 56.4001, lng: 14.7, skapad: 200, photoData: FOTO }),
  M({ id: 's1', ordning: 3 }), M({ id: 's2', ordning: 4 }),
];
const LANG_TEXT = 'Skogsägaren önskar att ca 15 tallar per ha sparas som fröträd. Hänsynsytor vid bäcken ska lämnas orörda. Markberedning planeras till våren.';

const spion = { knapp: [] as string[], stang: 0, visa: [] as string[], foto: [] as string[], mer: [] as string[], brand: 0, larm: 0, slapp: [] as string[] };
function props(o: { roll?: 'planerare' | 'forare'; faror?: string[]; markeringar?: KartMarkering[]; pos?: { lat: number; lng: number } | null; maskinSlag?: 'skordare' | 'skotare' | null; framhavdId?: string | null; startVy?: 'kort' | 'om' } = {}): ObjektInfoProps {
  const roll = o.roll ?? 'planerare';
  const go: any = new Proxy({}, { get: (_t, k) => (k === 'gpsKalla' ? null : () => { spion.mer.push(String(k)); }) });
  const mer = byggMerGrupper({ roll, arAdmin: roll === 'planerare', korvyAktiv: false, maskinlage: false, skotningFinnsSomKnapp: roll === 'forare', status: 'pagaende', tillTrakt: true, vagdata: { varde: '3 vägar', misslyckad: false, kanKora: true }, go });
  return {
    oppen: true, onStang: () => { spion.stang += 1; }, objektNamn: 'Skälviken RP J-Hus- 25', objektId: 'objekt-1',
    onKnapp: (id) => { spion.knapp.push(id); },
    kort: {
      rad: objektRad({ typ: 'Slutavverkning', avtalsform: 'Rp', cert: 'FSC PEFC' }),
      knappar: kortKnappar({ roll, harKoordinat: true, korvyAktiv: false, maskinSlag: o.maskinSlag ?? 'skotare' }),
      faror: o.faror ?? [],
      tillForaren: tillForaren({ vida: LANG_TEXT, anteckningar: 'Ring Stefan.' }),
      brickor: faktaBrickor({ areal: 3.6, volym: 950, grot: true }), extraBrickor: [],
      paTrakten: '4 markeringar · 2 med text', brand: { lat: 56.4, lng: 14.7 }, onBrand: () => { spion.brand += 1; },
      dokument: { antal: 3, chips: <span data-testid="dok-chips">chips</span> },
      larm: { satt: true, koordinat: '56.40012, 14.70123', kalla: 'från traktfil (envz)', bekraftad: false, beskrivning: '', onVisa: () => { spion.larm += 1; } },
    },
    om: {
      hela: tillForaren({ vida: LANG_TEXT, anteckningar: 'Ring Stefan.' }), planttext: null, restriktioner: [],
      markeringar: o.markeringar ?? MARKERINGAR, pos: o.pos === undefined ? { lat: 56.4, lng: 14.7 } : o.pos,
      miljo: [{ id: 'hogstubbar', namn: 'Högstubbar', antal: 5, krav: 15, uppfyllt: false }],
      ytor: [], ikon: () => <span />, onVisa: (m, lage) => { spion.visa.push(`${m.id}:${lage}`); }, onSlapp: (orsak) => { spion.slapp.push(orsak); }, onFoto: (s) => { spion.foto.push(s); }, framhavdId: o.framhavdId ?? null,
    },
    mer: { grupper: mer.grupper, avsluta: mer.avslutaObjekt ? () => { spion.mer.push('avsluta'); } : null, planerare: roll === 'planerare' ? { visaSom: null } : null },
    startVy: o.startVy,
  };
}

async function montera(p: ObjektInfoProps) {
  behallare = document.createElement('div');
  document.body.appendChild(behallare);
  rot = createRoot(behallare);
  await act(async () => { rot!.render(<ObjektInfo {...p} />); });
  await flush();
}
beforeEach(() => { kon.blob = null; (URL as any).createObjectURL = vi.fn(() => 'blob:lokalt-foto'); (URL as any).revokeObjectURL = vi.fn(); spion.knapp = []; spion.stang = 0; spion.visa = []; spion.foto = []; spion.mer = []; spion.brand = 0; spion.larm = 0; spion.slapp = []; smhi.fel = false; sattBredd(390); });
afterEach(async () => { await act(async () => { rot?.unmount(); }); behallare?.remove(); rot = null; });

describe('kortet (ⓘ) — ark på telefon, panel på bred skärm', () => {
  it('telefon: ark på halv höjd med namn, rad, knapprad, Till föraren och faktabrickor; Dra upp växlar halv ↔ hel', async () => {
    await montera(props());
    const ram = q('objekt-info')!;
    expect(ram.getAttribute('data-lage')).toBe('ark');
    expect(ram.getAttribute('data-detent')).toBe('halv');
    expect(q('info-titel')!.textContent).toBe('Skälviken RP J-Hus- 25');
    expect(q('info-undertitel')!.textContent).toBe('Slutavverkning · Rp · FSC PEFC');
    expect(q('kort-till-foraren')).not.toBeNull();
    expect(qa('kort-brickor').length).toBe(1);
    expect(['kort-bricka-areal', 'kort-bricka-volym', 'kort-bricka-grot'].map((i) => q(i)!.textContent)).toEqual(['3,6 ha', '950 m³', 'GROT ja']);
    trycka(q('objekt-info-grepp'));
    expect(q('objekt-info')!.getAttribute('data-detent')).toBe('hel');
    trycka(q('objekt-info-grepp'));
    expect(q('objekt-info')!.getAttribute('data-detent')).toBe('halv');
  });

  it('bred skärm (≥ 900 px): panel från höger, inget grepp', async () => {
    sattBredd(1280);
    await montera(props());
    const ram = q('objekt-info')!;
    expect(ram.getAttribute('data-lage')).toBe('panel');
    expect(ram.getAttribute('data-detent')).toBeNull();
    expect(q('objekt-info-grepp')).toBeNull();
    expect(q('kort-uppdrag')).not.toBeNull();   // allt syns
  });

  it('planerare: Kör hit · Mer (ingen Inför maskin, ingen Körvy)', async () => {
    await montera(props());
    expect(qa('kort-knappar')[0].querySelectorAll('button').length).toBe(2);
    expect(q('kort-knapp-kor-hit')).not.toBeNull();
    expect(q('kort-knapp-mer')).not.toBeNull();
    expect(q('kort-knapp-korvy')).toBeNull();
    expect(behallare!.textContent).not.toContain('Inför maskin');
    klicka(q('kort-knapp-kor-hit'));
    expect(spion.knapp).toEqual(['kor-hit']);
  });

  it('förare: Körvy · Skotning · Utkört · Mer — varje knapp ropar rätt handling; Mer öppnar Mer här inne', async () => {
    await montera(props({ roll: 'forare' }));
    expect(Array.from(q('kort-knappar')!.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Körvy', 'Skotning', 'Utkört', 'Mer']);
    expect(q('kort-knappar')!.style.gridTemplateColumns).toContain('repeat(4,');   // alla fyra på EN rad
    klicka(q('kort-knapp-korvy')); klicka(q('kort-knapp-skotning')); klicka(q('kort-knapp-utkort'));
    expect(spion.knapp).toEqual(['korvy', 'skotning', 'utkort']);
    klicka(q('kort-knapp-mer'));
    expect(q('objekt-info')!.getAttribute('data-vy')).toBe('mer');
    expect(spion.knapp).toEqual(['korvy', 'skotning', 'utkort']);   // Mer ropar inte sidan
  });

  it('skördarförare: Körvy · Mer', async () => {
    await montera(props({ roll: 'forare', maskinSlag: 'skordare' }));
    expect(Array.from(q('kort-knappar')!.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Körvy', 'Mer']);
  });

  it('faror står överst som röd rad med ord, och saknas helt när det inte finns några', async () => {
    await montera(props({ faror: ['Kraftledning', 'Dike'] }));
    expect(q('kort-faror')!.textContent).toBe('warningFaror: Kraftledning, Dike');
    await act(async () => { rot!.unmount(); }); behallare!.remove();
    await montera(props());
    expect(q('kort-faror')).toBeNull();
  });

  it('Till föraren: var och en med avsändare; en lång text ger "Läs allt ›" som öppnar Om trakten', async () => {
    await montera(props());
    expect(q('kort-post-vida')!.textContent).toContain('Vida');
    expect(q('kort-post-anteckningar')!.textContent).toContain('Planerare');
    expect(q('kort-post-vida')!.querySelector('[data-testid="kort-las-allt"]')).not.toBeNull();
    expect(q('kort-post-anteckningar')!.querySelector('[data-testid="kort-las-allt"]')).toBeNull();   // kort text: inget "Läs allt"
    klicka(q('kort-post-vida')!.querySelector('[data-testid="kort-las-allt"]'));
    expect(q('objekt-info')!.getAttribute('data-vy')).toBe('om');
    expect(q('om-hela')!.textContent).toContain('Markberedning planeras till våren.');   // hela texten
  });

  it('På trakten är EN rad ("N markeringar · M med text ›") och öppnar Om trakten — ingen högstubbe-dubblett i kortet', async () => {
    await montera(props());
    expect(q('kort-pa-trakten')!.textContent).toBe('På trakten 4 markeringar · 2 med text');
    expect(q('kort-uppdrag')!.textContent).not.toMatch(/Högstubb|Evighetsträd/);
    klicka(q('kort-pa-trakten'));
    expect(q('objekt-info')!.getAttribute('data-vy')).toBe('om');
  });

  it('Brandrisk: fem dagar som färgstreck med dag och klass som text, tryck öppnar brandriskpanelen', async () => {
    await montera(props());
    const dagar = qa('info-brandrisk-dag');
    expect(dagar.length).toBe(5);
    expect(dagar.map((d) => d.textContent)).toEqual(['Idag 2', 'Mån 3', 'Tis 4', 'Ons 5', 'Tor 3']);
    expect(dagar.map((d) => d.getAttribute('data-klass'))).toEqual(['2', '3', '4', '5', '3']);
    expect(dagar[3].getAttribute('aria-label')).toBe('Ons: Mycket stor (klass 5)');
    expect(q('info-brandrisk')!.textContent).toContain('Idag: liten');
    klicka(q('info-brandrisk'));
    expect(spion.brand).toBe(1);
  });

  it('Brandrisk som inte går att hämta säger det — ingen gissad risk, raden går fortfarande att trycka på', async () => {
    smhi.fel = true;
    const p = props();
    p.kort.brand = { lat: 58.12, lng: 16.3 };   // annan plats än de andra testerna (brandraden cachar per plats i 30 minuter)
    await montera(p);
    expect(qa('info-brandrisk-dag').length).toBe(0);
    expect(q('info-brandrisk')!.textContent).toContain('Kunde inte hämtas');
    klicka(q('info-brandrisk'));
    expect(spion.brand).toBe(1);
  });

  it('Dokument fälls ut till chips; Larmkoordinat (satt) flyger kartan dit', async () => {
    await montera(props());
    expect(q('kort-dokument-lista')).toBeNull();
    klicka(q('kort-dokument'));
    expect(q('kort-dokument-lista')!.querySelector('[data-testid="dok-chips"]')).not.toBeNull();
    klicka(q('kort-larm'));
    expect(spion.larm).toBe(1);
  });

  it('Esc och × stänger', async () => {
    await montera(props());
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    klicka(q('info-stang'));
    expect(spion.stang).toBe(2);
  });
});

describe('Om trakten › På kartan — läsbarhet (Skälviken)', () => {
  const oppnaOm = async (p: ObjektInfoProps) => { await montera(p); klicka(q('kort-pa-trakten')); };
  const SK: KartMarkering[] = [
    M({ id: 'v1', slag: 'symbol', typ: 'road', namn: 'Väg', comment: 'Gul väg', lat: 56.4003, lng: 14.7, skapad: 100 }),
    M({ id: 'v2', slag: 'symbol', typ: 'road', namn: 'Väg', comment: 'Röd väg', lat: 56.4002, lng: 14.7, skapad: 110 }),
    M({ id: 'v3', slag: 'linje', typ: 'mainRoad', namn: 'Basväg', comment: 'Röd väg', lat: 56.4004, lng: 14.7, skapad: 120 }),
    M({ id: 'f1', slag: 'symbol', typ: 'warning', namn: 'Varning', comment: 'En knäckt gran så Se upp här', lat: 56.4009, lng: 14.7, skapad: 150 }),
    M({ id: 'f2', slag: 'symbol', typ: 'warning', namn: 'Varning', comment: 'Ett jakttorn', lat: 56.401, lng: 14.7, skapad: 160 }),
    M({ id: 'm1', slag: 'symbol', typ: 'manualfelling', namn: 'Manuell fällning', comment: 'Fällning pga brant', lat: 56.4001, lng: 14.7, skapad: 170 }),
  ];

  it('Faror först med röd rubrik, sedan På kartan, Vägar sist', async () => {
    await oppnaOm(props({ markeringar: SK, pos: null }));
    const sektioner = Array.from(behallare!.querySelectorAll('[data-testid="om-innehall"] > section')).map((x) => x.getAttribute('data-testid'));
    expect(sektioner).toEqual(['om-hela', 'om-faror', 'om-pa-kartan', 'om-vagar']);   // Hela trakten först (Vidas och planerarens text), sedan kartan
    const rubrik = q('om-faror')!.querySelector('div')!;
    expect(rubrik.textContent).toBe('Faror');
    expect(rubrik.style.color).toMatch(/255, ?69, ?58|#ff453a/i);   // FARG.rod
    expect(qa('om-markering').filter((r) => q('om-faror')!.contains(r)).map((r) => r.getAttribute('data-id'))).toEqual(['f1', 'f2']);
  });

  it('kommentaren är huvudtexten, symbolens namn står litet under', async () => {
    await oppnaOm(props({ markeringar: SK, pos: null }));
    const rad = qa('om-markering').find((r) => r.getAttribute('data-id') === 'f2')!;
    expect(rad.querySelector('[data-testid="om-huvudtext"]')!.textContent).toBe('Ett jakttorn');
    expect(rad.querySelector('[data-testid="om-symbolnamn"]')!.textContent).toBe('Varning');
  });

  it('en markering med bara foto: symbolens namn är huvudtexten, ingen rad under', async () => {
    await oppnaOm(props({ markeringar: [M({ id: 'p', typ: 'landing', namn: 'Avlägg', comment: '', photoData: FOTO, skapad: 1 })], pos: null }));
    const rad = q('om-markering')!;
    expect(rad.querySelector('[data-testid="om-huvudtext"]')!.textContent).toBe('Avlägg');
    expect(rad.querySelector('[data-testid="om-symbolnamn"]')).toBeNull();
  });

  it('avstånd: inget när användaren är 39 km bort, avstånd när hen står på trakten', async () => {
    await oppnaOm(props({ markeringar: SK, pos: { lat: 56.75, lng: 14.7 } }));
    expect(qa('om-avstand').length).toBe(0);
    await act(async () => { rot?.unmount(); }); behallare?.remove();
    await oppnaOm(props({ markeringar: SK, pos: { lat: 56.401, lng: 14.7 } }));
    expect(qa('om-avstand').length).toBeGreaterThan(0);
  });

  it('korta kommentarer av samma typ är EN rad ("Vägar · Gul väg · Röd väg"); tryck fäller ut en rad per markering med Visa ›; basvägen har egen rad', async () => {
    await oppnaOm(props({ markeringar: SK, pos: null }));
    const samlad = qa('om-samlad');
    expect(samlad.length).toBe(1);
    expect(q('om-samlad-text')!.textContent).toBe('Vägar · Gul väg · Röd väg');
    expect(q('om-samlad-lista')).toBeNull();
    klicka(q('om-samlad-knapp'));
    const inre = Array.from(q('om-samlad-lista')!.querySelectorAll('[data-testid="om-markering"]'));
    expect(inre.map((r) => r.getAttribute('data-id'))).toEqual(['v1', 'v2']);
    klicka(inre[1].querySelector('[data-testid="om-visa"]'));
    expect(spion.visa).toEqual(['v2:ark']);
    klicka(q('om-samlad-knapp'));
    expect(q('om-samlad-lista')).toBeNull();
  });

  it('basvägar listas under Vägar som "Basväg röd · 640 m" (även utan kommentar); en äldre basväg utan färg: "Basväg · 1,25 km"; kommentaren står under', async () => {
    const bv = (o: Partial<KartMarkering> & { id: string }) => M({ slag: 'linje', typ: 'mainRoad', namn: 'Basväg', lat: 56.4, lng: 14.7, ...o });
    await oppnaOm(props({ pos: null, markeringar: [
      bv({ id: 'b1', farg: 'red', langdM: 640, skapad: 1 }),
      bv({ id: 'b2', langdM: 1250, comment: 'Kör inte vid regn', skapad: 2 }),
      bv({ id: 'b3', farg: 'blue', langdM: 90, skapad: 3 }),
    ] }));
    const rader = qa('om-markering').filter((r) => q('om-vagar')!.contains(r));
    expect(rader.map((r) => r.querySelector('[data-testid="om-huvudtext"]')!.textContent)).toEqual(['Basväg röd · 640 m', 'Basväg · 1,25 km', 'Basväg blå · 90 m']);
    expect(rader[1].querySelector('[data-testid="om-symbolnamn"]')!.textContent).toBe('Kör inte vid regn');
    expect(rader[0].querySelector('[data-testid="om-symbolnamn"]')).toBeNull();
  });
});

describe('position — sidans currentPosition är { lat, lon } (PR 766)', () => {
  // Så som sidan bygger positionen: { lat, lon } genom gpsNu → { lat, lng }. Förut matades komponenterna med färdigt { lat, lng } och kraschen i sidan syntes aldrig.
  const sidansPosition = (position: { lat: number; lon: number } | null) => gpsNu({ korvyAktiv: false, korvyPos: null, position });

  it('utan position: kortet OCH Om trakten renderas, utan avstånd', async () => {
    await montera(props({ pos: sidansPosition(null) }));
    expect(q('kort-knappar')).not.toBeNull();
    klicka(q('kort-pa-trakten'));
    expect(qa('om-markering').length).toBe(2);
    expect(qa('om-avstand').length).toBe(0);
  });

  it('MED position i { lat, lon }-form: kortet OCH Om trakten renderas, och avstånd visas (närmast först)', async () => {
    await montera(props({ pos: sidansPosition({ lat: 56.4, lon: 14.7 }) }));
    expect(q('kort-knappar')).not.toBeNull();
    klicka(q('kort-pa-trakten'));
    const rader = qa('om-markering');
    expect(rader.map((r) => r.getAttribute('data-id'))).toEqual(['nara', 'lang']);
    expect(rader[0].querySelector('[data-testid="om-avstand"]')!.textContent).toBe('10 m');
    expect(rader[1].querySelector('[data-testid="om-avstand"]')!.textContent).toMatch(/km$/);
  });
});

describe('Om trakten', () => {
  const oppnaOm = async (p = props()) => { await montera(p); klicka(q('kort-pa-trakten')); };

  it('bara markeringar MED kommentar eller foto får en rad; närmast först när GPS finns, med avstånd', async () => {
    await oppnaOm();
    const rader = qa('om-markering');
    expect(rader.map((r) => r.getAttribute('data-id'))).toEqual(['nara', 'lang']);
    expect(rader[0].querySelector('[data-testid="om-avstand"]')!.textContent).toBe('10 m');
    expect(rader[0].textContent).toContain('Plats för tre bilar');   // hela kommentaren
  });

  it('utan GPS: i den ordning de skapades, och inga avstånd', async () => {
    await oppnaOm(props({ pos: null }));
    expect(qa('om-markering').map((r) => r.getAttribute('data-id'))).toEqual(['lang', 'nara']);
    expect(qa('om-avstand').length).toBe(0);
  });

  it('utan kommentar: bara antal per typ, och "5 av 15" EN gång', async () => {
    await oppnaOm();
    expect(q('om-utan-kommentar')!.textContent).toBe('Utan kommentar 2 högstubbar');
    expect(q('om-miljo-hogstubbar')!.textContent).toBe('Högstubbar 5 av 15');
    expect(behallare!.textContent!.match(/5 av 15/g)!.length).toBe(1);
  });

  it('foto: liten bild; tryck = stor bild', async () => {
    await oppnaOm();
    const bild = q('om-foto')!.querySelector('img');
    expect(bild).not.toBeNull();
    klicka(bild);
    expect(spion.foto).toEqual([FOTO]);
    expect(qa('om-foto').length).toBe(1);   // bara markeringen med foto
  });

  it('Visa › ger markeringen och ramens läge (telefon: ark, bred skärm: panel)', async () => {
    await oppnaOm();
    klicka(qa('om-visa')[0]);
    expect(spion.visa).toEqual(['nara:ark']);
    await act(async () => { rot!.unmount(); }); behallare!.remove(); spion.visa = [];
    sattBredd(1280);
    await oppnaOm();
    klicka(qa('om-visa')[1]);
    expect(spion.visa).toEqual(['lang:panel']);
  });

  it('foto som väntar på uppladdning: raden listas utan kommentar, bilden visas från enheten med väntar-ikonen (och en rad utan väntande foto har ingen ikon)', async () => {
    kon.blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    const vantar = M({ id: 'fv', typ: 'warning', namn: 'Varning', comment: '', fotoVantar: true, lat: 56.4002, lng: 14.7, skapad: 300 });
    await oppnaOm(props({ markeringar: [vantar, ...MARKERINGAR] }));
    await flush();
    const rad = qa('om-markering').find((r) => r.getAttribute('data-id') === 'fv')!;
    expect(rad, 'markeringen med bara ett väntande foto listas').toBeTruthy();
    expect(rad.querySelector('img')!.getAttribute('src')).toBe('blob:lokalt-foto');
    expect(rad.querySelector('[data-testid="foto-vantar"]')!.getAttribute('aria-label')).toBe('Väntar på uppladdning');
    const med = qa('om-markering').find((r) => r.getAttribute('data-id') === 'nara')!;
    expect(med.querySelector('[data-testid="foto-vantar"]')).toBeNull();   // vanligt foto (redan uppe/inbäddat): ingen ikon
  });

  it('vald rad: knappen heter "Visa hela" (inte "Visa ›") och ett tryck släpper framhävningen; övriga rader säger fortfarande Visa ›', async () => {
    await oppnaOm(props({ framhavdId: 'nara' }));
    const knappar = qa('om-visa');
    expect(knappar.map((k) => k.textContent)).toEqual(['Visa hela', 'Visa ›']);   // rad 1 = 'nara' (närmast), rad 2 = 'lang'
    expect(knappar[0].getAttribute('data-framhavd')).toBe('1');
    klicka(knappar[0]);
    expect(spion.slapp).toEqual(['rad']);
    expect(spion.visa).toEqual([]);          // släpper — väljer inte om
    klicka(knappar[1]);
    expect(spion.visa).toEqual(['lang:ark']);   // en annan rad väljer den som vanligt
  });

  it('utan vald rad står "Visa ›" överallt', async () => {
    await oppnaOm();
    expect(qa('om-visa').map((k) => k.textContent)).toEqual(['Visa ›', 'Visa ›']);
  });

  it('bred skärm: stängs Om trakten (× eller ‹ objektnamn) lämnas framhävningen; på kortet och på telefon gör stängningen ingenting åt den', async () => {
    sattBredd(1280);
    await oppnaOm(props({ framhavdId: 'nara' }));
    klicka(q('info-stang'));
    expect(spion.slapp).toEqual(['stang']);
    expect(spion.stang).toBe(1);
    klicka(q('info-tillbaka'));
    expect(spion.slapp).toEqual(['stang', 'stang']);
    expect(q('kort-till-foraren')).not.toBeNull();        // och vi är tillbaka på kortet
    spion.slapp = [];
    klicka(q('info-stang'));                               // stängs från KORTET: inget att släppa
    expect(spion.slapp).toEqual([]);
  });

  it('telefon: att arket stängs av Visa › (onStang) släpper INTE framhävningen — då vore den borta innan man sett den', async () => {
    await oppnaOm(props({ framhavdId: 'nara' }));
    klicka(q('info-stang'));
    expect(spion.slapp).toEqual([]);
    expect(spion.stang).toBe(1);
  });

  it('startVy="om": objektinfon öppnas direkt på Om trakten (telefonens "‹ Om trakten")', async () => {
    await montera(props({ startVy: 'om' }));
    expect(q('om-innehall')).not.toBeNull();
    expect(q('kort-till-foraren')).toBeNull();
  });

  it('sökfältet filtrerar på kommentar och symbolnamn, och säger när inget matchar', async () => {
    await oppnaOm();
    skriv(q('om-sok') as HTMLInputElement, 'bäcken');
    expect(qa('om-markering').map((r) => r.getAttribute('data-id'))).toEqual(['lang']);
    skriv(q('om-sok') as HTMLInputElement, 'AVLÄGG');
    expect(qa('om-markering').map((r) => r.getAttribute('data-id'))).toEqual(['nara']);
    skriv(q('om-sok') as HTMLInputElement, 'finns inte');
    expect(qa('om-markering').length).toBe(0);
    expect(q('om-inget')!.textContent).toContain('finns inte');
  });

  it('‹ objektnamn tar tillbaka till kortet', async () => {
    await oppnaOm();
    expect(q('info-tillbaka')!.textContent).toContain('Skälviken RP J-Hus- 25');
    klicka(q('info-tillbaka'));
    expect(q('objekt-info')!.getAttribute('data-vy')).toBe('kort');
  });

  it('en trakt utan text: förklarar varför det är tomt', async () => {
    const p = props({ markeringar: [] });
    p.om.hela = []; p.om.miljo = [];
    await oppnaOm(p);
    expect(q('om-tomt')!.textContent).toContain('Inget är skrivet om trakten än');
  });
});

describe('Mer', () => {
  it('planerare: grupperna Körvy · Föraren · Planeraren · Övrigt, Avsluta objekt (rött) längst ner när objektet är pågående', async () => {
    const p = props();
    p.mer.planerare = { visaSom: { aktivId: null, alternativ: [{ id: null, label: 'Planerare' }], onValj: () => {} } };
    await montera(p);
    klicka(q('kort-knapp-mer'));
    expect(['korvy', 'foraren', 'planeraren', 'ovrigt', 'avsluta'].map((g) => !!q(`mer-grupp-${g}`))).toEqual([true, true, true, true, true]);
    expect(q('mer-avsluta-objekt')!.textContent).toBe('check_circleAvsluta objekt');
    const sist = Array.from(q('mer-innehall')!.querySelectorAll('section')).pop()!;
    expect(sist.getAttribute('data-testid')).toBe('mer-grupp-avsluta');
  });

  it('en rad ropar sin handling; ‹ tillbaka till kortet', async () => {
    await montera(props());
    klicka(q('kort-knapp-mer'));
    klicka(q('mer-genomgang'));
    klicka(q('mer-checklista'));
    expect(spion.mer).toEqual(['genomgang', 'checklista']);
    klicka(q('info-tillbaka'));
    expect(q('objekt-info')!.getAttribute('data-vy')).toBe('kort');
  });

  it('inga gamla menyval: Byt objekt, Brandrisk, Gallring, Inställningar, Förslag', async () => {
    await montera(props());
    klicka(q('kort-knapp-mer'));
    const text = q('mer-innehall')!.textContent!;
    for (const bort of ['Byt objekt', 'Brandrisk', 'Gallring', 'Inställningar', 'Förslag', 'Briefing', 'Kvittera markeringar']) expect(text, bort).not.toContain(bort);
    expect(text).toContain('Genomgång & kvittering');
  });
});

describe('stängt', () => {
  it('oppen=false: ramen glider ut och tas bort ur DOM (inget kvar som tar tryck)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    try {
      behallare = document.createElement('div'); document.body.appendChild(behallare); rot = createRoot(behallare);
      await act(async () => { rot!.render(<ObjektInfo {...props()} />); });
      expect(q('objekt-info')).not.toBeNull();
      await act(async () => { rot!.render(<ObjektInfo {...props()} oppen={false} />); });
      expect(q('objekt-info')!.getAttribute('data-oppen')).toBe('0');
      await act(async () => { vi.advanceTimersByTime(600); });
      expect(q('objekt-info')).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});
