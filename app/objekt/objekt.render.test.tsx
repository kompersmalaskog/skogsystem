// @vitest-environment jsdom
/**
 * RENDERINGSKONTROLL: Objekt + beställning i EN vy. Vad som vaktas här — och som tsc/lint inte ser:
 *  - HOOK-ORDNING: vyn monteras genom laddar → klar → ark öppet/stängt utan "Rendered more/fewer hooks" (React #310, 2026-10-02).
 *  - TÄCKNINGEN: det avslutade Bågskyttebanan syns OCH räknas ("6 234 / 5 000", "Beställningen fylld · 1 234 över") — förut dolde
 *    listan avslutade objekt medan stapeln räknade dem.
 *  - TILLSTÅND I KLARTEXT på varje rad, och det som saknas på samma rad.
 *  - Läsfel är ett fel med Försök igen, aldrig en tom lista.
 *  - Arket: Spara inaktiv tills något ändrats; förslaget skriver aldrig över en månad som redan har en beställning.
 *  - Objektvyn: det osäkra först, "Ja, det stämmer" skriver en Bekräftad-rad, saknade filer står som information.
 * Datan är prod oktober 2026 (verifierad mot databasen 2026-10-19): Skälvikens hänsynsytor, basväg och kraftledning ur objekt_geometri.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const OBJ = (id: string, namn: string, typ: string, volym: number, status: string, o: Record<string, unknown> = {}) => ({
  id, namn, typ, bolag: 'Vida', ar: 2026, manad: 10, volym, status, ordning: 1, areal: null, cert: 'FSC PEFC', grot: false, markagare: 'Johannishus Godsförvaltning Ab',
  inkopare: 'Martin Hjert', fastighetsbeteckning: 'JOHANNISHUS 1:2', traktdirektiv_url: 'td.pdf', stamplingslangd_url: null, traktkarta_url: null, traktkartor: null,
  oversiktskarta_url: null, valtlapp_url: null, ovriga_dokument: null, checklist_items: null, import_varningar: [], ...o,
});
const SKALVIKEN_VARNING = '"Skälviken.pdf" tolkad som stämplingslängd via Info — OSÄKER, bekräfta i UI:t.';
const OBJEKT = [
  OBJ('sandasen', 'Sandåsen gallring 2025', 'gallring', 146, 'pagaende', { cert: 'PEFC', markagare: 'Hans Koch', inkopare: 'Jan-Erik Gustafsson' }),
  OBJ('vashult', 'Vashult gallring 2026', 'gallring', 100, 'oplanerad', { cert: 'None' }),
  OBJ('intaget', 'Intaget gallring', 'gallring', 88, 'oplanerad', { cert: 'None' }),
  OBJ('bagskytte', 'Bågskyttebanan RP J-Hus- 25', 'slutavverkning', 3495, 'avslutat', { stamplingslangd_url: 'sl.pdf', grot: true }),
  OBJ('skalviken', 'Skälviken RP J-Hus -25', 'slutavverkning', 1734, 'planerad', {
    areal: 7.28, grot: true, stamplingslangd_url: 'sl-skalviken.pdf', traktkarta_url: '883966_traktkarta.pdf', checklist_items: new Array(22).fill({ fraga: 'f' }),
    import_varningar: ['OGI ForestOwner: URBAN EK (urban.ek@vida.se) — VIDA-kontakt, ej lagrad som markägare.', SKALVIKEN_VARNING],
  }),
  OBJ('molleryd', 'Mölleryd RP J-Hus -25', 'slutavverkning', 1005, 'oplanerad', {}),
];
const POSTER = [
  { id: 'b-g', ar: 2026, manad: 10, typ: 'gallring', bolag: 'Vida', bolag_id: 1, volym: 1000 },
  { id: 'b-s', ar: 2026, manad: 10, typ: 'slutavverkning', bolag: 'Vida', bolag_id: 1, volym: 5000 },
  { id: 'b-n', ar: 2026, manad: 11, typ: 'gallring', bolag: 'Vida', bolag_id: 1, volym: 500 },
];
const GEOMETRI = { features: [
  ...[3112.50097656, 406.545654297, 1024.9777832, 2161.19848633, 1611.84179688].map(a => ({ properties: { _typ: 'hänsynsyta', FLBESKR: 'Grova lövträd F', 'SHAPE.STAr': String(a) } })),
  { properties: { _typ: 'linje', FLBESKR: 'Kraftledning', 'SHAPE.STLe': '731.434741655' } },
  { properties: { _typ: 'linje', FLBESKR: 'Basväg', 'SHAPE.STLe': '204.848339109' } },
  { properties: { _typ: 'punkt', FLBESKR: 'Larmkoordinat' } },
  { properties: { _typ: 'punkt', FLBESKR: 'Virkesavlägg' } },
] };

// ---- Supabase-fake: filtrerar eller returnerar fel, loggar skrivningar ----
const DB: { objekt: any[]; poster: any[]; lasFel: boolean; skrivningar: { tabell: string; op: string; payload: any; filter?: any }[]; signerade: string[] } = { objekt: [], poster: [], lasFel: false, skrivningar: [], signerade: [] };

vi.mock('@/lib/supabase', () => {
  const byggare = (tabell: string) => {
    const f: { k: string; v: any; op: string }[] = [];
    let op = 'select', payload: any = null, enkel = false;
    const tabellrader = () => (tabell === 'objekt' ? DB.objekt : tabell === 'bestallningar' ? DB.poster : tabell === 'objekt_geometri' ? [{ objekt_id: 'skalviken', geometri: GEOMETRI }] : []);
    const svar = () => {
      if (DB.lasFel && op === 'select') return { data: null, error: { message: 'Anslutningen avbröts' } };
      if (op === 'upsert' || op === 'insert' || op === 'update') {
        DB.skrivningar.push({ tabell, op, payload, filter: f.map(x => `${x.k}${x.op}${x.v}`) });
        const n = Array.isArray(payload) ? payload.length : 1;
        return { data: Array.from({ length: n }, (_, i) => ({ id: `ny-${i}` })), error: null };
      }
      let rader = tabellrader().filter(r => f.every(x => (x.op === 'eq' ? r[x.k] === x.v : x.op === 'in' ? x.v.includes(r[x.k]) : x.op === 'gte' ? r[x.k] >= x.v : x.op === 'lte' ? r[x.k] <= x.v : true)));
      return { data: enkel ? (rader[0] ?? null) : rader, error: null };
    };
    const p: any = new Proxy(() => {}, {
      get(_t, prop: string) {
        if (prop === 'then') return (res: any, rej: any) => Promise.resolve(svar()).then(res, rej);
        if (prop === 'maybeSingle' || prop === 'single') return () => { enkel = true; return p; };
        if (prop === 'upsert' || prop === 'insert' || prop === 'update') return (pl: any) => { op = prop; payload = pl; return p; };
        if (prop === 'eq' || prop === 'in' || prop === 'gte' || prop === 'lte') return (k: string, v: any) => { f.push({ k, v, op: prop }); return p; };
        return () => p;
      },
    });
    return p;
  };
  return { supabase: { from: (t: string) => byggare(t), storage: { from: (b: string) => ({ createSignedUrl: async (path: string) => { DB.signerade.push(`${b}/${path}`); return { data: { signedUrl: `https://signerad.example/${b}/${path}` }, error: null }; } }) } } };
});

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let konsolFel: string[] = [];
const hookFel = () => konsolFel.filter(m => /Rendered (more|fewer) hooks|change in the order of Hooks|#310/i.test(m));
const stilla = async (n = 4) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
/** Tillstand tonar över i 250 ms (RORELSE.byte) — vänta tills villkoret gäller i stället för en fast tid. */
async function tills(vill: () => boolean, max = 2000) {
  const start = Date.now();
  while (!vill() && Date.now() - start < max) await act(async () => { await new Promise(r => setTimeout(r, 25)); });
}
const knapp = (t: string, exakt = false) => Array.from(behallare!.ownerDocument.querySelectorAll('button')).find(b => (exakt ? (b.textContent || '').trim() === t : (b.textContent || '').includes(t)));
async function klicka(el: Element | undefined | null) { if (!el) throw new Error(`hittar inte elementet — sidan säger: ${(behallare!.ownerDocument.body.textContent || '').slice(0, 400)}`); await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await stilla(); }
const text = () => behallare!.ownerDocument.body.textContent || '';
/** Svensk talformatering skriver tusental med hårt mellanslag (1 000) — bara där. */
const nbsp = (s: string) => s.replace(/(\d) (?=\d{3}\b)/g, '$1\u00a0');

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  konsolFel = []; DB.objekt = OBJEKT; DB.poster = POSTER; DB.lasFel = false; DB.skrivningar = []; DB.signerade = [];
  vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { konsolFel.push(a.map(String).join(' ')); });
  vi.stubGlobal('open', vi.fn(() => ({ close() {}, location: { href: '' } })));
  behallare = document.createElement('div');
  document.body.appendChild(behallare);
});
afterEach(() => { act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; behallare = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function montera(url = '/objekt?ar=2026&manad=10') {
  window.history.replaceState({}, '', url);
  const { default: ObjektVy } = await import('./_components/ObjektVy');
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<ObjektVy />); });
  await tills(() => !text().includes('Läser objekt och beställning'));
  await stilla();
}

describe('Objekt + beställning — listan', () => {
  it('monteras utan hook-fel och visar båda sektionerna med tal, läge och ALLA objekt (även avslutade)', async () => {
    await montera();
    expect(hookFel()).toEqual([]);
    const t = text();
    expect(t).toContain(nbsp('334 / 1 000'));
    expect(t).toContain(nbsp('6 234 / 5 000'));
    expect(t).toContain(nbsp('666 m³fub kvar till beställningen'));
    expect(t).toContain(nbsp('Beställningen fylld · 1 234 över'));
    expect(t).toContain('Bågskyttebanan RP J-Hus- 25'); // avslutat: syns OCH räknas
    expect(t).toContain('Oktober 2026');
  });

  it('tillstånd i klartext, och det som saknas står på samma rad', async () => {
    await montera();
    const rad = (id: string) => behallare!.querySelector(`[data-objekt="${id}"]`)!.textContent!;
    expect(rad('sandasen')).toContain('Igång');
    expect(rad('vashult')).toContain('Väntar på planering');
    expect(rad('bagskytte')).toContain('Klar');
    expect(rad('bagskytte')).not.toMatch(/saknar/); // ett klart objekt nagas inte
    expect(rad('skalviken')).toContain('Planerad · stämplingslängd osäker');
    expect(rad('molleryd')).toContain('Väntar på planering · saknar stämplingslängd');
    expect(rad('molleryd')).toContain(nbsp('1 005'));
  });

  it('läsfel är ett fel med Försök igen — aldrig en tom lista', async () => {
    DB.lasFel = true;
    await montera();
    expect(text()).toContain('Kunde inte läsa objekten');
    expect(knapp('Försök igen')).toBeTruthy();
    expect(behallare!.querySelector('[data-objekt]')).toBeNull();
    DB.lasFel = false;
    await klicka(knapp('Försök igen'));
    await tills(() => !!behallare!.querySelector('[data-objekt="skalviken"]'));
    expect(behallare!.querySelector('[data-objekt="skalviken"]')).toBeTruthy();
  });

  it('en månad utan objekt säger varför listan är tom och vad som fyller den', async () => {
    await montera('/objekt?ar=2026&manad=12');
    expect(text()).toContain('Inga objekt inlagda i december 2026. Importera en traktfil');
    expect(text()).toContain('Ingen beställning inlagd');
  });

  it('månadsväljaren byter månad och adressen följer', async () => {
    await montera();
    await klicka(behallare!.ownerDocument.querySelector('[aria-label="Nästa månad"]'));
    await tills(() => text().includes('Inga objekt inlagda i november 2026'));
    expect(text()).toContain('November 2026');
    expect(window.location.search).toBe('?ar=2026&manad=11');
  });
});

describe('Ändra beställning', () => {
  it('rubrikraden öppnar arket; Spara är inaktiv tills något ändrats; sparar med nyckeln (ar, manad, bolag, typ)', async () => {
    await montera();
    await klicka(behallare!.ownerDocument.querySelector('section[aria-label="Gallring"] h3 button'));
    expect(hookFel()).toEqual([]);
    const spara = knapp('Spara', true) as HTMLButtonElement;
    expect(spara.style.opacity).toBe('0.4');
    expect(text()).toContain(nbsp('Redan inlagt: 334 m³fub i 3 objekt'));
    expect(text()).toContain(nbsp('Redan inlagt: 6 234 m³fub i 3 objekt'));

    const falt = behallare!.ownerDocument.querySelectorAll<HTMLInputElement>('input[inputmode="numeric"]');
    expect(Array.from(falt).map(i => i.value)).toEqual(['1000', '5000']);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(falt[0], '1200'); falt[0].dispatchEvent(new Event('input', { bubbles: true })); });
    await stilla();
    expect((knapp('Spara', true) as HTMLButtonElement).style.opacity).not.toBe('0.4');
    await klicka(knapp('Spara', true));
    expect(DB.skrivningar).toHaveLength(1);
    expect(DB.skrivningar[0].payload).toMatchObject([{ ar: 2026, manad: 10, typ: 'gallring', bolag: 'Vida', bolag_id: 1, volym: 1200 }]);
    expect(DB.skrivningar[0].payload).toHaveLength(1); // bara det som ändrats
    expect(text()).toContain('Beställningen för oktober är sparad.');
  });

  it('förslaget: 14 månader, en redan inlagd rörs inte, och Lägg in skriver bara de valda', async () => {
    await montera();
    await klicka(behallare!.ownerDocument.querySelector('section[aria-label="Gallring"] h3 button'));
    await klicka(behallare!.ownerDocument.querySelector('[data-foresla]'));
    await tills(() => behallare!.ownerDocument.querySelectorAll('[data-forslag-manad]').length > 0);
    const rader = behallare!.ownerDocument.querySelectorAll('[data-forslag-manad]');
    expect(rader).toHaveLength(14);
    expect(behallare!.ownerDocument.querySelector('[data-forslag-manad="2026-11"]')!.textContent).toContain(nbsp('Redan inlagd: Gallring 500'));
    expect(knapp('Lägg in 13 månader')).toBeTruthy(); // 14 minus november
    await klicka(behallare!.ownerDocument.querySelector('[data-forslag-manad="2026-12"]')); // välj bort december
    await klicka(knapp('Lägg in 12 månader'));
    const skrivet = DB.skrivningar[0].payload as any[];
    expect(skrivet).toHaveLength(24); // 12 månader × 2 typer
    expect(skrivet.some(r => r.manad === 11 && r.ar === 2026)).toBe(false); // november (redan inlagd) rörs inte
    expect(skrivet.some(r => r.manad === 12 && r.ar === 2026)).toBe(false); // december valdes bort
    expect(skrivet.find(r => r.ar === 2027 && r.manad === 3 && r.typ === 'slutavverkning')).toMatchObject({ volym: 5000, bolag: 'Vida' });
  });
});

describe('Lägg in manuellt', () => {
  it('två fält + typ; knappen är inaktiv tills namn och volym finns; objektet får månadens år/månad och status utelämnas', async () => {
    await montera();
    await klicka(knapp('eller lägg in manuellt'));
    expect(text()).toContain('Läggs in i oktober 2026.');
    const lagg = knapp('Lägg in', true) as HTMLButtonElement;
    expect(lagg.style.opacity).toBe('0.4');
    const [namn, volym] = Array.from(behallare!.ownerDocument.querySelectorAll<HTMLInputElement>('input:not([type="file"])'));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(namn, 'Testtrakten'); namn.dispatchEvent(new Event('input', { bubbles: true })); setter.call(volym, '250'); volym.dispatchEvent(new Event('input', { bubbles: true })); });
    await stilla();
    await klicka(knapp('Lägg in', true));
    const s = DB.skrivningar[0];
    expect(s.tabell).toBe('objekt');
    expect(s.payload).toMatchObject({ namn: 'Testtrakten', volym: 250, ar: 2026, manad: 10, kalla: 'manuell', bolag: 'Vida' });
    expect(s.payload).not.toHaveProperty('status');
    expect(s.payload.typ).toBe('gallring'); // förvald: den typ vars beställning inte är fylld
  });
});

describe('Objektvyn — vad filen gav oss', () => {
  async function monteraObjekt(id: string) {
    window.history.replaceState({}, '', '/objekt/x?ar=2026&manad=10');
    const { default: FilenGavVy } = await import('./_components/FilenGavVy');
    rot = createRoot(behallare!);
    await act(async () => { rot!.render(<FilenGavVy objektId={id} />); });
    await tills(() => !text().includes('Läser objektet'));
    await stilla();
  }

  it('Skälviken: det osäkra först, sedan en rad per sak med vad filen BETYDER', async () => {
    await monteraObjekt('skalviken');
    expect(hookFel()).toEqual([]);
    const t = text();
    expect(t.indexOf('Osäkert')).toBeLessThan(t.indexOf('Vad filen gav oss'));
    expect(t).toContain('Är det här stämplingslängden? Filen hette Skälviken.pdf och hade inget namn vi känner igen.');
    expect(knapp('Ja, det stämmer')).toBeTruthy();
    expect(knapp('Öppna filen')).toBeTruthy();
    expect(t).toContain('1 blad');
    expect(t).toContain('5 ytor · 0,83\u00a0ha · Grova lövträd F');
    expect(t).toContain('Kraftledning över trakten · 731\u00a0m ritad');
    expect(t).toContain('Basväg 205\u00a0m');
    expect(t).toContain('1 avlägg');
    expect(t).toContain('22 frågor');
    expect(t).toContain('JOHANNISHUS 1:2 · inköpare Martin Hjert');
    expect(t).toContain('FSC PEFC');
    expect(t).toContain('Johannishus Godsförvaltning Ab');
    expect(t).toContain(nbsp('1 734'));
    expect(t).toContain('7,28 ha');
  });

  it('"Ja, det stämmer" ersätter OSÄKER-raden med en Bekräftad-rad — rör inga andra rader', async () => {
    await monteraObjekt('skalviken');
    DB.objekt = OBJEKT.map(o => (o.id === 'skalviken' ? { ...o, import_varningar: o.import_varningar } : o));
    await klicka(knapp('Ja, det stämmer'));
    const s = DB.skrivningar.find(x => x.tabell === 'objekt')!;
    expect(s.op).toBe('update');
    expect(s.payload.import_varningar).toEqual([
      'OGI ForestOwner: URBAN EK (urban.ek@vida.se) — VIDA-kontakt, ej lagrad som markägare.',
      'Bekräftad: "Skälviken.pdf" är stämplingslängd.',
    ]);
    expect(s.payload).not.toHaveProperty('stamplingslangd_url'); // den var redan tolkad som stämplingslängd
  });

  it('saknade filer står som information, aldrig som en tom rad', async () => {
    await monteraObjekt('molleryd');
    const t = text();
    expect(t).toContain('Ingen traktkarta i filen');
    expect(t).toContain('Ingen stämplingslängd i filen');
    expect(t).toContain('Ingen geometri sparad för objektet');
    expect(t).toContain('Inga frågor i filen');
    expect(t).not.toContain('Osäkert'); // inget osäkert att fråga om
  });

  it('läsfel är ett fel med Försök igen; ett okänt id säger att objektet inte finns', async () => {
    DB.lasFel = true;
    await monteraObjekt('skalviken');
    expect(text()).toContain('Kunde inte läsa objektet');
    expect(knapp('Försök igen')).toBeTruthy();
    act(() => { rot?.unmount(); }); rot = null;
    DB.lasFel = false;
    await monteraObjekt('finns-inte');
    expect(text()).toContain('Objektet finns inte längre');
  });
});
