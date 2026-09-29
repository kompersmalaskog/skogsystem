// RADBYGGAREN — från ett VO:s underlag till de rader som hamnar på fakturan.
//
// REN FUNKTION. Allt hämtande ligger utanför, så raderna går att pröva mot
// riktiga fakturor utan databas. Facit är fortnox_invoice_rows: strukturen
// nedan är AVLÄST ur skickade fakturor, inte härledd ur avtalet.
//
//   rad 1   ingen artikel   objektets namn                       0 à 0
//   rad 2   artikel 8       "Kontraktsnr 972114"                 1 st à 0
//   rad 3   artikel 1       "Skördning Gigant"            2000 m3fub à 58
//   rad 4   artikel 2       "Skotning Wisent"             2000 m3fub à 56,5
//   rad 5   artikel 5       "Flytt av maskin"                    2 st à 1500
//   rad 6+  ingen artikel   "Medel 0,69" "Krönt +1,5kr" …        0 à 0
//
// ─────────────────────────────────────────────────────────────────────────
// VARJE PRIS HAR EXAKT EN ÄGARE, OCH ÄGAREN ÄR DEN SOM HAR UNDERLAGET.
//
//   'app'         ackordspriset (medelstam, traktstorlek, avstånd) och
//                 timpengen (maskin_timpris). Räknas fram, lagras ALDRIG.
//   'fortnox'     fasta artikelpriser (flytt, kontraktsnr). Hämtas live med
//                 FortnoxClient.hamtaArtikelpris, lagras ALDRIG.
//   'leverantor'  vidarefakturerad kostnad (manuell fällning). ENDA radtypen
//                 som bär ett belopp — och den bär det för att beloppet
//                 kommer från någon annans faktura. FLYTT hör INTE hit:
//                 trailern är vår egen och priset ägs av Fortnox (artikel
//                 5 under 3 mil, artikel 3 däröver).
//
// TIMPENGSARTIKLARNA 11/12 FRÅGAR ALDRIG FORTNOX. De har tomt pris där med
// flit: priset ägs av maskin_timpris och maskinen identifieras av
// KOSTNADSSTÄLLET. Ett Fortnox-anrop hade svarat 'pris_saknas' — sant men
// meningslöst, eftersom Fortnox inte är prisets ägare.
// ─────────────────────────────────────────────────────────────────────────
//
// TVÅ REGLER SOM ÄR AVLÄSTA, INTE ANTAGNA:
//
// 1. ACKORD ÄR EN RAD PER ROLL, inte per maskin — även när två skotare kört
//    (faktura 2026145: "Skotning ackord King/Wisent", ETT kostnadsställe).
//    TIMPENG är en rad per MASKIN, eftersom timmarna och timpriset är
//    maskinens.
//
// 2. BÅDA ACKORDRADERNA HAR SAMMA ANTAL = den SKÖRDADE volymen.
//    Verifierat på 33 ackordfakturor: noll har olika antal på artikel 1 och 2.
//    Skotarens lassvolym används INTE — den läcker (Brokamåla: 2 187 m³
//    skördat mot 1 168 i lass), och ackordet avser trakten, inte lassen.
//    De 16 fakturor som HAR olika antal är alla timpeng, där antalet är
//    TIMMAR och maskinerna självklart kört olika länge.

// ─────────────────────────────────────────────────────────────────────────
// TVÅ LUCKOR I REGISTREN SOM RADBYGGAREN INTE KAN LAGA SJÄLV (2026-09-26)
//
// 1. KOSTNADSSTÄLLET HAR BYTT ÖVER TID — ÅTGÄRDAT.
//    Scorpionen låg på M13 (2026-01-09 → 2026-02-17) och på SCO från
//    2026-03-09; två Rottne delade M12. maskin_kostnadsstalle saknade
//    tidsaxel och kunde bara svara "vad gäller NU", så ett underlag byggt
//    för januari hade fått SCO på en rad som bokfördes på M13.
//    Migration 20260926_maskin_kostnadsstalle_giltighet ger registret
//    giltig_fran/giltig_till, och lib/ekonomi/kostnadsstalle slår upp per
//    DATUM. Anroparen ska fylla Maskinrad.kostnadsstalle därifrån — aldrig
//    ur "maskinens enda rad".
//
// 2. FLYTTRADENS KOSTNADSSTÄLLE FINNS INTE I NÅGOT REGISTER. Fakturorna
//    sätter TRA (tidigare M8) på flytt- och traillerrader, men det är inte
//    en MASKIN och står därför inte i maskin_kostnadsstalle. Raden lämnas
//    med null här tills det finns en källa — hellre tomt än gissat. Att det
//    SAKNAS ska synas i granskningen, inte tyst bli tomt på fakturan.
//
// Och ett icke-fynd: smeknamnet behöver INGEN ny kolumn. dim_maskin.
// visningsnamn finns redan. Den stämmer inte med fakturan för två maskiner
// ("Ponsse Scorpion" mot "Gigant", "Elefant" mot "King"), men fakturatexten
// är ändå inte ett namn — den bär vad raden avser ("Skotning Wisent Virke",
// "Skördning Gigant special (37m3f)"). Radbyggaren FÖRESLÅR texten ur
// visningsnamn, och faktura_rad.benamning är en vanlig text-kolumn som
// redigeras på raden. "King" är dessutom tvetydigt — både A110148 och
// A130743 heter så på faktura — så namnet kan aldrig bära identiteten.
// Det gör kostnadsstället.
// ─────────────────────────────────────────────────────────────────────────

import { prisPerM3, type Prisdel, type Tillaggspost } from '@/lib/ekonomi/prisPerM3';
import type { AcordPris } from '@/lib/ekonomi/acord';

export type Prisagare = 'fortnox' | 'app' | 'leverantor';
export type RadStatus = 'klar' | 'vantar_leverantorsfaktura' | 'fel';
export type FelKod = 'fortnox_svarade_inte' | 'artikel_saknas' | 'pris_saknas';
export type Enhet = 'h' | 'km' | 'kr' | 'm3fub' | 'st';
export type FakturaKalla =
  | 'ackord_skordning' | 'ackord_skotning' | 'slutredovisning'
  | 'timpeng_skordare' | 'timpeng_skotare' | 'flytt' | 'traillerflytt'
  | 'kront' | 'manuell_fallning' | 'planering' | 'kontraktsnr' | 'manuell';

export type FakturaRad = {
  radnr: number;
  artikelnr: string | null;
  benamning: string;
  antal: number | null;
  enhet: Enhet | null;
  prisagare: Prisagare;
  /** Ifyllt ENDAST för prisagare='leverantor' — faktura_rad.rad_pris_agare. */
  a_pris: number | null;
  harledning: Prisdel[] | null;
  kalla: FakturaKalla;
  kalla_id: string | null;
  status: RadStatus;
  fel_kod: FelKod | null;
  /** Kostnadsstället identifierar maskinen på fakturan. Inte en kolumn i
   *  faktura_rad än — bärs här tills exporten byggs. */
  kostnadsstalle: string | null;
  /**
   * Det UTRÄKNADE à-priset, för visning och granskning. LAGRAS ALDRIG —
   * faktura_rad.a_pris är NULL för prisagare 'app' och 'fortnox', och
   * constrainten rad_pris_agare ser till att det förblir så. Fältet finns för
   * att granskningen ska kunna visa talet utan att någon frestas spara det;
   * det räknas om varje gång underlaget öppnas.
   * null för 'fortnox'-rader — där äger Fortnox talet och det hämtas live.
   */
  a_pris_beraknat: number | null;
  /**
   * À-prisets tre delar, för vyn. Skickas med i stället för att härledas ur
   * harledning: grundpriset där bär TOTALPRISET (så visar Vida det), och
   * rollens andel går inte att räkna baklänges när fördelningen inte är
   * hälften — Brokamåla är 2,00/0,50. En vy som gissar visar fel tal.
   * Alla tre är null på rader som inte är ackord eller timpeng.
   */
  delar_grundpris: number | null;
  delar_andel: number | null;
  delar_avstand: number | null;
  /** Prislistans rad oförändrad, så vyn kan visa vad AVTALET ger före
   *  tilläggen. Bara på ackordrader. */
  prislista: { medelstam: number; klass: number; total: number; skordare: number; skotare: number } | null;
  /** Tilläggen med sin mottagare — skördaren, skotaren eller delas.
   *  Bara på ackordrader; identisk på båda, det är TRAKTENS tillägg. */
  tillaggsposter: Tillaggspost[] | null;
};

export type Maskinrad = {
  maskin_id: string;
  /** Namnet Vida ser: "Gigant", "Wisent", "King". Inte modellbeteckningen. */
  namn: string;
  roll: 'skordare' | 'skotare';
  kostnadsstalle: string | null;
  /** G15-timmar på objektet. Används bara för timpeng. */
  g15h: number;
  /** Datumgiltigt timpris. null = ingen prisrad — ett TILLSTÅND, inte 0 kr. */
  timpris: number | null;
};

export type Flyttrad = {
  id: string;
  datum: string;
  maskin: string;
  km: number | null;
  /**
   * fakturaunderlag_flytt.traillertimmar — INSKRIVNA av Martin.
   * Lastbilens rundresa från LBC och tillbaka, inte maskinens förflyttning.
   * maskin_flytt.tid_flytt_min mäter fel sak och används ALDRIG här.
   */
  traillertimmar: number | null;
  /** true = raden är ompekad hit vid granskning, inte där flytten
   *  registrerades. Visas som en not — ett val ska aldrig vara osynligt. */
  omdirigerad?: boolean;
  /** Avreseobjektets namn, BARA för texten: "Traillerflytt Wisent från
   *  Kämpamåla". Saknas det utelämnas frasen — raden hör ändå till trakten
   *  maskinen kom TILL, så ett tomt avreseobjekt gör den aldrig hemlös. */
  franNamn?: string | null;
};

/** En post Martin lagt in för hand: fällning, GROT-skotning, papp. */
export type ManuellPost = {
  etikett: string;
  antal: number;
  enhet: Enhet;
  /** Leverantörens pris EXKL moms. Null = beloppet inte känt än. */
  a_pris: number | null;
  kalla: FakturaKalla;
};

export type VoUnderlag = {
  vo_nummer: string;
  objektnamn: string;
  kontraktsnummer: string | null;
  bolag: string | null;
  /** bolag.fortnox_kundnr. null = går inte att fakturera, ska SYNAS. */
  fortnox_kundnr: number | null;
  timpeng: boolean;
  /** lib/objekt/avrakning.avrakningsdatum. null = inte slutavräknat. */
  avrakningsdatum: string | null;

  /** SKÖRDAD volym. Samma antal på båda ackordraderna — se huvudet. */
  volymM3fub: number;
  medelstam: number;
  sortimentgrupper: number;
  terrangKr: number;
  /** Skotningsavståndets tillägg i KRONOR totalt. Går helt till skotaren. */
  skotAvstandKr: number;

  /** Överskrivning av fördelningen. null = använd förslaget. */
  andelSkordareManuell: number | null;

  acordList: AcordPris[];
  sortKr: number;
  traktKr: number;
  kvalitetKr: number;

  maskiner: Maskinrad[];
  flyttar: Flyttrad[];
  manuellaPoster: ManuellPost[];
};

/**
 * Gränsen mellan de två flyttradtyperna. Till och med denna sträcka är
 * flytten ett fast belopp per maskin (artikel 5); däröver betalas den per
 * timme (artikel 3). Stämmer mot maskin_flytt: fakturerbar är sann på exakt
 * de sex flyttar som är över 30 km och falsk på de elva under.
 */
export const FLYTT_TIMDEBITERING_KM = 30;

const tvaDec = (n: number) => Math.round(n * 100) / 100;

/**
 * Bygger fakturaraderna för ETT vo-nummer.
 *
 * Kan inte kasta. Allt som saknas blir en rad med status='fel' och en fel_kod,
 * eller en saknad rad som granskningen ytar — aldrig ett tyst nollbelopp.
 */
export function byggRader(u: VoUnderlag): FakturaRad[] {
  const rader: FakturaRad[] = [];
  let n = 0;
  type Valfria = 'a_pris_beraknat' | 'delar_grundpris' | 'delar_andel' | 'delar_avstand'
               | 'prislista' | 'tillaggsposter';
  type Ny = Omit<FakturaRad, 'radnr' | Valfria> & Partial<Pick<FakturaRad, Valfria>>;
  const lagg = (r: Ny) => {
    rader.push({ radnr: ++n, a_pris_beraknat: null,
      delar_grundpris: null, delar_andel: null, delar_avstand: null,
      prislista: null, tillaggsposter: null, ...r });
  };

  // ── 1. Rubrikraden: objektets namn, noll kronor ────────────────────────
  lagg({
    artikelnr: null, benamning: u.objektnamn, antal: 0, enhet: null,
    prisagare: 'app', a_pris: null, harledning: null,
    kalla: 'manuell', kalla_id: null, status: 'klar', fel_kod: null,
    kostnadsstalle: null,
  });

  // ── 2. Kontraktsnumret: artikel 8, 1 st à 0 ────────────────────────────
  // 0 kr är ett PRIS, inte ett saknat pris. Artikeln finns i Fortnox just för
  // att numret ska stå på dokumentet utan att kosta något.
  if (u.kontraktsnummer) {
    lagg({
      artikelnr: '8', benamning: `Kontraktsnr ${u.kontraktsnummer}`,
      antal: 1, enhet: 'st', prisagare: 'fortnox', a_pris: null,
      harledning: null, kalla: 'kontraktsnr', kalla_id: null,
      status: 'klar', fel_kod: null, kostnadsstalle: null,
    });
  } else {
    // Saknas numret kan Vida inte para ihop fakturan med sitt kontrakt.
    // Det är ett fel som Martin åtgärdar i objektet, inte i Fortnox.
    lagg({
      artikelnr: '8', benamning: 'Kontraktsnr saknas', antal: 1, enhet: 'st',
      prisagare: 'fortnox', a_pris: null, harledning: null,
      kalla: 'kontraktsnr', kalla_id: null,
      status: 'fel', fel_kod: 'pris_saknas', kostnadsstalle: null,
    });
  }

  const skordare = u.maskiner.filter(m => m.roll === 'skordare');
  const skotare = u.maskiner.filter(m => m.roll === 'skotare');

  if (u.timpeng) {
    // ── 3a. TIMPENG: en rad per MASKIN ───────────────────────────────────
    // Artikel 11/12 har tomt pris i Fortnox med flit — priset ägs av
    // maskin_timpris och maskinen identifieras av kostnadsstället.
    // Därför prisagare='app' och INGET Fortnox-anrop.
    for (const m of u.maskiner) {
      const artikel = m.roll === 'skordare' ? '11' : '12';
      const verb = m.roll === 'skordare' ? 'Skördning' : 'Skotning';
      const utanPris = m.timpris == null;
      lagg({
        artikelnr: artikel,
        benamning: `${verb} timpeng ${m.namn}`,
        antal: tvaDec(m.g15h), enhet: 'h',
        prisagare: 'app', a_pris: null,
        harledning: utanPris ? null : [{ etikett: `Timpris ${m.maskin_id}`, belopp: m.timpris! }],
        kalla: m.roll === 'skordare' ? 'timpeng_skordare' : 'timpeng_skotare',
        kalla_id: null,
        status: utanPris ? 'fel' : 'klar',
        fel_kod: utanPris ? 'pris_saknas' : null,
        kostnadsstalle: m.kostnadsstalle,
        a_pris_beraknat: m.timpris,
        delar_grundpris: m.timpris,
      });
    }
  } else {
    // ── 3b. ACKORD: en rad per ROLL, samma antal på båda ─────────────────
    const gem = {
      medelstam: u.medelstam, acordList: u.acordList,
      sortKr: u.sortKr, traktKr: u.traktKr,
      kvalitetKr: u.kvalitetKr, terrangKr: u.terrangKr,
    };
    const psk = prisPerM3({ roll: 'skordare', ...gem });
    const psko = prisPerM3({
      roll: 'skotare', ...gem,
      avstand: u.volymM3fub > 0 && u.skotAvstandKr !== 0
        ? { kr: u.skotAvstandKr, volym: u.volymM3fub, enhetligtSteg: false }
        : null,
    });

    // Fördelningen: förslaget om ingen överskrivning finns.
    // Överskrivningen bor på OBJEKTET (dim_objekt.acord_andel_skordare_manuell),
    // inte på raden — faktura_rad.rad_pris_agare FÖRBJUDER a_pris på en
    // 'app'-rad, så en överskriven à-pris går inte att lagra där. Den är
    // dessutom samma sorts bedömning som terrang_kr_manuell och gäller båda
    // raderna: lagrad på varje rad hade de kunnat glida isär.
    // Förslaget kommer nu från prisPerM3, som vet vem varje post hör till.
    // Radbyggaren räknar inte om fördelningen — två uträkningar av samma
    // delning är samma felklass som två priser.
    const forslag = { skordare: psk.andelSkordare, skotare: psk.andelSkotare };
    const overskriven = u.andelSkordareManuell != null;
    const andelSk = overskriven ? u.andelSkordareManuell! : forslag.skordare;
    const andelSko = tvaDec(psk.ovrigt - andelSk);

    const grundSk = tvaDec(psk.krPerM3 - forslag.skordare);
    const grundSko = tvaDec(psko.krPerM3 - forslag.skotare);

    // AVSTÅNDET LÄGGS PÅ SKOTARENS À-PRIS HÄR, INTE I prisPerM3.
    //
    // prisPerM3.krPerM3 utesluter avståndet med flit: i /ekonomi räknas
    //     volymEfterUndantag × krPerM3 + skotKr
    // så att timpeng-undantaget inte skalar avståndet. På FAKTURAN finns
    // ingen sådan uppdelning — raden är antal × à-pris, och Vida ser
    // avståndet som kronor per kubik ("Avstånd +12kr").
    //
    // Skillnaden är alltså inte en motsägelse utan två olika frågor:
    // /ekonomi frågar "vad tjänade maskinen", fakturan frågar "vad står på
    // raden". Lägger man in avståndet i prisPerM3 går /ekonomi sönder; utelämnar
    // man det här blir fakturan för låg med hela avståndsbeloppet
    // (Brokamåla: 26 241 kr).
    const avstandPerM3 = u.volymM3fub > 0 ? u.skotAvstandKr / u.volymM3fub : 0;

    const aSkordare = tvaDec(grundSk + andelSk);
    const aSkotare = tvaDec(grundSko + andelSko + avstandPerM3);

    const saknasPris = psk.klass == null;
    const namnSk = skordare.map(m => m.namn).join('/') || 'skördare';
    const namnSko = skotare.map(m => m.namn).join('/') || 'skotare';

    // Härledningen bär HELA tillägget och ligger på BÅDA raderna — så visar
    // Vida den. Avståndet finns bara i skotarens.
    const harlSk: Prisdel[] = [...psk.delar];
    const harlSko: Prisdel[] = [...psko.delar];
    if (overskriven) {
      const not = { etikett: `Fördelning ändrad (förslag ${forslag.skordare.toFixed(2).replace('.', ',')})`, belopp: 0 };
      harlSk.push(not); harlSko.push(not);
    }

    lagg({
      artikelnr: '1', benamning: `Skördning ackord ${namnSk}`,
      antal: tvaDec(u.volymM3fub), enhet: 'm3fub',
      prisagare: 'app', a_pris: null, harledning: harlSk,
      kalla: 'ackord_skordning', kalla_id: null,
      status: saknasPris ? 'fel' : 'klar',
      fel_kod: saknasPris ? 'pris_saknas' : null,
      kostnadsstalle: skordare[0]?.kostnadsstalle ?? null,
      a_pris_beraknat: aSkordare,
      delar_grundpris: grundSk, delar_andel: andelSk, delar_avstand: null,
      prislista: psk.prislista, tillaggsposter: psk.tillaggsposter,
    });
    lagg({
      artikelnr: '2', benamning: `Skotning ackord ${namnSko}`,
      antal: tvaDec(u.volymM3fub), enhet: 'm3fub',
      prisagare: 'app', a_pris: null, harledning: harlSko,
      kalla: 'ackord_skotning', kalla_id: null,
      status: saknasPris ? 'fel' : 'klar',
      fel_kod: saknasPris ? 'pris_saknas' : null,
      kostnadsstalle: skotare[0]?.kostnadsstalle ?? null,
      a_pris_beraknat: aSkotare,
      delar_grundpris: grundSko, delar_andel: andelSko,
      delar_avstand: tvaDec(avstandPerM3),
      prislista: psko.prislista, tillaggsposter: psko.tillaggsposter,
    });
  }

  // ── 4. Flyttar: EGEN TRAILER, TVÅ RADTYPER EFTER STRÄCKA ─────────────
  //
  //   under 3 mil  artikel 5 "Flytt av maskin"  1 500 kr PER MASKIN
  //                Två maskiner blir 3 000 kr, alltså avtalets fasta belopp.
  //   över 3 mil   artikel 3 "Traillerflytt"    timmar à 1 350
  //
  // Båda ägs av FORTNOX — trailern är vår egen, inte en inhyrd åkare.
  // leverantor-radtypen finns kvar för manuell fällning, där priset varierar
  // med vem som lejs in.
  //
  // fakturerbar-flaggan i maskin_flytt betyder alltså inte "ska faktureras"
  // utan "ska faktureras PÅ TID". Korta flyttar faktureras också, som
  // artikel 5.
  //
  // ⚠️ TIMMARNA SKRIVS IN, DE HÄRLEDS INTE.
  // Fakturan avser lastbilens rundresa från LBC och tillbaka — därför är
  // ingen historisk rad under två timmar. maskin_flytt.tid_flytt_min mäter
  // MASKINENS förflyttning (33–98 min) och är fel källa. Var LBC ligger och
  // hur en dag med flera flyttar delas upp är inte bestämt, så en härledning
  // vore en gissning. Anroparen visar lastbilens dygnssummor bredvid fältet.
  for (const f of u.flyttar) {
    const km = Number(f.km) || 0;

    if (km > 0 && km <= FLYTT_TIMDEBITERING_KM) {
      lagg({
        artikelnr: '5',
        benamning: `Flytt av maskin ${f.maskin}`
          + (f.franNamn ? ` från ${f.franNamn}` : ''),
        antal: 1, enhet: 'st',
        prisagare: 'fortnox', a_pris: null,
        harledning: [{ etikett: `${km} km ${f.datum}`, belopp: 0 }],
        kalla: 'flytt', kalla_id: f.id,
        status: 'klar', fel_kod: null,
        // Fakturorna bokför flytt på TRA (tidigare M8). Det är ingen maskin
        // och finns inte i maskin_kostnadsstalle — lämnas tomt och ytas.
        kostnadsstalle: null,
      });
      continue;
    }

    const timmar = f.traillertimmar == null ? null : Number(f.traillertimmar);
    const saknasTid = timmar == null || timmar <= 0;
    lagg({
      artikelnr: '3',
      benamning: `Traillerflytt ${f.maskin}`
        + (f.franNamn ? ` från ${f.franNamn}` : '') + `, ${km} km`,
      antal: saknasTid ? null : tvaDec(timmar!),
      enhet: 'h',
      prisagare: 'fortnox', a_pris: null,
      harledning: [{
        etikett: saknasTid
          ? `${km} km ${f.datum} — timmarna är inte ifyllda`
          : `${km} km ${f.datum}`,
        belopp: 0,
      }],
      kalla: 'traillerflytt', kalla_id: f.id,
      status: saknasTid ? 'fel' : 'klar',
      fel_kod: saknasTid ? 'pris_saknas' : null,
      kostnadsstalle: null,
    });
  }

  // ── 5. Manuella poster ─────────────────────────────────────────────────
  // Fällning, GROT-skotning, papp, "Blött". Beloppet kommer från någon annans
  // faktura eller från Martins bedömning — enda radtypen som får bära a_pris.
  for (const p of u.manuellaPoster) {
    lagg({
      artikelnr: null, benamning: p.etikett, antal: p.antal, enhet: p.enhet,
      prisagare: p.a_pris != null ? 'leverantor' : 'app',
      a_pris: p.a_pris,
      harledning: null, kalla: p.kalla, kalla_id: null,
      status: p.a_pris != null ? 'klar' : 'vantar_leverantorsfaktura',
      fel_kod: null, kostnadsstalle: null, a_pris_beraknat: p.a_pris,
    });
  }

  return rader;
}

/**
 * Kan underlaget skickas? En rad med status='fel' blockerar HELA underlaget.
 * 'vantar_leverantorsfaktura' gör det INTE — ett objekts fakturering ska inte
 * stoppas av en underleverantör som inte skickat sin faktura.
 */
export function garAttSkicka(u: VoUnderlag, rader: FakturaRad[]): {
  ok: boolean; hinder: string[];
} {
  const hinder: string[] = [];
  if (u.fortnox_kundnr == null) {
    hinder.push(`Bolaget ${u.bolag ?? '(saknas)'} har inget kundnummer i Fortnox`);
  }
  if (!u.avrakningsdatum) hinder.push('Objektet är inte slutavräknat');
  for (const r of rader.filter(r => r.status === 'fel')) {
    hinder.push(`Rad ${r.radnr} ${r.benamning}: ${r.fel_kod}`);
  }
  return { ok: hinder.length === 0, hinder };
}
