// Källvakter för "Klar med trakten?": sidan (app/planering/page.tsx) går inte att montera i vitest, så kopplingarna som kortet vilar på låses här.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const las = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = las('../app/planering/page.tsx');
const kort = las('../components/planering/KlarMedTrakten.tsx');

describe('kortet och sidan', () => {
  it('kortet läser och sparar via useKlarFalt (nya kolumner) — aldrig via Objektinfo-autosparet, som annars slutar spara utan migrationen', () => {
    expect(page).toContain("import { useKlarFalt } from '../../lib/hooks/useKlarFalt'");
    expect(page).toContain('const klarHook = useKlarFalt(supabase, valtObjekt?.id ?? null, !!testlage);');
    const spar = las('./objektInfoSpar.ts');
    for (const k of ['har_du_svar', 'ved_detaljer', 'prognos_godkand', 'klar_kvar_antal']) expect(spar, k).not.toContain(k);
  });
  it('"N kvar" skrivs som ögonblicksbild bara av en planerare, medan trakten planeras, när allt är läst — och aldrig i testläget', () => {
    expect(page).toContain('if (!klarGaller || !klarDataKlart || testlage) return;');
    expect(page).toContain("const klarGaller = klarPlanerare && !!valtObjekt && arUnderPlanering(valtObjekt.status) && !korvyActive && !(maskinlage || !!maskinSomParam);");
    expect(page).toContain("const klarDataKlart = infoLoaded && markersLoaded && klarHook.lage === 'ok'");
  });
  it('chippen i namnfältet: "N kvar"/"Klar" i pillen, ett tryck öppnar kortet; i körvyn finns den inte', () => {
    expect(page).toContain('data-testid="objekt-pill-klar"');
    expect(page).toContain("setObjektListaOppen(false); setInfoStartVy('klar'); setTraktOversiktOpen(true);");
    // körvyns pill (KorvyObjektPill) rörs inte — chippen sitter bara i planeringens egen pill
    expect(las('../components/planering/KorvyObjektPill.tsx')).not.toContain('objekt-pill-klar');
  });
  it('Klar för maskin: planerad + klar_skickad_timestamp i ett anrop, verifierat; knappen spärras aldrig av "kvar"', () => {
    expect(page).toContain("{ status: STATUS_PLANERAD, klar_skickad_timestamp: nowIso }, { id: valtObjekt.id }, 'status,klar_skickad_timestamp'");
    expect(kort).toContain('disabled={p.klarSparar}');
    expect(kort).not.toMatch(/disabled=\{[^}]*status\.klar/);
    expect(kort).not.toContain('disabled={!status.klar}');
  });
  it('hooks ligger före den tidiga returen i kortet (React #310)', () => {
    const forst = kort.indexOf('export default function KlarMedTrakten');
    const retur = kort.indexOf("if (vy === 'ved')", forst);
    expect(kort.indexOf('useState<', forst)).toBeGreaterThan(forst);
    expect(kort.indexOf('useState<', forst)).toBeLessThan(retur);
    expect(kort.slice(retur)).not.toMatch(/\buse(State|Effect|Memo|Ref|Callback)\b/);
  });
  it('ved-symbolen: egen symboltyp som aldrig hamnar i dockan eller "senast använda", sätts via placeraSymbol och öppnar kortet igen', () => {
    expect(page).toContain("{ id: 'firewood', name: 'Ved' }");
    expect(page).toContain("if (typ !== 'firewood') noteraPlus({ typ: 'symbol', id: typ });");
    expect(page).toContain("if (typ !== 'firewood') setRecentSymbols");
    expect(page).toContain("void klarHook.spara({ ved: { ...klarFalt.ved, plats: 'karta', lat, lng: lon, markeringId: String(id) } });");
    // inte i någon palett
    const symbolKategorier = page.slice(page.indexOf('const symbolCategories'), page.indexOf('const markerTypes ='));
    expect(symbolKategorier).not.toContain('firewood');
    expect(las('../lib/marker-icons.ts')).toContain("id: 'firewood'");
  });
  it('byter man tillbaka till "vid avlägget" tas ved-symbolen bort från kartan (föraren ser ingen gammal plats)', () => {
    expect(page).toContain("if (v.plats === 'avlagg' && klarFalt.ved.markeringId) {");
    expect(page).toMatch(/setMarkers\(\(prev: any\[\]\) => prev\.filter\(\(m\) => String\(m\.id\) !== gammal\)\);\s*deleteMarkerFromDb\(gammal\);/);
  });
});

describe('städningen', () => {
  it('Anteckningar-fältet är borta ur Trakt-panelen; texten raderas inte (grå rad "Gamla anteckningar")', () => {
    expect(page).not.toContain('placeholder="Fritext..."');
    expect(page).not.toContain("onChange={e => setInfoAnteckningar");
    expect(page).toContain("const gamlaTexter = [valtObjekt.forardirektiv, egna]");
    expect(kort).toContain('Gamla anteckningar');
    expect(las('../components/planering/ObjektKort.tsx')).toContain('Gamla anteckningar');
    // kolumnen info_anteckningar finns kvar i autosparet (orörd data)
    expect(las('./objektInfoSpar.ts')).toContain('info_anteckningar');
  });
  it('Till föraren = bara Vidas direktiv', () => {
    expect(page).toContain('const forareTexter = tillForaren({ vida });');
  });
  it('Trakt-panelen har bara Larm kvar — allt annat har fått plats i kortet', () => {
    for (const borta of ['{/* FAKTA-flik */}', "traktTab === 'fakta'", "traktTab === 'prognos'", 'renderMaskinVal', 'valjUtforare', 'setMaskinSheet', 'Maskin-väljar-sheet']) expect(page, borta).not.toContain(borta);
    expect(page).toContain("traktTab === 'larm' &&");
    for (const id of ['klar-rad-', 'klar-basvag-timmar', 'klar-trailer-kommentar', 'klar-manuell-text', 'klar-ved-rad', 'klar-areal', 'klar-volym', 'klar-prognos-anvand', 'id="konfiguration"', 'id="band-skordare"', 'id="band-skotare"', 'id="breddat"', 'id="ris"', 'id="vagn"']) expect(kort, id).toContain(id);
  });
  it('/planner har ingen checklista längre (den sparades aldrig); frågorna bor i Har du … på Planering', () => {
    const planner = las('../app/planner/page.tsx');
    expect(planner).not.toContain('setChecklistOpen');
    expect(planner).not.toContain("id: 'checklist'");
    expect(planner).not.toContain('=== CHECKLISTA ===');
  });
  it('Mer › Planeraren har ingen tilldelning och ingen "Klar — skicka"', () => {
    const mer = las('../components/planering/MerMeny.tsx');
    expect(mer).not.toContain('tilldelning');
    expect(mer).not.toContain('mer-klar-skicka');
    expect(mer).not.toContain('onSkicka');
  });
});
