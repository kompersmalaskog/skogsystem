// Källvakter för "Klar med trakten?": sidan (app/planering/page.tsx) går inte att montera i vitest, så kopplingarna som kortet vilar på låses här.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

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
  it('förval: skördare/skotare är EGEN maskin ur planeringen (maskinkön) — sparat svar går före, Extern skrivs aldrig över, kön läses på objektet', () => {
    expect(page).toContain("supabase.from('maskin_ko').select('maskin_id').eq('objekt_id', id)");
    expect(page).toContain("standardMaskin(klarKoDetta!.maskiner, maskinerForRoll('skordare').map((m) => m.maskin_id))");
    expect(page).toContain("standardMaskin(klarKoDetta!.maskiner, maskinerForRoll('skotare').map((m) => m.maskin_id))");
    expect(page).toContain('const klarSkordare: UtforareVal = medStandardMaskin(');
    expect(page).toContain('const klarSkotare: UtforareVal = medStandardMaskin(');
    // förvalet visas bara; det blir sparat svar först när planeraren trycker Klar för maskin
    expect(page).toContain('if (!infoSkordareMaskinId && klarSkordare.maskinId) { setInfoSkordareMaskinId(klarSkordare.maskinId); setInfoSkordareUtforare(null); }');
    expect(page).toContain('if (!infoSkotareMaskinId && klarSkotare.maskinId) { setInfoSkotareMaskinId(klarSkotare.maskinId); setInfoSkotareUtforare(null); }');
  });
  it('kortet: ett val stänger raden (skördare, skotare; Förutsättningar när alla tre är valda); skrivfält stänger aldrig av sig självt', () => {
    for (const rad of ['skordare', 'skotare']) expect(kort, rad).toContain(`onKlart={() => stangRad('${rad}')}`);
    expect(kort).toContain("if (efter.barighet && efter.terrang && efter.skotningsavstand) stangRad('forutsattningar');");
    // ett skrivfält stänger aldrig sin rad medan man skriver (onChange) — bara Enter/blur avslutar, och de fäller ihop bara fältet, inte raden bredvid
    expect(kort).not.toMatch(/<Falt[^>]*onChange=\{[^}]*stangRad/);
  });
  it('del 3: etiketten är alltid FARG.text — läget visas bara av knappen till höger (grå fyllning = standard, vit = avviker)', () => {
    expect(kort).toContain("<span style={{ flex: 1, minWidth: 0, ...TYP.text, color: FARG.text }}>{etikett}</span>");
    expect(kort).not.toMatch(/color: avviker \? FARG\.text : FARG\.text2 \}\}>\{etikett/);
    expect(kort).toContain('data-testid="klar-ved-lage"');
  });
  it('G15-förslag: ur UPPMÄTT utfall (RPC prognos_utfall), förifyllt, sparat först vid Stämmer; inga "Använd förslaget"/förslagsruta och inga planerade timmar som underlag', () => {
    expect(page).toContain("supabase.rpc('prognos_utfall')");
    expect(page).toContain('beraknaG15Forslag(');
    expect(page).not.toContain('klarAnvandForslag');
    expect(page).not.toContain('onAnvandForslag');
    expect(page).not.toContain('beraknaTidsforslag');
    expect(page).not.toContain('prognosHistorik');
    expect(kort).not.toContain('klar-prognos-anvand');
    expect(kort).not.toContain('Använd förslaget');
    expect(kort).not.toContain('klar-prognos-forslag');
    // förvalet blir skrivet svar vid Stämmer: bara när fältet är tomt, bara för egna maskiner
    expect(page).toContain("(manuellPrognos?.[roll] ?? '').toString().trim() === '' && tim != null");
    expect(page).toContain("setManuellPrognos((prev) => ({ ...prev, ...skriv }))");
    // ett utfall som inte gick att läsa säger det (aldrig en tom lista som ser ut som "inga trakter")
    expect(page).toContain('Utfallet bakom förslaget gick inte att läsa');
    expect(existsSync(new URL('./prognos-forslag.ts', import.meta.url))).toBe(false);   // den gamla modellen (planerade timmar) är borta
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

describe('omdesignen (förslag 2): presentation, ingen ny logik', () => {
  it('rubriken är traktens namn, inte en fråga', () => {
    expect(kort).toContain('<Huvud titel={p.namn}');
    expect(kort).not.toContain('titel={`Klar med ${p.namn}?`}');
  });
  it('fast ordning i källan: Behöver dig → prognoskortet → det som är klart → Klar för maskin', () => {
    const i = (t: string) => kort.indexOf(t);
    expect(i('data-testid="klar-behover"')).toBeGreaterThan(0);
    expect(i('data-testid="klar-behover"')).toBeLessThan(i('data-testid="klar-prognoskort"'));
    expect(i('data-testid="klar-prognoskort"')).toBeLessThan(i('testid="klar-del2"'));
    expect(i('testid="klar-del2"')).toBeLessThan(i('data-testid="klar-for-maskin"'));
  });
  it('Behöver dig renderas bara när något är kvar', () => {
    expect(kort).toContain('{antalBehover > 0 && (');
  });
  it('prognosen: bara ett fält åt gången och aldrig en sammanfattning bredvid fälten (den gamla hopfällda prognosraden är borta)', () => {
    expect(kort).toContain("const [cell, setCell] = useState<CellId | null>(null);");
    expect(kort).not.toContain('klar-prognos-redigera');
    expect(kort).not.toContain('klar-prognos-rad-');
    expect(kort).not.toContain('prognosUnder');
  });
  it('prestationen (m³fub/G15) är uträknad och aldrig en tryckbar cell', () => {
    expect(kort).toContain("data-testid={`klar-${roll}-prestation`}");
    expect(kort).not.toContain('klar-cell-prestation');
  });
  it('de hopfällda raderna är stängda från början (ingen är öppen utan att man tryckt) och öppnas av ett tryck på plats — ingen ny vy', () => {
    expect(kort).toContain("useState<'appen' | 'ovrigt' | null>(p.startMedVed ? 'ovrigt' : null)");
    expect(kort).not.toContain('onNyVy');
  });
  it('v2 efter test på Mölleryd: antalet kvar bara i rubriken, ingen rubrik "Det som redan stämmer", ingen Kvar-rad under knappen', () => {
    expect(kort).not.toContain('klar-kvar-text');
    expect(kort).not.toContain('kvarText');
    expect(kort).not.toContain('Det som redan stämmer');
    expect(kort).not.toMatch(/<Rubrik>Behöver dig[^<]*\{/);          // ingen siffra i Behöver dig-rubriken
    expect(kort).not.toContain('klar-grupp-harDu');                    // Har du … är en vy, inte en utfällbar grupp
  });
  it('areal i namnfältet, mätfigur, traktgränskortet och maskinkortet går genom svTal (decimalkomma) — aldrig rå sträng eller toFixed med punkt', () => {
    expect(page).toContain("{valtObjekt.areal ? ` · ${svTal(valtObjekt.areal, 2)} ha` : ''}");
    expect(page).toContain('kontext.push(`${svTal(traktInfo.arealHa, 2)} ha`)');
    expect(page).toContain('`${svTal(maskindatorKort.areal, 1)} ha`');
    expect(page).not.toContain('{valtObjekt.areal} ha');
    expect(page).not.toMatch(/arealHa\.toFixed\(2\)\} ha/);
    expect(kort).not.toMatch(/\{pg\.areal\.trim\(\)\} ha/);
  });
  it('Förutsättningar är ETT område (segmentknappar på plats) och Har du … en egen vy, en fråga i taget', () => {
    expect(kort).toContain('function ForutsRad(');
    expect(kort).toContain('function FragorVy(');
    expect(kort).toContain('data-testid="klar-fragor-vy"');
    expect(kort).toContain("setVy('fragor')");
    // posterna bärighet/terräng/avstånd får inte ha egna rader i Behöver dig
    expect(kort).not.toMatch(/BEHOVER_ORDNING[^\n]*'barighet'/);
    expect(kort).toContain("const BEHOVER_ORDNING: Array<PostId | 'forutsattningar'> = ['avlagg', 'basvag', 'forutsattningar', 'skordare', 'skotare', 'medelstam', 'prognos'];");
  });
  it('orange bara på rubrikens antal och på värden i Behöver dig: prognoskortet och det klara har ingen orange text utom ogiltigt-noten', () => {
    const prognos = kort.slice(kort.indexOf('data-testid="klar-prognoskort"'), kort.indexOf('{/* ── 3. DET SOM ÄR KLART'));
    const orangeRader = prognos.split('\n').filter((r) => r.includes('FARG.orange'));
    expect(orangeRader.length).toBe(1);
    expect(orangeRader[0]).toContain('klar-stammer-ogiltigt');
    const klart = kort.slice(kort.indexOf('{/* ── 3. DET SOM ÄR KLART'), kort.indexOf('{/* ── KLAR FÖR MASKIN'));
    expect(klart).not.toContain('FARG.orange');
  });
  it('kortet räknar ingenting nytt: status, förslag och tider kommer ur lib/klarTrakt, lib/g15Forslag och sidan', () => {
    expect(kort).not.toMatch(/from '@\/lib\/g15Forslag'/);
    expect(kort).not.toMatch(/berakna\(|beraknaG15Forslag|prognosLage\(/);
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
    for (const id of ['klar-rad-', 'klar-basvag-timmar', 'klar-trailer-kommentar', 'klar-manuell-text', 'klar-ved-rad', 'klar-areal', 'klar-volym', 'klar-medelstam', 'skordartimmar', 'skotartimmar', 'id="konfiguration"', 'id="band-skordare"', 'id="band-skotare"', 'id="breddat"', 'id="ris"', 'id="vagn"']) expect(kort, id).toContain(id);
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
