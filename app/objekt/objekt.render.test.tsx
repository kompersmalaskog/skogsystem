// @vitest-environment jsdom
/**
 * RENDERINGSKONTROLL: Objekt + beställning i EN vy. Vad som vaktas här — och som tsc/lint inte ser:
 *  - HOOK-ORDNING: vyn monteras genom laddar → klar → ark öppet/stängt utan "Rendered more/fewer hooks" (Reacts hook-fel 310, 2026-10-02).
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

const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace, push: vi.fn() }) }));

const VO: Record<string, string> = { bagskytte: '11271849', sandasen: '11000001', skalviken: '11161397' };
const OBJ = (id: string, namn: string, typ: string, volym: number, status: string, o: Record<string, unknown> = {}) => ({
  id, vo_nummer: VO[id] ?? null, namn, typ, bolag: 'Vida', ar: 2026, manad: 10, volym, status, kalla: 'envz', ordning: 1, areal: null, cert: 'FSC PEFC', grot: false, markagare: 'Johannishus Godsförvaltning Ab',
  inkopare: 'Martin Hjert', fastighetsbeteckning: 'JOHANNISHUS 1:2', traktdirektiv_url: 'td.pdf', stamplingslangd_url: null, traktkarta_url: null, traktkartor: null,
  oversiktskarta_url: null, valtlapp_url: null, ovriga_dokument: null, checklist_items: null, import_varningar: [], ...o,
});
const SKALVIKEN_VARNING = '"Skälviken.pdf" tolkad som stämplingslängd via Info — OSÄKER, bekräfta i UI:t.';
const MOLLERYD_VARNING = 'PDF utan känt suffix: "Mölleryd.pdf" — sparad som övrigt dokument.';
const URBAN = 'OGI ForestOwner: URBAN EK (urban.ek@vida.se) — VIDA-kontakt, ej lagrad som markägare.';
const LAGER = 'Okänt lagernamn "SV_FASTIGHET" — importeras som typ \'okänt\'. Kolla om VIDA lagt till ett lager.';
const OBJEKT = [
  OBJ('sandasen', 'Sandåsen gallring 2025', 'gallring', 146, 'pagaende', { cert: 'PEFC', markagare: 'Hans Koch', inkopare: 'Jan-Erik Gustafsson' }),
  OBJ('vashult', 'Vashult gallring 2026', 'gallring', 100, 'oplanerad', { cert: 'None' }),
  OBJ('intaget', 'Intaget gallring', 'gallring', 88, 'oplanerad', { cert: 'None' }),
  OBJ('bagskytte', 'Bågskyttebanan RP J-Hus- 25', 'slutavverkning', 3495, 'avslutat', { areal: 5.68, stamplingslangd_url: 'sl.pdf', grot: true, import_varningar: [URBAN, SKALVIKEN_VARNING.replace('Skälviken', 'Bågskyttebanan')] }),
  OBJ('skalviken', 'Skälviken RP J-Hus -25', 'slutavverkning', 1734, 'planerad', {
    areal: 7.28, grot: true, stamplingslangd_url: 'sl-skalviken.pdf', traktkarta_url: '883966_traktkarta.pdf', checklist_items: new Array(22).fill({ fraga: 'f' }),
    import_varningar: [URBAN, SKALVIKEN_VARNING, LAGER],
  }),
  OBJ('molleryd', 'Mölleryd RP J-Hus -25', 'slutavverkning', 1005, 'oplanerad', { ovriga_dokument: [{ namn: 'Mölleryd.pdf', path: '886465_ovrigt_0.pdf' }], import_varningar: [URBAN, MOLLERYD_VARNING] }),
  // Tredje typen: GROT har ingen beställning. Den här ligger i oktober; Kroksjömåla och Kompersmåla väggata saknar månad (prod 2026-10-19).
  OBJ('grot-okt', 'Hålabäck GROT', 'grot', 0, 'planerad', { volym: null, kalla: 'starta-jobb', traktdirektiv_url: null }),
  OBJ('kroksjomala', 'Kroksjömåla Grot', 'grot', 0, 'pagaende', { volym: null, ar: null, manad: null, kalla: 'starta-jobb', traktdirektiv_url: null, bolag: 'Vida Energi' }),
  OBJ('vaggata', 'Kompersmåla väggata', 'slutavverkning', 0, 'oplanerad', { volym: null, ar: null, manad: null, kalla: 'starta-jobb', traktdirektiv_url: null, bolag: null }),
  OBJ('gammal-utan-manad', 'Gammal avslutad', 'slutavverkning', 400, 'avslutat', { ar: null, manad: null }),
];
// Maskinernas utfall (fakt_produktion: flera rader per objekt — dag × trädslag). Bågskyttebanan 1 687 m³fub (prod 2026-10-20), Sandåsen 294 hittills.
const UTFALL = [
  { id: 1, objekt_id: '11271849', volym_m3sub: 1000.5 }, { id: 2, objekt_id: '11271849', volym_m3sub: 686.5 },
  { id: 3, objekt_id: '11000001', volym_m3sub: 294 }, { id: 4, objekt_id: '11161397', volym_m3sub: 1700 },
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
const DB: { objekt: any[]; poster: any[]; utfall: any[]; utfallFel: boolean; lasFel: boolean; saknarKolumner: boolean; skrivningar: { tabell: string; op: string; payload: any; filter?: any }[]; signerade: string[] } = { objekt: [], poster: [], utfall: [], utfallFel: false, lasFel: false, saknarKolumner: false, skrivningar: [], signerade: [] };

vi.mock('@/lib/supabase', () => {
  const byggare = (tabell: string) => {
    const f: { k: string; v: any; op: string }[] = [];
    let op = 'select', payload: any = null, enkel = false, utanManad = false, valda = '';
    const tabellrader = () => (tabell === 'objekt' ? DB.objekt : tabell === 'fakt_produktion' ? DB.utfall : tabell === 'bestallningar' ? DB.poster : tabell === 'objekt_geometri' ? [{ objekt_id: 'skalviken', geometri: GEOMETRI }] : []);
    const svar = () => {
      if (DB.lasFel && op === 'select') return { data: null, error: { message: 'Anslutningen avbröts' } };
      if (DB.utfallFel && tabell === 'fakt_produktion') return { data: null, error: { message: 'Utfallet kunde inte läsas' } };
      // Migrationen objekt_stamplingslangd_tal ej körd: PostgREST svarar 42703 på en select som nämner kolumnerna och PGRST204 på en skrivning.
      if (DB.saknarKolumner && tabell === 'objekt' && op === 'select' && /stamplingslangd_volym/.test(valda)) return { data: null, error: { code: '42703', message: 'column objekt.stamplingslangd_volym does not exist' } };
      if (DB.saknarKolumner && tabell === 'objekt' && op === 'update' && payload && 'stamplingslangd_volym' in payload) return { data: null, error: { code: 'PGRST204', message: "Could not find the 'stamplingslangd_volym' column of 'objekt' in the schema cache" } };
      if (op === 'upsert' || op === 'insert' || op === 'update' || op === 'delete') {
        DB.skrivningar.push({ tabell, op, payload, filter: f.map(x => `${x.k}${x.op}${x.v}`) });
        const n = Array.isArray(payload) ? payload.length : 1;
        return { data: Array.from({ length: n }, (_, i) => ({ id: `ny-${i}` })), error: null };
      }
      let rader = tabellrader().filter(r => f.every(x => (x.op === 'eq' ? r[x.k] === x.v : x.op === 'in' ? x.v.includes(r[x.k]) : x.op === 'gte' ? r[x.k] >= x.v : x.op === 'lte' ? r[x.k] <= x.v : x.op === 'neq' ? r[x.k] !== x.v : true)))
        .filter(r => !utanManad || r.ar == null || r.manad == null);
      return { data: enkel ? (rader[0] ?? null) : rader, error: null };
    };
    const p: any = new Proxy(() => {}, {
      get(_t, prop: string) {
        if (prop === 'then') return (res: any, rej: any) => Promise.resolve(svar()).then(res, rej);
        if (prop === 'select') return (k?: string) => { if (typeof k === 'string') valda = k; return p; };
        if (prop === 'maybeSingle' || prop === 'single') return () => { enkel = true; return p; };
        if (prop === 'or') return () => { utanManad = true; return p; };
        if (prop === 'upsert' || prop === 'insert' || prop === 'update' || prop === 'delete') return (pl?: any) => { op = prop; payload = pl ?? null; return p; };
        if (prop === 'eq' || prop === 'in' || prop === 'gte' || prop === 'lte' || prop === 'neq') return (k: string, v: any) => { f.push({ k, v, op: prop }); return p; };
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
const hookFel = () => konsolFel.filter(m => /Rendered (more|fewer) hooks|change in the order of Hooks|Minified React error/i.test(m));
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
  routerReplace.mockClear(); konsolFel = []; DB.objekt = OBJEKT; DB.poster = POSTER; DB.utfall = UTFALL; DB.utfallFel = false; DB.lasFel = false; DB.saknarKolumner = false; DB.skrivningar = []; DB.signerade = [];
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
    expect(t).toContain(nbsp('334 / 1 000 m³fub'));
    expect(t).toContain(nbsp('6 234 / 5 000 m³fub'));
    expect(t).toContain(nbsp('666 m³fub kvar till beställningen'));
    expect(t).toContain(nbsp('Beställningen fylld · 1 234 m³fub över'));
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
    // ...och ställer ingen fråga om PDF:er (en gammal OSÄKER-rad finns kvar) — men volymen är en fråga: 615 m³fub/ha ingår i täckningen.
    expect(rad('bagskytte')).toContain('2 frågor'); // orimlig volym per hektar + avvikande utfall (plan 3 495 mot utfall 1 687)
    expect(rad('skalviken')).not.toMatch(/orimlig|per hektar/); // 238 m³fub/ha är rimligt
    expect(rad('skalviken')).toContain('Planerad · 1 fråga');
    expect(rad('molleryd')).toContain('Väntar på planering · 2 frågor'); // okänd PDF + rotpost utan identifierad stämplingslängd
    expect(rad('molleryd')).toContain(nbsp('1 005'));
    expect(text()).not.toMatch(/saknar stämplingslängd|stämplingslängd osäker/); // saknad stämplingslängd är normaltillståndet, ingen varning
  });

  it('orange bär bara det som kräver en hand: "Väntar på planering" är normaltillstånd (dämpat), frågan är orange', async () => {
    await montera();
    const farg = (id: string, ord: string) => Array.from(behallare!.querySelector(`[data-objekt="${id}"]`)!.querySelectorAll('span')).find(x => (x.textContent ?? '').includes(ord))!.style.color;
    expect(farg('vashult', 'Väntar på planering')).toBe('rgb(142, 142, 147)'); // FARG.text2
    expect(farg('molleryd', '2 frågor')).toBe('rgb(255, 159, 10)'); // FARG.orange
    expect(farg('sandasen', 'Igång')).toBe('rgb(48, 209, 88)');
  });

  it('klart är dämpat i ORDET, inte i talet: ett avslutat objekts volym ritas som alla andras', async () => {
    await montera();
    const rad = behallare!.querySelector('[data-objekt="bagskytte"]')!;
    const tal = Array.from(rad.querySelectorAll<HTMLElement>('div')).find(d => d.textContent === nbsp('3 495 m³fub') && d.style.color)!;
    expect(tal.style.color).toBe('rgb(255, 255, 255)');
    expect(Array.from(rad.querySelectorAll('span')).find(x => x.textContent === 'Klar')!.style.color).toBe('rgb(142, 142, 147)');
  });

  it('GROT är en tredje sektion utan beställning (ingen rubrikrad med tal, inget läge)', async () => {
    await montera();
    const sek = behallare!.querySelector('section[aria-label="GROT"]')!;
    expect(sek.querySelector('[data-objekt="grot-okt"]')).toBeTruthy();
    expect(sek.querySelector('button')).toBeNull(); // rubriken är inte tryckbar: det finns ingen beställning att ändra
    expect(sek.textContent).not.toMatch(/beställning/i);
    expect(behallare!.querySelector('[data-objekt="grot-okt"]')!.textContent).not.toMatch(/saknar|saknas/); // GROT har ingen volymkrav
  });

  it('de levande objekten utan månad har en plats sist — och de avslutade utan månad drar inte in i den', async () => {
    await montera();
    const sek = behallare!.querySelector('section[aria-label="Utan månad (2)"]')!;
    expect(sek).toBeTruthy();
    expect(sek.querySelector('[data-objekt="kroksjomala"]')!.textContent).toContain('GROT · Igång');
    expect(sek.querySelector('[data-objekt="vaggata"]')!.textContent).toContain('Slutavverkning · Väntar på planering');
    expect(sek.querySelector('[data-objekt="gammal-utan-manad"]')).toBeNull();
    expect(sek.textContent).toContain('räknas inte mot någon beställning');
    const sektioner = Array.from(behallare!.querySelectorAll('section')).map(x => x.getAttribute('aria-label'));
    expect(sektioner[sektioner.length - 1]).toBe('Utan månad (2)');
    // De räknas inte i täckningen:
    expect(text()).toContain(nbsp('334 / 1 000 m³fub'));
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
  const sattVarde = async (el: HTMLInputElement, v: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const faltInput = () => Array.from(behallare!.ownerDocument.querySelectorAll<HTMLInputElement>('input:not([type="file"])'));
  const typFlikar = () => Array.from(behallare!.ownerDocument.querySelectorAll<HTMLElement>('[data-typval] [role="tab"]'));

  it('tre typer och INGET förval: knappen är inaktiv även när namn och volym finns, tills en typ har valts', async () => {
    await montera();
    await klicka(knapp('eller lägg in manuellt'));
    expect(typFlikar().map(t => t.textContent)).toEqual(['Gallring', 'Slutavverkning', 'GROT']);
    expect(typFlikar().some(t => t.getAttribute('aria-selected') === 'true')).toBe(false);
    const [namn, volym] = faltInput();
    await sattVarde(namn, 'Testtrakten'); await sattVarde(volym, '250');
    await stilla();
    expect((knapp('Lägg in', true) as HTMLButtonElement).style.opacity).toBe('0.4');
    await klicka(typFlikar()[1]);
    expect((knapp('Lägg in', true) as HTMLButtonElement).style.opacity).not.toBe('0.4');
  });

  it('objektet får månadens år/månad, vald typ och beställningens bolag; status utelämnas', async () => {
    await montera();
    await klicka(knapp('eller lägg in manuellt'));
    const [namn, volym] = faltInput();
    await sattVarde(namn, 'Testtrakten'); await sattVarde(volym, '250');
    await klicka(typFlikar()[1]);
    await klicka(knapp('Lägg in', true));
    const s = DB.skrivningar[0];
    expect(s.tabell).toBe('objekt');
    expect(s.payload).toMatchObject({ namn: 'Testtrakten', volym: 250, typ: 'slutavverkning', ar: 2026, manad: 10, kalla: 'manuell', bolag: 'Vida' });
    expect(s.payload).not.toHaveProperty('status');
  });

  it('GROT: volymen är valfri, ingen enhet, och inget bolag gissas', async () => {
    await montera();
    await klicka(knapp('eller lägg in manuellt'));
    await klicka(typFlikar()[2]);
    expect(text()).toContain('Volym (valfritt)');
    const [namn] = faltInput();
    await sattVarde(namn, 'Ny grotjobb');
    await klicka(knapp('Lägg in', true));
    expect(DB.skrivningar[0].payload).toMatchObject({ namn: 'Ny grotjobb', volym: null, typ: 'grot', bolag: null, ar: 2026, manad: 10 });
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

  it('Skälviken: faran först, sedan frågan, sedan en rad per sak med vad filen BETYDER', async () => {
    await monteraObjekt('skalviken');
    expect(hookFel()).toEqual([]);
    const t = text();
    expect(t.indexOf('Fara')).toBeLessThan(t.indexOf('Fråga'));
    expect(t.indexOf('Fråga')).toBeLessThan(t.indexOf('Vad filen gav oss'));
    // Gissad PDF på en rotpost = EN fråga (inte PDF-frågan + volymfrågan): importen gissade, ingen har läst papperet.
    expect(behallare!.querySelectorAll('[data-fraga]')).toHaveLength(1);
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_saknas"]')!.textContent).toContain('Importen gissade att "Skälviken.pdf" är den, men ingen har bekräftat det');
    expect(t).not.toContain('Är det här stämplingslängden?');
    expect(knapp('Öppna filen')).toBeTruthy();
    expect(knapp('Ja, det stämmer')).toBeUndefined(); // en bekräftelse som försvinner vid nästa omimport är sämre än ingen knapp
    expect(t).toContain('1 blad');
    expect(t).toContain('5 ytor · 0,83\u00a0ha · Grova lövträd F');
    expect(t).toContain('Kraftledning över trakten');
    expect(t).toContain('731\u00a0m ritad i filen');
    expect(t).toContain('Basväg 205\u00a0m');
    expect(t).toContain('1 avlägg');
    expect(t).toContain('22 frågor');
    expect(t).toContain('JOHANNISHUS 1:2 · inköpare Martin Hjert');
    expect(t).toContain('FSC PEFC');
    expect(t).toContain('Johannishus Godsförvaltning Ab');
    expect(t).toContain('7,28\u00a0ha');
  });

  it('tryckbara rader har skiljelinjen under sig, precis som de som inte går att trycka på (sista raden har ingen)', async () => {
    await monteraObjekt('skalviken');
    const rader = Array.from(behallare!.querySelectorAll<HTMLElement>('section[aria-label="Vad filen gav oss"] button, section[aria-label="Vad filen gav oss"] > div > div'));
    const traktdirektiv = Array.from(behallare!.querySelectorAll<HTMLElement>('button')).find(b => b.textContent?.startsWith('Traktdirektiv'))!;
    expect(traktdirektiv.style.borderBottomStyle).toBe('solid');
    const egenkontroll = Array.from(behallare!.querySelectorAll<HTMLElement>('div')).find(d => d.textContent?.startsWith('Egenkontroll22') && d.style.minHeight)!;
    expect(egenkontroll.style.borderBottomStyle).toBe('none');
    expect(rader.length).toBeGreaterThan(3);
  });

  it('faran är en egen rad (Fara) och Körning bär bara vägen — kraftledningen står inte på båda', async () => {
    await monteraObjekt('skalviken');
    const fara = behallare!.querySelector('[data-fara="Kraftledning"]')!;
    expect(fara.textContent).toContain('Kraftledning över trakten');
    const kor = Array.from(behallare!.querySelectorAll('button')).find(b => b.textContent?.startsWith('Körning'))
      ?? Array.from(behallare!.querySelectorAll('div')).find(d => d.textContent?.startsWith('KörningBasväg'))!;
    expect(kor.textContent).not.toMatch(/Kraftledning/);
  });

  it('namnet är rubriken och volymen ligger en nivå ned — inget TYP.tal som skriker högre än titeln', async () => {
    await monteraObjekt('skalviken');
    const h1 = behallare!.querySelector('h1')!;
    expect(h1.style.fontSize).toBe('30px');
    const volym = Array.from(behallare!.querySelectorAll('p')).find(p => p.textContent!.includes('m³fub'))!;
    expect(volym.style.fontSize).toBe('17px');
    expect(Array.from(behallare!.querySelectorAll('*')).some(e => (e as HTMLElement).style?.fontSize === '32px')).toBe(false);
  });

  it('en okänd PDF är SAMMA fråga som den osäkra stämplingslängden (Mölleryd), med "Öppna filen" som enda knapp', async () => {
    await monteraObjekt('molleryd');
    expect(text()).toContain('Vad är Mölleryd.pdf? Filen hade inget namn vi känner igen');
    // Mölleryd RP är en rotpost utan identifierad stämplingslängd: den frågan kommer ovanpå PDF-frågan, och pekar på den oidentifierade PDF:en.
    expect(Array.from(behallare!.querySelectorAll('[data-fraga]')).map(e => e.getAttribute('data-fraga'))).toEqual(['stamplingslangd_saknas', 'okand_pdf:Mölleryd.pdf']);
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_saknas"]')!.textContent).toContain('kan det vara stämplingslängden?');
    expect(knapp('Öppna filen')).toBeTruthy();
    await klicka(knapp('Öppna filen'));
    expect(DB.signerade).toContain('kartbilder/886465_ovrigt_0.pdf');
  });

  it('en avslutad trakt får ingen fråga om PDF:er, fast en gammal OSÄKER-rad finns kvar (Bågskyttebanan) — men volymen är en fråga', async () => {
    await monteraObjekt('bagskytte');
    expect(Array.from(behallare!.querySelectorAll('[data-fraga]')).map(e => e.getAttribute('data-fraga'))).toEqual(['orimlig_volym', 'avvikande_utfall']);
    expect(text()).not.toContain('Är det här stämplingslängden');
    expect(text()).toContain(nbsp('3 495 m³fub på 5,68 ha är 615 per hektar. Kontrollera mot stämplingslängden.'));
  });

  it('noterat ligger hopfällt och utveckling visas aldrig', async () => {
    await monteraObjekt('skalviken');
    expect(text()).toContain('Importnoteringar (1)'); // ForestOwner-raden
    expect(text()).not.toContain('Okänt lagernamn');
    expect(text()).not.toContain('URBAN EK'); // hopfälld
    await klicka(Array.from(behallare!.querySelectorAll('button')).find(b => b.textContent?.includes('Importnoteringar')));
    expect(text()).toContain('URBAN EK');
    expect(text()).not.toContain('Okänt lagernamn');
  });

  it('saknade filer står som information; saknad stämplingslängd är ingen rad alls', async () => {
    await monteraObjekt('vashult');
    const t = text();
    expect(t).toContain('Ingen traktkarta i filen');
    expect(t).toContain('Ingen geometri sparad för objektet');
    expect(t).toContain('Inga frågor i filen');
    expect(t).not.toMatch(/Ingen stämplingslängd i filen/);
    expect(t).not.toContain('Fråga'); // inget att fråga om
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

describe('Objektvyn — Ändra: flytta månad och ta bort', () => {
  async function monteraObjekt(id: string) {
    window.history.replaceState({}, '', '/objekt/x?ar=2026&manad=10');
    const { default: FilenGavVy } = await import('./_components/FilenGavVy');
    rot = createRoot(behallare!);
    await act(async () => { rot!.render(<FilenGavVy objektId={id} />); });
    await tills(() => !text().includes('Läser objektet'));
    await stilla();
  }

  it('Spara är inaktiv tills månaden ändrats; sparar bara år och månad (aldrig status)', async () => {
    await monteraObjekt('molleryd');
    await klicka(behallare!.querySelector('[data-andra]'));
    expect(text()).toContain('Oktober 2026');
    expect((knapp('Spara', true) as HTMLButtonElement).style.opacity).toBe('0.4');
    await klicka(behallare!.ownerDocument.querySelector('[aria-label="Nästa månad"]'));
    expect(text()).toContain('November 2026');
    await klicka(knapp('Spara', true));
    const s = DB.skrivningar.find(x => x.tabell === 'objekt')!;
    expect(s.op).toBe('update');
    expect(s.payload).toEqual({ ar: 2026, manad: 11 });
    expect(s.filter).toEqual(['ideqmolleryd']);
  });

  it('ett objekt utan månad kan få en: Välj månad lägger det i månaden man kom ifrån', async () => {
    await monteraObjekt('kroksjomala');
    await klicka(behallare!.querySelector('[data-andra]'));
    expect(text()).toContain('Ingen månad');
    await klicka(behallare!.ownerDocument.querySelector('[data-valj-manad]'));
    await klicka(knapp('Spara', true));
    expect(DB.skrivningar.find(x => x.tabell === 'objekt')!.payload).toEqual({ ar: 2026, manad: 10 });
  });

  it('Ta bort kräver bekräftelse i samma ark, och tar först bort när man bekräftar', async () => {
    await monteraObjekt('molleryd');
    await klicka(behallare!.querySelector('[data-andra]'));
    await klicka(behallare!.ownerDocument.querySelector('[data-ta-bort]'));
    expect(text()).toContain('Mölleryd RP J-Hus -25 tas bort från appen. Det går inte att ångra.');
    expect(DB.skrivningar).toHaveLength(0); // inget raderat än
    await klicka(behallare!.ownerDocument.querySelector('[data-borttag]'));
    const s = DB.skrivningar.find(x => x.tabell === 'objekt')!;
    expect(s.op).toBe('delete');
    expect(s.filter).toEqual(['ideqmolleryd']);
    expect(routerReplace).toHaveBeenCalledWith('/objekt?ar=2026&manad=10'); // tillbaka till listan
  });

  it('Avbryt i bekräftelsen tar tillbaka formuläret, inte stänger arket', async () => {
    await monteraObjekt('molleryd');
    await klicka(behallare!.querySelector('[data-andra]'));
    await klicka(behallare!.ownerDocument.querySelector('[data-ta-bort]'));
    await klicka(knapp('Avbryt', true));
    expect(text()).toContain('Ändra objekt');
    expect(DB.skrivningar).toHaveLength(0);
  });
});


describe('Volymen: rimlighet, enhet och stämplingslängdens tal', () => {
  async function monteraObjekt(id: string) {
    window.history.replaceState({}, '', '/objekt/x?ar=2026&manad=10');
    const { default: FilenGavVy } = await import('./_components/FilenGavVy');
    rot = createRoot(behallare!);
    await act(async () => { rot!.render(<FilenGavVy objektId={id} />); });
    await tills(() => !text().includes('Läser objektet'));
    await stilla();
  }
  const stamp = (id: string, volym: number | null, enhet: string | null) => { DB.objekt = OBJEKT.map(o => (o.id === id ? { ...o, stamplingslangd_volym: volym, stamplingslangd_enhet: enhet } : o)); };
  const skriv = async (el: HTMLInputElement, v: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await stilla();
  };

  it('enheten står vid varje volym: rubrik, rad, läge och objektets Volym', async () => {
    await montera();
    expect(text()).toContain(nbsp('334 / 1 000 m³fub'));
    expect(text()).toContain(nbsp('666 m³fub kvar till beställningen'));
    expect(behallare!.querySelector('[data-objekt="sandasen"]')!.textContent).toContain('146 m³fub');
    expect(behallare!.querySelector('[data-objekt="bagskytte"]')!.textContent).toContain(nbsp('3 495 m³fub'));
    await monteraObjekt('bagskytte');
    expect(behallare!.querySelector('[data-volym]')!.textContent).toContain(nbsp('3 495 m³fub'));
    expect(behallare!.querySelector('[data-volym]')!.textContent).toContain('Plan, från Vida');
  });

  it('Bågskyttebanan (avslutad): frågan om orimlig volym visas, med knappen Rätta volymen — och talet är orört', async () => {
    await monteraObjekt('bagskytte');
    expect(behallare!.querySelector('[data-fraga="orimlig_volym"]')).toBeTruthy();
    expect(behallare!.querySelector('[data-ratta-volym]')).toBeTruthy();
    expect(DB.skrivningar).toEqual([]); // flaggar bara, rättar ingenting av sig självt
  });

  it('ett normalt objekt (Skälviken, 238/ha) har ingen volymfråga', async () => {
    await monteraObjekt('skalviken');
    expect(behallare!.querySelector('[data-fraga="orimlig_volym"]')).toBeNull();
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_avviker"]')).toBeNull();
  });

  it('Rätta volymen: Ändra-arket sparar bara volymen (heltal), utan att flytta månad', async () => {
    await monteraObjekt('bagskytte');
    await klicka(behallare!.querySelector('[data-ratta-volym]'));
    const falt = behallare!.ownerDocument.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
    expect(falt.value).toBe('3495');
    expect((knapp('Spara', true) as HTMLButtonElement).style.opacity).toBe('0.4'); // inget ändrat än
    await skriv(falt, '1560');
    await klicka(knapp('Spara', true));
    expect(DB.skrivningar).toHaveLength(1);
    expect(DB.skrivningar[0]).toMatchObject({ tabell: 'objekt', op: 'update', payload: { volym: 1560 } });
    expect(Object.keys(DB.skrivningar[0].payload)).toEqual(['volym']);
    expect(text()).toContain('volymen är 1');
  });

  it('stämplingslängdens tal: m³sk räknas om med 0,83 och faktorn syns; sparas som skrivet, med enhet', async () => {
    await monteraObjekt('bagskytte');
    await klicka(behallare!.querySelector('[data-stamplingslangd-tal]'));
    expect((knapp('Spara', true) as HTMLButtonElement).style.opacity).toBe('0.4'); // varken tal eller enhet
    await klicka(Array.from(behallare!.ownerDocument.querySelectorAll('[role="tab"]')).find(b => b.textContent === 'm³sk'));
    await skriv(behallare!.ownerDocument.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!, '1884');
    expect(text()).toContain(nbsp('≈ 1 564 m³fub (× 0,83)'));
    await klicka(knapp('Spara', true));
    expect(DB.skrivningar).toHaveLength(1);
    expect(DB.skrivningar[0]).toMatchObject({ tabell: 'objekt', op: 'update', payload: { stamplingslangd_volym: 1884, stamplingslangd_enhet: 'm3sk' } });
  });

  it('enheten har inget förval: utan val går det inte att spara', async () => {
    await monteraObjekt('bagskytte');
    await klicka(behallare!.querySelector('[data-stamplingslangd-tal]'));
    await skriv(behallare!.ownerDocument.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!, '1884');
    expect((knapp('Spara', true) as HTMLButtonElement).style.opacity).toBe('0.4');
    expect(behallare!.ownerDocument.querySelectorAll('[role="tab"][aria-selected="true"]')).toHaveLength(0);
  });

  it('inskrivet tal visas som "1 884 m³sk ≈ 1 564 m³fub", och avviker det mer än 15 % blir det en fråga med båda talen och faktorn', async () => {
    stamp('bagskytte', 1884, 'm3sk');
    await monteraObjekt('bagskytte');
    expect(behallare!.querySelector('[data-stamplingslangd-tal]')!.textContent).toContain(nbsp('1 884 m³sk ≈ 1 564 m³fub'));
    const f = behallare!.querySelector('[data-fraga="stamplingslangd_avviker"]')!;
    expect(f.textContent).toContain(nbsp('Volymen 3 495 m³fub avviker 124 % från stämplingslängden, 1 884 m³sk ≈ 1 564 m³fub (× 0,83)'));
    expect(text()).toContain('m³sk omräknas till m³fub med × 0,83');
  });

  it('inom 15 % (volymen rättad till 1 560) är det ingen fråga alls — frågan släcks av sig själv', async () => {
    DB.objekt = OBJEKT.map(o => (o.id === 'bagskytte' ? { ...o, volym: 1560, stamplingslangd_volym: 1884, stamplingslangd_enhet: 'm3sk' } : o));
    await monteraObjekt('bagskytte');
    expect(behallare!.querySelector('[data-fraga]')).toBeNull();
    expect(behallare!.querySelector('[data-stamplingslangd-tal]')!.textContent).toContain(nbsp('1 884 m³sk ≈ 1 564 m³fub'));
  });

  it('listraden för ett klart objekt visar frågan när stämplingslängden avviker men volymen är rimlig per hektar', async () => {
    DB.objekt = OBJEKT.map(o => (o.id === 'bagskytte' ? { ...o, volym: 2000, stamplingslangd_volym: 1884, stamplingslangd_enhet: 'm3sk' } : o));
    await montera();
    expect(behallare!.querySelector('[data-objekt="bagskytte"]')!.textContent).toContain('1 fråga'); // 2 000 mot 1 564 = 28 %
  });

  it('migrationen ej körd: listan och objektet läses ändå, och inskrivningen säger varför den inte går', async () => {
    DB.saknarKolumner = true;
    await montera();
    expect(hookFel()).toEqual([]);
    expect(text()).toContain(nbsp('6 234 / 5 000 m³fub')); // listan föll inte för ett tillägg
    await monteraObjekt('bagskytte');
    await klicka(behallare!.querySelector('[data-stamplingslangd-tal]'));
    await klicka(Array.from(behallare!.ownerDocument.querySelectorAll('[role="tab"]')).find(b => b.textContent === 'm³sk'));
    await skriv(behallare!.ownerDocument.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!, '1884');
    await klicka(knapp('Spara', true));
    expect(text()).toContain('databasen saknar fältet');
  });
});


describe('Utfall mot plan', () => {
  async function monteraObjekt(id: string) {
    window.history.replaceState({}, '', '/objekt/x?ar=2026&manad=10');
    const { default: FilenGavVy } = await import('./_components/FilenGavVy');
    rot = createRoot(behallare!);
    await act(async () => { rot!.render(<FilenGavVy objektId={id} />); });
    await tills(() => !text().includes('Läser objektet'));
    await stilla();
  }

  it('båda talen under Volym: plan från Vida och utfall från maskinerna (summan av alla rader)', async () => {
    await monteraObjekt('bagskytte');
    expect(behallare!.querySelector('[data-volym]')!.textContent).toContain(nbsp('3 495 m³fub'));
    expect(behallare!.querySelector('[data-volym]')!.textContent).toContain('Plan, från Vida');
    expect(behallare!.querySelector('[data-utfall]')!.textContent).toContain(nbsp('1 687 m³fub'));
    expect(behallare!.querySelector('[data-utfall]')!.textContent).toContain('Maskinerna');
  });

  it('Bågskyttebanan: avvikande utfall med båda talen och båda per hektar — och ett FÖRSLAG som kräver ett tryck', async () => {
    await monteraObjekt('bagskytte');
    const f = behallare!.querySelector('[data-fraga="avvikande_utfall"]')!;
    expect(f.textContent).toContain(nbsp('Planen är 3 495 m³fub (615 per hektar) och utfallet från maskinerna 1 687 m³fub (297 per hektar). De avviker 107 %.'));
    expect(f.textContent).toContain(nbsp('Utfallet från maskinerna är 1 687 m³fub. Använd det?'));
    expect(DB.skrivningar).toEqual([]); // föreslår, skriver inte
    await klicka(f.querySelector('[data-anvand-utfall]'));
    expect(DB.skrivningar).toHaveLength(1);
    expect(DB.skrivningar[0]).toMatchObject({ tabell: 'objekt', op: 'update', payload: { volym: 1687 } });
    expect(Object.keys(DB.skrivningar[0].payload)).toEqual(['volym']);
    expect(text()).toContain(nbsp('Volymen är satt till 1 687 m³fub (utfallet från maskinerna).'));
  });

  it('en pågående trakt vars utfall redan överstiger planen (Sandåsen 294 mot 146) är en fråga — men utan förslag (utfallet är inte klart)', async () => {
    await monteraObjekt('sandasen');
    const f = behallare!.querySelector('[data-fraga="avvikande_utfall"]')!;
    expect(f.textContent).toContain('hittills');
    expect(f.querySelector('[data-anvand-utfall]')).toBeNull();
    expect(f.textContent).not.toContain('Använd det');
  });

  it('en pågående trakt som ännu skördat MINDRE än planen är normal — ingen fråga', async () => {
    DB.utfall = [{ id: 1, objekt_id: '11000001', volym_m3sub: 60 }];
    await monteraObjekt('sandasen');
    expect(behallare!.querySelector('[data-fraga="avvikande_utfall"]')).toBeNull();
    expect(behallare!.querySelector('[data-utfall]')!.textContent).toContain('Maskinerna, hittills');
  });

  it('inom 40 % är det ingen fråga (Skälviken: 1 734 mot 1 700)', async () => {
    await monteraObjekt('skalviken');
    expect(behallare!.querySelector('[data-fraga="avvikande_utfall"]')).toBeNull();
  });

  it('listan: raden för Bågskyttebanan och Sandåsen visar en fråga; täckningen räknar fortfarande PLANEN (växlar inte till utfall)', async () => {
    await montera();
    expect(behallare!.querySelector('[data-objekt="bagskytte"]')!.textContent).toContain('2 frågor');
    expect(behallare!.querySelector('[data-objekt="sandasen"]')!.textContent).toContain('1 fråga');
    expect(text()).toContain(nbsp('6 234 / 5 000 m³fub'));
    expect(text()).toContain(nbsp('334 / 1 000 m³fub'));
  });

  it('utfallet kan inte läsas: listan visas ändå, och objektvyn säger det — den påstår inte "inget utfall"', async () => {
    DB.utfallFel = true;
    await montera();
    expect(text()).toContain(nbsp('6 234 / 5 000 m³fub'));
    expect(behallare!.querySelector('[data-fraga="avvikande_utfall"]')).toBeNull();
    await monteraObjekt('bagskytte');
    expect(behallare!.querySelector('[data-utfall]')!.textContent).toContain('Kunde inte läsas just nu');
  });
});


describe('Stämplingslängd gäller bara en rotpost (avtalsformen avgör, inte typen)', () => {
  async function monteraObjekt(id: string) {
    window.history.replaceState({}, '', '/objekt/x?ar=2026&manad=10');
    const { default: FilenGavVy } = await import('./_components/FilenGavVy');
    rot = createRoot(behallare!);
    await act(async () => { rot!.render(<FilenGavVy objektId={id} />); });
    await tills(() => !text().includes('Läser objektet'));
    await stilla();
  }
  const med = (id: string, o: Record<string, unknown>) => { DB.objekt = OBJEKT.map(x => (x.id === id ? { ...x, ...o } : x)); };

  it('Rp utan stämplingslängd = fråga — också på en GALLRING (typen avgör inte)', async () => {
    med('vashult', { avtalsform: 'Rp', stamplingslangd_url: null });
    await monteraObjekt('vashult');
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_saknas"]')).toBeTruthy();
    expect(behallare!.querySelector('[data-stamplingslangd-tal]')).toBeTruthy();
    expect(behallare!.querySelector('[data-skriv-stamplingslangd]')).toBeTruthy();
  });

  it('Au = frågan ställs aldrig och raden visas inte (N Rimshult: avverkningsuppdrag, ingen stämplingslängd, korrekt)', async () => {
    med('vashult', { avtalsform: 'Au', stamplingslangd_url: null });
    await monteraObjekt('vashult');
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_saknas"]')).toBeNull();
    expect(behallare!.querySelector('[data-stamplingslangd-tal]')).toBeNull();
    expect(text()).not.toMatch(/rotpost|Skriv in talet från stämplingslängden/);
  });

  it('avtalsformen går före namnet: Au i fältet slår RP i namnet', async () => {
    med('molleryd', { avtalsform: 'Au' }); // "Mölleryd RP J-Hus -25"
    await monteraObjekt('molleryd');
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_saknas"]')).toBeNull();
    expect(behallare!.querySelector('[data-stamplingslangd-tal]')).toBeNull();
  });

  it('avtalsform saknas → "RP" i namnet avgör (Mölleryd RP) — och utan båda ställs ingen fråga (Vashult gallring)', async () => {
    await monteraObjekt('molleryd');
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_saknas"]')).toBeTruthy();
    rot!.unmount();
    behallare!.innerHTML = '';
    rot = createRoot(behallare!);
    await monteraObjekt('vashult');
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_saknas"]')).toBeNull();
    expect(behallare!.querySelector('[data-stamplingslangd-tal]')).toBeNull();
  });

  it('Rp med en PDF UTAN spår (Åbogen-fallet: ingen importlogg) = okontrollerad: frågan ställs, raden säger det, aldrig "PDF i filen"', async () => {
    med('vashult', { avtalsform: 'Rp', stamplingslangd_url: '890004_stamplingslangd.pdf', import_varningar: null, kalla: 'traktdirektiv' });
    await monteraObjekt('vashult');
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_saknas"]')!.textContent).toContain('inget säger hur den identifierades');
    const rad = behallare!.querySelector('[data-stamplingslangd-tal]')!;
    expect(rad.textContent).toContain('ingen vet hur den identifierades');
    expect(rad.textContent).not.toContain('PDF i filen');
    expect(behallare!.querySelector('[data-stamplingslangd-okontrollerad]')!.textContent).toBe('okontrollerad');
    expect(text()).toContain('Ej kontrollerad');
    await klicka(knapp('Öppna filen'));
    expect(DB.signerade).toContain('kartbilder/890004_stamplingslangd.pdf');
  });

  it('Åbogen som AVSLUTAD: raden visar okontrollerad, men ingen fråga', async () => {
    med('bagskytte', { stamplingslangd_url: '890004_stamplingslangd.pdf', import_varningar: null, kalla: 'traktdirektiv' });
    await monteraObjekt('bagskytte');
    expect(behallare!.querySelector('[data-stamplingslangd-okontrollerad]')).toBeTruthy();
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_saknas"]')).toBeNull();
  });

  it('importkontroll: "inget hittat" och "aldrig letat" ser inte likadana ut', async () => {
    med('vashult', { import_varningar: null, kalla: 'traktdirektiv' });
    await monteraObjekt('vashult');
    expect(behallare!.querySelector('[data-importkontroll="okand"]')!.textContent).toContain('Importerades innan kontrollerna fanns');
    rot!.unmount(); behallare!.innerHTML = ''; rot = createRoot(behallare!);
    med('vashult', { import_varningar: [], kalla: 'envz' });
    await monteraObjekt('vashult');
    expect(behallare!.querySelector('[data-importkontroll="kontrollerad"]')!.textContent).toContain('Kontrollerades vid importen');
    rot!.unmount(); behallare!.innerHTML = ''; rot = createRoot(behallare!);
    med('vashult', { import_varningar: null, kalla: 'manuell' });
    await monteraObjekt('vashult');
    expect(behallare!.querySelector('[data-importkontroll="okand"]')!.textContent).toContain('Inlagd för hand');
  });

  it('Rp med en GISSAD PDF (OSÄKER) = frågan ställs och raden säger "gissad", inte "PDF i filen" (Skälviken)', async () => {
    await monteraObjekt('skalviken');
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_saknas"]')).toBeTruthy();
    const rad = behallare!.querySelector('[data-stamplingslangd-tal]')!;
    expect(rad.textContent).toContain('Gissad: PDF:en tolkades som stämplingslängd, ingen har bekräftat');
    expect(rad.textContent).not.toContain('PDF i filen');
    expect(behallare!.querySelector('[data-stamplingslangd-gissad]')!.textContent).toBe('gissad');
    expect(text()).toContain('Gissad, ej bekräftad'); // dokumentraden säger inte "Finns"
  });

  it('listraden räknar Skälvikens gissade PDF som en fråga', async () => {
    await montera();
    expect(behallare!.querySelector('[data-objekt="skalviken"]')!.textContent).toContain('1 fråga');
  });

  it('ett inskrivet tal bekräftar: frågan försvinner, raden säger "Skriven av dig" och den gissade PDF:en är inte längre en öppen fråga', async () => {
    med('skalviken', { stamplingslangd_volym: 2000, stamplingslangd_enhet: 'm3sk' }); // 2 000 m³sk ≈ 1 660 m³fub mot 1 734 = 4 %
    await monteraObjekt('skalviken');
    expect(behallare!.querySelector('[data-fraga]')).toBeNull();
    expect(behallare!.querySelector('[data-stamplingslangd-tal]')!.textContent).toContain('Skriven av dig');
    expect(behallare!.querySelector('[data-stamplingslangd-gissad]')).toBeNull();
  });

  it('en AVSLUTAD rotpost: raden och fältet finns och går att fylla i, men stämplingslängden är ingen öppen fråga (Bågskyttebanan)', async () => {
    await monteraObjekt('bagskytte');
    const rad = behallare!.querySelector('[data-stamplingslangd-tal]')!;
    expect(rad).toBeTruthy();
    expect(rad.textContent).toContain('Gissad'); // PDF:en är fortfarande en gissning, och det syns också efteråt
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_saknas"]')).toBeNull();
    await klicka(rad);
    expect(behallare!.ownerDocument.querySelector('input[inputmode="decimal"]')).toBeTruthy(); // talet kan skrivas in
  });

  it('en avslutad rotpost utan PDF och utan tal: raden finns och säger varför man skriver in talet, men ingen fråga', async () => {
    med('bagskytte', { stamplingslangd_url: null });
    await monteraObjekt('bagskytte');
    expect(behallare!.querySelector('[data-stamplingslangd-tal]')!.textContent).toContain('Skriv in talet för att kontrollera volymen');
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_saknas"]')).toBeNull();
  });

  it('en inskriven stämplingslängd på ett avverkningsuppdrag visas inte och ger ingen jämförelsefråga', async () => {
    med('bagskytte', { avtalsform: 'Au', volym: 3495, stamplingslangd_volym: 1884, stamplingslangd_enhet: 'm3sk' });
    await monteraObjekt('bagskytte');
    expect(behallare!.querySelector('[data-stamplingslangd-tal]')).toBeNull();
    expect(behallare!.querySelector('[data-fraga="stamplingslangd_avviker"]')).toBeNull();
  });

  it('listan: raden för en rotpost utan stämplingslängd visar frågan, ett avverkningsuppdrag gör det inte', async () => {
    med('vashult', { avtalsform: 'Rp' });
    await montera();
    expect(behallare!.querySelector('[data-objekt="vashult"]')!.textContent).toContain('1 fråga');
    rot!.unmount();
    behallare!.innerHTML = '';
    rot = createRoot(behallare!);
    med('vashult', { avtalsform: 'Au' });
    await montera();
    expect(behallare!.querySelector('[data-objekt="vashult"]')!.textContent).not.toContain('fråga');
  });
});
