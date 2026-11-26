// Kartan i A4-rapporten, ritad som VEKTOR (pdf-lib): traktgrans, stammoln, hyttspar, planeringens markeringar, kontrollpunkterna.
// Delas av sida 1 (alla lager) och bilagan (traktgrans + blekt stammoln + numrerade pinnar) - EN ritare, sa att de aldrig kan se olika ut.
//
// STAMMOLNET GLESAS ALDRIG UT. Monstret - stickvagarna, halen dar hansynen star - ar hela poangen med kartan. Varje stam ar en egen punkt.
// Kostnaden matt 2026-10-19 (pdf-lib, en filledcirkel per stam som SVG-bana): 2 247 stammar = 55 kB, 12 000 = 292 kB, under en sekund.
// Det gar rent - ingen rasterbild behovs. (drawCircle ger 259 kB/1,4 MB; en strom med fyrkanter 77 kB/408 kB; bana-cirkeln ar minst.)
//
// Allt som ritas klipps mot kartans ruta (en spar- eller markeringspunkt langt utanfor trakten ska inte dra kartan at sig) men RUTANS UTSTRACKNING
// bestams av traktgransen och stammolnet (kartExtent): det ar dem kartan handlar om.

import type { PDFFont, PDFPage } from 'pdf-lib';
import type { RapportModell, LatLng, KartNotering } from './egenkontrollRapport';
import { arMedIRapport } from './egenkontrollNotering';
import { placeraEtiketter, type EtikettPost, type Rektangel } from './egenkontrollEtikettPlats';
import { bryt } from './omTraktenEtikettBild';
import { FORM_PATH, GLYF_LINJE_BREDD, GLYF_PLACERING, FORM_KANT_BREDD, SYMBOL_VIEWBOX, symbolDef } from './symboler';
import {
  HYTTSPAR_FARG, MARK_STIL, STAMMOLN_FARG, TRAKTGRANS_FARG, markeringsStil,
  type KartMarkering, type MarkSlag,
} from './egenkontrollRapportKarta';
import { DIKE, LEGEND, STRECK_RANDAD } from './kartstil';
import { BAND_BREDD_M, BAND_KANT_M, MITTLINJE_FARG, STRAK_FARG, UTE_FARG } from './sparStil';

type PdfLib = typeof import('pdf-lib');

/**
 * Minsta bandbredd (pt) som rymmer en vit mittlinje. Under den ritas ingen —
 * se skälet vid ritningen. Hör ihop med golvet 1,5 pt: mittlinjen ska aldrig
 * kunna äta den lila kärnan.
 */
const MITTLINJE_MIN_KARNA_PT = 2.2;

/**
 * Golv (pt) för skotarens VITA band. Bredare än det lilas (1,5) eftersom ett
 * vitt band på vitt papper bara syns genom sin kant, och kanten behöver plats.
 * Se skälet vid ritningen.
 */
const UTE_GOLV_PT = 2.6;

/**
 * Finaste skala bandet ritas i: 4 m blir aldrig bredare än ~6,5 pt. Se skälet
 * vid `bandPt`. Hör ihop med `BAND_BREDD_M` — ändras den, räkna om talet.
 */
const BAND_MIN_METER_PER_PT = BAND_BREDD_M / 6.5;

export type KartLager = {
  granser: LatLng[][];
  stammar: LatLng[];
  /**
   * Körspåren. `klar`/`ute` används bara med `appstil` och gör kartan till den
   * som står i hytten (se `AppStil`): en bit av SKÖRDARENS stråk där skotaren
   * kört (`klar`) får en vit mittlinje i det lila, och skotarens spår UTANFÖR
   * stråket (`ute`) ritas som ett eget ljust band. Delningen görs av
   * `lib/korsparKlart` (delaKlart/delaUtanfor) — samma funktioner som kartan
   * i maskinen, inte en kopia.
   */
  hyttspar?: (RapportModell['karta']['hyttspar'] extends (infer P)[] | undefined
    ? P & { klar?: boolean; ute?: boolean }
    : never)[];
  markeringar?: KartMarkering[];
  /** Noteringarna (PR 9a): ord pa kartan. Linjer/punkter over planens vagar och hyttsparet, etiketterna overst. */
  noteringar?: KartNotering[];
  pinnar: { nr: number; rubrik: string; plats: LatLng }[];
  /**
   * MARKEN ur SLU:s markfuktighet och Skogsstyrelsens lutning — varfor
   * korningen blev som den blev. Rutor i lat/lng, ritade underst (under
   * traktgransen), aldrig som en gissning: saknas datan finns inga rutor.
   */
  mark?: { slag: MarkSlag; ruta: LatLng[] }[];
};

export type Ruta = { x: number; top: number; b: number; h: number };

const SIDHOJD = 841.89;

/**
 * Det kartan handlar om: traktgrans + stammoln; saknas de, allt som finns.
 *
 * `allt`: ta med pinnar och hyttspar aven nar traktgransen finns. Egenkontrollen
 * vill INTE det - dess kontrollpunkter ligger i trakten, och en karta som
 * zoomas ut for ett spar pa vag hem blir samre. Skotningsrapporten maste:
 * avlagget ligger nastan alltid UTANFOR traktgransen, vid vagen, och rapporten
 * handlar om avstandet fran just det avlagget ut i trakten. Utan flaggan klipps
 * avlagget och halva sparet bort (uppmatt pa Skalviken 2026-11-25).
 */
export function kartExtent(l: KartLager, opts: { allt?: boolean } = {}): LatLng[] {
  const ovrigt = [
    ...l.pinnar.map((p) => p.plats),
    ...(l.hyttspar ?? []).flatMap((h) => h.linjer.flat()),
    ...(l.noteringar ?? []).filter(arMedIRapport).flatMap((n) => n.punkter),
    ...(l.markeringar ?? []).flatMap((m) => (m.slag === 'symbol' ? [m.plats] : m.punkter)),
  ];
  const karna = [...l.granser.flat(), ...l.stammar];
  if (karna.length === 0) return ovrigt;
  return opts.allt ? [...karna, ...ovrigt] : karna;
}

/** Meter -> en "snygg" langd for skalstocken: 10, 20, 50, 100 ... */
export function skalstock(meterPerPt: number, maxPt: number): { meter: number; pt: number } {
  const kandidater = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  let valt = kandidater[0];
  for (const k of kandidater) if (k / meterPerPt <= maxPt) valt = k;
  return { meter: valt, pt: valt / meterPerPt };
}

/**
 * Projicerar punkter till en ruta (b x h pt) utan att forvrida: langdgraden skalas med cos(lat), annars blir kartan bredare an den ar i
 * verkligheten. Norr ar uppat. Returnerar en funktion och meter per pt.
 */
export function projicera(punkter: LatLng[], b: number, h: number, pad = 18) {
  const lat0 = punkter.reduce((s, p) => s + p.lat, 0) / punkter.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of punkter) {
    const x = p.lng * k;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (p.lat < minY) minY = p.lat; if (p.lat > maxY) maxY = p.lat;
  }
  const spannX = Math.max(maxX - minX, 1e-6), spannY = Math.max(maxY - minY, 1e-6);
  const skala = Math.min((b - 2 * pad) / spannX, (h - 2 * pad) / spannY);
  const offX = (b - spannX * skala) / 2, offY = (h - spannY * skala) / 2;
  return {
    /** x, y i rutans egna koordinater, y nedat fran overkanten. */
    till: (p: LatLng) => ({ x: offX + (p.lng * k - minX) * skala, y: h - (offY + (p.lat - minY) * skala) }),
    meterPerPt: 111320 / skala,
  };
}

/** Kartans hojd for bredden b: foljer trakten (hog trakt = hog karta) inom [min, max]. */
export function kartaHojd(l: KartLager, b: number, min = 230, max = 400, pad = 18, opts: { allt?: boolean } = {}): number {
  const e = kartExtent(l, opts);
  if (e.length === 0) return min;
  const lat0 = e.reduce((s, p) => s + p.lat, 0) / e.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = e.map((p) => p.lng * k), ys = e.map((p) => p.lat);
  const spannX = Math.max(Math.max(...xs) - Math.min(...xs), 1e-6), spannY = Math.max(Math.max(...ys) - Math.min(...ys), 1e-6);
  const h = (b - 2 * pad) * (spannY / spannX) + 2 * pad;
  return Math.round(Math.min(max, Math.max(min, h)));
}

const hex = (lib: PdfLib, f: string) => lib.rgb(parseInt(f.slice(1, 3), 16) / 255, parseInt(f.slice(3, 5), 16) / 255, parseInt(f.slice(5, 7), 16) / 255);

/**
 * "Rita kartan som den ser ut i appen" (Martin 2026-11-26: "kör stråcken som
 * det är i appen så det liknar exakt som det är i resten av appen").
 *
 * EN karta, ETT språk: den som läser rapporten och den som sitter i hytten ska
 * se samma sak betyda samma sak. Tre skillnader mot egenkontrollens rapport,
 * som behåller sitt eget utseende:
 *
 * - **Traktgränsen är snitseln**: röd heldragen med gula streck ovanpå, exakt
 *   som `boundary` i appens kartstil — inte en svart streckad linje.
 * - **Körspåret är ett BAND i meter**, i rollfärgen, med en svagare ytterkant
 *   under: `BAND_BREDD_M` / `BAND_KANT_M` ur `lib/sparStil`, samma tal som
 *   kartan i maskinen. Egenkontrollen ritar tunna linjer med låg opacitet, för
 *   där är spåret bakgrund; här är det svaret.
 * - **Pinnarna är en SYMBOL ur appens symbolkälla** (avlägget), inte en
 *   numrerad grå ring. Numret står bredvid bara när det finns mer än ett
 *   avlägg — med ett enda säger symbolen redan allt.
 *
 * Måtten är i METER och skalas med kartan (`meterPerPt`), så ett band är lika
 * brett i verkligheten oavsett hur stor trakten är. Golvet i punkter finns för
 * att en stor trakt annars ger ett band som inte går att se.
 */
export type AppStil = { pinnsymbol: string; pinnnummer?: boolean };

/** Ritar kartan. Returnerar meter per pt (for skalstocken) eller null nar det inte finns nagot att rita. */
export function ritaKarta(
  lib: PdfLib,
  sida: PDFPage,
  fonter: { normal: PDFFont; fet: PDFFont },
  ruta: Ruta,
  l: KartLager,
  san: (s: string) => string,
  opts: { stammarBlek?: boolean; etiketter?: boolean; extentAllt?: boolean; appstil?: AppStil } = {},
): { meterPerPt: number } | null {
  const grå = (g: number) => lib.rgb(g / 255, g / 255, g / 255);
  sida.drawRectangle({ x: ruta.x, y: SIDHOJD - ruta.top - ruta.h, width: ruta.b, height: ruta.h, color: grå(247), borderColor: grå(215), borderWidth: 0.5 });
  const extent = kartExtent(l, { allt: opts.extentAllt });
  if (extent.length === 0) return null;
  const pr = projicera(extent, ruta.b, ruta.h);
  /** Toppbaserade koordinater i SVG-banor (origo = sidans ovre vanstra hornet, se `SVG`). */
  const ap = (p: LatLng) => { const q = pr.till(p); return { x: ruta.x + q.x, y: ruta.top + q.y }; };
  const SVG = { x: 0, y: SIDHOJD } as const;

  // Klipp mot rutan.
  sida.pushOperators(lib.pushGraphicsState(), lib.rectangle(ruta.x, SIDHOJD - ruta.top - ruta.h, ruta.b, ruta.h), lib.clip(), lib.endPath());

  const bana = (pts: LatLng[], slut: boolean) => pts.map((p, i) => { const a = ap(p); return `${i === 0 ? 'M' : 'L'} ${a.x.toFixed(2)} ${a.y.toFixed(2)}`; }).join(' ') + (slut ? ' Z' : '');

  // 0. MARKEN underst: blött och brant ur SLU/Skogsstyrelsen, i appens egna
  //    färger OCH mönster — blått vågrätt som myren, rött snett för brant —
  //    under allt annat: de förklarar körningen, de ska inte tävla med den.
  //
  //    ALLA ytor av samma slag ritas i EN omgång: svag fyllning som en bana med
  //    flera delbanor (opaciteten läggs då på en gång — ritas de var för sig
  //    blir varje överlapp mellan två grannrutor en mörkare söm), och därefter
  //    strecken klippta mot samma ringar, så mönstret ligger i ETT rutnät över
  //    hela trakten i stället för att börja om i varje 10 m-ruta.
  //
  //    MED `appstil` ritas marken EFTER körspåret i stället (se `ritaMark`
  //    nedan): bandet är brett, och på en trakt där skotaren kört överallt
  //    täcker det marken helt — uppmätt på Bondeskog gick de blå pixlarna från
  //    3 895 till 628. Marken ÄR skälet till att vägen blev så lång, så den får
  //    inte döljas av vägen. Mönstret är streck, inte en yta, så spåret syns
  //    fortfarande under det.
  const ritaMark = () => {
    for (const slag of (['fuktigt', 'blott', 'brant', 'mycket_brant'] as const)) {
      const ytor = (l.mark ?? []).filter((m) => m.slag === slag && m.ruta.length >= 3);
      if (ytor.length === 0) continue;
      const st = MARK_STIL[slag];
      sida.drawSvgPath(ytor.map((m) => bana(m.ruta, true)).join(' '), { ...SVG, color: hex(lib, st.farg), opacity: st.fyllning });
      ritaStreckmonster(lib, sida, ytor.map((m) => m.ruta.map(ap)), st.farg,
        { lutning: st.lutning, avstand: st.avstand, tjocklek: st.tjocklek, opacitet: 0.85 });
    }
  };
  if (!opts.appstil) ritaMark();

  // 1. Hänsynsytor/zoner: fyllning och snedstreck underst. KANTEN ritas en
  //    andra gång efter virket (steg 4b) — en hänsynsyta är ofta liten, och
  //    med högar runt om och i kanten försvann den helt i den renderade
  //    PDF:en. Kanten är det som visar att vi INTE kört där; den får aldrig
  //    döljas av virket.
  type Zon = Extract<KartMarkering, { slag: 'zon' }>;
  const zoner = (l.markeringar ?? []).filter((m): m is Zon => m.slag === 'zon' && m.punkter.length >= 3);
  for (const m of zoner) {
    const st = markeringsStil('zon', m.typ); if (!st) continue;
    sida.drawSvgPath(bana(m.punkter, true), { ...SVG, color: hex(lib, st.farg), opacity: st.snedstreck ? 0.14 : 0.2 });
    if (st.snedstreck) ritaSnedstreck(lib, sida, m.punkter.map(ap), st.farg);
  }

  // 2. KORSPAREN under virket — SAMMA ORDNING SOM APPEN (lib/lagerOrdning:
  //    hyttspar ligger under traktgrans, vagar och symboler). Ritades forut
  //    ovanpå stammarna/högarna, och på en trakt där skotaren kört fram och
  //    tillbaka lagger sig da hundratals tunna linjer bredvid varandra till
  //    ett brett band som äter upp kartan (uppmätt på Bondeskog: spåret dolde
  //    både högarna och den blöta marken). Opaciteten är lägre än i appen av
  //    samma skäl: det är många linjer ovanpå varandra, inte en — och det är
  //    en fördel, för där skotaren kört många gånger lägger sig linjerna till
  //    ett tydligare band. Tätheten säger alltså hur mycket som körts där.
  //
  //    MED `appstil` är det kartan i hytten, med dess TRE TILLSTÅND: skördarens
  //    stråk som ett LILA band i meter (`STRAK_FARG` ur lib/sparStil), en VIT
  //    MITTLINJE i det lila där skotaren kört i stråket (`klar`), och skotarens
  //    körning UTANFÖR stråket som ett eget ljust band (`ute`, `UTE_FARG`).
  //    Samma färger som skärmen i maskinen — ingen egen palett. Bandet ritas
  //    ytterkanten först, kärnan ovanpå; där skotaren kört fram och tillbaka på
  //    samma stickväg lägger sig banden över varandra till en stickväg, precis
  //    som i hytten. På papper får det vita bandet en MÖRK kant: appens vita
  //    syns mot en svart skärm, inte mot ett vitt ark.
  //
  // Skalan KLAMPAS i båda ändar. Utan tak sväljer bandet en liten trakt:
  // uppmätt vid 110 dpi blev ett 4 m-band 8 px på en 267 m-trakt (bra), 24 px
  // på 89 m och 64 px på 33 m — en femtedel av kartan. Det är sant mot appen
  // (där är 4 m verkligen en åttondel av en 33 m-skärmbild), men på papper
  // döljer det både marken och mönstret, och kartan ska svara på varför vägen
  // blev som den blev. Taket är därför valt för LÄSBARHET, inte för trohet.
  const skala = Math.max(pr.meterPerPt, BAND_MIN_METER_PER_PT);
  const bandPt = (m: number, golv: number) => Math.max(golv, m / skala);
  for (const h of l.hyttspar ?? []) {
    const appVitt = opts.appstil && h.ute;
    const farg = hex(lib, opts.appstil ? (h.ute ? UTE_FARG : STRAK_FARG) : HYTTSPAR_FARG[h.roll]);
    for (const linje of h.linjer) {
      if (linje.length < 2) continue;
      const d = bana(linje, false);
      if (opts.appstil) {
        // Golvet i PUNKTER: en trakt vars avlägg ligger 600 m bort ger en
        // utzoomad karta där fyra meter är under en punkt, och utan golv
        // försvinner bandet. Måtten är VALDA PÅ BILDEN, inte räknade: med 3 och
        // 5 pt smälte Bondeskogs stickvägar ihop till ett enda fält och
        // mönstret — det som visar var skotaren kört fram och tillbaka —
        // försvann. Höj dem inte utan att rendera en trakt där skotaren kört
        // överallt och titta.
        const kant = bandPt(BAND_KANT_M, 2.4), karna = bandPt(BAND_BREDD_M, 1.5);
        if (appVitt) {
          // VITT PÅ VITT PAPPER BÄRS AV KANTEN, och därför har det vita bandet
          // ett EGET, bredare golv. Uppmätt på Skälviken vid 110 dpi: med
          // samma golv som det lila (1,5 pt) och en kant på +0,8 pt blev hela
          // skotarspåret 7 ritade pixlar — alltså osynligt. En trakt där
          // skördaren saknar hyttspår (Edestad) hade då fått en tom karta fast
          // vi kört 38 km. Kanten är smal men HELT mörk, inte en bred svag
          // halo: med 2,4 pt / 55 % såg bitarna ut som grå smutsfläckar bredvid
          // det lila.
          const vitKarna = Math.max(UTE_GOLV_PT, karna);
          sida.drawSvgPath(d, { ...SVG, borderColor: grå(55), borderWidth: vitKarna + 1.4, borderOpacity: 1, borderLineCap: lib.LineCapStyle.Round });
          sida.drawSvgPath(d, { ...SVG, borderColor: farg, borderWidth: vitKarna, borderOpacity: 1, borderLineCap: lib.LineCapStyle.Round });
        } else {
          sida.drawSvgPath(d, { ...SVG, borderColor: farg, borderWidth: kant, borderOpacity: 0.45, borderLineCap: lib.LineCapStyle.Round });
          sida.drawSvgPath(d, { ...SVG, borderColor: farg, borderWidth: karna, borderOpacity: 0.95, borderLineCap: lib.LineCapStyle.Round });
          // Den vita mittlinjen: här har skotaren kört i skördarens stråk.
          // Mittlinjen ritas BARA när bandet är brett nog att rymma den.
          // Uppmätt på Bondeskog: utzoomad till avlägget ligger kärnan på sitt
          // golv (1,5 pt), och en mittlinje på 30 % av den (0,45 pt) äter med
          // antialiasingen hela den lila kärnan — stråket läses då som VITT
          // med lila kontur, tvärtemot hytten. Appen gör samma sak: mittlinjen
          // är meterbaserad och försvinner när man zoomar ut.
          if (h.klar && karna >= MITTLINJE_MIN_KARNA_PT) {
            sida.drawSvgPath(d, { ...SVG, borderColor: hex(lib, MITTLINJE_FARG), borderWidth: karna * 0.3, borderOpacity: 1, borderLineCap: lib.LineCapStyle.Round });
          }
        }
      } else {
        sida.drawSvgPath(d, { ...SVG, borderColor: farg, borderWidth: 0.7, borderOpacity: 0.3, ...(h.roll === 'skotare' ? { borderDashArray: [3, 1.5] } : {}) });
      }
    }
  }

  if (opts.appstil) ritaMark();

  // 3. Traktgrans — ovanpa ytorna och sparen men under virket. MED `appstil`:
  //    snitseln, röd heldragen med gula streck ovanpå (som `boundary` i appens
  //    kartstil); utan: neutral svart streckad, som egenkontrollen alltid haft.
  for (const ring of l.granser) {
    if (ring.length < 2) continue;
    const d = bana(ring, true);
    if (opts.appstil) {
      sida.drawSvgPath(d, { ...SVG, borderColor: hex(lib, LEGEND.fara), borderWidth: 1.6 });
      sida.drawSvgPath(d, { ...SVG, borderColor: hex(lib, LEGEND.gul), borderWidth: 1.6, borderDashArray: [...STRECK_RANDAD].map((n) => n * 1.6) });
    } else {
      sida.drawSvgPath(d, { ...SVG, borderColor: hex(lib, TRAKTGRANS_FARG), borderWidth: 1.2, borderDashArray: [5, 3] });
    }
  }

  // 2. STAMMOLNET: en fylld cirkel per stam. Aldrig utglesat — mönstret är
  //    poängen: det ritar stickvägarna och hålen där hänsynen står.
  //
  //    Skotningsrapporten skickar en TOM lista hit (Martin 2026-11-26): dess
  //    karta svarar på varför vägen blev som den blev, och virket står i tal i
  //    tabellen bredvid. Egenkontrollens rapport ritar molnet som förut.
  const cirkel = (a: { x: number; y: number }, r: number) =>
    `M ${(a.x + r).toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 1 0 ${(a.x - r).toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 1 0 ${(a.x + r).toFixed(2)} ${a.y.toFixed(2)} Z`;
  {
    const r = opts.stammarBlek ? 0.7 : 0.85;
    const stamFarg = opts.stammarBlek ? grå(205) : hex(lib, STAMMOLN_FARG);
    for (const s of l.stammar) sida.drawSvgPath(cirkel(ap(s), r), { ...SVG, color: stamFarg });
  }

  // 4b. ZONKANTEN överst bland ytorna: hänsynen ska synas även när stammolnet
  //     ligger tätt intill (se steg 1).
  for (const m of zoner) {
    const st = markeringsStil('zon', m.typ); if (!st) continue;
    sida.drawSvgPath(bana(m.punkter, true), { ...SVG, borderColor: hex(lib, st.farg), borderWidth: st.bredd, borderOpacity: 1, ...(st.streck ? { borderDashArray: st.streck } : {}) });
  }

  // 5. Planeringens linjer och symboler.
  for (const m of l.markeringar ?? []) {
    if (m.slag !== 'linje' || m.punkter.length < 2) continue;
    const st = markeringsStil('linje', m.typ); if (!st) continue;
    if (st.ledning) { ritaKraftledning(lib, sida, m.punkter.map(ap), st.farg, st.bredd); continue; }
    if (st.dike) { ritaDike(lib, sida, SVG, bana(m.punkter, false), st.bredd); continue; }
    // Stenmur: KRAFTIG mörk kant under gruppens färg (som på kartan) — ingen andra nyans.
    if (m.typ === 'stonewall') sida.drawSvgPath(bana(m.punkter, false), { ...SVG, borderColor: lib.rgb(0.05, 0.05, 0.05), borderWidth: st.bredd + 2.2 });
    sida.drawSvgPath(bana(m.punkter, false), { ...SVG, borderColor: hex(lib, st.farg), borderWidth: st.bredd, ...(st.streck ? { borderDashArray: st.streck } : {}) });
    if (m.backvag) {
      const strack = backvagStreckPt(m.punkter.map(ap), m.backvag);
      if (strack) for (const s of strack) ritaTvarstreck(lib, sida, SVG, s, hex(lib, st.farg), st.bredd);
    }
  }
  const placerade: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const m of l.markeringar ?? []) {
    if (m.slag !== 'symbol') continue;
    const st = markeringsStil('symbol', m.typ); if (!st) continue;
    const a = ap(m.plats), d = 4.6;
    ritaSymbol(lib, sida, m.typ, a, d * 2);
    if (opts.etiketter !== false) {
      const text = san(st.etikett), bredd = fonter.normal.widthOfTextAtSize(text, 6.5);
      const rect = { x0: a.x + d + 2, x1: a.x + d + 2 + bredd, y0: a.y - 4, y1: a.y + 4 };
      const krock = placerade.some((p) => rect.x0 < p.x1 && rect.x1 > p.x0 && rect.y0 < p.y1 && rect.y1 > p.y0);
      if (!krock && rect.x1 < ruta.x + ruta.b) {
        sida.drawText(text, { x: rect.x0, y: SIDHOJD - a.y - 2.2, size: 6.5, font: fonter.normal, color: grå(60) });
        placerade.push(rect);
      }
    }
  }

  // 4b. NOTERINGARNA: linjer, punkter och pilspetsar over planens vagar och hyttsparet, under kontrollpunkterna (som i appen).
  // Skyddsnät: modellen släpper bara blev hit, men ritaren ritar aldrig en skulle-notering även om någon skickar in en (arMedIRapport).
  const noteringar = (l.noteringar ?? []).filter(arMedIRapport);
  for (const n of noteringar) ritaNoteringForm(lib, sida, SVG, n, ap);

  // 5. Pinnarna overst: egenkontrollens kontrollpunkter som numrerade ringar,
  //    eller — med `appstil` — appens egen symbol (avlagget). Numret står
  //    bredvid bara när det finns mer än ett att skilja åt.
  for (const p of l.pinnar) {
    const a = ap(p.plats);
    if (opts.appstil) {
      ritaSymbol(lib, sida, opts.appstil.pinnsymbol, a, 14);
      if (opts.appstil.pinnnummer) {
        const t = String(p.nr);
        sida.drawText(t, { x: a.x + 8, y: SIDHOJD - a.y + 2, size: 7.5, font: fonter.fet, color: grå(40) });
      }
      continue;
    }
    sida.drawCircle({ x: a.x, y: SIDHOJD - a.y, size: 8.5, color: grå(17), borderColor: grå(255), borderWidth: 1 });
    const t = String(p.nr);
    sida.drawText(t, { x: a.x - fonter.fet.widthOfTextAtSize(t, 9) / 2, y: SIDHOJD - a.y - 3.2, size: 9, font: fonter.fet, color: grå(255) });
  }

  // 6. ETIKETTERNA overst: de ska kunna lasas. Placeras utan att doldja varandra, en kontrollpunkt eller en notering (planeraNoteringsEtiketter).
  const maler = (t: string) => fonter.normal.widthOfTextAtSize(san(t), ETIKETT_STORLEK);
  const etiketter = planeraNoteringsEtiketter(noteringar, l.pinnar.map((p) => ap(p.plats)), ap, maler, { x0: ruta.x + 2, y0: ruta.top + 2, x1: ruta.x + ruta.b - 2, y1: ruta.top + ruta.h - 2 });
  for (const n of noteringar) {
    const e = etiketter.get(n.id);
    if (e) ritaNoteringsEtikett(lib, sida, SVG, fonter, e.rader, e.ruta, san);
  }
  sida.pushOperators(lib.popGraphicsState());

  // Norrpil och skalstock (utanfor klippet).
  sida.drawText('N', { x: ruta.x + ruta.b - 17, y: SIDHOJD - ruta.top - 20, size: 9, font: fonter.fet, color: grå(17) });
  sida.drawLine({ start: { x: ruta.x + ruta.b - 13, y: SIDHOJD - ruta.top - 24 }, end: { x: ruta.x + ruta.b - 13, y: SIDHOJD - ruta.top - 38 }, thickness: 1.2, color: grå(17) });
  const sk = skalstock(pr.meterPerPt, 120);
  const sx = ruta.x + 12, sy = SIDHOJD - ruta.top - ruta.h + 16;
  sida.drawLine({ start: { x: sx, y: sy }, end: { x: sx + sk.pt, y: sy }, thickness: 1.5, color: grå(17) });
  sida.drawText(sk.meter >= 1000 ? `${sk.meter / 1000} km` : `${sk.meter} m`, { x: sx, y: sy - 10, size: 8, font: fonter.normal, color: grå(110) });
  return { meterPerPt: pr.meterPerPt };
}

/**
 * Backvag i rapporten: DUBBLA tvarstreck (‖) i hinderanden, tvars over vagen - som i appen. Returnerar tva strack [x1,y1,x2,y2] (sidans pt, toppbaserade),
 * eller null om vagen saknar riktning. Anden tas i ritriktningen ('start' = forsta punkten); grannen ar den narmaste punkten minst 3 pt bort.
 */
export function backvagStreckPt(pts: { x: number; y: number }[], ande: 'start' | 'slut', halvLangd = 6, halvAvstand = 3): [number, number, number, number][] | null {
  if (pts.length < 2) return null;
  const rad = ande === 'start' ? pts : [...pts].reverse();   // rad[0] = hinderanden
  const e = rad[0];
  let g = rad[1];
  for (let i = 1; i < rad.length; i++) { g = rad[i]; if (Math.hypot(e.x - g.x, e.y - g.y) >= 3) break; }
  const L = Math.hypot(e.x - g.x, e.y - g.y);
  if (L === 0) return null;
  const dx = (e.x - g.x) / L, dy = (e.y - g.y) / L;   // riktningen UT ur vagen
  const px = -dy, py = dx;                              // vinkelrat
  return [-halvAvstand, halvAvstand].map((o) => {
    const cx = e.x + dx * o, cy = e.y + dy * o;
    return [cx - px * halvLangd, cy - py * halvLangd, cx + px * halvLangd, cy + py * halvLangd] as [number, number, number, number];
  });
}

/** Ett tvarstreck: morkt kant (bredare) och vagens farg ovanpa, som i appen. */
function ritaTvarstreck(lib: PdfLib, sida: PDFPage, SVG: { x: number; y: number }, s: [number, number, number, number], farg: ReturnType<PdfLib['rgb']>, vagBredd: number): void {
  const bana = `M ${s[0].toFixed(2)} ${s[1].toFixed(2)} L ${s[2].toFixed(2)} ${s[3].toFixed(2)}`;
  const inre = Math.max(0.9, vagBredd * 0.7);
  sida.drawSvgPath(bana, { ...SVG, borderColor: lib.rgb(0.07, 0.07, 0.07), borderWidth: inre + 1.1, borderLineCap: lib.LineCapStyle.Butt });
  sida.drawSvgPath(bana, { ...SVG, borderColor: farg, borderWidth: inre, borderLineCap: lib.LineCapStyle.Butt });
}

// ---------------------------------------------------------------------------
// Noteringar i rapportens karta (PR 9a)
// ---------------------------------------------------------------------------
//
// Rapporten tar BARA "sa har blev det" (Martin 2026-10-21, arMedIRapport): en HELDRAGEN morklinje med en FYLLD punkt och en morkfylld etikett
// med vit text. "Skulle" ritas aldrig har — en rattelse ovanpa hyttsparet ar ett daterat och positionsbestamt medgivande till kunden.

const BLEV_FARG = '#111111';
const NOTERING_PUNKT_R = 3.4;
const ETIKETT_STORLEK = 8.5;
const ETIKETT_PAD = 3.2;
const ETIKETT_MAX_BREDD = 140;
const ETIKETT_MAX_RADER = 3;

/** Ankaret: punkten, eller mitt pa linjen (langs den, inte mellan hornen). null = inget att rita. */
function noteringsAnkare(n: KartNotering, ap: (p: LatLng) => { x: number; y: number }): { x: number; y: number } | null {
  if (n.punkter.length === 0) return null;
  if (n.typ === 'punkt' || n.punkter.length === 1) return ap(n.punkter[0]);
  const pts = n.punkter.map(ap);
  let tot = 0;
  for (let i = 1; i < pts.length; i++) tot += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let kvar = tot / 2;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (kvar <= d && d > 0) { const t = kvar / d; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }; }
    kvar -= d;
  }
  return pts[pts.length - 1];
}

/**
 * Var varje notering far sin etikett: aldrig ovanpa en annan etikett, en kontrollpunkts pinne, en notering (dess ankare eller linje) -
 * utom nar det inte finns nagot fritt lage. Rent (taget ur ritaKarta sa att det gar att prova utan en PDF).
 */
export function planeraNoteringsEtiketter(
  noteringar: KartNotering[],
  pinnar: { x: number; y: number }[],
  ap: (p: LatLng) => { x: number; y: number },
  mat: (t: string) => number,
  yta: Rektangel,
): Map<string, { ruta: Rektangel; rader: string[] }> {
  const ut = new Map<string, { ruta: Rektangel; rader: string[] }>();
  if (noteringar.length === 0) return ut;
  const hinder: Rektangel[] = pinnar.map((a) => ({ x0: a.x - 9, y0: a.y - 9, x1: a.x + 9, y1: a.y + 9 }));
  for (const n of noteringar) {
    const a = noteringsAnkare(n, ap);
    if (a) hinder.push({ x0: a.x - NOTERING_PUNKT_R - 1, y0: a.y - NOTERING_PUNKT_R - 1, x1: a.x + NOTERING_PUNKT_R + 1, y1: a.y + NOTERING_PUNKT_R + 1 });
    // Linjerna ar hinder for ALLA etiketter: en etikett som ligger over en pil doljer var den slutar (provat: "Overfart stenmur" doljde "Drivnings" pilspets).
    if (n.typ === 'linje') hinder.push(...linjeHinder(n.punkter.map(ap)));
  }
  const matt = noteringar.map((n) => etikettMatt(n, mat));
  const poster: EtikettPost[] = [];
  noteringar.forEach((n, i) => {
    const a = noteringsAnkare(n, ap);
    const m = matt[i];
    if (a && m) poster.push({ id: n.id, ankare: a, bredd: m.bredd, hojd: m.hojd });
  });
  const plats = placeraEtiketter(poster, hinder, yta);
  noteringar.forEach((n, i) => {
    const r = plats.get(n.id), m = matt[i];
    if (r && m) ut.set(n.id, { ruta: r, rader: m.rader });
  });
  return ut;
}

/** Rektanglar (5 x 5 pt) tata langs en linje: en etikett far inte ligga ovanpa den. Ett glest satt av punkter skulle lata en etikett glida mellan dem. */
export function linjeHinder(pts: { x: number; y: number }[]): Rektangel[] {
  const ut: Rektangel[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const steg = Math.max(1, Math.ceil(d / 5));
    for (let k = 0; k <= steg; k++) {
      const x = pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / steg, y = pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / steg;
      ut.push({ x0: x - 2.5, y0: y - 2.5, x1: x + 2.5, y1: y + 2.5 });
    }
  }
  return ut;
}

function etikettMatt(n: KartNotering, mat: (t: string) => number): { rader: string[]; bredd: number; hojd: number } | null {
  const rader = bryt(n.etikett, mat, ETIKETT_MAX_BREDD - ETIKETT_PAD * 2, ETIKETT_MAX_RADER);
  if (rader.length === 0) return null;
  return { rader, bredd: Math.ceil(Math.max(...rader.map(mat))) + ETIKETT_PAD * 2, hojd: rader.length * ETIKETT_STORLEK * 1.25 + ETIKETT_PAD * 2 };
}

/** Linjen/punkten/pilspetsen. Vit kant under allt: syns pa den ljusgra kartytan och over stammolnets prickar. */
function ritaNoteringForm(
  lib: PdfLib, sida: PDFPage, SVG: { x: number; y: number }, n: KartNotering, ap: (p: LatLng) => { x: number; y: number },
): void {
  const farg = hex(lib, BLEV_FARG);
  const vit = lib.rgb(1, 1, 1);
  const pts = n.punkter.map(ap);
  if (n.typ === 'punkt' || pts.length < 2) {
    const a = pts[0];
    if (!a) return;
    const ring = `M ${(a.x + NOTERING_PUNKT_R).toFixed(2)} ${a.y.toFixed(2)} A ${NOTERING_PUNKT_R} ${NOTERING_PUNKT_R} 0 1 0 ${(a.x - NOTERING_PUNKT_R).toFixed(2)} ${a.y.toFixed(2)} A ${NOTERING_PUNKT_R} ${NOTERING_PUNKT_R} 0 1 0 ${(a.x + NOTERING_PUNKT_R).toFixed(2)} ${a.y.toFixed(2)} Z`;
    sida.drawSvgPath(ring, { ...SVG, color: farg, borderColor: vit, borderWidth: 1.2 });
    return;
  }
  const bana = pts.map((q, i) => `${i === 0 ? 'M' : 'L'} ${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(' ');
  sida.drawSvgPath(bana, { ...SVG, borderColor: vit, borderWidth: 3.6, borderOpacity: 0.9 });                  // heldragen vit kant
  sida.drawSvgPath(bana, { ...SVG, borderColor: farg, borderWidth: 1.6 });
  if (n.pil) {
    // Pilspets i slutet: tva korta streck bakat fran sista punkten, mot riktningen pa sista delstrackan.
    let a = pts[pts.length - 1], g = pts[pts.length - 2];
    for (let i = pts.length - 2; i >= 0; i--) { g = pts[i]; if (Math.hypot(a.x - g.x, a.y - g.y) > 0.5) break; }
    const L = Math.hypot(a.x - g.x, a.y - g.y);
    if (L > 0) {
      const dx = (a.x - g.x) / L, dy = (a.y - g.y) / L, lang = 9, bred = 4.6;
      const bx = a.x - dx * lang, by = a.y - dy * lang;
      const spets = `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${(bx - dy * bred).toFixed(2)} ${(by + dx * bred).toFixed(2)} L ${(bx + dy * bred).toFixed(2)} ${(by - dx * bred).toFixed(2)} Z`;
      sida.drawSvgPath(spets, { ...SVG, color: farg, borderColor: vit, borderWidth: 1 });
    }
  }
}

function ritaNoteringsEtikett(
  lib: PdfLib, sida: PDFPage, SVG: { x: number; y: number }, fonter: { normal: PDFFont },
  rader: string[], r: Rektangel, san: (s: string) => string,
): void {
  const farg = hex(lib, BLEV_FARG);
  const b = r.x1 - r.x0, h = r.y1 - r.y0, k = 2.2;
  const bana = `M ${r.x0 + k} ${r.y0} L ${r.x1 - k} ${r.y0} Q ${r.x1} ${r.y0} ${r.x1} ${r.y0 + k} L ${r.x1} ${r.y1 - k} Q ${r.x1} ${r.y1} ${r.x1 - k} ${r.y1} L ${r.x0 + k} ${r.y1} Q ${r.x0} ${r.y1} ${r.x0} ${r.y1 - k} L ${r.x0} ${r.y0 + k} Q ${r.x0} ${r.y0} ${r.x0 + k} ${r.y0} Z`;
  sida.drawSvgPath(bana, { ...SVG, color: farg, borderColor: lib.rgb(1, 1, 1), borderWidth: 0.8 });
  void b; void h;
  rader.forEach((rad, i) => {
    sida.drawText(san(rad), {
      x: r.x0 + ETIKETT_PAD, y: SIDHOJD - (r.y0 + ETIKETT_PAD + ETIKETT_STORLEK * 0.92 + i * ETIKETT_STORLEK * 1.25),
      size: ETIKETT_STORLEK, font: fonter.normal, color: lib.rgb(1, 1, 1),
    });
  });
}

/** Punkter längs en polylinje (sidans pt) var `steg:e pt` med riktning (enhetsvektor) — första efter halva steget, så stolparna ligger jämnt fördelade. */
export function punkterLangsLinje(pts: { x: number; y: number }[], steg: number): { x: number; y: number; dx: number; dy: number }[] {
  const ut: { x: number; y: number; dx: number; dy: number }[] = [];
  let kvar = steg / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L === 0) continue;
    const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
    let t = kvar;
    while (t <= L) { ut.push({ x: a.x + dx * t, y: a.y + dy * t, dx, dy }); t += steg; }
    kvar = t - L;
  }
  return ut;
}

/**
 * KRAFTLEDNINGEN i rapporten, som i appen (lib/kartstil kraftledningLager): gruppens röd med mörk kant, korta stolpar vinkelräta mot linjen och farosymbolen
 * (triangel med blixt, ur symbolkällan) upprepad längs linjen. `pts` = sidans pt, toppbaserade. Avstånden är i pt (kartans 40 resp. 250 px motsvaras av
 * ungefär 14 resp. 90 pt på en A4).
 */
export function ritaKraftledning(
  lib: PdfLib, sida: PDFPage, pts: { x: number; y: number }[], farg: string, bredd: number,
  val: { stolpeAvstand?: number; symbolAvstand?: number; symbolStorlek?: number } = {},
): void {
  if (pts.length < 2) return;
  const SVG = { x: 0, y: SIDHOJD } as const;
  const bana = `M ${pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')}`;
  sida.drawSvgPath(bana, { ...SVG, borderColor: lib.rgb(0.07, 0.07, 0.07), borderWidth: bredd + 1.6, borderLineCap: lib.LineCapStyle.Round });
  sida.drawSvgPath(bana, { ...SVG, borderColor: hex(lib, farg), borderWidth: bredd, borderLineCap: lib.LineCapStyle.Round });
  const halv = Math.max(3.2, bredd * 2.6);
  for (const p of punkterLangsLinje(pts, val.stolpeAvstand ?? 14)) {
    const nx = -p.dy, ny = p.dx;   // vinkelrätt mot linjen
    ritaTvarstreck(lib, sida, SVG, [p.x - nx * halv, p.y - ny * halv, p.x + nx * halv, p.y + ny * halv], hex(lib, farg), bredd);
  }
  for (const p of punkterLangsLinje(pts, val.symbolAvstand ?? 90)) ritaSymbol(lib, sida, 'powerline', { x: p.x, y: p.y }, val.symbolStorlek ?? 9);
}

/** Symbolen i PDF:en: SAMMA form, kant och glyf som på kartan (lib/symboler) — vektor, så den är skarp i alla storlekar. `a` = mittpunkt, toppbaserad sidkoordinat. */
export function ritaSymbol(lib: PdfLib, sida: PDFPage, typ: string, a: { x: number; y: number }, storlek: number): void {
  const d = symbolDef(typ);
  const sc = storlek / SYMBOL_VIEWBOX, h = SYMBOL_VIEWBOX / 2;
  const ox = a.x - h * sc, oy = SIDHOJD - (a.y - h * sc);
  sida.drawSvgPath(FORM_PATH[d.form], { x: ox, y: oy, scale: sc, color: hex(lib, d.farg), borderColor: lib.rgb(1, 1, 1), borderWidth: Math.max(0.6, FORM_KANT_BREDD * sc), borderLineCap: lib.LineCapStyle.Round });
  const g = GLYF_PLACERING[d.form];
  sida.drawSvgPath(d.glyf, { x: ox + g.x * sc, y: oy - g.y * sc, scale: sc * g.skala, borderColor: lib.rgb(1, 1, 1), borderWidth: GLYF_LINJE_BREDD * sc * g.skala, borderLineCap: lib.LineCapStyle.Round });
}

/** DIKET i rapporten, som i appen (lib/kartstil dikeLager): mörk kant, jordkant, fåra och en smal blå vattenlinje — inga ränder. */
function ritaDike(lib: PdfLib, sida: PDFPage, SVG: { x: number; y: number }, bana: string, bredd: number): void {
  const lager: [string, number][] = [['#000000', bredd + 0.8], [DIKE.jord, bredd], [DIKE.fara, bredd * 0.6], [DIKE.vatten, bredd * 0.3]];
  for (const [farg, b] of lager) sida.drawSvgPath(bana, { ...SVG, borderColor: hex(lib, farg), borderWidth: b, borderLineCap: lib.LineCapStyle.Round });
}

/** Snedstreckning (45°) i gruppens färg inuti en yta — ytor man inte får köra in i. Klipps mot ytans ring; `ring` är toppbaserade sidkoordinater. */
export function ritaSnedstreck(lib: PdfLib, sida: PDFPage, ring: { x: number; y: number }[], farg: string, avstand = 4.5, tjocklek = 0.9): void {
  ritaStreckmonster(lib, sida, [ring], farg, { lutning: 'sned', avstand, tjocklek });
}

/**
 * Streckmönster klippt mot en eller flera ringar — APPENS EGET SPRÅK på papper.
 *
 * I hytten är blöt mark BLÅ VÅGRÄTA STRECK (som myren på en orienteringskarta,
 * glesa = fuktigt, täta = blött) och brant RÖDA SNEDSTRECK (glesa = lite brant,
 * täta = mycket brant). På papper ritades de först som dämpade ytor — men
 * skotarens spår är turkost och blött är blått: på den renderade kartan gick
 * "här är blött" inte att skilja från "här kör skotaren". MÖNSTRET skiljer dem
 * åt i FORM, inte bara i färg, och det är samma mönster föraren ser i hytten.
 *
 * Alla ringar av samma slag klipps i EN omgång, så strecken ligger i samma
 * rutnät över hela trakten i stället för att börja om i varje ruta.
 */
export function ritaStreckmonster(
  lib: PdfLib, sida: PDFPage, ringar: { x: number; y: number }[][], farg: string,
  o: { lutning: 'sned' | 'vagrat'; avstand: number; tjocklek: number; opacitet?: number },
): void {
  const giltiga = ringar.filter((r) => r.length >= 3);
  if (giltiga.length === 0) return;
  const pts = giltiga.flat();
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);

  const ops = [lib.pushGraphicsState()];
  for (const ring of giltiga) {
    ops.push(lib.moveTo(ring[0].x, SIDHOJD - ring[0].y));
    for (const p of ring.slice(1)) ops.push(lib.lineTo(p.x, SIDHOJD - p.y));
    ops.push(lib.closePath());
  }
  ops.push(lib.clip(), lib.endPath());
  sida.pushOperators(...ops);

  const c = hex(lib, farg), op = o.opacitet ?? 0.9;
  if (o.lutning === 'vagrat') {
    for (let y = y0; y <= y1; y += o.avstand) {
      sida.drawLine({ start: { x: x0, y: SIDHOJD - y }, end: { x: x1, y: SIDHOJD - y }, thickness: o.tjocklek, color: c, opacity: op });
    }
  } else {
    for (let k = x0 - (y1 - y0); k <= x1; k += o.avstand) {
      sida.drawLine({ start: { x: k, y: SIDHOJD - y1 }, end: { x: k + (y1 - y0), y: SIDHOJD - y0 }, thickness: o.tjocklek, color: c, opacity: op });
    }
  }
  sida.pushOperators(lib.popGraphicsState());
}


/** En rad (eller flera) med teckenforklaring: ett litet prov per lager + dess namn. Returnerar hojden som anvandes. */
export function ritaTeckenforklaring(
  lib: PdfLib,
  sida: PDFPage,
  fonter: { normal: PDFFont },
  x: number, top: number, b: number,
  poster: { nyckel: string; etikett: string }[],
  san: (s: string) => string,
): number {
  const grå = (g: number) => lib.rgb(g / 255, g / 255, g / 255);
  const SVG = { x: 0, y: SIDHOJD } as const;
  const STORLEK = 7.5, RAD = 11, PROV = 16;
  let cx = x, cy = top;
  for (const p of poster) {
    const text = san(p.etikett), bredd = fonter.normal.widthOfTextAtSize(text, STORLEK);
    if (cx > x && cx + PROV + 4 + bredd > x + b) { cx = x; cy += RAD; }
    const mid = cy + 4;
    const [slag, typ] = p.nyckel.split(':');
    if (p.nyckel === 'traktgrans') sida.drawSvgPath(`M ${cx} ${mid} L ${cx + PROV} ${mid}`, { ...SVG, borderColor: hex(lib, TRAKTGRANS_FARG), borderWidth: 1.2, borderDashArray: [4, 2] });
    else if (p.nyckel === 'stammar') sida.drawCircle({ x: cx + PROV / 2, y: SIDHOJD - mid, size: 1.6, color: hex(lib, STAMMOLN_FARG) });
    else if (slag === 'hyttspar') sida.drawSvgPath(`M ${cx} ${mid} L ${cx + PROV} ${mid}`, { ...SVG, borderColor: hex(lib, HYTTSPAR_FARG[typ as 'skordare' | 'skotare']), borderWidth: 0.9, ...(typ === 'skotare' ? { borderDashArray: [3, 1.5] } : {}) });
    else if (p.nyckel === 'backvag') {   // en kort vag med dubbla tvarstreck i andan, i neutral morkgra (farg ar aldrig ensam)
      sida.drawSvgPath(`M ${cx} ${mid} L ${cx + PROV - 5} ${mid}`, { ...SVG, borderColor: grå(90), borderWidth: 1.2 });
      for (const s of backvagStreckPt([{ x: cx, y: mid }, { x: cx + PROV - 5, y: mid }], 'slut', 3.4, 2)!) ritaTvarstreck(lib, sida, SVG, s, grå(90), 1.2);
    }
    else if (p.nyckel === 'notering:blev') {          // heldragen morklinje + fylld punkt
      sida.drawSvgPath(`M ${cx} ${mid} L ${cx + PROV} ${mid}`, { ...SVG, borderColor: hex(lib, BLEV_FARG), borderWidth: 1.6 });
      sida.drawCircle({ x: cx + PROV / 2, y: SIDHOJD - mid, size: 2.4, color: hex(lib, BLEV_FARG), borderColor: grå(255), borderWidth: 0.8 });
    }
    else if (p.nyckel === 'kontrollpunkt') sida.drawCircle({ x: cx + PROV / 2, y: SIDHOJD - mid, size: 3.6, color: grå(17) });
    else if (slag === 'linje' || slag === 'zon' || slag === 'symbol') {
      const st = markeringsStil(slag, typ);
      if (st && slag === 'symbol') ritaSymbol(lib, sida, typ, { x: cx + PROV / 2, y: mid }, 9);
      else if (st && slag === 'zon') {
        sida.drawSvgPath(`M ${cx} ${mid - 3} L ${cx + PROV} ${mid - 3} L ${cx + PROV} ${mid + 3} L ${cx} ${mid + 3} Z`, { ...SVG, color: hex(lib, st.farg), opacity: st.snedstreck ? 0.08 : 0.16, borderColor: hex(lib, st.farg), borderWidth: 0.9, ...(st.streck ? { borderDashArray: st.streck } : {}) });
        if (st.snedstreck) ritaSnedstreck(lib, sida, [{ x: cx, y: mid - 3 }, { x: cx + PROV, y: mid - 3 }, { x: cx + PROV, y: mid + 3 }, { x: cx, y: mid + 3 }], st.farg, 3, 0.7);
      }
      else if (st?.dike) ritaDike(lib, sida, SVG, `M ${cx} ${mid} L ${cx + PROV} ${mid}`, st.bredd);
      else if (st?.ledning) ritaKraftledning(lib, sida, [{ x: cx, y: mid }, { x: cx + PROV, y: mid }], st.farg, 1.1, { stolpeAvstand: 5, symbolAvstand: PROV, symbolStorlek: 6.5 });
      else if (st) sida.drawSvgPath(`M ${cx} ${mid} L ${cx + PROV} ${mid}`, { ...SVG, borderColor: hex(lib, st.farg), borderWidth: Math.min(st.bredd, 2.2), ...(st.streck ? { borderDashArray: st.streck } : {}) });
    }
    sida.drawText(text, { x: cx + PROV + 4, y: SIDHOJD - cy - STORLEK * 0.78 - 0.5, size: STORLEK, font: fonter.normal, color: grå(70) });
    cx += PROV + 4 + bredd + 12;
  }
  return poster.length === 0 ? 0 : cy - top + RAD;
}
