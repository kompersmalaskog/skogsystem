// Rund-state-maskinen (STEG 2). Körs i cron:en efter varje loggskrivning och
// öppnar/stänger AUTO-rundor ur lastbil_logg. "Lastbilen är sanningen" —
// odometern ger mätar-km och bränsle för hela rundan inkl. hemresan.
//
// Bärande regler:
//  • En avstängd/parkerad bil sänder EN fryst punkt — därför mäts "35 min
//    stilla" mot NU − ankomstpunktens tid (wall clock), inte antal punkter.
//    Cron:en måste därför köra denna logik VARJE cykel (även vid dedupe), så
//    en runda kan stängas 35 min efter ankomst trots att ingen ny punkt kom.
//  • Manuellt vinner alltid NÄR föraren agerar: en runda med auto_skapad=false
//    stängs aldrig av auto-tröskeln (35 min). MEN ett SÄKERHETSNÄT fångar en
//    bortglömd "Kör hem": har bilen stått stilla på hemmabasen i SAKERHETSNAT_MIN
//    (2 h) stänger cron:en även en manuell runda — annars blir en glömd runda
//    evigt öppen och blockerar dubbelskyddet (torsdagsproblemet på rundnivå).
//    Nätet märker auto_avslutad_av='cron_sakerhetsnat' så loggen kan säga ärligt
//    att "Kör hem" aldrig trycktes. En manuell stängning som faktiskt sker vinner
//    ändå — nätet fångar bara det bortglömda, och slut_odometer tas från första
//    punkten efter ankomst precis som vid auto-stängning (mätare/bränsle rätt).
//  • Dubbelskydd: auto-öppnar bara om INGEN öppen runda finns för bilen
//    (matchar även manuella vin-null-rundor).
//  • Kedjeregel: rundor på samma bil får aldrig överlappa i tid. En ny auto-runda
//    börjar aldrig före förra rundans sluttid (se "KEDJEREGELN" nedan). Dubbelskyddet
//    ovan ser bara ÖPPNA rundor och räckte inte: en runda stängd medan bilen var ute
//    följdes av en ny från samma avfärd (20 aug, 28 aug, 1 sep 2026).
//  • Sluttid ≥ starttid: säkerhetsnätet mäter från rundans start, aldrig från en
//    ankomst som ligger före den (514d88e1, 12 aug 2026).
//  • Kraschar aldrig: allt i try/catch, fel rapporteras men fäller inte cron:en.

import { haversine } from '@/utils/geo'

const STILLA_KMH = 2          // ≤ detta = stillastående
const STANG_MIN = 35          // min i radien innan auto-stängning (auto-runda)
const SAKERHETSNAT_MIN = 120  // min stilla på hemmabas innan nätet stänger en MANUELL runda
const HISTORIK_TIM = 48       // hur långt bak vi läser loggpunkter

type Db = {
  from: (t: string) => any
}

interface Punkt {
  tidpunkt: string
  lat: number
  lng: number
  hastighet: number | null
  odometer_m: number
  bransle_ml: number | null
}

export interface RundRapport {
  atgard: 'oppnade' | 'stangde' | 'inget' | 'manuell_orord' | 'fel'
  rundaId?: string
  detalj?: any
}

export async function koraRundlogik(db: Db): Promise<RundRapport> {
  try {
    // Aktiv lastbil (en idag; loopbar för fler)
    const { data: bilar } = await db.from('lastbil')
      .select('vin, hemmabas_lat, hemmabas_lng, hemmabas_radie_m').eq('aktiv', true).limit(1)
    if (!bilar?.length) return { atgard: 'inget', detalj: 'ingen aktiv lastbil' }
    const bil = bilar[0]
    const vin: string = bil.vin
    const bas = { lat: bil.hemmabas_lat, lng: bil.hemmabas_lng, radie_km: (bil.hemmabas_radie_m ?? 300) / 1000 }
    const iRadie = (p: { lat: number; lng: number }) => haversine(p.lat, p.lng, bas.lat, bas.lng) <= bas.radie_km

    // Öppen runda för bilen — auto ELLER manuell (vin null). Dubbelskydds-guard.
    const { data: oppna } = await db.from('flyttdag')
      .select('id, auto_skapad, start_odometer_m, start_odometer_tid, starttid, hemresa_start_tid, hemresa_start_odometer_m')
      .is('sluttid', null).or(`vin.eq.${vin},vin.is.null`)
      .order('starttid', { ascending: false }).limit(1)
    const oppen = oppna?.[0] ?? null

    // Loggpunkter, äldst först. Kräv position + odometer.
    const sedan = new Date(Date.now() - HISTORIK_TIM * 3600_000).toISOString()
    const { data: pkt } = await db.from('lastbil_logg')
      .select('tidpunkt, lat, lng, hastighet, odometer_m, bransle_ml')
      .eq('vin', vin).gte('tidpunkt', sedan)
      .order('tidpunkt', { ascending: true })
    const punkter: Punkt[] = (pkt ?? []).filter((p: any) => p.lat != null && p.lng != null && p.odometer_m != null)
    if (!punkter.length) return { atgard: 'inget', detalj: 'inga punkter' }
    const senaste = punkter[punkter.length - 1]

    // ── Ingen öppen runda → auto-ÖPPNA om bilen är ute ──
    if (!oppen) {
      if (iRadie(senaste)) return { atgard: 'inget', detalj: 'hemma, ingen runda' }
      // Avfärd = sista punkt i radien före den pågående ute-sviten
      let avfardIdx = -1
      for (let i = punkter.length - 1; i >= 0; i--) { if (iRadie(punkter[i])) { avfardIdx = i; break } }
      const osaker = avfardIdx === -1               // loggen började mitt i en utekörning
      const avfard = osaker ? punkter[0] : punkter[avfardIdx]

      // KEDJEREGELN. Dubbelskyddet ovan ser bara ÖPPNA rundor; det räckte inte
      // (dubbelrundorna 20 aug, 28 aug och 1 sep 2026). Förarens "Framme på LBC"
      // kan stänga rundan medan bilen fortfarande är ute (600 m, 14 km och 40 km
      // från basen i de tre fallen). Nästa cykel ser "ingen öppen runda, bilen
      // ute" och öppnade en NY runda vid utekörningens avfärd — samma starttid och
      // startodometer som den stängda — så de första milen och litrarna räknades
      // två gånger. Rundor på samma bil bildar en kedja: en ny runda får aldrig
      // börja före den föregående slutade. Fortsättningen startar exakt vid
      // förra rundans sluttid, med odometern från senaste loggpunkten vid/före
      // den, så milen läggs ihop utan glapp eller dubbelräkning.
      const { data: stangda, error: stangdaFel } = await db.from('flyttdag')
        .select('sluttid').not('sluttid', 'is', null).or(`vin.eq.${vin},vin.is.null`)
        .gt('sluttid', avfard.tidpunkt).order('sluttid', { ascending: false }).limit(1)
      // Hellre ingen runda än en dubblett: kan vi inte läsa de stängda rundorna
      // öppnar vi ingen (nästa cykel försöker igen, avfärdspunkten finns kvar).
      if (stangdaFel) return { atgard: 'fel', detalj: `öppna: läste inte stängda rundor: ${stangdaFel.message}` }
      const tackt: string | null = stangda?.[0]?.sluttid ?? null

      let start: Punkt = avfard
      let starttid = avfard.tidpunkt
      if (tackt) {
        const tackMs = Date.parse(tackt)
        let fore: Punkt | undefined
        for (const p of punkter) { if (Date.parse(p.tidpunkt) <= tackMs) fore = p }
        const efter = punkter.find(p => Date.parse(p.tidpunkt) > tackMs)
        if (fore) { start = fore; starttid = tackt }
        else if (efter) { start = efter; starttid = efter.tidpunkt }
        // Bilen har inte rört sig sedan förra rundan slutade (t.ex. "Framme"
        // tryckt på en parkeringsplats utanför radien): ingen körning att räkna.
        if (!(senaste.odometer_m > start.odometer_m)) {
          return { atgard: 'inget', detalj: 'ute men stilla sedan förra rundan slutade' }
        }
      }

      const { data, error } = await db.from('flyttdag').insert({
        vin, auto_skapad: true, start_kalla: 'auto', status: 'pagaende',
        starttid,
        start_lat: start.lat, start_lng: start.lng,
        start_odometer_m: start.odometer_m, start_odometer_tid: start.tidpunkt,
        odometer_stale: osaker && !tackt,           // osäker start → visas med "~"
      }).select('id')
      if (error) return { atgard: 'fel', detalj: `öppna: ${error.message}` }
      return { atgard: 'oppnade', rundaId: data?.[0]?.id, detalj: { osaker, fortsattning: !!tackt, start_odometer_m: start.odometer_m } }
    }

    // ── Öppen runda finns ──
    // Auto-runda stängs efter STANG_MIN. Manuell runda rörs INTE av den tröskeln
    // (manuellt vinner) — men säkerhetsnätet stänger den efter SAKERHETSNAT_MIN
    // stilla på hemmabasen och märker det som 'cron_sakerhetsnat'. Är bilen ute
    // eller rör sig hemma → 'manuell_orord' för manuell runda (nätet slog inte till).
    const manuell = !oppen.auto_skapad
    const stangMin = manuell ? SAKERHETSNAT_MIN : STANG_MIN
    const avslutAv = manuell ? 'cron_sakerhetsnat' : 'cron'
    const rorEjSvar: RundRapport['atgard'] = manuell ? 'manuell_orord' : 'inget'

    if (!iRadie(senaste)) return { atgard: rorEjSvar, detalj: 'ute, rundan fortsätter' }
    if (!(senaste.hastighet != null && senaste.hastighet <= STILLA_KMH)) {
      return { atgard: rorEjSvar, detalj: 'i radien men rör sig' }
    }
    // Ankomst = första punkt i den pågående hemma-sviten (efter senaste ute-punkt)
    let ankomstIdx = punkter.length - 1
    for (let i = punkter.length - 1; i >= 0; i--) { if (iRadie(punkter[i])) ankomstIdx = i; else break }
    const ankomst = punkter[ankomstIdx]

    // En runda kan inte ta slut innan den började (rotorsak till 514d88e1, 12 aug
    // 2026: rundan startades på basen 18:33 men fick sluttid 11 aug 10:43). En
    // parkerad bil sänder EN fryst punkt, så den "senaste ankomsten" i loggen kan
    // ligga dagar före rundans start. Då har bilen inte rört sig sedan rundan
    // började: tröskeln mäts från rundans start och sluttiden blir aldrig äldre
    // än den. Ankomstpunktens odometer gäller fortfarande (bilen står där).
    const startMs = Date.parse(oppen.starttid)
    const ankomstMs = Date.parse(ankomst.tidpunkt)
    const ankomstEfterStart = ankomstMs >= startMs
    const slutTid = ankomstEfterStart ? ankomst.tidpunkt : oppen.starttid
    const minSedanAnkomst = (Date.now() - Math.max(ankomstMs, startMs)) / 60000
    if (minSedanAnkomst < stangMin) {
      return { atgard: rorEjSvar, detalj: `hemma ${Math.round(minSedanAnkomst)}/${stangMin} min${manuell ? ' (säkerhetsnät)' : ''}` }
    }

    // ── STÄNG (auto-tröskel ELLER säkerhetsnät): slut = ankomstpunkten (inkl. hemresan i odometern) ──
    const startOdo: number | null = oppen.start_odometer_m
    let matareKm: number | null = startOdo != null ? Math.round(((ankomst.odometer_m - startOdo) / 1000) * 10) / 10 : null
    if (matareKm != null && matareKm < 0) matareKm = null               // trasig data → hellre tomt

    // Bränsle: startpunktens bransle_ml via start_odometer_tid
    let bransleL: number | null = null
    if (oppen.start_odometer_tid && ankomst.bransle_ml != null) {
      const startPkt = punkter.find(p => p.tidpunkt === oppen.start_odometer_tid)
      const startBransle = startPkt?.bransle_ml
        ?? (await db.from('lastbil_logg').select('bransle_ml').eq('vin', vin).eq('tidpunkt', oppen.start_odometer_tid).maybeSingle()).data?.bransle_ml
      if (startBransle != null) bransleL = Math.round(((ankomst.bransle_ml - startBransle) / 1000) * 10) / 10
    }
    if (bransleL != null && bransleL < 0) bransleL = null               // mätarbrus på en stillastående bil är ingen förbrukning

    // Flytt i rundan? → avslutad, annars övrig körning (räknas aldrig i flyttstatistik)
    const { count } = await db.from('maskin_flytt')
      .select('id', { count: 'exact', head: true })
      .eq('flyttdag_id', oppen.id).eq('avbruten', false).not('sluttid', 'is', null)
    const status = (count ?? 0) > 0 ? 'avslutad' : 'ovrig_korning'

    // ── Hemresan MÄTT ur loggen — nätet fångar glömda "Framme på LBC" ──
    // (a) föraren tryckte "Kör hem" men glömde "Framme": mät hemresa_start → ankomst.
    // (b) inget tryck alls: sista benet in i radien (punkten före hemma-sviten) → ankomst.
    let hemKm: number | null = null
    let tidHemMin: number | null = null
    if (oppen.hemresa_start_odometer_m != null) {
      hemKm = Math.round(((ankomst.odometer_m - oppen.hemresa_start_odometer_m) / 1000) * 10) / 10
      if (oppen.hemresa_start_tid) tidHemMin = Math.round((Date.parse(ankomst.tidpunkt) - Date.parse(oppen.hemresa_start_tid)) / 60000)
    } else if (ankomstEfterStart && ankomstIdx > 0) {
      const avfardHem = punkter[ankomstIdx - 1]
      hemKm = Math.round(((ankomst.odometer_m - avfardHem.odometer_m) / 1000) * 10) / 10
      tidHemMin = Math.round((Date.parse(ankomst.tidpunkt) - Date.parse(avfardHem.tidpunkt)) / 60000)
    }
    if (hemKm != null && hemKm < 0) hemKm = null                       // trasig data → hellre tomt
    if (tidHemMin != null && (tidHemMin < 0 || tidHemMin > 960)) tidHemMin = null

    const raMin = Math.round((Date.parse(slutTid) - startMs) / 60000)
    const { error } = await db.from('flyttdag').update({
      sluttid: slutTid,
      slut_lat: bas.lat, slut_lng: bas.lng,
      slut_odometer_m: ankomst.odometer_m, slut_odometer_tid: ankomst.tidpunkt,
      matare_km: matareKm, bransle_l: bransleL,
      hem_km: hemKm, tid_hem_min: tidHemMin, hemresa_matt: true,
      total_tid_min: raMin >= 0 && raMin <= 960 ? raMin : null,
      auto_avslutad_av: avslutAv, status,
    }).eq('id', oppen.id)
    if (error) return { atgard: 'fel', detalj: `stäng: ${error.message}` }
    return { atgard: 'stangde', rundaId: oppen.id, detalj: { sakerhetsnat: manuell, status, matareKm, bransleL, hemKm } }
  } catch (e: any) {
    return { atgard: 'fel', detalj: String(e?.message || e) }
  }
}
