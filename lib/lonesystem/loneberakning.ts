/**
 * Löneexport-beräkning för Fortnox.
 *
 * VIKTIGT: Löneperiod i Fortnox ligger en månad efter arbetstiden.
 * Löneperiod mars 2026 = arbetstid februari 2026.
 * Funktionen arbetar med "arbetsperiod" (YYYY-MM) — anroparen
 * ansvarar för att skicka rätt arbetsperiod baserat på vald löneperiod.
 *
 * Skickar ANTAL (timmar, veckor, mil) + löneartkod.
 * Fortnox multiplicerar med sats per anställd.
 *
 * Löneartskoder: finns INTE här. De läses ur lonesystem_artikelmappning (lib/lonesystem/loneart) och skickas in som `koder`.
 * Lönearterna är timlön, premielön (skördare/skotare), övertid (skördare/skotare), vältlappar, reseersättning, helglön (skördare/skotare) och
 * brandrisk-OB (EN rad, bara beordrad brandriskmorgon — lib/ob).
 * Tom kod = ingen rad (varning + röd rad i förhandsvisningen); premielönen är frivillig och stoppar inget.
 *
 * Premielön är FÖRETAGETS EGEN konstruktion — den står inte i
 * Skogsavtalet. Regeln (premie på alla timlönetimmar, fördelad efter
 * månadens maskintyp) är Martins arbetsgivarbeslut 2026-09-29:
 * docs/lonesystem/premielon.md. Leta inte efter en paragraf.
 *
 * Övertid:
 *   Ordinarie tid = antal arbetsdagar × 8h
 *   Övertid = totalt jobbat - ordinarie
 *   Timlön = ordinarie (inte totalt!)
 *   En rad per månad med Date = löneperiodens första dag.
 *
 * Arbetsdag = dag med minst 60 min maskintid + extra tid (lib/arbetsdagRegler).
 * Kortare dagar ("kortpass") är betald tid men ingen arbetsdag: ingen ×8 i
 * övertidsbasen, ingen vältlappsvecka, ingen reseersättning. De listas i
 * varningarna så granskningen ser dem.
 */

import { ersattningsMilDag, KM_GRANS_DEFAULT } from "../kmErsattning";
import { loneartInfo, type LoneartKey, type Loneartskoder } from "./loneart";
import { rodVardagNamn, arDeldag, deldagTimmar, schemaTimmarPerDag, hemskickadMinuter } from "../franvaro";
import { arArbetsdag, ARBETSDAG_MIN_MINUTER } from "../arbetsdagRegler";
import { helglonIManad, helglonSkalText, HELGLON_TIMMAR, type HelglonDag, type FranvaroPost } from "./helglon";
import { brandriskSumma, minTillTimmar, type BrandriskSumma } from "../ob";

type ArbetsdagInput = {
  datum: string;        // YYYY-MM-DD
  arbetad_min: number;
  maskin_id: string | null;
  km_totalt: number | null;
  bekraftad: boolean | null;
  dagtyp: string | null;
  /** Brandrisk-OB (lib/ob): dagens start och om starten var beordrad. Saknas fälten räknas ingen OB. */
  start_tid?: string | null;
  brandrisk_beordrad?: boolean | null;
};

// Extra tid = arbete när maskindatorn var av (arbetad_min ser den inte).
// Arbetstid rakt av per M+L-beslut 2026-07-16 — räknas in i totalH och
// påverkar därmed BÅDE timlön och övertidströskeln.
type ExtraTidInput = {
  datum: string | null;
  minuter: number | null;
};

// Frånvaro ur ledighet_ansokningar (lib/franvaro: godkänd + registrerad) — ENDA
// frånvarokällan sedan steg 2 (2026-09-18). Expanderas start–slut till datum i
// arbetsperioden. "Arbete vinner": en frånvarodag som samtidigt har ett
// arbetspass (arbetad_min > 0) räknas som ARBETE, inte frånvaro (undviker
// dubbelräkning + speglar verkligheten).
type LedighetInput = {
  typ: string;          // FranvaroTyp (lib/franvaro)
  startdatum: string;   // YYYY-MM-DD
  slutdatum: string;    // YYYY-MM-DD
  ersatter_datum?: string | null; // bara typ 'inarbetad': den röda vardag som arbetades i stället
  fran_tid?: string | null;       // deldag: frånvaron började mitt på dagen (§12 mom 3 räknar timmar)
  till_tid?: string | null;
};

/** Deldag i granskningen: arbete PLUS frånvaro samma dag, timmarna härledda. */
export type DeldagRad = {
  datum: string;
  typ: string;
  fran_tid: string | null;
  till_tid: string | null;
  arbetad_min: number;
  timmar: number;          // schematimmar/dag − arbetade (lib/franvaro.deldagTimmar)
  schema_timmar: number;   // antagandet timmarna räknats mot
};

/**
 * Hemskickad (typ 'hemskickad', del av dag): dagen fylls upp till 8 tim. Raden bär klockslaget föraren åkte hem; minuterna HÄRLEDS ur
 * den arbetade tiden den dagen (maskin + extra tid) och lagras aldrig. Betalas som timlön, ingår i premien, räknas som arbetad tid mot
 * månadens ordinarie och ger aldrig övertid. En hemskickad dag är en hel 8-timmarsdag utanför utjämningen mot andra dagar.
 */
export type HemskickadRad = {
  datum: string;
  fran_tid: string | null;
  arbetad_min: number;     // maskin + extra tid den dagen
  minuter: number;         // 8 tim − arbetad (lib/franvaro.hemskickadMinuter) — heltal
  timmar: number;          // minuter / 60, två decimaler
};

// Bytesdag (skoftning §5 mom 4) i granskningen. Aldrig en lönerad, aldrig
// ett avdrag: den röda dagens timmar är ordinarie tid, den lediga dagen är
// inarbetad, helglönen flyttas inte.
export type ByteRad = {
  ledig: string;            // den lediga vardagen (typ inarbetad)
  ersatter: string;         // den röda vardagen som arbetades
  ersatterNamn: string;
  ersatterArbetad: boolean; // finns arbetstid på den röda dagen? (kan ligga i annan månad)
  ledigArbetad: boolean;    // registrerat arbete på den lediga dagen → bytet togs inte ut
};

type MaskinTypMap = Record<string, "skordare" | "skotare">;

/**
 * Det som avgör om och hur en förare får lönerader utöver dagarna själva (lib/lonesystem/loneunderlag fyller i det per medarbetare).
 *  franvaroRunt     frånvaro några dagar runt arbetsmånaden: närvarokravet för helglön tittar på dagarna före/efter en röd dag, även
 *                   över månadsskiftet. Saknas den används `ledigheter` (äldre anrop).
 *  anstallningsdatum  kvalifikationstiden (§10 mom 3). Saknas den kontrolleras inget och beräkningen varnar.
 *  foretagsledare   företagsledare får INGA lönerader alls (lönen ligger utanför appen), men kontrollvyerna får sin information.
 */
export type LonKontext = {
  franvaroRunt?: LedighetInput[];
  anstallningsdatum?: string | null;
  foretagsledare?: boolean;
};

/**
 * Varje löneart som HAR ett antal, i exportens ordning — också de som inte skickas. Förhandsvisningen visar den här listan rad för
 * rad, så en rad utan kod syns (röd) i stället för att bara saknas.
 *   skickas         raden går till Fortnox (finns i `rader`)
 *   saknar_kod      lönearten saknar kod: raden skickas inte och BLOCKERAR en skarp sändning tills koden är ifylld
 *   valfri_utan_kod frivillig löneart (premien) utan kod: raden hoppas över med en varning, blockerar inget
 */
export type LoneRad = {
  loneart: LoneartKey;
  /** Antalet raden skulle bära, "24.00". Fortnox multiplicerar med sats. */
  mangd: string;
  kod: string | null;
  beskrivning: string;
  status: "skickas" | "saknar_kod" | "valfri_utan_kod";
};

export type FortnoxRad = {
  EmployeeId: string;
  /** Vilken löneart raden är (lib/lonesystem/loneart). Intern: skickas inte till Fortnox. */
  loneart: LoneartKey;
  SalaryCode: string;
  Number: string;     // antal — Fortnox multiplicerar med sats
  Date: string;        // YYYY-MM-DD (löneperiodens 1:a)
  beskrivning: string; // intern — skickas inte till Fortnox
};

export type ExportSammanfattning = {
  medarbetare_id: string;
  namn: string;
  anstallningsnummer: string;
  rader: FortnoxRad[];
  varningar: string[];
  /** Alla lönearter med antal och deras status, i ordning (skickas / saknar kod / frivillig utan kod). */
  lonerader: LoneRad[];
  /** Lönearter som hade en mängd men saknar kod i mappningen: ingen rad skickades. Frivilliga (premien) räknas inte hit. */
  saknade_loneartskoder: LoneartKey[];
  /** Företagsledare (medarbetare.foretagsledare): inga lönerader alls, lönen ligger utanför appen. */
  foretagsledare: boolean;
  arbetsdagar: number;
  ordinarie_h: number;
  extra_h: number;      // varav extra tid (utanför maskinen) — ingår i timlön/övertid
  timlon_h: number;
  premielon_skordare_h: number;
  premielon_skotare_h: number;
  overtid_h: number;
  valtlappar_veckor: number;
  kor_mil: number;
  obekraftade: number;
  // Frånvaro i arbetsperioden (efter "arbete vinner") — ur ledighet_ansokningar
  // (godkänd ledighet + registrerad sjuk/vab/föräldraledig, lib/franvaro).
  // Läggs ALDRIG som lönerad — Fortnox-löneart för frånvaro är ej fastställd;
  // visas för granskning och sätts manuellt. En rad per typ.
  franvaro: { typ: string; dagar: number; datum: string[] }[];
  // Deldagar (sjuk/VAB/… från ett klockslag): dagen är arbetsdag OCH frånvaro.
  // Timmar = schematimmar − arbetade, mot antagandet ordinarie_vecka_h/5 tills
  // schema beslutats (§12 mom 3 anm 2). Aldrig lönerad — löneart öppen, och
  // frågan "levereras sjukfrånvaro i timmar?" ligger hos löneansvarig.
  deldagar: DeldagRad[];
  // Hemskickade dagar (typ 'hemskickad', del av dag): INGEN frånvaro — dagen fylls upp till 8 tim och betalas som timlön (och premie), räknas mot
  // ordinarie, aldrig övertid. `hemskickad_h` = summan i timmar (två decimaler), det Admin ser per förare och månad.
  hemskickad: HemskickadRad[];
  hemskickad_h: number;
  // Dagar under arbetsdagströskeln (lib/arbetsdagRegler): betald tid som inte är
  // en arbetsdag. Visas i granskningen — oftast inloggningar på annans maskin.
  kortpass: { datum: string; minuter: number; km_totalt: number }[];
  // Helglön §10 (lib/lonesystem/helglon): röda VARDAGAR i arbetsmånaden ur avtalets
  // lista, var och en bedömd (`ger` + `skal`). `timmar` = 8 × de dagar som ger helglön
  // (praxis: också arbetade röda dagar). Blir en lönerad per maskintyp (helglon_skordare /
  // helglon_skotare) när lönearten har en kod. `anstallningsdatumSaknas`: kvalifikationstiden
  // (mom 3) kunde inte kontrolleras — helglönen betalas, beräkningen varnar.
  helglon: { dagar: HelglonDag[]; timmar: number; anstallningsdatumSaknas: boolean };
  // Brandrisk-OB (lib/ob): beordrade vardagsmorgnar → OB (start–06:30), en rad. Minuter är
  // exakta; Fortnox-raderna bär timmar med två decimaler. Den ENDA OB appen räknar — enkelskift: tidig start är annars eget val.
  brandrisk: BrandriskSumma;
  // Bytesdagar (inarbetad, §5 mom 4) som rör arbetsmånaden — den lediga dagen
  // ELLER den röda dagen ligger i månaden. Upplysning, ingen lönerad.
  byten: ByteRad[];
};

function isoVecka(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
}

/**
 * Beräkna arbetsperiod (månad bakåt) från löneperiod.
 * Löneperiod "2026-03" → arbetsperiod "2026-02".
 */
export function arbetsperiodFrånLöneperiod(loneperiod: string): string {
  const [å, m] = loneperiod.split("-").map(Number);
  const d = new Date(å, m - 2, 1); // m-1 = löneperiod (0-indexed), minus 1 = föregående
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function beräknaExport(
  medarbetareId: string,
  namn: string,
  anstallningsnummer: string,
  dagar: ArbetsdagInput[],
  maskinTypMap: MaskinTypMap,
  loneperiod: string,  // YYYY-MM — löneperioden (en månad efter arbetstiden)
  extraTid: ExtraTidInput[] = [],  // extra tid i ARBETSPERIODEN för medarbetaren
  ledigheter: LedighetInput[] = [],  // godkänd ledighet (frånvaro) för medarbetaren
  kmGrans: number = KM_GRANS_DEFAULT,  // gs_avtal.km_grans_per_dag (fri pendling km/dag)
  helglonNamn: string | null = null,   // gs_avtal.helglon_dagar (tolv namn); null = avtalets default
  arbetadeUtanforPerioden: Set<string> = new Set(), // datum med arbete UTANFÖR arbetsperioden (bytesdagars röda dag i annan månad)
  ordinarieVeckaH: number | null = null,            // gs_avtal.ordinarie_vecka_h — deldagens schematimmar/dag (40 → 8)
  radMaskinTyp: "skordare" | "skotare" | null = null, // typen på förarens medarbetarrad-maskin — premiens fördelning en månad utan maskintid
  // Löneartskoderna ur lonesystem_artikelmappning (lib/lonesystem/loneart). Inga egna koder här: en bortglömd
  // parameter ger inga rader och en varning per löneart, aldrig en gissad kod.
  koder: Loneartskoder = {},
  lon: LonKontext = {},
): ExportSammanfattning {
  const foretagsledare = lon.foretagsledare === true;
  const loneperiodStart = loneperiod + "-01"; // Date på Fortnox-transaktionerna
  const varningar: string[] = [];
  const rader: FortnoxRad[] = [];
  const saknadeKoder: LoneartKey[] = [];
  const lonerader: LoneRad[] = [];

  /**
   * Lägg en Fortnox-rad med mappningens kod. Saknas den (eller är tom): ingen rad, mängden syns som varning och som rad i
   * `lonerader`. En vanlig löneart utan kod räknas som saknad kod (blockerar en skarp sändning); en frivillig (premien) hoppas
   * över med en varning och stoppar inget.
   */
  const laggRad = (loneart: LoneartKey, mangd: string, beskrivning: string) => {
    if (foretagsledare) return; // lönen ligger utanför appen: ingen rad, ingen saknad kod, ingen varning
    const info = loneartInfo(loneart)!;
    const kod = (koder[loneart] || "").trim();
    if (!kod) {
      if (info.valfri) {
        lonerader.push({ loneart, mangd, kod: null, beskrivning, status: "valfri_utan_kod" });
        varningar.push(`${info.label} (${Number(mangd)} ${info.enhet}) skickas inte: ingen kod är kopplad (frivillig). Koppla en kod under Lön → Lönearter om den ska med.`);
        return;
      }
      if (!saknadeKoder.includes(loneart)) saknadeKoder.push(loneart);
      lonerader.push({ loneart, mangd, kod: null, beskrivning, status: "saknar_kod" });
      varningar.push(`Löneart saknas för ${info.label} (${Number(mangd)} ${info.enhet}): koppla en kod under Lön → Lönearter. Raden skickas inte.`);
      return;
    }
    rader.push({ EmployeeId: eid, loneart, SalaryCode: kod, Number: mangd, Date: loneperiodStart, beskrivning });
    lonerader.push({ loneart, mangd, kod, beskrivning, status: "skickas" });
  };

  if (!anstallningsnummer && !foretagsledare) {
    varningar.push("Anställningsnummer saknas — kan inte skicka till Fortnox.");
  }

  const eid = anstallningsnummer || "SAKNAS";

  // ARBETSDAG = minst 60 min maskintid + extra tid samma dag (lib/arbetsdagRegler).
  // Kortare dagar är kortpass: minuterna räknas i totalH (betald tid) men dagen
  // ger ingen ×8 i övertidsbasen, ingen vältlappsvecka och ingen reseersättning.
  // Förr räknade en femminutersinloggning som en hel arbetsdag — Martins två
  // sådana i augusti 2026 tog bort 16 timmar ur hans övertid.
  const extraMinPerDatum = new Map<string, number>();
  for (const e of extraTid) if (e?.datum) extraMinPerDatum.set(e.datum, (extraMinPerDatum.get(e.datum) || 0) + (e.minuter || 0));
  const dagTotalMin = (d: ArbetsdagInput) => (d.arbetad_min || 0) + (extraMinPerDatum.get(d.datum) || 0);
  // En rad utan någon tid alls (0 min maskin, 0 min extra) är ingen dag — varken
  // arbetsdag eller kortpass. arbetsdag.dagtyp läses inte här: frånvaro kommer
  // ur `ledigheter` (lib/franvaro), dagtyp betyder bara sorts maskindag (steg 3,
  // 2026-09-25). De två gamla frånvaroraderna (0 min, ingen tid) faller på det.
  const dagarMedTid = dagar.filter(d => dagTotalMin(d) > 0);
  const produktionsDagar = dagarMedTid.filter(d => arArbetsdag(dagTotalMin(d)));
  const kortpass = dagarMedTid
    .filter(d => !arArbetsdag(dagTotalMin(d)))
    .map(d => ({ datum: d.datum, minuter: dagTotalMin(d), km_totalt: d.km_totalt || 0 }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const antalArbetsdagar = produktionsDagar.length;
  const ordinarie = antalArbetsdagar * 8; // timmar

  // ── HEMSKICKAD — dagen fylls upp till 8 tim, betalas som timlön ──
  // Raden (ledighet typ 'hemskickad', klockslag) säger bara att föraren åkte hem; minuterna härleds ur arbetad tid den dagen. Hemskickad tid på en
  // ARBETSDAG ligger i totalH (räknas mot ordinarie: dagen är en hel 8-timmarsdag, den jämnas inte ut mot andra dagar). På en dag som inte är
  // arbetsdag (under 60 min eller ingen tid alls) betalas den som timlön men ger ingen ×8, vältlapp eller reseersättning — som kortpass.
  const arbperiod = arbetsperiodFrånLöneperiod(loneperiod); // YYYY-MM
  const arbMinPerDatum = new Map<string, number>();
  for (const d of dagar) arbMinPerDatum.set(d.datum, (arbMinPerDatum.get(d.datum) || 0) + (d.arbetad_min || 0));
  const arbetsdagDatum = new Set(produktionsDagar.map(d => d.datum));
  const hemskickad: HemskickadRad[] = [];
  const hemSedda = new Set<string>();
  let hemArbetsdagMin = 0, hemOvrigMin = 0;
  for (const l of ledigheter) {
    if (String(l.typ || "").toLowerCase() !== "hemskickad" || !arDeldag(l) || !l.startdatum) continue;
    if (!l.startdatum.startsWith(arbperiod) || hemSedda.has(l.startdatum)) continue;  // utanför månaden / samma dag två gånger = en gång
    hemSedda.add(l.startdatum);
    const arbetadMin = (arbMinPerDatum.get(l.startdatum) || 0) + (extraMinPerDatum.get(l.startdatum) || 0);
    const minuter = hemskickadMinuter(arbetadMin);
    if (minuter <= 0) continue;                                                      // redan 8 tim arbetade: inget att fylla upp
    hemskickad.push({ datum: l.startdatum, fran_tid: l.fran_tid ? String(l.fran_tid).slice(0, 5) : null, arbetad_min: arbetadMin, minuter, timmar: Math.round(minuter / 60 * 100) / 100 });
    if (arbetsdagDatum.has(l.startdatum)) hemArbetsdagMin += minuter; else hemOvrigMin += minuter;
  }
  hemskickad.sort((a, b) => a.datum.localeCompare(b.datum));
  const hemMinTotalt = hemArbetsdagMin + hemOvrigMin;
  const hemskickadH = Math.round(hemMinTotalt / 60 * 100) / 100;

  // Räkna obekräftade
  let obekraftade = 0;

  // Timmar per maskintyp
  let totalH = 0;
  let skordareH = 0;
  let skotareH = 0;

  for (const d of produktionsDagar) {
    const h = (d.arbetad_min || 0) / 60;
    totalH += h;
    const typ = d.maskin_id ? maskinTypMap[d.maskin_id] : null;
    if (typ === "skordare") skordareH += h;
    else if (typ === "skotare") skotareH += h;
    else if (d.maskin_id) {
      varningar.push(`Dag ${d.datum}: maskin ${d.maskin_id} saknar typ.`);
    }
    if (!d.bekraftad) obekraftade++;
  }

  // Extra tid (utanför maskinen) — in i totalH så timlön, övertid OCH premie
  // räknas på förarens hela arbetstid.
  const extraH = extraTid.reduce((a, e) => a + (e?.minuter || 0), 0) / 60;
  totalH += extraH;
  // Kortpassens maskinminuter: betald tid som TIMLÖN (och därmed premie),
  // aldrig övertid. Utan detta blev Joacims 26 minuter 0,43 h övertid —
  // ordinarie var 0 eftersom dagen inte är arbetsdag.
  const kortpassH = kortpass.reduce((a, k) => a + (dagarMedTid.find(d => d.datum === k.datum)?.arbetad_min || 0), 0) / 60;
  totalH += kortpassH;
  // Hemskickad tid: arbetad tid i betydelsen "betald som timlön". På en dag utan ×8 är den betald tid precis som kortpass (aldrig övertid).
  const hemOvrigH = hemOvrigMin / 60;
  totalH += hemArbetsdagMin / 60 + hemOvrigH;

  totalH = Math.round(totalH * 100) / 100;
  skordareH = Math.round(skordareH * 100) / 100;
  skotareH = Math.round(skotareH * 100) / 100;
  const extraHRund = Math.round(extraH * 100) / 100;

  // OBS (flaggat, ej beslutat): extra tid på en dag UTAN maskinpass ökar
  // totalH men inte antalArbetsdagar/ordinarie — sådan tid lutar mot
  // övertid. Varnas nedan så det syns i exporten i stället för att gissas.
  const passDatum = new Set(produktionsDagar.map(d => d.datum));
  const extraUtanPassMin = extraTid
    .filter(e => e?.datum && !passDatum.has(e.datum))
    .reduce((a, e) => a + (e?.minuter || 0), 0);
  if (extraUtanPassMin > 0) {
    varningar.push(
      `${Math.round(extraUtanPassMin / 60 * 100) / 100}h extra tid ligger på dagar utan maskinpass — ` +
      `räknas som arbetstid men höjer inte ordinarie-timmarna (kan ge övertid). Granska.`,
    );
  }

  // Övertid = totalt - ordinarie (kortpassens timmar är ordinarie, aldrig övertid)
  const overtidH = Math.round(Math.max(0, totalH - ordinarie - kortpassH - hemOvrigH) * 100) / 100;

  // Timlön = ordinarie (inte totalt!) — räknas på HELA arbetstiden inkl extra
  const timlonH = Math.round(Math.min(totalH, ordinarie + kortpassH + hemOvrigH) * 100) / 100;
  const kortpassHRund = Math.round(kortpassH * 100) / 100;

  // ── PREMIELÖN — ER EGEN KONSTRUKTION, INTE KOLLEKTIVAVTALET ──
  // Premien finns inte i Skogsavtalet (docs/lonesystem/premielon.md). Regeln
  // är Martins beslut som arbetsgivare, 2026-09-29: premie på ALLA arbetade
  // timmar — maskin, planering, service, möten, flyttar, manuellt arbete.
  // "Ingen ska tappa pengar på att göra något annat än att sitta i maskinen."
  //
  //   premietimmar = timlönetimmarna (ordinarie + kortpass; övertid ger ingen
  //                  premie, som förr)
  //   fördelning   = månadens andel skördar-/skotartid (maskintid på dagar
  //                  MED typad maskin)
  //   ingen maskintid i månaden → typen på förarens medarbetarrad
  //   ingen maskin där heller  → ingen premie + varning (syns i granskningen)
  //
  // Förr: bas = min(maskintid, ordinarie) fördelad på maskintidens andel. En
  // dag UTAN maskin_id räknades i basen men hörde till ingen typ → timmarna
  // tappade premien tyst (Martin sep 2026: 19,96 tim; Max: 7 tim). Extra tid
  // gav aldrig premie. Båda är borta med den här regeln.
  const typadH = skordareH + skotareH;
  const premieBas = timlonH;
  let premieSkordare = 0, premieSkotare = 0;
  if (premieBas > 0 && !foretagsledare) {
    const andelSkordare = typadH > 0 ? skordareH / typadH
      : radMaskinTyp === "skordare" ? 1 : radMaskinTyp === "skotare" ? 0 : null;
    if (andelSkordare === null) {
      varningar.push(`Ingen premielön: ingen maskintid i månaden och ingen maskin på medarbetarraden (${premieBas} tim utan premie). Sätt förarens maskin i admin.`);
    } else {
      // Avrunda den ena, låt den andra ta resten — summan är exakt premiebasen.
      premieSkordare = Math.round(premieBas * andelSkordare * 100) / 100;
      premieSkotare = Math.round((premieBas - premieSkordare) * 100) / 100;
    }
  }

  // ── 1. TIMLÖN ──
  if (timlonH > 0) {
    laggRad("timlon", timlonH.toFixed(2), `Timlön: ${timlonH}h ordinarie (${antalArbetsdagar} dagar × 8h${kortpassHRund > 0 ? ` + ${kortpassHRund}h kortpass` : ''})${hemskickadH > 0 ? ` varav ${hemskickadH}h hemskickad` : ''}`);
  }

  // ── 2. PREMIELÖN — på alla timlönetimmar, fördelat efter månadens maskintyp ──
  const premieGrund = typadH > 0 ? `${skordareH}h skördare / ${skotareH}h skotare i maskin` : `ingen maskintid, typ ur medarbetarraden (${radMaskinTyp})`;
  if (premieSkordare > 0) {
    laggRad("premielon_skordare", premieSkordare.toFixed(2), `Premielön skördare: ${premieSkordare}h av ${premieBas}h timlön (${premieGrund})`);
  }
  if (premieSkotare > 0) {
    laggRad("premielon_skotare", premieSkotare.toFixed(2), `Premielön skotare: ${premieSkotare}h av ${premieBas}h timlön (${premieGrund})`);
  }

  // ── 3. ÖVERTID — en rad per månad ──
  if (overtidH > 0) {
    // Dominant maskintyp för hela perioden
    const overtidArt: LoneartKey = skordareH >= skotareH ? "overtid_skordare" : "overtid_skotare";
    laggRad(overtidArt, overtidH.toFixed(2), `Övertid: ${overtidH}h (${totalH}h totalt${extraHRund > 0 ? `, varav ${extraHRund}h extra tid` : ''} - ${ordinarie}h ordinarie)`);
  }

  // ── 4. VÄLTLAPPAR: antal veckor med minst 1 arbetsdag ──
  const veckor = new Set<number>();
  for (const d of produktionsDagar) veckor.add(isoVecka(new Date(d.datum)));
  const vältVeckor = veckor.size;
  if (vältVeckor > 0) {
    laggRad("valtlappar", vältVeckor.toFixed(0), `Vältlappar: ${vältVeckor} veckor`);
  }

  // ── 5. RESEERSÄTTNING: påbörjade mil över gränsen ──
  // Delad lib (lib/kmErsattning) — SAMMA mängd som kalendern + per-dag-vyn.
  // Appen skickar bara ANTAL mil; Fortnox äger kr/mil-satsen. (Tidigare *2 tog
  // bort — km_totalt är redan tur+retur, så det dubblade fel. Gränsen kommer nu
  // från gs_avtal.km_grans_per_dag, ej hårdkodad 60.)
  let totalMil = 0;
  for (const d of produktionsDagar) totalMil += ersattningsMilDag(d.km_totalt, kmGrans);
  if (totalMil > 0) {
    laggRad("korersattning", totalMil.toFixed(0), `Reseersättning: ${totalMil} påbörjade mil (över ${kmGrans} km/dag)`);
  }

  // Obekräftade varning
  if (obekraftade > 0) {
    varningar.push(`${obekraftade} av ${antalArbetsdagar} dagar är ej bekräftade.`);
  }
  if (kortpass.length > 0) {
    const lista = kortpass.map(k => `${k.datum} ${k.minuter} min${k.km_totalt > 0 ? ` · ${k.km_totalt} km` : ''}`).join(', ');
    varningar.push(`Kortpass (under ${ARBETSDAG_MIN_MINUTER} min): ${lista} — betald tid men ingen arbetsdag: ingen ×8 i övertidsbasen, ingen vältlappsvecka, ingen reseersättning. Ta bort dagen om den är en felinloggning.`);
  }

  // ── FRÅNVARO ur godkänd ledighet (primär källa) ──
  // Expandera varje ledighet start–slut till datum, begränsa till ARBETSPERIODENS
  // månad, och tillämpa "arbete vinner": en dag med arbetspass (arbetad_min > 0)
  // räknas som arbete, inte frånvaro. Läggs ALDRIG som lönerad (löneart okänd) —
  // ytas som franvaro + varning för manuell hantering.
  const arbetadeDatum = new Set(dagar.filter(d => (d.arbetad_min || 0) > 0).map(d => d.datum));
  const franvaroPerTyp = new Map<string, string[]>();
  // ── BYTESDAGAR (inarbetad, §5 mom 4) — inte frånvaro att sätta löneart på ──
  // Den lediga dagen är ledighet UTAN avdrag (lönen följer schemat); den röda
  // dagen är en vanlig arbetsdag i ordinarie (+ söndagstillägg om beordrat,
  // löneart OB öppen) och ger INGEN helglön (§10 mom 2). Listas separat med
  // upplysning; ett byte kan spänna över månadsskiftet — då syns det i båda.
  const byten: ByteRad[] = [];
  for (const l of ledigheter) {
    if (l.typ !== 'inarbetad' || !l.ersatter_datum || !l.startdatum) continue;
    const ledig = l.startdatum, ersatter = l.ersatter_datum;
    if (!ledig.startsWith(arbperiod) && !ersatter.startsWith(arbperiod)) continue;
    byten.push({
      ledig, ersatter,
      ersatterNamn: rodVardagNamn(ersatter) || 'röd dag',
      ersatterArbetad: arbetadeDatum.has(ersatter) || arbetadeUtanforPerioden.has(ersatter),
      ledigArbetad: arbetadeDatum.has(ledig),
    });
  }
  for (const b of byten) {
    const rod = `${b.ersatterNamn} ${b.ersatter}`;
    if (b.ledigArbetad) {
      varningar.push(`Bytesdag: ${b.ledig} skulle vara inarbetad ledighet (ersätter ${rod}) men har registrerat arbete — bytet togs inte ut; ${b.ersatter} är då en vanlig arbetad röd dag. Granska.`);
    } else if (!b.ersatterArbetad) {
      varningar.push(`Bytesdag: ${b.ledig} är inarbetad ledighet som ersätter ${rod} — men INGEN arbetstid finns registrerad ${b.ersatter}. Inarbetningen saknas; granska (byt typ om dagen ska räknas som annan ledighet).`);
    } else {
      varningar.push(`Bytesdag (§5 mom 4): ${b.ledig} är inarbetad ledighet — ersätter ${rod} som arbetades. Ingen lönerad, inget avdrag; den röda dagens timmar är ordinarie tid (+ söndagstillägg om beordrat), helglönen flyttas inte.`);
    }
  }
  // ── DELDAGAR (klockslag på raden) — arbete PLUS frånvaro samma dag ──
  // "Arbete vinner" gäller BARA heldagsrader (nedan). En deldag är förmiddag
  // arbete, eftermiddag frånvaro; timmarna härleds mot schematimmar/dag.
  const schemaH = schemaTimmarPerDag(ordinarieVeckaH);
  const arbetadMinPerDatum = new Map(dagar.map(d => [d.datum, d.arbetad_min || 0]));
  const deldagar: DeldagRad[] = [];
  for (const l of ledigheter) {
    if (!arDeldag(l) || l.typ === 'inarbetad' || !l.startdatum) continue;
    if (String(l.typ || '').toLowerCase() === 'hemskickad') continue;   // betald tid, ingen frånvaro: egen lista ovan (`hemskickad`)
    if (!l.startdatum.startsWith(arbperiod)) continue;
    const arbetadMin = arbetadMinPerDatum.get(l.startdatum) || 0;
    deldagar.push({
      datum: l.startdatum, typ: (l.typ || 'ledig').toLowerCase(),
      fran_tid: l.fran_tid ? String(l.fran_tid).slice(0, 5) : null, till_tid: l.till_tid ? String(l.till_tid).slice(0, 5) : null,
      arbetad_min: arbetadMin, timmar: deldagTimmar(schemaH, arbetadMin), schema_timmar: schemaH,
    });
  }
  deldagar.sort((a, b) => a.datum.localeCompare(b.datum));
  for (const dd of deldagar) {
    const nar = dd.fran_tid ? `från ${dd.fran_tid}` : `till ${dd.till_tid}`;
    const arb = Math.round(dd.arbetad_min / 6) / 10;
    varningar.push(`Deldag (${dd.typ}) ${dd.datum} ${nar}: ${dd.timmar} tim frånvaro (arbetade ${arb} tim, räknat mot ${dd.schema_timmar} tim/dag — ANTAGANDE tills schema beslutats, §12 mom 3 anm 2). Dagen är arbetsdag. Löneart ej fastställd; läggs INTE som lönerad.`);
  }

  // ── HELDAGSRADER — "arbete vinner" ──
  for (const l of ledigheter) {
    if (l.typ === 'inarbetad') continue; // bytesdagar ovan — aldrig "frånvaro att sätta löneart på"
    if (String(l.typ || '').toLowerCase() === 'hemskickad') continue; // betald tid (egen lista `hemskickad`), aldrig frånvaro — även om en rad skulle sakna klockslag
    if (arDeldag(l)) continue;           // deldagar ovan
    if (!l.startdatum || !l.slutdatum) continue;
    const start = new Date(l.startdatum + "T00:00:00");
    const slut = new Date(l.slutdatum + "T00:00:00");
    for (let d = new Date(start); d <= slut; d.setDate(d.getDate() + 1)) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!iso.startsWith(arbperiod)) continue;      // bara arbetsperiodens månad
      if (arbetadeDatum.has(iso)) continue;          // arbete vinner — BARA för heldagsrader
      const typ = (l.typ || 'ledig').toLowerCase();
      const arr = franvaroPerTyp.get(typ) || [];
      if (!arr.includes(iso)) arr.push(iso);
      franvaroPerTyp.set(typ, arr);
    }
  }
  // (Förr lästes även arbetsdag.dagtyp här. Joacims sjukdag 2026-08-19 låg
  // BARA där och försvann tyst ur augusti-underlaget tills #546 — och sedan
  // steg 2 (2026-09-18) ligger den i ledighet_ansokningar som alla andra.
  // Två källor är borta; `ledigheter` är den enda.)
  const franvaro = Array.from(franvaroPerTyp.entries())
    .map(([typ, datum]) => ({ typ, dagar: datum.length, datum: datum.sort() }))
    .sort((a, b) => b.dagar - a.dagar);
  for (const f of franvaro) {
    const spann = f.datum.length > 1 ? `${f.datum[0]}…${f.datum[f.datum.length - 1]}` : f.datum[0];
    varningar.push(`Frånvaro (${f.typ}): ${f.dagar} dag(ar) ${spann} — löneart för Fortnox ej fastställd; läggs INTE som lönerad, sätt manuellt innan sändning.`);
  }

  // ── HELGLÖN §10 (lib/lonesystem/helglon) ──
  // Varje röd vardag i arbetsmånaden ur avtalets tolv namn ger 8 tim — företagets praxis (Martin 2026-10-17), över avtalets
  // minimum: "bortfallna timmar" (§10 mom 2) tillämpas inte, så en ARBETAD röd dag ger helglön OCH vanlig lön för de arbetade
  // timmarna (inget söndagstillägg). Närvarokravet (mom 4) och kvalifikationstiden (mom 3) avgör vilka dagar som INTE ger helglön;
  // varje dag bär sin orsak (`skal`). Lönearten väljs efter månadens maskintyp (som övertiden). Blir en lönerad när lönearten har en kod.
  const arbetadeInklExtra = new Set<string>(arbetadeDatum);
  for (const e of extraTid) if (e?.datum && (e.minuter || 0) > 0) arbetadeInklExtra.add(e.datum);
  // Bytesdag: en arbetad röd dag som byts mot en ledig dag — märks så att granskningen ser att ledigheten finns.
  const bytesLedigPerRod = new Map(byten.map(b => [b.ersatter, b.ledig]));
  const anstDatum = (lon.anstallningsdatum || "").trim() || null;
  const franvaroRunt: FranvaroPost[] = (lon.franvaroRunt ?? ledigheter).map(l => ({ ...l, typ: String(l.typ || "").toLowerCase() }));
  const helglonDagarLista: HelglonDag[] = foretagsledare ? [] : helglonIManad(helglonNamn, arbperiod, { arbetadeDatum: arbetadeInklExtra, franvaro: franvaroRunt, anstallningsdatum: anstDatum })
    .map(h => bytesLedigPerRod.has(h.datum) ? { ...h, bytesLedig: bytesLedigPerRod.get(h.datum) } : h);
  const helglonGerDagar = helglonDagarLista.filter(h => h.ger);
  const helglonTimmar = helglonGerDagar.length * HELGLON_TIMMAR;
  const anstallningsdatumSaknas = helglonDagarLista.length > 0 && !anstDatum;
  const helglon = { dagar: helglonDagarLista, timmar: helglonTimmar, anstallningsdatumSaknas };
  if (helglonDagarLista.length > 0) {
    const lista = helglonDagarLista.map(h => `${h.datum} ${h.namn}${h.ger ? (h.arbetad ? ` (${helglonSkalText(h.skal)})` : '') : ` (ingen helglön: ${helglonSkalText(h.skal)})`}${h.bytesLedig ? ` (byts mot ledig ${h.bytesLedig})` : ''}`).join(', ');
    varningar.push(`Helglön §10: ${helglonTimmar} tim (${lista}). Praxis: varje röd vardag ger 8 tim, även om du arbetar den (arbetade timmar lönas dessutom, inget söndagstillägg §8 mom 1). Närvarokravet (§10 mom 4) och kvalifikationstiden (mom 3) är kontrollerade.`);
  }
  if (anstallningsdatumSaknas) {
    varningar.push("Anställningsdatum saknas: kvalifikationstiden för helglön (tre månader, §10 mom 3) är inte kontrollerad. Helglönen betalas. Fyll i anställningsdatum under Medarbetare.");
  }
  if (helglonTimmar > 0) {
    const helglonArt: LoneartKey | null = typadH > 0
      ? (skordareH >= skotareH ? "helglon_skordare" : "helglon_skotare")
      : radMaskinTyp === "skordare" ? "helglon_skordare" : radMaskinTyp === "skotare" ? "helglon_skotare" : null;
    if (helglonArt) {
      const arbetade = helglonGerDagar.filter(h => h.arbetad).length;
      laggRad(helglonArt, helglonTimmar.toFixed(2), `Helglön §10: ${helglonTimmar}h (${helglonGerDagar.length} röda vardagar${arbetade > 0 ? `, varav ${arbetade} arbetade` : ''})`);
    } else {
      varningar.push(`Ingen helglön skickas: ${helglonTimmar} tim kan inte räknas — ingen maskintid i månaden och ingen maskin på medarbetarraden, så maskintypen (skördare/skotare) går inte att avgöra. Sätt förarens maskin i admin.`);
    }
  }

  // ── BRANDRISK-OB (lib/ob, Skogsavtalet § 8 mom 1) ──
  // EN rad per förare och månad med tom kod tills admin kopplar den (Fortnox 147): alla beordrade timmar start → 06:30 — företagets praxis,
  // över avtalets minimum, ingen uppdelning i nattillägg. Exakta timmar, två decimaler, ingen avrundning per dag. Ingen annan OB räknas.
  const brandrisk = brandriskSumma(dagar.map(d => ({ datum: d.datum, start_tid: d.start_tid ?? null, brandrisk_beordrad: d.brandrisk_beordrad ?? null })));
  if (brandrisk.ob_min > 0) {
    laggRad("brandrisk_ob", minTillTimmar(brandrisk.ob_min), `Brandrisk – OB: ${minTillTimmar(brandrisk.ob_min)}h (${brandrisk.dagar.length} beordrade morgnar, start–06:30)`);
  }

  return {
    medarbetare_id: medarbetareId,
    namn,
    anstallningsnummer,
    rader,
    varningar,
    lonerader,
    saknade_loneartskoder: saknadeKoder,
    foretagsledare,
    arbetsdagar: antalArbetsdagar,
    ordinarie_h: ordinarie,
    extra_h: extraHRund,
    // Företagsledare: lönen ligger utanför appen, så inga löntal (timlön, premie, övertid, vältlappar, mil) visas för dem.
    timlon_h: foretagsledare ? 0 : timlonH,
    premielon_skordare_h: premieSkordare,
    premielon_skotare_h: premieSkotare,
    overtid_h: foretagsledare ? 0 : overtidH,
    valtlappar_veckor: foretagsledare ? 0 : vältVeckor,
    kor_mil: foretagsledare ? 0 : totalMil,
    obekraftade,
    franvaro,
    kortpass,
    helglon,
    brandrisk,
    byten,
    deldagar,
    hemskickad,
    hemskickad_h: hemskickadH,
  };
}
