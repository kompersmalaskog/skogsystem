// Källvakter för "Klar med trakten?": sidan (app/planering/page.tsx) går inte att montera i vitest, så kopplingarna som kortet vilar på låses här.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { SYMBOL_NAMN } from './larm/grupper';

const las = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = las('../app/planering/page.tsx');
const kort = las('../components/planering/KlarMedTrakten.tsx');
const steg = las('../components/planering/KlarSteg.tsx');
const se = las('../components/planering/KlarSe.tsx');
/** hela kortet: orkestratorn + stegen + sammanställningen (ved-arket för sig) */
const allt = kort + steg + se;

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
  it('varje rad beter sig likadant: Behöver dig-listan har inga fält och inga utfällningar — en rad öppnar sitt steg, och valen sparas direkt i steget', () => {
    const lista = kort.slice(kort.indexOf('data-testid="klar-behover"'), kort.indexOf('{/* ── KLAR FÖR MASKIN'));
    expect(lista).toContain('onClick={() => oppnaSteg(s)}');
    expect(lista).not.toMatch(/<Falt|<input|<textarea|aria-expanded|stangRad/);
    expect(allt).not.toContain('stangRad');
    // ett val i ett steg går rakt till sidan (onAndra) — kortet håller inget eget svar
    expect(steg).toContain("onVal={(v) => p.onAndra({ barighet: v })}");
    expect(steg).toContain("onVal={(u) => p.onAndra({ skordare: u })}");
  });
  it('etiketten i Markägare & övrigt är alltid FARG.text — läget visas bara av knappen till höger (grå fyllning = standard, vit = avviker)', () => {
    expect(steg).toContain("<span style={{ flex: 1, minWidth: 0, ...TYP.text, color: FARG.text }}>{etikett}</span>");
    expect(steg).not.toMatch(/color: avviker \? FARG\.text : FARG\.text2 \}\}>\{etikett/);
    expect(steg).toContain('data-testid="klar-ved-lage"');
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
    const retur = kort.indexOf("if (vy.v === 'ved')", forst);
    expect(kort.indexOf('useState<', forst)).toBeGreaterThan(forst);
    expect(kort.indexOf('useState<', forst)).toBeLessThan(retur);
    expect(kort.indexOf('useEffect(', forst)).toBeLessThan(retur);
    expect(kort.slice(retur)).not.toMatch(/\buse(State|Effect|Memo|Ref|Callback)\b/);
    // stegen: samma regel i varje komponent som har hooks
    for (const [namn, retur2] of [['export function PrognosBody', 'if (extern) return'], ['export function HarDuSteg', 'return (']] as const) {
      const a = steg.indexOf(namn); const r = steg.indexOf(retur2, a);
      expect(a, namn).toBeGreaterThan(0);
      expect(steg.indexOf('useState', a), namn).toBeLessThan(r);
    }
  });
  it('ved-symbolen: egen symboltyp som aldrig hamnar i dockan eller "senast använda", sätts via placeraSymbol och öppnar kortet igen', () => {
    expect(page).toContain("{ id: 'firewood', name: SYMBOL_NAMN.firewood }");
    expect(SYMBOL_NAMN.firewood).toBe('Ved');
    expect(page).toContain("if (typ !== 'firewood') noteraPlus({ typ: 'symbol', id: typ });");
    expect(page).toContain("if (typ !== 'firewood') setRecentSymbols");
    expect(page).toContain("void klarHook.spara({ ved: { ...klarFalt.ved, plats: 'karta', lat, lng: lon, markeringId: String(id) } });");
    // inte i någon palett
    const symbolKategorier = page.slice(page.indexOf('const symbolCategories'), page.indexOf('const markerTypes ='));
    expect(symbolKategorier).not.toContain('firewood');
    expect(las('../lib/symboler.ts')).toContain('firewood:');   // glyf, namn och förklaring bor i symbolkällan
  });
  it('byter man tillbaka till "vid avlägget" tas ved-symbolen bort från kartan (föraren ser ingen gammal plats)', () => {
    expect(page).toContain("if (v.plats === 'avlagg' && klarFalt.ved.markeringId) {");
    expect(page).toMatch(/setMarkers\(\(prev: any\[\]\) => prev\.filter\(\(m\) => String\(m\.id\) !== gammal\)\);\s*deleteMarkerFromDb\(gammal\);/);
  });
});

describe('två lägen: GÖRA och SE (jobb 1)', () => {
  it('rubriken är traktens namn, inte en fråga', () => {
    expect(kort).toContain('<Huvud titel={p.namn}');
    expect(kort).not.toContain('titel={`Klar med ${p.namn}?`}');
  });
  it('läget avgörs av vad som är kvar: SE när trakten är klar eller skickad (eller när man bett om den), annars GÖRA', () => {
    expect(kort).toContain("const visaSe = vy.v === 'se' || planerad || status.klar;");
    expect(kort).toContain('{status.antalKvar > 0 && (');                                  // kvar efter skickad trakt: "Gå igenom" överst på SE-sidan
  });
  it('fast ordning i GÖRA: Gå igenom → Behöver dig → Visa hela trakten / Om trakten → (utanför det som scrollar) Klar för maskin', () => {
    const i = (t: string) => kort.indexOf(t);
    const gora = kort.slice(i(') : (\n          <div style={{ padding'));
    expect(i('testid="klar-ga-igenom" onTryck={goraIgenom}>Gå igenom')).toBeGreaterThan(0);
    expect(gora.indexOf('testid="klar-ga-igenom"')).toBeLessThan(gora.indexOf('data-testid="klar-behover"'));
    expect(gora.indexOf('data-testid="klar-behover"')).toBeLessThan(gora.indexOf('data-testid="klar-se-oppna"'));
    expect(gora.indexOf('data-testid="klar-se-oppna"')).toBeLessThan(gora.indexOf('data-testid="klar-info"'));
    expect(i('data-testid="klar-innehall"')).toBeLessThan(i('data-testid="klar-for-maskin" data-klar'));
  });
  it('"Visa hela trakten ›" öppnar SE-sidan — ingen egen lista; "Om trakten ›" finns kvar och öppnar ⓘ', () => {
    expect(kort).toContain('Visa hela trakten');
    expect(kort).toContain("onClick={() => setVy({ v: 'se' })}");
    expect(allt).not.toContain('Allt som är ifyllt');
    expect(kort).toContain('onClick={p.onInfo}');
    expect(las('../components/planering/ObjektInfo.tsx')).toContain("onInfo={() => setVy('kort')}");
  });
  it('stegen: strecket räknar bara stegen som är kvar; Sammanfattningen är slutskärmen och har inget streck och inget Hoppa över', () => {
    expect(kort).toContain("const numrerade = ordning.filter((s) => s !== 'sammanfattning');");
    expect(kort).toContain("const delar = alla && steg !== 'sammanfattning' && numrerade.length > 1 ? { antal: numrerade.length, nu: idx } : null;");
    expect(kort).toContain("hoppa={alla && steg !== 'sammanfattning' ? { onTryck: nasta } : null}");
  });
  it('luft i botten: inget innehåll ligger under Klar för maskin (knappraden är en egen rad under det som scrollar)', () => {
    expect(steg).toContain('padding: `${AVSTAND.l}px ${AVSTAND.xl}px ${AVSTAND.xxl}px`');
    expect(kort).toContain('overflowY: \'auto\', WebkitOverflowScrolling: \'touch\', paddingBottom: AVSTAND.xxl');
    expect(kort).toContain("<div style={{ flexShrink: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.l)}`, borderTop");
  });
  it('Klar för maskin spärrar aldrig: ingen knapp i kortet eller stegen är disabled av "kvar"', () => {
    expect(allt).not.toMatch(/disabled=\{[^}]*(status\.klar|antalKvar|kvar\b)/);
    expect(kort).toContain('disabled={p.klarSparar}');
  });
  it('prognosen: bara ett fält åt gången och aldrig en sammanfattning bredvid fälten', () => {
    expect(steg).toContain('const [cell, setCell] = useState<CellId | null>(null);');
    expect(allt).not.toContain('klar-prognos-redigera');
    expect(allt).not.toContain('prognosUnder');
  });
  it('prestationen (m³fub/G15) är uträknad och aldrig en tryckbar cell', () => {
    expect(steg).toContain('data-testid={`klar-${roll}-prestation`}');
    expect(allt).not.toContain('klar-cell-prestation');
  });
  it('Har du … är ETT steg med en fråga i taget; Förutsättningar är segmentknappar i steget — ingen utfällning på plats', () => {
    expect(steg).toContain('export function HarDuSteg(');
    expect(steg).toContain('testid="klar-fragor-vy"');
    expect(steg).toContain('export function Segment(');
    expect(allt).not.toContain('function ForutsRad(');
    expect(allt).not.toContain('function FragorVy(');
    expect(kort).toContain("const OVRIGT_ETT: Vy = { v: 'steg', flode: { typ: 'ett', steg: 'ovrigt', till: 'kort' } };");
  });
  it('en sektion i SE öppnar samma steg för att ändra, och en besvarad fråga öppnar BARA den frågan', () => {
    expect(se).toContain("onClick={() => onOppna('harDu', f.id)}");
    expect(kort).toContain("flode: { typ: 'ett', steg: s, fraga, till: vy.v === 'se' ? 'se' : 'kort' }");
    expect(steg).toContain('const enda = fraga != null;');
  });
  it('avläggssteget: arket krymper till en list nertill (NedfaldList) medan man placerar, och kortet fortsätter i samma steg', () => {
    expect(page).toContain("import { NedfaldList } from '../../components/planering/NedfaldList'");
    expect(page).toContain('onPlaceraAvlagg:');
    expect(page).toContain('klarVyRef.current = v');
    expect(page).toContain("if (typ === 'landing' && klarAterAvlagg) { setKlarAterAvlagg(false); setInfoStartVy('klar'); setTraktOversiktOpen(true); }");
    expect(page).toContain('startVy: klarVyRef.current ?? undefined,');
    const lista = page.slice(page.indexOf("klarAterAvlagg && selectedSymbol === 'landing'"), page.indexOf("klarAterAvlagg && selectedSymbol === 'landing'") + 900);
    expect(lista).toContain('<NedfaldList');
    expect(lista).toContain('testid="placera-list"');
  });
  it('Rita basväg ur kortet: samma list som avlägg ("‹ Klar med trakten?"), och kortet öppnas igen i samma steg när ritningen är klar eller avbruten', () => {
    expect(page).toContain("onRitaBasvag: () => { setKlarAterBasvag(true); stang(); setDrawType('mainRoad');");
    expect(page).toContain("useEffect(() => { if (klarAterBasvag && !isDrawMode) { setKlarAterBasvag(false); setInfoStartVy('klar'); setTraktOversiktOpen(true); } }, [klarAterBasvag, isDrawMode]);");
    // kortets vy minns över ritningen, precis som över avläggsplaceringen
    expect(page).toContain('if (!traktOversiktOpen && !klarAterAvlagg && !klarAterBasvag && !klarGranskaAvlagg) klarVyRef.current = null;');
    const lista = page.slice(page.indexOf('{ritListSynlig && (klarAterBasvag'), page.indexOf('{ritListSynlig && (klarAterBasvag') + 700);
    expect(lista).toContain("tillbaka={{ etikett: 'Klar med trakten?', onClick: cancelDrawing, testid: 'rita-tillbaka' }}");
  });
  it('Vidas avlägg: ritas med VÅR avläggssymbol (marker-landing) och Vidas nummer som etikett; den gula fyrkanten är borta; räknas som avlägg i kortet', () => {
    const lager = page.slice(page.indexOf("map.addLayer({ id: 'trakt-punkt-circle'"), page.indexOf("map.addLayer({ id: 'trakt-punkt-circle'") + 700);
    expect(lager).toContain("'icon-image': 'marker-landing'");
    expect(lager).not.toContain('avlagg-icon');
    expect(page).not.toContain("map.addImage('avlagg-icon'");
    expect(page).toContain("['coalesce', ['get', 'EXTRA_LABE'], ['get', 'LOPNR'], '']");    // etiketten är bara Vidas nummer (Kartan lugnare: inte beskrivningen FLBESKR)
    expect(page).toContain("vidaAvlagg: klarVidaAvlagg, vidaAvlaggBekraftat: klarVidaBekraftat, basvagTexter: klarBasvagTexterTop,");
    expect(page).toContain('onBekraftaVidaAvlagg: () => { void klarHook.spara({ vidaAvlagg: { nummer: klarVidaAvlagg,');
    // bekräftelsen sparas i har_du_svar och skriver aldrig bort de sex svaren (hooken ger nuvarande fält till kolumnbyggaren)
    expect(las('./hooks/useKlarFalt.ts')).toContain('klarFaltTillKolumner(patch, fore)');
  });
  it('Vidas avlägg på kartan: arket krymper till en list med frågan, kartan zoomar in och framhäver dem, numren är bara etiketter', () => {
    expect(page).toContain('onGranskaAvlagg: (efter: KlarVy) => { klarEfterRef.current = efter; setKlarGranskaAvlagg(true); stang(); },');
    const lista = page.slice(page.indexOf('testid="avlagg-granska-list"'), page.indexOf('testid="avlagg-granska-list"') + 1800);
    expect(lista).toContain('stapla');
    expect(lista).toContain('fraga.text');
    expect(lista).toContain("testid: 'avlagg-granska-ja'");
    expect(lista).toContain("etikett: 'Lägg till eget'");
    expect(lista).toContain("etikett: '‹ Klar med trakten?'");
    expect(lista).not.toMatch(/klarVidaAvlagg\.join|nummer\}/);        // numren står inte i texten
    // kartan: zoom på avläggen + ring runt varje; Vidas symbol och nummer tvingas synliga så länge
    const effekt = page.slice(page.indexOf("map.addSource('avlagg-granska-source'") - 400, page.indexOf("map.addSource('avlagg-granska-source'") + 2200);
    expect(effekt).toContain("'avlagg-granska-ring'");
    expect(effekt).toContain('map.fitBounds(');
    expect(effekt).toContain("['trakt-punkt-circle', 'trakt-punkt-label']");
    // etiketten (Vidas nummer) ligger utanför ringen så länge den står, och sätts tillbaka efteråt
    expect(effekt).toContain("map.setLayoutProperty('trakt-punkt-label', 'text-offset', [0, 3.8])");
    expect(effekt).toContain("map.setLayoutProperty('trakt-punkt-label', 'text-offset', foreOffset)");
    // marginal upptill så översta avlägget inte hamnar under namnfältet
    expect(effekt).toMatch(/padding: \{ top: 7 \* AVSTAND\.xxl,/);
    // kartan går tillbaka till vyn den hade när listen stängs med Ja eller tillbaka — men inte vid Lägg till eget (placeringen sker vid avläggen)
    expect(page).toContain('klarKameraForeRef.current = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }');
    expect(page).toContain('const oppnaKortet = (vy: KlarVy | null) => { klarAterstallKamera(); klarVyRef.current = vy;');
    expect(page).toContain("onClick: () => { klarKameraForeRef.current = null; klarVyRef.current = klarEfterRef.current;");
    // "Lägg till eget" hoppar över steget efteråt (annars öppnas frågan igen); tillbaka går till kortet
    expect(page).toContain("klarVyRef.current = klarEfterRef.current; setKlarGranskaAvlagg(false); setKlarAterAvlagg(true); setSelectedSymbol('landing'); } }");
    expect(kort).toContain('if (steg === \'avlagg\' && (p.vidaAvlagg ?? []).length > 0 && p.onGranskaAvlagg) return <AvlaggGranska');
  });
  it('SE: ingen maskinrad under Förutsättningar, och SE-raden för avlägg heter alltid "Avlägg · …"', () => {
    expect(se).not.toContain('klar-se-maskiner');
    expect(se).toContain('export function avlaggRadText(');
    expect(steg).toContain('klar-byt-maskin');
  });
  it('den knapp som gör stegets sak är primär: Nästa är grå så länge Avlägg/Basväg inte är gjort', () => {
    expect(kort).toContain("variant={aktionKvar ? 'sekundar' : 'primar'}");
    expect(steg).toContain("variant={post.kvar ? 'primar' : 'sekundar'} onTryck={p.onRitaBasvag}");
    expect(steg).toContain("variant={post.kvar ? 'primar' : 'sekundar'} onTryck={p.onPlaceraAvlagg}");
    expect(allt).not.toContain('klar-avlagg-flytta');   // Flytta gjorde samma sak som Lägg till eget avlägg — två knappar för samma sak skapar tvekan
    expect(allt).not.toContain('Tryck på kartan där avlägget ska ligga.');
    expect(allt).not.toContain('Inget avlägg placerat än');
  });
  it('en oplanerad trakt med något kvar: ⓘ öppnar "Klar med trakten?" direkt', () => {
    expect(page).toContain("if (!traktOversiktOpen && klarGaller && klarDataKlart && valtObjekt?.status === 'oplanerad' && klarStatus.antalKvar > 0) setInfoStartVy('klar');");
  });
  it('orange bara på rubrikens antal och på värden i Behöver dig; i stegen bara på ej valda etiketter, prognosen utanför liknande trakter och varningsrutor', () => {
    const orangeRader = (kalla: string) => kalla.split('\n').filter((r) => r.includes('FARG.orange'));
    // orkestratorn: rubrikens antal (läget + "· N kvar"), värdet i raden, och två felrutor (datalage med ikon + text, sparfel)
    expect(orangeRader(kort).length).toBe(6);
    expect(orangeRader(kort).filter((r) => r.includes('klar-rad-${s}-varde')).length).toBe(1);
    // stegen: ej vald segmentetikett, varningsruta (Varningsruta, 2 rader), prestation + varningsrad
    expect(orangeRader(steg).length).toBe(5);
    expect(orangeRader(steg).filter((r) => r.includes('varn ? FARG.orange') || r.includes('klar-${roll}-varning')).length).toBe(2);
    // prognoskortet har ingen orange text utöver det
    const prognos = steg.slice(steg.indexOf('export function PrognosBody'), steg.indexOf('// ── Har du …'));
    expect(orangeRader(prognos).length).toBe(2);
  });
  it('areal i namnfältet, mätfigur, traktgränskortet och maskinkortet går genom svTal (decimalkomma) — aldrig rå sträng eller toFixed med punkt', () => {
    expect(page).toContain("{valtObjekt.areal ? ` · ${svTal(valtObjekt.areal, 2)} ha` : ''}");
    expect(page).toContain('kontext.push(`${svTal(traktInfo.arealHa, 2)} ha`)');
    expect(page).toContain('`${svTal(maskindatorKort.areal, 1)} ha`');
    expect(page).not.toContain('{valtObjekt.areal} ha');
    expect(page).not.toMatch(/arealHa\.toFixed\(2\)\} ha/);
    expect(allt).not.toMatch(/\{pg\.areal\.trim\(\)\} ha/);
  });
  it('kortet räknar ingenting nytt: status, förslag och tider kommer ur lib/klarTrakt, lib/g15Forslag och sidan', () => {
    expect(allt).not.toMatch(/^import (?!type).*from '@\/lib\/g15Forslag'/m);   // bara typen (PrestationVarning) — gränsen räknas av sidan
    expect(allt).not.toMatch(/berakna\(|beraknaG15Forslag|prognosLage\(/);
  });
});

describe('städningen', () => {
  it('Anteckningar-fältet är borta ur Trakt-panelen; texten raderas inte (grå rad "Gamla anteckningar")', () => {
    expect(page).not.toContain('placeholder="Fritext..."');
    expect(page).not.toContain("onChange={e => setInfoAnteckningar");
    expect(page).toContain("const gamlaTexter = [valtObjekt.forardirektiv, egna]");
    expect(allt).toContain('Gamla anteckningar');
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
    for (const id of ['klar-rad-', 'klar-basvag-timmar', 'klar-trailer-kommentar', 'klar-manuell-text', 'klar-ved-rad', 'klar-areal', 'klar-volym', 'klar-medelstam', 'skordartimmar', 'skotartimmar', 'id="konfiguration"', 'id="band-skordare"', 'id="band-skotare"', 'id="breddat"', 'id="ris"', 'id="vagn"']) expect(allt, id).toContain(id);
  });
  it('Mer › Planeraren har ingen tilldelning och ingen "Klar — skicka"', () => {
    const mer = las('../components/planering/MerMeny.tsx');
    expect(mer).not.toContain('tilldelning');
    expect(mer).not.toContain('mer-klar-skicka');
    expect(mer).not.toContain('onSkicka');
  });
});
