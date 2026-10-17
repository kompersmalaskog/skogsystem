// @vitest-environment jsdom
// Objektinfon (ⓘ): kortet, Om trakten och Mer — ark under 900 px, panel från 900 px. Verkligt DOM-beteende (jsdom); planeringssidan själv monteras inte.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}), storage: { from: () => ({}) } } }));
const smhi = vi.hoisted(() => ({ fel: false, klasser: [2, 3, 4, 5, 3, 1] as number[] }));
// Fotokön (IndexedDB finns inte i jsdom): det lokala fotot som väntar på uppladdning.
const kon = vi.hoisted(() => ({ blob: null as Blob | null }));
vi.mock('@/lib/markeringFotoKo', () => ({ lokaltMarkeringFoto: vi.fn(async () => kon.blob), prenumereraFotoKo: () => () => {} }));
vi.mock('@/lib/smhi-brandrisk', () => {
  const dagar = () => Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.now() + i * 86400e3);
    return { date: d.toISOString().split('T')[0], dayName: ['Idag', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre'][i], fwiIndex: smhi.klasser[i], fwi: 10, peakHour: 14, temp: 10, wind: '', windLevel: '', humidity: '', humLevel: '', rain: false, hourlyIdx: [] };
  });
  return { fetchSmhiFwi: vi.fn(async () => { if (smhi.fel) throw new Error('SMHI nere'); return { daily: dagar() }; }) };
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

const spion = { knapp: [] as string[], stang: 0, visa: [] as string[], foto: [] as string[], mer: [] as string[], brand: 0, larm: 0, slapp: [] as string[], typ: [] as string[], nav: [] as any[] };
function props(o: { roll?: 'planerare' | 'forare'; faror?: string[]; markeringar?: KartMarkering[]; pos?: { lat: number; lng: number } | null; maskinSlag?: 'skordare' | 'skotare' | null; framhavdId?: string | null; startVy?: 'kort' | 'om'; start?: any } = {}): ObjektInfoProps {
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
      larm: { satt: true, koordinat: '56.40012, 14.70123', bekraftad: false, beskrivning: '', onVisa: () => { spion.larm += 1; } },
    },
    om: {
      hela: tillForaren({ vida: LANG_TEXT, anteckningar: 'Ring Stefan.' }), planttext: null, restriktioner: [],
      markeringar: o.markeringar ?? MARKERINGAR, pos: o.pos === undefined ? { lat: 56.4, lng: 14.7 } : o.pos,
      miljo: [{ id: 'hogstubbar', namn: 'Högstubbar', antal: 5, krav: 15, uppfyllt: false }],
      ytor: [], brand: { lat: 56.4, lng: 14.7 }, onBrand: () => { spion.brand += 1; }, start: o.start, onNav: (n) => { spion.nav.push(n); }, onTyp: (m, lage) => { spion.typ.push(m ? `${m.map((x) => x.id).join(',')}:${lage}` : 'null'); },
      ikon: () => <span />, onVisa: (m, lage) => { spion.visa.push(`${m.id}:${lage}`); }, onSlapp: (orsak) => { spion.slapp.push(orsak); }, onFoto: (s) => { spion.foto.push(s); }, framhavdId: o.framhavdId ?? null,
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
beforeEach(() => { kon.blob = null; (URL as any).createObjectURL = vi.fn(() => 'blob:lokalt-foto'); (URL as any).revokeObjectURL = vi.fn(); spion.knapp = []; spion.stang = 0; spion.visa = []; spion.foto = []; spion.mer = []; spion.brand = 0; spion.larm = 0; spion.slapp = []; spion.typ = []; spion.nav = []; smhi.fel = false; sattBredd(390); });
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

  it('Brandrisk visas bara när någon dag är 3 eller högre: EN rad "Brandrisk 5 på <dag>", röd, direkt under Faror; tryck öppnar brandriskpanelen', async () => {
    await montera(props({ faror: ['Elledning'] }));
    const rad = q('info-brandrisk')!;
    expect(rad.textContent).toMatch(/^Brandrisk 5 på [a-zåäö]+dag$/);
    expect(rad.getAttribute('data-ton')).toBe('rod');
    expect(qa('info-brandrisk-dag').length).toBe(0);   // inga fem färgstreck längre
    expect(q('kort-faror')!.compareDocumentPosition(q('info-brandrisk-kort')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(q('kort-uppdrag')!.contains(rad)).toBe(false);
    klicka(rad);
    expect(spion.brand).toBe(1);
  });

  it('Brandrisk: 3 = vanlig text, 4 = orange, 5E = "Brandrisk 5E på <dag> – inga band"', async () => {
    const med = async (klasser: number[], lat: number) => {
      smhi.klasser = klasser;
      const p = props(); p.kort.brand = { lat, lng: 16.1 };
      await montera(p);
      const rad = q('info-brandrisk');
      const r = rad ? { ton: rad.getAttribute('data-ton'), text: rad.textContent! } : null;
      await act(async () => { rot!.unmount(); }); behallare!.remove();
      return r;
    };
    expect((await med([1, 3, 2, 1, 1, 1], 57.11))!.ton).toBe('neutral');
    expect((await med([1, 1, 4, 1, 1, 1], 57.12))!.ton).toBe('orange');
    const extrem = (await med([1, 1, 1, 6, 1, 1], 57.13))!;
    expect(extrem.ton).toBe('rod');
    expect(extrem.text).toMatch(/^Brandrisk 5E på [a-zåäö]+dag – inga band$/);
    smhi.klasser = [2, 3, 4, 5, 3, 1];
  });

  it('Brandrisk 1–2 hela veckan: ingen rad alls', async () => {
    smhi.klasser = [1, 2, 2, 1, 1, 1];
    const p = props(); p.kort.brand = { lat: 57.2, lng: 16.1 };
    await montera(p);
    expect(q('info-brandrisk')).toBeNull();
    expect(q('info-brandrisk-kort')).toBeNull();
    smhi.klasser = [2, 3, 4, 5, 3, 1];
  });

  it('Brandrisk som inte går att hämta säger det — ingen gissad risk, raden går fortfarande att trycka på', async () => {
    smhi.fel = true;
    const p = props();
    p.kort.brand = { lat: 58.12, lng: 16.3 };   // annan plats än de andra testerna (brandraden cachar per plats i 30 minuter)
    await montera(p);
    expect(q('info-brandrisk')!.textContent).toContain('kunde inte hämtas');
    klicka(q('info-brandrisk'));
    expect(spion.brand).toBe(1);
  });

  it('Om trakten visar samma brandriskrad, direkt under Faror', async () => {
    await montera(props({ markeringar: SK }));
    klicka(q('kort-pa-trakten'));
    expect(q('info-brandrisk')!.textContent).toMatch(/^Brandrisk 5 på /);
    expect(q('om-faror')!.compareDocumentPosition(q('info-brandrisk-kort')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it('Larmkoordinat: "Larmplats inte kontrollerad" — ingen teknisk text om källan; kontrollerad säger det', async () => {
    await montera(props());
    expect(q('kort-larm-status')!.textContent).toBe('Larmplats inte kontrollerad');
    expect(q('kort-larm')!.textContent).not.toMatch(/envz|traktfil|Ej bekräftad/);
    await act(async () => { rot!.unmount(); }); behallare!.remove();
    const p = props(); p.kort.larm.bekraftad = true;
    await montera(p);
    expect(q('kort-larm-status')!.textContent).toBe('Larmplats kontrollerad');
  });

  it('Esc och × stänger', async () => {
    await montera(props());
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    klicka(q('info-stang'));
    expect(spion.stang).toBe(2);
  });
});

// ── Om trakten (omtag 2026-10-17): grupper, EN rad per typ, typvy, objekt, tillbaka ─────────────────────────────────────────────────────
const SK: KartMarkering[] = [
  M({ id: 'v1', slag: 'symbol', typ: 'road', namn: 'Väg', comment: 'Gul väg', lat: 56.4003, lng: 14.7, skapad: 100 }),
  M({ id: 'v1b', slag: 'symbol', typ: 'road', namn: 'Väg', comment: 'Gul väg', lat: 56.4003, lng: 14.7001, skapad: 101 }),
  M({ id: 'v2', slag: 'symbol', typ: 'road', namn: 'Väg', comment: 'Röd väg', lat: 56.4002, lng: 14.7, skapad: 110 }),
  M({ id: 'v2b', slag: 'symbol', typ: 'road', namn: 'Väg', comment: 'Röd väg', lat: 56.4002, lng: 14.7001, skapad: 111 }),
  M({ id: 'v2c', slag: 'symbol', typ: 'road', namn: 'Väg', comment: 'Röd väg', lat: 56.4002, lng: 14.7002, skapad: 112 }),
  M({ id: 'b2', slag: 'linje', typ: 'mainRoad', namn: 'Basväg', farg: null, langdM: 260, lat: 56.4004, lng: 14.7, skapad: 121 }),
  M({ id: 'b1', slag: 'linje', typ: 'mainRoad', namn: 'Basväg', farg: 'red', langdM: 640, comment: 'Röd väg in från norr', lat: 56.4004, lng: 14.7, skapad: 120 }),
  M({ id: 'f1', slag: 'symbol', typ: 'warning', namn: 'Varning', comment: 'En knäckt gran så Se upp här', lat: 56.4009, lng: 14.7, skapad: 150 }),
  M({ id: 'f2', slag: 'symbol', typ: 'warning', namn: 'Varning', comment: 'Ett jakttorn', lat: 56.401, lng: 14.7, skapad: 160 }),
  M({ id: 'm1', slag: 'symbol', typ: 'manualfelling', namn: 'Manuell fällning', comment: 'Fällning pga brant', lat: 56.4001, lng: 14.7, skapad: 170 }),
  M({ id: 'm2', slag: 'symbol', typ: 'manualfelling', namn: 'Manuell fällning', lat: 56.4001, lng: 14.7001, skapad: 171 }),
  M({ id: 'h1', slag: 'symbol', typ: 'highstump', namn: 'Högstubbe', antal: 1, lat: 56.4005, lng: 14.7, skapad: 180 }),
  M({ id: 'h2', slag: 'symbol', typ: 'highstump', namn: 'Högstubbe', antal: 2, lat: 56.4005, lng: 14.7001, skapad: 181 }),
  M({ id: 'h3', slag: 'symbol', typ: 'highstump', namn: 'Högstubbe', antal: 1, lat: 56.4005, lng: 14.7002, skapad: 182 }),
  M({ id: 'e1', slag: 'symbol', typ: 'eternitytree', namn: 'Evighetsträd', lat: 56.4006, lng: 14.7, skapad: 190 }),
  M({ id: 'k1', slag: 'symbol', typ: 'culturemonument', namn: 'Kulturminne', comment: 'Stenrös vid vägen', photoData: FOTO, lat: 56.4007, lng: 14.7, skapad: 200 }),
  M({ id: 's1', slag: 'linje', typ: 'stonewall', namn: 'Stenmur', lat: 56.4008, lng: 14.7, skapad: 210 }),
];
const MILJO_EJ_KRAV = [{ id: 'hogstubbar', namn: 'Högstubbar', antal: 4, krav: null, uppfyllt: false }, { id: 'evighetstrad', namn: 'Evighetsträd', antal: 1, krav: null, uppfyllt: false }];
const oppnaOm = async (p = props()) => { await montera(p); klicka(q('kort-pa-trakten')); };
const radText = (nyckel: string) => q(`om-typ-${nyckel}`)!.textContent;

describe('Om trakten — grupper och EN rad per typ', () => {
  const sk = (o: Parameters<typeof props>[0] = {}) => { const p = props({ markeringar: SK, ...o }); p.om.miljo = MILJO_EJ_KRAV; return p; };

  it('grupperna kommer i ordningen Faror · Från Vida · Hänsyn · Vägar · Övrigt', async () => {
    await oppnaOm(sk());
    const ordning = ['om-faror', 'om-hela', 'om-grupp-hansyn', 'om-grupp-vagar', 'om-grupp-ovrigt'].map((id) => q(id));
    ordning.forEach((el, i) => expect(el, `grupp ${i} finns`).not.toBeNull());
    for (let i = 1; i < ordning.length; i++) expect(ordning[i - 1]!.compareDocumentPosition(ordning[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `grupp ${i} efter ${i - 1}`).toBeTruthy();
  });

  it('Faror: röd rubrik med antal, alltid utfälld — varje fara är en rad med sin kommentar', async () => {
    await oppnaOm(sk());
    expect(q('om-faror')!.textContent).toContain('Faror · 2');
    const rader = qa('om-objekt').filter((r) => q('om-faror')!.contains(r));
    expect(rader.map((r) => r.getAttribute('data-id'))).toEqual(['f1', 'f2']);
    expect(rader[0].textContent).toContain('En knäckt gran så Se upp här');
  });

  it('en rad per typ med antal och summa: Basväg · 2 st · 900 m, Röd väg · 3 st, Gul väg · 2 st, Manuell fällning · 2 st, Stenmur · 1 st, Kulturminne · 1 st', async () => {
    await oppnaOm(sk());
    expect(radText('linje-mainroad')).toBe('Basväg · 2 st · 900 m');
    expect(radText('symbol-road-r-d-v-g')).toBe('Röd väg · 3 st');
    expect(radText('symbol-road-gul-v-g')).toBe('Gul väg · 2 st');
    expect(radText('symbol-manualfelling')).toBe('Manuell fällning · 2 st');
    expect(radText('linje-stonewall')).toBe('Stenmur · 1 st');
    expect(radText('symbol-culturemonument')).toBe('Kulturminne · 1 st');
  });

  it('basvägen står först under Vägar; kultur och stenmur hör ihop med högstubbar och evighetsträd under Hänsyn', async () => {
    await oppnaOm(sk());
    const vagar = Array.from(q('om-grupp-vagar')!.querySelectorAll('[data-testid^="om-typ-"]:not([data-testid="om-typ-text"])')).map((e) => e.getAttribute('data-testid'));
    expect(vagar[0]).toBe('om-typ-linje-mainroad');
    const hansyn = q('om-grupp-hansyn')!.textContent!;
    for (const ord of ['Högstubbar', 'Evighetsträd', 'Kulturminne', 'Stenmur']) expect(hansyn).toContain(ord);
    expect(q('om-grupp-ovrigt')!.textContent).toContain('Manuell fällning');
  });

  it('inget av det gamla: ingen sammanfattningsrad, ingen "Utan kommentar", inget "Visa" på raderna', async () => {
    await oppnaOm(sk());
    const allt = q('om-innehall')!.textContent!;
    expect(allt).not.toMatch(/Utan kommentar/);
    expect(allt).not.toMatch(/Vägar · Gul väg/);
    expect(allt).not.toMatch(/Visa/);
    expect(q('om-samlad')).toBeNull();
    expect(q('om-miljo')).toBeNull();
  });

  it('Högstubbar/Evighetsträd på certifierat objekt: kravet utskrivet ("3 av 11 markerade"), uppfyllt "11 av 11 markerade ✓" i grönt', async () => {
    const p = sk();
    p.om.miljo = [{ id: 'hogstubbar', namn: 'Högstubbar', antal: 3, krav: 11, uppfyllt: false }, { id: 'evighetstrad', namn: 'Evighetsträd', antal: 37, krav: 37, uppfyllt: true }];
    await oppnaOm(p);
    expect(radText('miljo-hogstubbar')).toBe('Högstubbar · 3 av 11 markerade');
    expect(q('om-typ-miljo-hogstubbar')!.getAttribute('data-uppfyllt')).toBe('0');
    expect(radText('miljo-evighetstrad')).toBe('Evighetsträd · 37 av 37 markerade ✓');
    expect(q('om-typ-miljo-evighetstrad')!.getAttribute('data-uppfyllt')).toBe('1');
  });

  it('ej certifierat: bara antalet satta ("Högstubbar · 4 st")', async () => {
    await oppnaOm(sk());
    expect(radText('miljo-hogstubbar')).toBe('Högstubbar · 4 st');
  });

  it('certifierat men inget satt än: raden finns ändå ("Högstubbar · 0 av 11 markerade")', async () => {
    const p = props({ markeringar: [] });
    p.om.miljo = [{ id: 'hogstubbar', namn: 'Högstubbar', antal: 0, krav: 11, uppfyllt: false }, { id: 'evighetstrad', namn: 'Evighetsträd', antal: 0, krav: 37, uppfyllt: false }];
    await oppnaOm(p);
    expect(radText('miljo-hogstubbar')).toBe('Högstubbar · 0 av 11 markerade');
  });

  it('Hänsynsytor (Vidas) är en typrad "Hänsynsytor · 1 st"; typvyn listar ytan och trycket öppnar den som förut', async () => {
    const p = sk();
    let oppnad = 0;
    p.om.ytor = [{ nr: 1, typLabel: 'Hänsynsyta', text: 'Fuktig sänka', harLjud: false, harFoto: false, onOppna: () => { oppnad += 1; } }];
    await oppnaOm(p);
    expect(radText('yta-h-nsynsyta')).toBe('Hänsynsytor · 1 st');
    klicka(q('om-typ-yta-h-nsynsyta'));
    klicka(q('om-yta'));
    expect(oppnad).toBe(1);
  });

  it('sökning filtrerar raderna och räknar bara träffarna (inget krav)', async () => {
    const p = sk();
    p.om.miljo = [{ id: 'hogstubbar', namn: 'Högstubbar', antal: 4, krav: 11, uppfyllt: false }, { id: 'evighetstrad', namn: 'Evighetsträd', antal: 1, krav: 37, uppfyllt: false }];
    await oppnaOm(p);
    skriv(q('om-sok') as HTMLInputElement, 'stenrös');
    expect(radText('symbol-culturemonument')).toBe('Kulturminne · 1 st');
    expect(q('om-typ-linje-mainroad')).toBeNull();
    expect(q('om-typ-miljo-hogstubbar')).toBeNull();   // kravet gäller hela trakten — inte en träfflista
    skriv(q('om-sok') as HTMLInputElement, 'finns inte');
    expect(q('om-inget')!.textContent).toContain('finns inte');
  });

  it('en trakt utan text: förklarar varför det är tomt', async () => {
    const p = props({ markeringar: [] });
    p.om.hela = []; p.om.miljo = [];
    await oppnaOm(p);
    expect(q('om-tomt')!.textContent).toContain('Inget är skrivet om trakten än');
  });
});

describe('Om trakten — typvyn, objekten och vägen tillbaka', () => {
  const sk = (o: Parameters<typeof props>[0] = {}) => { const p = props({ markeringar: SK, ...o }); p.om.miljo = MILJO_EJ_KRAV; return p; };

  it('tryck på en typrad: typvyn öppnas, alla av typen markeras på kartan, arket går till halv höjd', async () => {
    await oppnaOm(sk());
    expect(q('objekt-info')!.getAttribute('data-detent')).toBe('hel');
    klicka(q('om-typ-linje-mainroad'));
    expect(q('om-innehall')!.getAttribute('data-vy')).toBe('typ');
    expect(q('info-titel')!.textContent).toBe('Basväg · 2 st · 900 m');
    expect(spion.typ.at(-1)).toBe('b1,b2:ark');
    expect(q('objekt-info')!.getAttribute('data-detent')).toBe('halv');
  });

  it('typvyn listar objekten — vägar längst först — med "Basväg röd · 640 m", kommentaren på en rad under och fotot som liten bild', async () => {
    await oppnaOm(sk());
    klicka(q('om-typ-linje-mainroad'));
    const rader = qa('om-objekt');
    expect(rader.map((r) => r.getAttribute('data-id'))).toEqual(['b1', 'b2']);
    expect(rader[0].querySelector('[data-testid="om-huvudtext"]')!.textContent).toBe('Basväg röd · 640 m');
    expect(rader[0].querySelector('[data-testid="om-kommentar"]')!.textContent).toBe('Röd väg in från norr');
    expect(rader[1].querySelector('[data-testid="om-huvudtext"]')!.textContent).toBe('Basväg · 260 m');
    expect(rader[1].querySelector('[data-testid="om-kommentar"]')).toBeNull();
    // Kulturminnet med kommentar OCH foto: samma radformat, fotot en liten bild till höger.
    klicka(q('info-tillbaka'));
    klicka(q('om-typ-symbol-culturemonument'));
    const k = qa('om-objekt')[0];
    expect(k.querySelector('[data-testid="om-huvudtext"]')!.textContent).toBe('Kulturminne');
    expect(k.querySelector('[data-testid="om-kommentar"]')!.textContent).toBe('Stenrös vid vägen');
    expect(k.querySelector('[data-testid="om-foto"]')).not.toBeNull();
  });

  it('‹ Om trakten i typvyn tar tillbaka till listan och släpper typmarkeringen', async () => {
    await oppnaOm(sk());
    klicka(q('om-typ-linje-mainroad'));
    expect(q('info-tillbaka')!.textContent).toContain('Om trakten');
    klicka(q('info-tillbaka'));
    expect(q('om-innehall')!.getAttribute('data-vy')).toBe('lista');
    expect(spion.typ.at(-1)).toBe('null');
    expect(q('objekt-info')!.getAttribute('data-detent')).toBe('hel');
  });

  it('tryck på ett objekt: sidan får objektet och ramens läge, plus var man stod (typvyn) — och trycket på samma objekt släpper', async () => {
    await oppnaOm(sk());
    klicka(q('om-typ-linje-mainroad'));
    klicka(qa('om-objekt-knapp')[1]);
    expect(spion.visa).toEqual(['b2:ark']);
    expect(spion.nav.at(-1)).toMatchObject({ typ: 'linje:mainRoad', q: '' });
    await act(async () => { rot!.unmount(); }); behallare!.remove(); spion.slapp = [];
    await oppnaOm(sk({ framhavdId: 'b2' }));
    klicka(q('om-typ-linje-mainroad'));
    expect(qa('om-objekt').find((r) => r.getAttribute('data-id') === 'b2')!.getAttribute('data-framhavd')).toBe('1');
    klicka(qa('om-objekt-knapp')[1]);
    expect(spion.slapp).toEqual(['rad']);
  });

  it('en fara i listan går direkt till objektet (ingen typvy)', async () => {
    await oppnaOm(sk());
    klicka(qa('om-objekt-knapp')[0]);
    expect(spion.visa).toEqual(['f1:ark']);
    expect(spion.nav.at(-1)).toMatchObject({ typ: null });
  });

  it('"‹ Lista": Om trakten öppnas i samma typvy med typen markerad, och rullningen ges tillbaka', async () => {
    const start = { typ: 'linje:mainRoad', scrollLista: 120, scrollTyp: 40, q: '' };
    await montera(props({ markeringar: SK, startVy: 'om', start }));
    expect(q('om-innehall')!.getAttribute('data-vy')).toBe('typ');
    expect(q('info-titel')!.textContent).toBe('Basväg · 2 st · 900 m');
    expect(spion.typ.at(-1)).toBe('b1,b2:ark');
    expect(q('objekt-info')!.getAttribute('data-detent')).toBe('halv');
    expect((q('om-innehall') as HTMLElement).scrollTop).toBe(40);
    // tillbaka till listan: rullningen där man lämnade den
    klicka(q('info-tillbaka'));
    expect((q('om-innehall') as HTMLElement).scrollTop).toBe(120);
  });

  it('× (och Esc) i Om trakten släpper typmarkeringen och glömmer var man stod; ‹ objektnamn gör likadant', async () => {
    await oppnaOm(sk());
    klicka(q('om-typ-linje-mainroad'));
    klicka(q('info-stang'));
    expect(spion.typ.at(-1)).toBe('null');
    expect(spion.nav.at(-1)).toBeNull();
    expect(spion.stang).toBe(1);
  });

  it('bred skärm: panelen ligger kvar och typvyn öppnas där (ingen halv höjd)', async () => {
    sattBredd(1280);
    await oppnaOm(sk());
    klicka(q('om-typ-linje-mainroad'));
    expect(q('objekt-info')!.getAttribute('data-lage')).toBe('panel');
    expect(spion.typ.at(-1)).toBe('b1,b2:panel');
    klicka(qa('om-objekt-knapp')[0]);
    expect(spion.visa).toEqual(['b1:panel']);
  });

  it('‹ objektnamn tar tillbaka till kortet', async () => {
    await oppnaOm(sk());
    expect(q('info-tillbaka')!.textContent).toContain('Skälviken RP J-Hus- 25');
    klicka(q('info-tillbaka'));
    expect(q('objekt-info')!.getAttribute('data-vy')).toBe('kort');
  });

  it('startVy="om": objektinfon öppnas direkt på Om trakten (telefonens "‹ Lista")', async () => {
    await montera(props({ startVy: 'om' }));
    expect(q('om-innehall')).not.toBeNull();
    expect(q('kort-till-foraren')).toBeNull();
  });
});

describe('position — sidans currentPosition är { lat, lon } (PR 766)', () => {
  // Så som sidan bygger positionen: { lat, lon } genom gpsNu → { lat, lng }. Förut matades komponenterna med färdigt { lat, lng } och kraschen i sidan syntes aldrig.
  const sidansPosition = (position: { lat: number; lon: number } | null) => gpsNu({ korvyAktiv: false, korvyPos: null, position });
  const sk = (pos: { lat: number; lng: number } | null) => { const p = props({ markeringar: SK, pos }); p.om.miljo = MILJO_EJ_KRAV; return p; };

  it('utan position: kortet OCH Om trakten renderas, utan avstånd', async () => {
    await montera(sk(sidansPosition(null)));
    expect(q('kort-knappar')).not.toBeNull();
    klicka(q('kort-pa-trakten'));
    expect(qa('om-objekt').length).toBe(2);
    expect(qa('om-avstand').length).toBe(0);
  });

  it('MED position i { lat, lon }-form: kortet OCH Om trakten renderas, och avstånd visas (närmast först)', async () => {
    await montera(sk(sidansPosition({ lat: 56.4009, lon: 14.7 })));
    expect(q('kort-knappar')).not.toBeNull();
    klicka(q('kort-pa-trakten'));
    const rader = qa('om-objekt');
    expect(rader.map((r) => r.getAttribute('data-id'))).toEqual(['f1', 'f2']);
    expect(rader[0].querySelector('[data-testid="om-avstand"]')!.textContent).toBe('5 m');
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
    klicka(q('mer-vagdata'));
    expect(spion.mer).toEqual(['genomgang', 'vagdata']);
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
