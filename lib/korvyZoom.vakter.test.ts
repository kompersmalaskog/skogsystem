// KÖRVYNS EGEN ZOOM — vakter mot app/planering/page.tsx (Martin 2026-11-23). Beteendet prövas i korvyZoom.test.ts, useKorvyGrundzoom.test.tsx, CentreraKnapp.test.tsx och
// korvyZoom.hytt.test.ts (riktig Chromium + touch); här låses INKOPPLINGEN så att ingen nollställning av zoomen smyger tillbaka.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const las = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = las('../app/planering/page.tsx');
const knapp = las('../components/planering/CentreraKnapp.tsx');

describe('ingen nollställning till standardzoomen kvar i körvyn', () => {
  it('konstanterna bor i lib/korvyZoom — inte längre i sidan', () => {
    expect(page).not.toMatch(/const KORVY_BASE_ZOOM\s*=/);
    expect(page).not.toMatch(/const KORVY_FULL_ZOOM\s*=/);
    expect(page).not.toMatch(/const KORVY_ZOOM_START_M\s*=/);
    expect(page).toContain("from '../../lib/korvyZoom'");
  });

  it('KORVY_BASE_ZOOM används bara som startvärde för refen — aldrig som kamerans zoom', () => {
    const traffar = page.split('\n').filter((r) => r.includes('KORVY_BASE_ZOOM') && !r.trim().startsWith('//'));
    for (const r of traffar) expect(r, r).toMatch(/useRef<number>\(KORVY_BASE_ZOOM\)|^import /);
  });

  it('de fyra ställena som förut satte baszoomen startar nu från förarens grundzoom', () => {
    expect(page).toMatch(/korvyZoomRef\.current = korvyGrundzoomRef\.current;   \/\/ närhets-zoomen startar från förarens grundzoom/);
    expect(page).toMatch(/zoom: korvyGrundzoomRef\.current,\n        pitch: 28,\n        bearing: kartBearing,\n        padding: \{ top: topPad, bottom: 0, left: 0, right: 0 \},\n        duration: FLY_MS,/);   // startflygningen
    expect(page).toMatch(/korvyZoomRef\.current = korvyGrundzoomRef\.current;  \/\/ starta närhets-zoomen från förarens grundzoom/);
    expect(page).toMatch(/center: targetCenter,\n        zoom: korvyGrundzoomRef\.current,/);   // körvyns egen setup
    expect(page).toMatch(/korvyZoomRef\.current = korvyGrundzoomRef\.current;\n    const topPad[\s\S]{0,300}zoom: korvyGrundzoomRef\.current, pitch: 28/);   // kameran landar rätt
  });

  it('följ-ticken räknar närhets-zoomen från grundzoomen (samma tillägg, förarens nivå)', () => {
    expect(page).toContain('const rawZoom = korvyProximityZoom(korvyNextItems[0]?.dist ?? null, korvyGrundzoomRef.current);');
    expect(page).toContain('const korvyProximityZoom = (dist: number | null, grund: number): number => narhetsZoom(dist, grund, FALLNINGSRADIE_M);');
  });
});

describe('nyp, hjul och drag pausar följet; Centrera går tillbaka till den sparade zoomen', () => {
  it("'dragstart', 'zoomstart' och 'zoom' pausar (hjulet bär originalEvent först på zoom-bilderna) och avregistreras", () => {
    expect(page).toContain("map.on('dragstart', onDrag);");
    expect(page).toContain("map.on('zoomstart', onDrag);");
    expect(page).toContain("map.on('zoom', onDrag);");
    expect(page).toContain("map.off('dragstart', onDrag); map.off('zoomstart', onDrag); map.off('zoom', onDrag);");
    expect(page).toContain('const onDrag = (e: any) => { if (korvyOppenRef.current && e && e.originalEvent) setKorvyFollowPaused(true); };');
  });

  it('Centrera i körvyn: följet igen, grundzoomen (+ närhets-tillägg om något är nära), och följet fortsätter från samma zoom', () => {
    expect(page).toContain('const zoom = korvyProximityZoom(korvyNextItems[0]?.dist ?? null, korvyGrundzoomRef.current);');
    expect(page).toMatch(/korvyZoomRef\.current = zoom;[^\n]*\n[^\n]*const topPad[^\n]*\n\s*map\.easeTo\(\{ center: \[pos\.lon, pos\.lat\], zoom, bearing: kartBearing/);
  });

  it('planeringsvyns Centrera är oförändrad: centrera EN gång, ingen grundzoom', () => {
    expect(page).toContain("map.flyTo({ center: [pos.lon, pos.lat], zoom: Math.max(map.getZoom(), 16), duration: 600 });");
  });
});

describe('håll in Centrera → Spara den här zoomen → Zoomen sparad', () => {
  it('håll-valet finns bara i körvyn (planeringens knapp får ingen onHall)', () => {
    expect(page).toContain('onHall={korvyActive ? () => setZoomValOppen(true) : undefined}');
    expect(page).toContain('{korvyActive && zoomValOppen && centreraSynlig && <CentreraZoomVal onSpara={sparaZoomNu} onStang={() => setZoomValOppen(false)} />}');
  });

  it('Spara: aktuell zoom blir grundzoomen, kartan centreras på den nivån, följet återupptas', () => {
    const m = page.match(/const sparaZoomNu = \(\) => \{[\s\S]*?\n  \};/);
    expect(m).not.toBeNull();
    const k = m![0];
    expect(k).toContain('sparaKorvyGrundzoom(map.getZoom())');
    expect(k).toContain('korvyZoomRef.current = z;');
    expect(k).toContain('setKorvyFollowPaused(false);');
    expect(k).toMatch(/map\.easeTo\(\{ center: \[pos\.lon, pos\.lat\], zoom: z,/);
    expect(k).toContain('setZoomKvitto(true);');
  });

  it('bekräftelsen är "Zoomen sparad" i ZOOM_KVITTO_MS (1,5 s) i det befintliga kvittot — ingen annan text', () => {
    expect(page).toContain('<KorvyKvitto text="Zoomen sparad" ton="ok" smal={smalSkarm} />');
    expect(page).toContain('const t = setTimeout(() => setZoomKvitto(false), ZOOM_KVITTO_MS);');
  });

  it('grundzoomen är per maskin: hooken får maskinens id (enheten, annars testläget)', () => {
    expect(page).toContain('useKorvyGrundzoom(enhetMaskinId ?? maskinSomParam ?? null)');
  });

  it('valet och bekräftelsen släpps när körvyn stängs eller Centrera försvinner', () => {
    expect(page).toContain('useEffect(() => { if (!korvyActive || !centreraSynlig) setZoomValOppen(false); }, [korvyActive, centreraSynlig]);');
    expect(page).toContain('useEffect(() => { if (!korvyActive) setZoomKvitto(false); }, [korvyActive]);');
  });
});

describe('CentreraKnapp: håll in', () => {
  it('använder det befintliga långtrycket (lib/langtryck) med ZOOM_HALL_MS och sväljer klicket efter hållet', () => {
    expect(knapp).toContain("import { skapaLangtryck } from '@/lib/langtryck';");
    expect(knapp).toContain('skapaLangtryck(ZOOM_HALL_MS)');
    expect(knapp).toContain('if (onHall && lt.slukKlick()) return;');
  });

  it('valet stängs bara av ett tryck som började på bakgrunden (webbläsarens klick efter hållet ska inte stänga det)', () => {
    expect(knapp).toContain('onPointerDown={() => { tryckBorjade.current = true; }}');
    expect(knapp).toContain('if (!tryckBorjade.current) return;');
  });

  it('en enda knapp i valet, inga nya färger eller storlekar utanför tokens', () => {
    const val = knapp.slice(knapp.indexOf('export function CentreraZoomVal'));
    expect((val.match(/<button/g) ?? []).length).toBe(1);
    expect(val).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
