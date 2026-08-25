// Mätvyns orienteringsmatematik — prickar som sitter kvar på trädet.
//
// PROBLEMET
// Martin snurrar 360° med telefonen som relaskop. En prick som lagras i
// skärmkoordinater flyttar sig med skärmen och pekar på fel träd så fort han
// snurrar vidare. Pricken måste därför lagras i VÄRLDEN — som bäring från norr
// och höjdvinkel över horisonten — och räknas om till skärmläge varje bildruta.
//
// VARFÖR INTE BARA alpha
// DeviceOrientationEvent ger tre vinklar (alpha, beta, gamma) som beskriver
// telefonens vridning i rummet. Att läsa alpha rakt av som kompassbäring
// fungerar bara när telefonen ligger platt. I mätläget hålls den UPPRÄTT med
// kameran framåt, och då är alpha vridningen kring en axel som pekar mot
// horisonten — inte kompassriktningen. Skillnaden är inte liten: lutar man
// telefonen 20° blir felet tiotals grader.
//
// Därför bygger vi hela rotationsmatrisen och plockar ut kamerans FRAMÅTVEKTOR
// (telefonens −Z, alltså rakt ut ur baksidan). Den vektorn ger bäring och
// höjdvinkel korrekt oavsett hur telefonen lutar.
//
// KOMPASSENS NOLLPUNKT
// iOS ger webkitCompassHeading (grader från norr, medurs) och den är
// pålitlig. Android ger alpha, som utan `absolute: true` är relativ mot en
// godtycklig startpunkt. Se `kompassOffset` nedan — utan den mäter man
// vinklar mot ingenting.

/** Telefonens råa orienteringsvinklar, som DeviceOrientationEvent ger dem. */
export type Enhetsvinklar = {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  /** iOS: grader från norr, medurs. Finns inte på Android. */
  webkitCompassHeading?: number | null;
};

/** En riktning i världen. Det är så här ett träd lagras. */
export type Riktning = {
  /** Grader från norr, medurs. 0 = norr, 90 = öst. */
  baring: number;
  /** Grader över horisonten. Positivt = uppåt. */
  hojdvinkel: number;
};

const grad = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/** Normaliserar till [0, 360). */
export function normalisera(baring: number): number {
  return ((baring % 360) + 360) % 360;
}

/** Kortaste vinkelskillnaden a→b, i [-180, 180]. */
export function vinkelDiff(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/**
 * Rotationsmatris ur alpha/beta/gamma enligt W3C:s Z-X'-Y'' -ordning.
 * Returnerar radmajor 3×3 som roterar från enhetens koordinatsystem till
 * jordens (x=öst, y=norr, z=upp).
 */
function rotationsmatris(a: number, b: number, g: number): number[] {
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cg = Math.cos(g), sg = Math.sin(g);
  // W3C:s matris for Z-X'-Y''. Ordningen ar inte utbytbar: skriver man den
  // sjalv "sa har brukar den se ut" hamnar kameran rakt ned i marken vid
  // upprattstaende telefon, vilket ar precis det lage matvyn anvands i.
  return [
    ca * cg - sa * sb * sg, -cb * sa, ca * sg + cg * sa * sb,
    cg * sa + ca * sb * sg, ca * cb, sa * sg - ca * cg * sb,
    -cb * sg, sb, cb * cg,
  ];
}

/**
 * Kamerans riktning i världen.
 *
 * Kameran sitter på baksidan och tittar längs enhetens −Z. Vektorn roteras
 * till jordens system, och därifrån faller bäring och höjdvinkel ut direkt.
 *
 * `kompassOffset` läggs på bäringen. På iOS är den 0 (webkitCompassHeading är
 * redan absolut). På Android är alpha relativ och offseten måste sättas av
 * anroparen — se `berakningKompassOffset`.
 *
 * null = vinklarna saknas. Anroparen ska då SÄGA att riktningen är okänd,
 * aldrig rita prickar på en gissning.
 */
export function kameraRiktning(v: Enhetsvinklar, kompassOffset = 0): Riktning | null {
  if (v.alpha == null || v.beta == null || v.gamma == null) return null;
  if (!Number.isFinite(v.alpha) || !Number.isFinite(v.beta) || !Number.isFinite(v.gamma)) return null;

  const m = rotationsmatris(rad(v.alpha), rad(v.beta), rad(v.gamma));
  // Enhetens −Z i världskoordinater = tredje kolumnen, negerad.
  const x = -m[2], y = -m[5], z = -m[8];

  const horisontellt = Math.hypot(x, y);
  // Telefonen rakt upp eller rakt ned: bäringen är odefinierad. Hellre null än
  // ett tal som hoppar. Mätläget håller telefonen upprätt, så detta är ett
  // kantfall, inte ett normalläge.
  if (horisontellt < 1e-6) return null;

  const baringRa = grad(Math.atan2(x, y));
  const hojdvinkel = grad(Math.atan2(z, horisontellt));

  // iOS: webkitCompassHeading är telefonens riktning mot norr och ersätter
  // alpha-delen helt. Den är mätt för toppen av telefonen, så kamerans
  // avvikelse från den ligger redan i matrisen — vi byter bara nollpunkt.
  if (typeof v.webkitCompassHeading === 'number' && Number.isFinite(v.webkitCompassHeading)) {
    const alphaBaring = normalisera(-v.alpha);
    const korrigering = vinkelDiff(alphaBaring, v.webkitCompassHeading);
    return { baring: normalisera(baringRa + korrigering), hojdvinkel };
  }

  return { baring: normalisera(baringRa + kompassOffset), hojdvinkel };
}

/**
 * Var på skärmen en världsriktning hamnar, i pixlar från mitten.
 *
 * Pinhole-modell: en vinkel θ från kamerans axel projiceras till
 * f·tan(θ), där f är brännvidden i pixlar. Utanför synfältet returneras
 * null — pricken finns kvar i världen men ska inte ritas.
 */
export function tillSkarm(
  mal: Riktning,
  kamera: Riktning,
  brannviddPx: number,
  bredd: number,
  hojd: number,
): { x: number; y: number } | null {
  const dBaring = rad(vinkelDiff(kamera.baring, mal.baring));
  const dHojd = rad(mal.hojdvinkel - kamera.hojdvinkel);

  // Bakom kameran.
  if (Math.abs(dBaring) >= Math.PI / 2 || Math.abs(dHojd) >= Math.PI / 2) return null;

  const x = bredd / 2 + brannviddPx * Math.tan(dBaring);
  const y = hojd / 2 - brannviddPx * Math.tan(dHojd);
  if (x < -bredd || x > bredd * 2 || y < -hojd || y > hojd * 2) return null;
  return { x, y };
}

/**
 * Brännvidd i pixlar ur horisontellt synfält.
 * Kalibreringen justerar SYNFÄLTET, och allt annat följer av det.
 */
export function brannvidd(bredd: number, synfaltGrader: number): number {
  return bredd / 2 / Math.tan(rad(synfaltGrader) / 2);
}

/**
 * Relaskopcirkelns radie i pixlar.
 *
 * Faktor 1 = 1:50 — ett träd räknas när det ser lika brett ut som 2 cm på
 * 1 meters håll. Det är en vinkel: 2·atan(0.01/1) ≈ 1,1459°. Cirkelns DIAMETER
 * ska motsvara den vinkeln, så ett träd som fyller cirkeln är ett träd som
 * fyller relaskopet.
 */
export function relaskopRadiePx(brannviddPx: number, faktor: number): number {
  const halvvinkel = Math.atan(0.01 * Math.sqrt(faktor));
  return brannviddPx * Math.tan(halvvinkel);
}

/**
 * Grundyta ur ett räknat varv. Relaskopets hela poäng: antalet träd som
 * fyller siktet ÄR grundytan i m²/ha, gånger faktorn. Ingen mätning av
 * diameter eller avstånd behövs.
 */
export function grundytaM2PerHa(antalTrad: number, faktor: number): number {
  return antalTrad * faktor;
}

// ---------------------------------------------------------------------------
// Varvet och driften
// ---------------------------------------------------------------------------

/**
 * Hur långt varvet gått, i grader, ackumulerat med tecken.
 *
 * Summerar de KORTASTE stegen mellan mätningarna i stället för att jämföra mot
 * startbäringen. Utan det slår räknaren över vid norr (359° → 1° ser ut som
 * −358° i stället för +2°).
 */
export function varvGrader(baringar: number[]): number {
  let summa = 0;
  for (let i = 1; i < baringar.length; i++) summa += vinkelDiff(baringar[i - 1], baringar[i]);
  return summa;
}

/**
 * Magnetometern driver under ett varv. Fem till tio graders fel är normalt,
 * och det räcker för att en prick ska glida av sitt träd på återvägen.
 *
 * Varvet ger oss facit gratis: ett helt varv ÄR 360°. Residualen mellan
 * uppmätt varv och 360 är driften, och den fördelas bakåt i proportion till
 * hur långt in i varvet varje träd sattes — samma princip som slutning av en
 * polygontåg i vanlig lantmäteri.
 *
 * Returnerar korrigerade riktningar. Är varvet inte slutet (mindre än ett helt
 * varv) returneras listan oförändrad — man sluter inte något som är öppet.
 */
export function slutVarv(trad: Riktning[], varvSumma: number): Riktning[] {
  if (trad.length === 0) return trad;
  const helt = Math.sign(varvSumma) * 360;
  if (Math.abs(varvSumma) < 300) return trad;

  const residual = varvSumma - helt;
  // Orimlig residual = något annat är fel (magnetstörning, järnvägsräls,
  // motorsåg i fickan). Då är korrigeringen en gissning och vi låter bli.
  if (Math.abs(residual) > 45) return trad;

  return trad.map((t, i) => {
    const andel = trad.length === 1 ? 1 : i / (trad.length - 1);
    return { baring: normalisera(t.baring - residual * andel), hojdvinkel: t.hojdvinkel };
  });
}
