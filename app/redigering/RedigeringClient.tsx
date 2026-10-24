"use client"
import { underTopbar, medSafeBotten, FARG, TYP, AVSTAND, RADIE, TRAFFYTA, KNAPP, IKON, FONT, RORELSE } from '@/lib/design/tokens'; // layoutmått, inte avstånd (tokens: LAYOUT)

import { useState, useEffect, useRef, useMemo, Fragment, Children, Suspense, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { grotHamtadAutomatik, angraGrotHamtadAutomatik } from '@/lib/grot-koppling'
import { useMatchning } from './hooks/useMatchning'
import { useFildata, filStatus, slaIhopFildata, harExternSkotning, harExternSkordning, skordareForvantasEj, skotareForvantasEj } from './hooks/useFildata'
import SkotareFordelning from './SkotareFordelning'
import { harNyaFalt, utanNyaFalt } from '@/lib/redigering/avslut'
import { arRisjobb, arGrotHuvudtyp } from '@/lib/objekt/typ'
import { sparaFalt, resolveObjektRad, FALT_RUTT } from '@/lib/redigering/objektRouter'
import { AVTALSFORMER } from '@/lib/trakt/avtalsform'
import { kravAvtalsform, saknarAvtalsformEllerAtgard } from '@/lib/redigering/avtalsformKrav'
import { medAvtalsformSvar } from '@/lib/avtalsformKolumn'
import { avslutaObjekt } from '@/lib/avslutaObjekt'
import DokumentChips from '@/components/DokumentChips'
import OkopplFilerKort from '@/components/redigering/OkopplFilerKort'
import Ark from '@/components/design/Ark'
import { useFilerUtanObjekt } from '@/lib/hooks/useFilerUtanObjekt'
import { delaFilJobb, kandidaterFor, sokObjekt as sokPlanObjekt } from '@/lib/redigering/filerUtanObjekt'
import { okopplatJobb, altNummerAttSkriva, ignoreradNyckel, nummerbyten, type OkopplatJobb } from '@/lib/objektNummer'
import BehoverDig, { EnFragaArk } from '@/components/redigering/BehoverDig'
import Sektion from '@/components/design/Sektion'
import Rad from '@/components/design/Rad'
import Ikon from '@/components/design/Ikon'
import ObjektOversikt from '@/components/redigering/ObjektOversikt'
import ObjektLista from '@/components/redigering/ObjektLista'
import { FilerSida, PrisSida, ExternSida, SkotareSida } from '@/components/redigering/Undersidor'
import type { ListGrupp } from '@/lib/redigering/listaVy'
import { voGruppKarta, medVoGrupp } from '@/lib/redigering/voGrupp'
import { byggSaker, patchForSvar, type BehoverGrupp, type FilJobb, type Sak } from '@/lib/redigering/behoverDig'
import { delaMaskinobjekt, altNummerForMaskinobjekt, mangdText, maskinText, type MaskinobjektRad } from '@/lib/redigering/maskinobjektUtanTrakt'
import PdfLasare from '@/app/planering/PdfLasare'

// Standardval som alltid ska finnas som chips (riktiga bolag) —
// kompletteras med unika värden ur datan vid inläsning.
// Inköpare seedas ENBART ur datan (inga hårdkodade namn).
const STANDARD_BOLAG = ['Vida', 'ATA', 'Privat', 'JGA', 'Rönås', 'Södra']
// 'Grot' är ett riktigt huvudtyp-värde (inte en uteslutningsklass). Att välja
// det synkar risskotning-flaggan (arGrotHuvudtyp ⟺ risskotning=true) så typ-
// regeln kan läsa vilken väg som helst. Se lib/objekt/typ.ts.
const HUVUDTYPER = ['Slutavverkning', 'Gallring', 'Grot']

// Delade keyframes/klasser — renderas av båda listvyerna (tidigare två
// identiska inline-kopior)
const GLOBAL_CSS = `
  @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes slideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
  @keyframes flashHighlight {
    0%   { background: rgba(255,159,10,0.20); box-shadow: 0 0 0 6px rgba(255,159,10,0.15); }
    100% { background: transparent; box-shadow: 0 0 0 0 transparent; }
  }
  .flash-highlight {
    animation: flashHighlight 0.7s ease;
    border-radius: 14px;
  }
  .tap-press {
    transition: transform 0.12s ease, background 0.18s ease, opacity 0.18s ease;
  }
  .tap-press:active:not(:disabled) {
    transform: scale(0.97);
  }
  .tap-press:disabled {
    cursor: not-allowed;
  }
  /* Bredd (2026-10-23): listan i en kolumn; objektets ark är centrerat på mellanstor skärm och en panel till höger
     från 1100 px, med listan kvar till vänster (som Mail). */
  .red-kolumn { max-width: 640px; margin-left: auto; margin-right: auto; }
  @media (min-width: 700px) and (max-width: 1099px) {
    .red-ark { left: 50% !important; right: auto !important; width: 640px; margin-left: -320px; }
  }
  @media (min-width: 1100px) {
    .red-rot[data-ark-oppet] { padding-right: 580px !important; }
    .red-overlay { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; pointer-events: none; }
    .red-ark { left: auto !important; right: 0 !important; top: ${underTopbar()} !important; width: 560px; max-height: none !important;
      border-radius: 0 !important; border-left: 1px solid ${FARG.linje}; animation: none !important; transform: none !important; }
    .red-ark [data-ark-grepp] { display: none !important; }
  }
`

// Egenskaper per maskinslag — sheeten visar bara det som är relevant för
// objektet (styrt av FAKTISK data via useMatchning, aldrig dim_objekt.maskin_id
// som är opålitlig på delade objekt).
// OBS Klippning hör till SKOTAREN — energiaggregatet sitter på skotaren.
const EGENSKAPER_SKORDARE = [
  { key: 'grot_anpassad', label: 'GROT-anpassad' },
  { key: 'stubbbehandling', label: 'Stubbbehandling' },
]

// Risskotning bor INTE längre som en skotar-switch — grot är ett riktigt
// huvudtyp-värde och sätts via huvudtyp-chippen (som synkar risskotning-
// flaggan). En enda kontroll, ingen dubbel som kan glida isär.
const EGENSKAPER_SKOTARE = [
  { key: 'extra_vagn', label: 'Extra vagn' },
  { key: 'klippning', label: 'Klippning' },
]

// === SUPABASE-KOPPLING ===
// Använder den delade browser-clienten från @/lib/supabase som ärver
// inloggade användarens JWT via cookies — RLS-policies körs korrekt.

async function hamtaObjektFranSupabase() {
  const { data, error } = await supabase
    .from('dim_objekt')
    .select('*')
    .order('object_name', { ascending: true, nullsFirst: true })
  if (error) throw new Error('Kunde inte hämta data: ' + error.message)
  const rows = data || []
  // Steg B: planeringsflaggan bor på objekt-tabellen (objekt.saknar_planering).
  // Häng på den per dim-rad (join på dim_objekt_id, annars vo_nummer) så listan kan
  // filtreras på "Saknar planering". Fel här får inte tömma listan → tyst false.
  try {
    const { data: planRader } = await supabase
      .from('objekt').select('vo_nummer, dim_objekt_id, saknar_planering')
    const perDim = new Map<string, boolean>(); const perVo = new Map<string, boolean>()
    for (const p of (planRader || [])) {
      if (p.dim_objekt_id) perDim.set(String(p.dim_objekt_id), p.saknar_planering === true)
      if (p.vo_nummer) perVo.set(String(p.vo_nummer), p.saknar_planering === true)
    }
    for (const r of rows) r.saknar_planering = perDim.get(String(r.objekt_id)) ?? perVo.get(String(r.vo_nummer)) ?? false
  } catch { /* flaggan är valfri — utan den är chippen bara borta */ }
  return rows
}

async function hamtaMaskinerFranSupabase() {
  const { data, error } = await supabase
    .from('dim_maskin')
    .select('maskin_id, visningsnamn, modell, maskin_typ')
  if (error) throw new Error('Kunde inte hämta maskiner: ' + error.message)
  return data || []
}

// Fältklasser för multi-rad-saven. Ett objekt är ibland FLERA dim_objekt-
// rader (skördare + skotare med samma VO, P-VO-flödet) — gemensamma fält
// fylls i EN gång och skrivs till ALLA rader i gruppen; maskinspecifika
// skrivs till respektive maskinslags rader.
const GEMENSAMMA_FALT = ['vo_nummer', 'object_name', 'skogsagare', 'bolag', 'inkopare',
  'huvudtyp', 'atgard', 'avtalsform', 'grot_anpassad', 'timpeng', 'exkludera', 'extern_skordning',
  'timpeng_undantag_timmar_skordare', 'timpeng_undantag_timmar_skotare',
  'timpeng_undantag_volym', 'timpeng_undantag_dra_skordare', 'timpeng_undantag_dra_skotare',
  // Ackordgrund-overrides på objektnivå (används av BÅDA maskindelarnas prisuppslag)
  'medelstam_manuell', 'sortiment_grupper_manuell', 'terrang_kr_manuell']
const SKORDARFALT = ['stubbbehandling', 'skordning_avslutad', 'skordning_avslutad_auto', 'skordning_g15_manuell']
const SKOTARFALT = ['risskotning', 'egen_skotning', 'extra_vagn', 'klippning',
  'skotad_volym_manuell', 'skotning_g15_manuell', 'skotning_avslutad', 'skotning_avslutad_auto', 'ovrigt_info',
  'skotavstand_manuell']

// Rader som hör till samma objekt: samma icke-tomma vo_nummer, annars bara
// raden själv. maskin_typ är berikad vid inläsning.
// Gruppnyckeln är _vo_grupp (lib/redigering/voGrupp.ts): samma objekt under två VO-nummer = EN grupp.
const voNyckel = (o: any): string | null => {
  const g = o?._vo_grupp ?? o?.vo_nummer
  return g && String(g).trim() ? String(g) : null
}

function syskonRader(allaObjekt: any[], obj: any): any[] {
  const nyckel = voNyckel(obj)
  if (!nyckel) return [obj]
  const grupp = allaObjekt.filter(o => voNyckel(o) === nyckel)
  return grupp.length > 0 ? grupp : [obj]
}

// Har VO-gruppen en skotarmaskin som aldrig sänder filer (dim_maskin.
// sander_filer=false, t.ex. JD810E)? Styr grå prick + proaktiv uppräkning.
function gruppSkotareSanderEj(syskon: any[], fildata: any): boolean {
  if (!fildata?.maskinInfo) return false
  // Skotaren är dim_objekt.tilldelad_skotare — dim_objekt.maskin_id är
  // SKÖRDAREN (aldrig skotare). En icke-filsändande skotare (JD810E) kan
  // BARA upptäckas via tilldelningen; en filsändande skotare hade ju synts
  // via lassdata. Läste tidigare maskin_id -> hittade aldrig JD810E, så
  // Skotare-undersidan doldes för rena JD810E-objekt tills skotning avslutats.
  return (syskon || []).some((o: any) => {
    const mi = fildata.maskinInfo.get(o.tilldelad_skotare)
    return mi?.typ === 'skotare' && mi?.sanderFiler === false
  })
}

// Volymer över VO-gruppen för luckvarningen: skördat (lass ingår ej) och
// skotat = lass + manuellt uppräknad volym. kortInfo kommer från useMatchning.
function volymForGrupp(allaObjekt: any[], kortInfo: Record<string, any>, obj: any): { skordat: number; skotat: number } {
  const syskon = syskonRader(allaObjekt, obj)
  const skordat = syskon.reduce((s: number, o: any) => s + (kortInfo[o.objekt_id]?.skordatM3 || 0), 0)
  const lass = syskon.reduce((s: number, o: any) => s + (kortInfo[o.objekt_id]?.skotatM3 || 0), 0)
  const manuell = Math.max(0, ...syskon.map((o: any) => Number(o.skotad_volym_manuell) || 0))
  return { skordat, skotat: lass + manuell }
}

// VO-GRUPPERING AV LISTORNA: ett fysiskt objekt (en VO-grupp) = ETT kort,
// hur många maskinrader det än har. Sheeten har alltid arbetat per grupp
// (syskonRader) — listorna visade däremot en rad per dim_objekt-rad, så
// ihopslagna objekt (samma VO, t.ex. P-1015 Björkebråten) såg dubbla ut.
// Representanten (kortets ansikte) = raden med mest ifyllt; rader utan VO
// blir egna en-radsgrupper (samma fallback som syskonRader).
function grupperaPerVo(rader: any[]): { nyckel: string; rep: any; rader: any[] }[] {
  const grupper = new Map<string, any[]>()
  rader.forEach((o: any) => {
    const nyckel = voNyckel(o) || `__rad__${o.objekt_id}`
    const lista = grupper.get(nyckel) || []
    lista.push(o)
    grupper.set(nyckel, lista)
  })
  const poang = (o: any) => ['huvudtyp', 'bolag', 'skogsagare', 'atgard'].filter(f => o[f]).length + (o.object_name ? 10 : 0)
  return Array.from(grupper.entries()).map(([nyckel, lista]) => {
    // Objektets eget nummer går före (det är där planeringsraden och sparningen landar), sedan mest ifyllt.
    const egen = (o: any) => (String(o.vo_nummer ?? '') === nyckel ? 100 : 0)
    const rep = lista.reduce((basta: any, o: any) => poang(o) + egen(o) > poang(basta) + egen(basta) ? o : basta, lista[0])
    return { nyckel, rep, rader: lista }
  })
}

// Union av varningar över gruppens rader (dedupe per varningstyp) — en
// varning på NÅGON rad gör gruppen åtgärdskrävande
function gruppVarningar(rader: any[], volym: { skordat: number; skotat: number }): any[] {
  const per = new Map<string, any>()
  rader.forEach((o: any) => getWarnings(o, volym).forEach((w: any) => { if (!per.has(w.key)) per.set(w.key, w) }))
  // Gemensamma fält: har EN rad i gruppen värdet saknas det inte (nästa sparning skriver det till alla rader).
  // Gäller främst en grupp under två VO-nummer (Mölleryd: skotarens rad har markägaren, skördarens inte).
  for (const falt of ['skogsagare', 'bolag', 'huvudtyp']) {
    if (per.has(falt) && rader.some((o: any) => o[falt])) per.delete(falt)
  }
  return Array.from(per.values())
}


// PÅGÅENDE: gruppen är inte färdig. Ett maskinslag "avgör" bara om avslutet
// är VÅRT att sätta — dvs. någon annan gör slaget. Samma orsak-hjälpare som
// filstatus, MEN sander_filer räknas INTE här: en icke-filsändande skotare
// är VÅR skotare som skotar på riktigt, avslutet är vårt att sätta (och är
// enda klart-signalen när maskinen är tyst). Därför skotareForvantasEj UTAN
// sanderEj — den flaggan hör till pricken (filer förväntas ej), inte till
// avslutskravet (jobbet förväntas avslutas). Förväntas BÅDA slag ej av oss
// finns inget att slutföra. Exkluderade grupper är aldrig pågående.
//   skordEj-orsaker: extern skördning, klippning, risskotning
//   skotEj-orsaker: egen/extern skotning (EJ sander_filer)
function arPagaende(g: any): boolean {
  const rader = g.rader || []
  if (rader.every((o: any) => o.exkludera === true)) return false
  const skordningKlar = rader.some((o: any) => !!o.skordning_avslutad)
  const skotningKlar = rader.some((o: any) => !!o.skotning_avslutad)
  const skordEj = skordareForvantasEj(rader) !== null
  const skotEj = skotareForvantasEj(rader) !== null
  if (skordEj && skotEj) return false
  if (skordEj) return !skotningKlar
  if (skotEj) return !skordningKlar
  return !skordningKlar || !skotningKlar
}

// Senaste datadatum för gruppen — max "data t.o.m." över gruppens
// maskinrader. SAMMA källa som Filer-undersidan (useFildata), inte
// fakt_tid-aktiviteten i kortInfo, så kortets datum och undersidans
// datum aldrig kan säga olika saker.
function gruppSenasteData(g: any, fildata: any): string | null {
  if (fildata?.status !== 'ok') return null
  let max: string | null = null
  ;(g.rader || []).forEach((o: any) => {
    (fildata.perObjekt.get(o.objekt_id) || []).forEach((r: any) => {
      if (r.senasteData && (!max || r.senasteData > max)) max = r.senasteData
    })
  })
  return max
}

// Senaste datadatum för ETT maskinslag i gruppen (skordare/skotare).
function gruppSenasteDataTyp(g: any, fildata: any, typ: 'skordare' | 'skotare'): string | null {
  if (fildata?.status !== 'ok') return null
  let max: string | null = null
  ;(g.rader || []).forEach((o: any) => {
    (fildata.perObjekt.get(o.objekt_id) || []).forEach((r: any) => {
      if (r.typ === typ && r.senasteData && (!max || r.senasteData > max)) max = r.senasteData
    })
  })
  return max
}

// AVSLUTSFÖRSLAG per maskinslag. Föreslår ALDRIG autoskriv — bara ett datum
// att godkänna. Två signaler:
//   1) maskindata: maskinens end_date (starkast — 80% exakt / 86% ≤3 dgr mot
//      Martins facit för skördning, 81% ≤3 dgr för skotning)
//   2) stale: end_date saknas men senaste data äldre än STALE_DAGAR -> objektet
//      körs inte längre, föreslå sista datadatum
// Föreslår bara för maskinslag som är VÅRT att avsluta (ej extern skördning /
// egen-extern skotning) och som inte redan är avslutat.
const STALE_DAGAR = 21 // 3 veckor
function avslutsForslag(g: any, fildata: any): Array<{
  field: string; autoField: string; label: string; typ: 'skordare' | 'skotare';
  maskinTyp: 'harvester' | 'forwarder'; datum: string; kalla: 'maskindata' | 'stale'; dagar?: number
}> {
  const rader = g.rader || []
  if (rader.every((o: any) => o.exkludera === true)) return []
  const idag = new Date()
  const dagarSedan = (ymd: string) => Math.floor((idag.getTime() - new Date(ymd + 'T00:00:00').getTime()) / 86400000)

  const forslag: any[] = []
  const bygg = (
    field: string, autoField: string, label: string, typ: 'skordare' | 'skotare',
    maskinTyp: string, hoppaOver: boolean,
  ) => {
    if (hoppaOver) return
    if (rader.some((o: any) => !!o[field])) return // redan avslutat i gruppen
    if (rader.some((o: any) => o[field.replace('_avslutad', '_ej_klar')] === true)) return // "Inte klar än" — människan har sagt
    // Primär: maskinens end_date (max över maskinslagets rader)
    let endYmd: string | null = null
    rader.forEach((o: any) => {
      if ((o.maskin_typ || '').toLowerCase() === maskinTyp && o.end_date) {
        const y = formatYMD(o.end_date)
        if (y && (!endYmd || y > endYmd)) endYmd = y
      }
    })
    // Maskinens slutdatum gäller bara om inget har kommit EFTER det. Skördaren och skotaren kan dela nummer och
    // därmed rad — Mölleryd: raden bar skördarens slutdatum (21 okt) medan skotaren körde till 23 okt, och appen
    // föreslog "Skotning klar 21 okt".
    const sista = gruppSenasteDataTyp(g, fildata, typ)
    const slut = endYmd as string | null
    if (slut && !(sista && sista > slut)) { forslag.push({ field, autoField, label, typ, maskinTyp, datum: slut, kalla: 'maskindata' }); return }
    // Fallback: stale — senaste data för maskinslaget äldre än STALE_DAGAR
    if (sista) {
      const d = dagarSedan(sista)
      if (d >= STALE_DAGAR) forslag.push({ field, autoField, label, typ, maskinTyp, datum: sista, kalla: 'stale', dagar: d })
    }
  }

  const externSkordar = rader.some((o: any) => harExternSkordning(o))
  const annanSkotar = rader.some((o: any) => o.egen_skotning === true || harExternSkotning(o))
  bygg('skordning_avslutad', 'skordning_avslutad_auto', 'skördning', 'skordare', 'harvester', externSkordar)
  bygg('skotning_avslutad', 'skotning_avslutad_auto', 'skotning', 'skotare', 'forwarder', annanSkotar)
  return forslag
}

// Boolean-switchar vars VÄRDE läses tillbaka efter save. Radräkning bevisar
// att en rad rördes — inte att switchen faktiskt landade i den. En stale
// klient som utelämnar fältet, ett RLS-partiellt skriv eller en felroutad
// fältklass ger rätt radantal men fel värde: "ser sparad ut men är det inte".
// Just den tysta lögnen ska switchar aldrig kunna bära igen.
const VERIFIERA_BOOL = ['grot_anpassad', 'timpeng', 'exkludera', 'stubbbehandling',
  'risskotning', 'egen_skotning', 'extra_vagn', 'klippning', 'extern_skordning',
  'skordning_avslutad_auto', 'skotning_avslutad_auto',
  'timpeng_undantag_dra_skordare', 'timpeng_undantag_dra_skotare']

// Direktuppdatering med ÄRLIG sparning: .select() räknar träffade rader OCH
// läser tillbaka boolean-switcharnas faktiska värde (se VERIFIERA_BOOL).
async function direktPatchDimObjekt(ids: string[], patch: any): Promise<{ ok: boolean; message: string }> {
  if (ids.length === 0) return { ok: true, message: '' }
  const boolFalt = Object.keys(patch).filter(f => VERIFIERA_BOOL.includes(f))
  const selectCols = ['objekt_id', ...boolFalt].join(',')
  const { data, error } = await supabase
    .from('dim_objekt')
    .update(patch)
    .in('objekt_id', ids)
    .select(selectCols)
  if (error) return { ok: false, message: 'Kunde inte spara: ' + error.message }
  const traffade = (data || []).length
  if (traffade !== ids.length) {
    return { ok: false, message: `Bara ${traffade} av ${ids.length} rader uppdaterades — objektet är INTE komplett sparat` }
  }
  // Värdeverifiering: bekräfta att varje switch faktiskt fick sitt värde i DB.
  for (const rad of data as any[]) {
    for (const f of boolFalt) {
      if ((rad[f] === true) !== (patch[f] === true)) {
        return { ok: false, message: `"${f}" sparades inte — värdet står kvar som ${rad[f] === true}. Ladda om sidan och försök igen.` }
      }
    }
  }
  return { ok: true, message: '' }
}

function plocka(obj: any, falt: string[]): any {
  const ut: any = {}
  for (const f of falt) ut[f] = obj[f] ?? null
  // Booleans ska aldrig sparas som null
  for (const f of ['grot_anpassad', 'timpeng', 'exkludera', 'stubbbehandling', 'risskotning', 'egen_skotning', 'extra_vagn', 'klippning', 'extern_skordning', 'skordning_avslutad_auto', 'skotning_avslutad_auto']) {
    if (f in ut) ut[f] = ut[f] === true
  }
  for (const f of ['timpeng_undantag_dra_skordare', 'timpeng_undantag_dra_skotare']) {
    if (f in ut) ut[f] = ut[f] !== false
  }
  return ut
}

// Maskinslags-rader i gruppen — fallback till den öppnade raden om gruppen
// saknar typade rader (delad rad med numeriskt VO är det vanliga fallet).
function raderForMaskinslag(syskon: any[], typ: string, oppnadId: string): string[] {
  const traff = syskon.filter(o => (o.maskin_typ || '').toLowerCase() === typ).map(o => o.objekt_id)
  return traff.length > 0 ? traff : [oppnadId]
}

// FILFRI SKOTARE (dim_maskin.sander_filer=false, t.ex. JD810E): manuell volym/G15 skrivs som
// PER-MASKIN-rad — maskin_id = tilldelad skotare, volym_egen_skotning (+ volym_m3 legacy-synk),
// g15_timmar, datum_fran NULL — exakt samma form som fördelningen (#448). ALDRIG som
// objekt-nivå-rad (maskin_id NULL): den hoppas av per-maskin-logiken (ObjektValjare,
// lib/skotat) → volymen syns aldrig som skotad → objektet går inte att avsluta (Åbogen,
// Hålabäck 16 — Claude fick koppla om i DB båda gångerna). Verifierat sparande: läser
// tillbaka VÄRDET. Städar en ev. objekt-nivå-spökrad som annars trumfar i äldre läsare.
// Utelämnad nyckel i `v` = behåll radens befintliga värde (så G15 inte nollas när bara
// volymen sätts, och tvärtom).
async function sparaPerMaskinSkotning(
  objektIds: string[], maskinId: string, v: { egen?: number | null; g15?: number | null },
): Promise<{ ok: boolean; message: string }> {
  const num = (x: any) => (x == null ? null : Number(x))
  for (const oid of objektIds) {
    const { data: bef, error: e0 } = await supabase.from('skotare_objekt_manuell')
      .select('id, volym_egen_skotning, g15_timmar').eq('objekt_id', oid).eq('maskin_id', maskinId).is('datum_fran', null).limit(1)
    if (e0) return { ok: false, message: 'Skotarrad (läsning): ' + e0.message }
    const rad: any = (bef || [])[0]
    const egen = 'egen' in v ? num(v.egen) : num(rad?.volym_egen_skotning)
    const g15 = 'g15' in v ? num(v.g15) : num(rad?.g15_timmar)
    const payload = { objekt_id: oid, maskin_id: maskinId, datum_fran: null as null, volym_egen_skotning: egen, volym_m3: egen, g15_timmar: g15 }
    const q = rad
      ? supabase.from('skotare_objekt_manuell').update(payload).eq('id', rad.id).select('id, volym_egen_skotning, g15_timmar')
      : supabase.from('skotare_objekt_manuell').insert(payload).select('id, volym_egen_skotning, g15_timmar')
    const { data, error } = await q
    if (error) return { ok: false, message: 'Skotarrad: ' + error.message }
    const r: any = (data || [])[0]
    if (!r || num(r.volym_egen_skotning) !== egen || num(r.g15_timmar) !== g15) {
      return { ok: false, message: 'Skotarraden landade inte — ladda om och försök igen' }
    }
    const { error: eDel } = await supabase.from('skotare_objekt_manuell')
      .delete().eq('objekt_id', oid).is('maskin_id', null).is('datum_fran', null)
    if (eDel) return { ok: false, message: 'Spökrad (rensning): ' + eDel.message }
  }
  return { ok: true, message: '' }
}

async function sparaObjektTillSupabase(obj: any, syskon: any[]): Promise<{ ok: boolean; message: string }> {
  // Bygg ovrigt_info-JSON från extern skotning-fälten
  let ovrigtInfo = null;
  if (obj._extern_skotning) {
    ovrigtInfo = JSON.stringify({
      extern_skotning: true,
      extern_foretag: obj._extern_foretag || '',
      extern_pris_typ: obj._extern_pris_typ || 'm3',
      extern_pris: obj._extern_pris || 0,
      extern_antal: obj._extern_antal || 0,
    });
  } else if (obj.ovrigt_info) {
    try {
      const parsed = JSON.parse(obj.ovrigt_info);
      if (parsed.extern_skotning) {
        delete parsed.extern_skotning;
        delete parsed.extern_foretag;
        delete parsed.extern_pris_typ;
        delete parsed.extern_pris;
        delete parsed.extern_antal;
        ovrigtInfo = Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : null;
      } else {
        ovrigtInfo = obj.ovrigt_info;
      }
    } catch { ovrigtInfo = obj.ovrigt_info; }
  }

  const gruppIds = syskon.map(o => o.objekt_id)
  const skordarIds = raderForMaskinslag(syskon, 'harvester', obj.objekt_id)
  const skotarIds = raderForMaskinslag(syskon, 'forwarder', obj.objekt_id)

  // Gemensamt -> ALLA rader i gruppen; maskinspecifikt -> respektive rader.
  const gemensamt = plocka(obj, GEMENSAMMA_FALT)
  const skordarPatch = plocka(obj, SKORDARFALT)
  const skotarPatch = { ...plocka(obj, SKOTARFALT), ovrigt_info: ovrigtInfo }

  // En grupp kan bära rader under två VO-nummer (lib/redigering/voGrupp.ts: Mölleryd 11166477 + 11271883).
  // Raderna med det andra numret behåller sitt nummer — maskinens data ligger under det.
  // Jämför med radens nummer FÖRE ändringen (syskon är det sparade läget), så ett ändrat VO följer med som förut.
  const forraVo = String((syskon.find(o => o.objekt_id === obj.objekt_id) ?? obj).vo_nummer ?? '')
  const egnaIds = syskon.filter(o => String(o.vo_nummer ?? '') === forraVo).map(o => o.objekt_id)
  const andraIds = gruppIds.filter(id => !egnaIds.includes(id))
  const { vo_nummer: _vo, ...gemensamtUtanVo } = gemensamt as Record<string, any>
  const r1 = await direktPatchDimObjekt(egnaIds, gemensamt)
  if (!r1.ok) return r1
  const r1b = await direktPatchDimObjekt(andraIds, gemensamtUtanVo)
  if (!r1b.ok) return r1b
  const r2 = await direktPatchDimObjekt(skordarIds, skordarPatch)
  if (!r2.ok) return { ok: false, message: 'Skördarfälten: ' + r2.message }
  // TODO(#334): TILLFÄLLIG dubbel-skrivning — dim_objekt.skotad_volym_manuell / skotning_g15_manuell
  // hålls i sync tills kolumnerna tas bort i städ-PR efter att skotare_objekt_manuell är enda källa.
  const r3 = await direktPatchDimObjekt(skotarIds, skotarPatch)
  if (!r3.ok) return { ok: false, message: 'Skotarfälten: ' + r3.message }

  // Avslut (väg A): när sparningen gör att BÅDA avslut-flaggorna är satta → delad avslut-regel
  // (objekt.status='avslutat' + avslutad_timestamp + ur ALLA maskin_ko). Flaggorna är redan satta av
  // spar → sattFlaggor utelämnas. Härledd status → avslutaObjekt kastar aldrig; resultatet ignoreras
  // (ett avslut-fel får inte fälla saven). Samma funktion som planeringens Avsluta-knapp anropar.
  if (obj.skordning_avslutad && obj.skotning_avslutad && obj.vo_nummer) {
    await avslutaObjekt(supabase, { voNummer: obj.vo_nummer })
  }
  // Spegla skotarvolym/G15 till skotare_objekt_manuell (primär läskälla sedan DEL 0).
  // UI-inmatning skriver om objektets manuella data i sin helhet — DELETE utan
  // maskin_id-filter tar även bort eventuella maskinspecifika rader (migrerade
  // 2026-07-25) så att läsningens prioritetsregel inte döljer det nya värdet.
  const harVolym = (obj.skotad_volym_manuell ?? 0) > 0
  const harG15 = (obj.skotning_g15_manuell ?? 0) > 0
  if (obj.tilldelad_skotare) {
    // TILLDELAD SKOTARE FINNS → per-maskin-rad, aldrig objekt-nivå (maskin_id NULL).
    // Rör inga rader alls om inget är angivet (en fördelning får aldrig klubbas av
    // ett tomt formulär). Manuell-rutan direktsparar samma väg; detta är spegeln
    // vid Spara så batch-vägen inte kan återskapa NULL-raden.
    if (harVolym || harG15) {
      const r4 = await sparaPerMaskinSkotning(skotarIds, obj.tilldelad_skotare, {
        ...(harVolym ? { egen: Number(obj.skotad_volym_manuell) } : {}),
        ...(harG15 ? { g15: Number(obj.skotning_g15_manuell) } : {}),
      })
      if (!r4.ok) return r4
    }
    return { ok: true, message: '' }
  }
  // INGEN tilldelad skotare (legacy, objekt-nivå): skriv om objektets manuella data i sin
  // helhet — DELETE utan maskin_id-filter tar även maskinspecifika rader (migrerade
  // 2026-07-25) så att läsningens prioritetsregel inte döljer det nya värdet.
  const { error: delManuellErr } = await supabase
    .from('skotare_objekt_manuell').delete().in('objekt_id', skotarIds)
  if (delManuellErr) return { ok: false, message: 'Skotarvolym (rensning): ' + delManuellErr.message }
  if (harVolym || harG15) {
    const { error: insManuellErr } = await supabase.from('skotare_objekt_manuell').insert(
      skotarIds.map((id: string) => ({
        objekt_id: id,
        maskin_id: null as null,
        volym_m3: harVolym ? Number(obj.skotad_volym_manuell) : null,
        g15_timmar: harG15 ? Number(obj.skotning_g15_manuell) : null,
      }))
    )
    if (insManuellErr) return { ok: false, message: 'Skotarvolym (ny tabell): ' + insManuellErr.message }
  }
  // Steg B: objektet har nu fått trakt-uppgifter i redigeringen → det saknar inte längre
  // planering. Nollar flaggan på objekt-tabellen. Fel här får aldrig fälla saven (valfri flagga).
  if (obj?.vo_nummer) {
    try { await supabase.from('objekt').update({ saknar_planering: false }).eq('vo_nummer', obj.vo_nummer) } catch { /* valfri flagga */ }
  }
  return { ok: true, message: '' }
}
// === SLUT SUPABASE ===

// Objektraden i Redigering: kolumnerna ur objekt/dim_objekt som vyn läser, plus de härledda _extern_*-fälten.
// Alla fält är valfria — importerade och handskrivna rader ser olika ut, och kolumner som en migration lägger till kan saknas.
type RObjekt = {
  id?: string; vo_nummer?: string | null; object_name?: string | null; skogsagare?: string | null; bolag?: string | null
  maskin_id?: string | null; maskin_typ?: string | null; start_date?: string | null; end_date?: string | null
  huvudtyp?: string | null; atgard?: string | null; avtalsform?: string | null
  skordning_avslutad?: string | null; skotning_avslutad?: string | null
  exkludera?: boolean | null; special?: boolean | null; special_skal?: string | null; egen_skotning?: boolean | null; risskotning?: boolean | null; ovrigt_info?: string | null
  [falt: string]: unknown
}

function parseExternSkotning(obj: RObjekt): RObjekt {
  const copy: RObjekt = { ...obj };
  try {
    if (obj.ovrigt_info) {
      const parsed = JSON.parse(obj.ovrigt_info);
      if (parsed.extern_skotning) {
        copy._extern_skotning = true;
        copy._extern_foretag = parsed.extern_foretag || '';
        copy._extern_pris_typ = parsed.extern_pris_typ || 'm3';
        copy._extern_pris = parsed.extern_pris || 0;
        copy._extern_antal = parsed.extern_antal || 0;
      }
    }
  } catch {}
  return copy;
}

// "Ser ut som autogenererat datum" — heltalssträng, t.ex. 20260408 eller 80426
function looksLikeAutoDate(name: unknown) {
  if (!name) return false
  return /^\d+$/.test(String(name).trim())
}

// Vilket avslutsfält som hör till maskintypen
function avslutadFieldFor(maskin_typ: string | null | undefined) {
  if (maskin_typ === 'Harvester') return { field: 'skordning_avslutad', label: 'skördning' }
  if (maskin_typ === 'Forwarder') return { field: 'skotning_avslutad', label: 'skotning' }
  return null
}

// Antal dagar sedan en ISO-tidsstämpel, eller null om ogiltig
function daysSinceISO(iso?: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

// Formatera ISO-tidsstämpel till YYYY-MM-DD (för date-input + display)
function formatYMD(iso?: string | null) {
  if (!iso) return null
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}


// Versaliserar första bokstaven
function capFirst(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s }

// Konkreta varningar för fält som behöver fixas (oftast import-fel).
// volym (skördat/skotat över VO-gruppen) är valfri — anropare med kortInfo
// skickar den så luckvarningen "skotning klar men 0 m³" kan räknas.
function getWarnings(obj: RObjekt | null | undefined, volym?: { skordat: number; skotat: number }) {
  if (!obj || obj.exkludera) return []
  const w = []

  // Lucka i timpengstatistiken: skotning avslutad men ingen skotad volym
  // (varken lass eller manuell) trots skördad volym. Triggar INTE på
  // nollskördade objekt (ris/grot/test — inget att räkna upp från) eller
  // egen/extern skotning (annan tar volymen).
  if (volym && obj.skotning_avslutad
      && volym.skordat > 0 && volym.skotat <= 0
      && obj.egen_skotning !== true && !harExternSkotning(obj)) {
    w.push({ key: 'skotning_noll', text: 'Skotning klar men 0 m³ skotat', target: 'avslut-skotare-section' })
  }
  // Risjobb: typen ÄR risskotning — huvudtyp/åtgärd efterfrågas aldrig.
  if (!arRisjobb(obj)) {
    if (!obj.huvudtyp) w.push({ key: 'huvudtyp', text: 'Saknar huvudtyp', target: 'huvudtyp-section' })
    // Slutavverkning: det som SKA vara satt är avtalsformen (Au/Rp …) — åtgärd är valfri där. Gallring: åtgärd som förut.
    // Före migrationen 20261014125836 finns ingen avtalsform-kolumn (obj har inte nyckeln): då gäller åtgärd som förut.
    const saknar = saknarAvtalsformEllerAtgard(obj)
    if (saknar) w.push(saknar)
  }
  if (looksLikeAutoDate(obj.object_name)) w.push({ key: 'autoname', text: 'Namnet är bara ett datum', target: 'object_name-section' })
  if (!obj.skogsagare) w.push({ key: 'skogsagare', text: 'Saknar markägare', target: 'skogsagare-section' })
  if (!obj.bolag) w.push({ key: 'bolag', text: 'Saknar bolag', target: 'bolag-section' })

  // Steg J: Maskinen har EndDate i fil men användaren har inte markerat avslutad.
  // Avslutsfälten bor numera i respektive maskinsektion — hoppa till rätt.
  const av = avslutadFieldFor(obj.maskin_typ)
  const avslutTarget = av?.field === 'skordning_avslutad' ? 'avslut-skordare-section' : 'avslut-skotare-section'
  if (av && obj.end_date && !obj[av.field]) {
    w.push({
      key: 'reported_end',
      // Samma ord som raden i objektets ark ("Skotning klar?") — inte maskinens språk.
      text: `${capFirst(av.label)} klar?`,
      target: avslutTarget
    })
  }

  // Steg K: 14-dagars-heuristik (plan B när maskinen INTE rapporterat EndDate)
  if (av && !obj.end_date && !obj[av.field]) {
    const days = daysSinceISO(obj.start_date)
    if (days !== null && days >= 14) {
      w.push({
        key: 'maybe_done',
        text: `${capFirst(av.label)} klar? Startade för ${days} dagar sedan`,
        target: avslutTarget
      })
    }
  }

  return w
}

// Obligatoriska fält — översiktssidans "Måste fyllas i"-rader + progressrad.
// target = rad-id på översiktssidan (scroll + flash).
const KRAV_FALT = [
  { key: 'huvudtyp', label: 'Huvudtyp', target: 'huvudtyp-section' },
  { key: 'bolag', label: 'Bolag', target: 'bolag-section' },
  { key: 'skogsagare', label: 'Markägare', target: 'skogsagare-section' },
  { key: 'atgard', label: 'Åtgärd', target: 'atgard-section' },
]

// TYP-REGEL: en enda källa — lib/objekt/typ.ts. Ett objekt är risjobb när
// risskotning=true ELLER huvudtyp='Grot' (de synkas, se HUVUDTYPER). arRisjobb
// importeras därifrån; ingen lokal kopia som kan glida isär.



// "12 maj" ur "YYYY-MM-DD" — fasta namn, ingen locale-överraskning
const MANADER_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
function fmtKortDatum(ymd: any) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ymd || ''
  return `${parseInt(m[3], 10)} ${MANADER_KORT[parseInt(m[2], 10) - 1] || m[2]}`
}

// "2 av 4 klart — Bolag och åtgärd saknas" (första ordet versalt, resten gemena)
function progressText(saknas: any[], total: number = KRAV_FALT.length) {
  if (saknas.length === 0) return 'Alla obligatoriska fält ifyllda'
  const namn = saknas.map((f: any, i: number) => i === 0 ? f.label : f.label.toLowerCase())
  const lista = namn.length === 1 ? namn[0] : `${namn.slice(0, -1).join(', ')} och ${namn[namn.length - 1]}`
  return `${total - saknas.length} av ${total} klart — ${lista} saknas`
}


// Snabbfix för Object_name — slår mot meta_importerade_filer (FPR-filer
// för objektets maskin_id) och matchar mot dim_objekt.start_date.
// Samma logik som SQL-fixet:
//   date(fil_dag) = date(d.start_date)
//   AND extract(hour from filnamnets klockslag) = extract(hour from d.start_date)
async function hamtaNamnFranFilnamn(obj: RObjekt | null | undefined) {
  const maskinId = obj?.maskin_id
  const startDate = obj?.start_date
  if (!maskinId) {
    return { ok: false, message: 'Maskin_id saknas på objektet — fyll i manuellt' }
  }
  if (!startDate) {
    return { ok: false, message: 'Start_date saknas på objektet — fyll i manuellt' }
  }

  // Parsa "YYYY-MM-DDTHH:MM:SS" eller "YYYY-MM-DD HH:MM:SS[+00]" som naive timestamp.
  // start_date är timestamp without time zone — vi tar värdet som det är lagrat,
  // ingen tz-konvertering (motsvarar SQL date()/extract() på naive timestamp).
  const sd = String(startDate).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/)
  if (!sd) {
    return { ok: false, message: 'Kunde inte tolka start_date — fyll i manuellt' }
  }
  const [, yyyy, mm, dd, hh] = sd
  const startDDMMYY = `${dd}${mm}${yyyy.slice(2)}`
  const startHour = parseInt(hh, 10)

  let rows = []
  try {
    const { data, error } = await supabase
      .from('meta_importerade_filer')
      .select('filnamn')
      .eq('maskin_id', maskinId)
      .eq('filtyp', 'FPR')
      .eq('status', 'OK')
    if (error) return { ok: false, message: `Kunde inte ansluta: ${error.message}` }
    rows = data || []
  } catch {
    return { ok: false, message: 'Kunde inte ansluta — försök igen' }
  }

  // Filnamnsmönster: "Skogsnamn_Mark-DDMMYY-HHMMSS.fpr"
  const re = /^(.+)-(\d{6})-(\d{6})\.fpr$/i
  const matches = []
  for (const r of rows) {
    const m = (r.filnamn || '').match(re)
    if (!m) continue
    const ddmmyy = m[2]
    const hhmmss = m[3]
    const fileHour = parseInt(hhmmss.slice(0, 2), 10)
    if (ddmmyy === startDDMMYY && fileHour === startHour) {
      matches.push(m[1].replace(/_/g, ' ').trim())
    }
  }

  const unika = Array.from(new Set(matches)).filter(Boolean)
  if (unika.length === 0) return { ok: false, message: 'Ingen FPR-fil matchade datum + timme — fyll i manuellt' }
  if (unika.length > 1) return { ok: false, message: 'Flera olika namn matchade — fyll i manuellt' }
  return { ok: true, name: unika[0] }
}

// Musens och pekskärmens händelser har olika fält för Y-läget; getY läser det som finns.
type PekarHandelse = { clientY?: number; touches?: ArrayLike<{ clientY: number }>; changedTouches?: ArrayLike<{ clientY: number }> }



// Chip with hover
function Chip({ label, selected, onClick, editMode, onDelete }: { label: string; selected: boolean; onClick: () => void; editMode: boolean; onDelete: () => void }) {
  const [hover, setHover] = useState(false)
  
  return (
    <div 
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styles.chip,
        background: selected ? 'rgba(173,198,255,0.2)' : hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
        borderColor: selected ? 'rgba(173,198,255,0.4)' : hover ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
        color: '#fff',
        transform: hover ? 'scale(1.03)' : 'scale(1)',
        boxShadow: hover && !selected ? '0 0 15px rgba(255,255,255,0.1)' : selected ? '0 0 15px rgba(173,198,255,0.3)' : 'none'
      }}
    >
      <span>{label}</span>
      {editMode && <button onClick={(e) => { e.stopPropagation(); onDelete() }} style={styles.chipDelete}>✕</button>}
    </div>
  )
}




// DateToggle (för avslut-datum)
function DateToggle({ label, date, onToggle, onDateChange }: { label: string; date: string | null | undefined; onToggle: (v: string | null) => void; onDateChange: (v: string | null) => void }) {
  const [bounce, setBounce] = useState(false)
  const [hover, setHover] = useState(false)
  const [textInput, setTextInput] = useState('')
  const active = !!date
  const activeColor = '#adc6ff'
  const activeBg = 'rgba(173,198,255,0.10)'
  const activeBorder = 'rgba(173,198,255,0.30)'

  const handleTextSave = () => {
    if (!textInput.trim()) return
    const t = textInput.trim()
    let parsed = null
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) parsed = t
    else if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(t)) {
      const parts = t.split(/[\/\-]/)
      parsed = `${parts[2]}-${parts[1]}-${parts[0]}`
    } else if (/^\d{8}$/.test(t)) {
      parsed = `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}`
    }
    if (parsed && !isNaN(new Date(parsed).getTime())) {
      onDateChange(parsed)
      setTextInput('')
    }
  }

  const handleClick = () => {
    setBounce(true)
    setTimeout(() => setBounce(false), 300)
    if (active) {
      onToggle(null)
    } else {
      onToggle(new Date().toISOString().split('T')[0])
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div 
        onClick={handleClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          ...styles.switchRow,
          background: active ? activeBg : hover ? 'rgba(255,255,255,0.03)' : 'transparent',
          borderColor: active ? activeBorder : hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
          transform: hover ? 'scale(1.01)' : 'scale(1)',
          boxShadow: active ? `0 0 20px ${activeColor}20` : 'none'
        }}
      >
        <div style={styles.switchLeft}>
          <span style={{ fontSize: 15, fontWeight: 500, color: active ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'color 0.2s ease' }}>{label}</span>
        </div>
        <div style={{
          ...styles.switch,
          background: active ? activeColor : 'rgba(255,255,255,0.15)',
          boxShadow: active ? `0 0 20px ${activeColor}90` : 'none',
          transform: bounce ? 'scale(1.1)' : 'scale(1)',
          transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}>
          <div style={{ ...styles.switchKnob, transform: active ? 'translateX(20px)' : 'translateX(0)' }} />
        </div>
      </div>
      {active && (
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: 8, 
          padding: '10px 16px', marginLeft: 8, marginRight: 8,
          borderRadius: 12, background: 'rgba(173,198,255,0.08)', 
          border: '1px solid rgba(173,198,255,0.2)',
          animation: 'fadeIn 0.2s ease'
        }}>
          <input 
            type="date" 
            value={date || ''} 
            onChange={(e) => onDateChange(e.target.value)}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8,
              border: '1px solid rgba(173,198,255,0.3)', background: 'rgba(0,0,0,0.3)',
              color: '#fff', fontSize: 14, outline: 'none',
              colorScheme: 'dark'
            }}
          />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>eller</span>
          <input 
            type="text" 
            value={textInput} 
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleTextSave() }}
            placeholder=""
            style={{
              width: 110, padding: '8px 10px', borderRadius: 8,
              border: '1px solid rgba(173,198,255,0.3)', background: 'rgba(0,0,0,0.3)',
              color: '#fff', fontSize: 14, outline: 'none'
            }}
          />
          {textInput.trim() && (
            <button onClick={handleTextSave}
              style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#adc6ff', color: '#000',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              OK
            </button>
          )}
        </div>
      )}
    </div>
  )
}



// Confirm-dialog — Apple-stil. 2 eller 3 knappar (om discardLabel + onDiscard
// är satta visas en mellan-knapp för "destructive non-cancel"-val, t.ex.
// "Stäng utan att spara"). 3-val renderas vertikalt.
function ConfirmDialog({
  open, title, message,
  confirmLabel = 'Fortsätt', cancelLabel = 'Avbryt',
  discardLabel = null, onDiscard = null,
  onConfirm, onCancel, destructive = false,
}: {
  open: boolean; title: string; message: ReactNode
  confirmLabel?: string; cancelLabel?: string
  discardLabel?: string | null; onDiscard?: (() => void) | null
  onConfirm: () => void; onCancel: () => void; destructive?: boolean
}) {
  if (!open) return null
  const showDiscard = !!(discardLabel && onDiscard)
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200 }} />
      <div role="dialog" aria-modal="true" data-fraga="" style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: FARG.kort, borderRadius: RADIE.sheet, padding: AVSTAND.xl,
        width: `calc(100% - ${AVSTAND.xxl * 2}px)`, maxWidth: 360, zIndex: 201,
        fontFamily: FONT, color: FARG.text, animation: `fadeIn ${RORELSE.byte}ms ease`,
      }}>
        <div style={{ ...TYP.rubrik, marginBottom: AVSTAND.s }}>{title}</div>
        <div style={{ ...TYP.text, color: FARG.text2, marginBottom: AVSTAND.xl }}>{message}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
          <button type="button" onClick={onConfirm} style={{ ...KNAPP.primar, ...(destructive ? { background: FARG.rod, color: FARG.text } : {}) }}>{confirmLabel}</button>
          {showDiscard && <button type="button" onClick={onDiscard!} style={{ ...KNAPP.sekundar, color: FARG.rod }}>{discardLabel}</button>}
          <button type="button" onClick={onCancel} style={{ ...KNAPP.sekundar }}>{cancelLabel}</button>
        </div>
      </div>
    </>
  )
}


// Bottom sheet med drag-to-close, esc, spring-animation, smooth backdrop-blur.
// Föräldern äger {open, onClose}. Esc/drag/klick-utanför kallar onClose
// som intent-callback — föräldern bestämmer om setValtObjekt(null) ska
// köras (t.ex. visa dirty-dialog först). Exit-animation körs när open
// går från true → false.
// onBack (valfri) visar ‹-knapp för undersidor; ✕ uppe till höger går alltid
// via onClose (samma intent-väg som Esc/backdrop/drag — dirty-guarden i
// föräldern gäller alla). contentKey nollställer scrollen vid sidbyte.
/** Tillbaka och Stäng i arkets huvud: 44 px tryckyta, bara ikonen syns. */
const ARK_KNAPP: CSSProperties = { width: TRAFFYTA.min, height: TRAFFYTA.min, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }

function EditSheet({ open, onClose, onBack, title, subtitel, footer, contentKey, children }: any) {
  const [closing, setClosing] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef<number | null>(null)
  const contentRef = useRef<any>(null)
  const wasOpenRef = useRef(open)

  // Ny undersida/översikt -> börja överst, utan kvarhängande scroll-skugga
  useEffect(() => {
    setScrolled(false)
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [contentKey])

  // Trigga exit-animation när open går true → false
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      setClosing(true)
      const t = setTimeout(() => {
        setClosing(false)
        setScrolled(false)
        setDragOffset(0)
      }, 280)
      wasOpenRef.current = open
      return () => clearTimeout(t)
    }
    wasOpenRef.current = open
  }, [open])

  // Intent-callback — föräldern beslutar om stängning är OK (t.ex. dirty-check)
  const handleClose = () => {
    if (closing || !open) return
    onClose()
  }

  // Esc-tangent
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Drag-listening på document — bara aktiv under drag
  useEffect(() => {
    if (!isDragging) return
    const getY = (e: PekarHandelse) => {
      if (typeof e.clientY === 'number') return e.clientY
      if (e.touches && e.touches[0]) return e.touches[0].clientY
      if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY
      return null
    }
    const onMove = (e: PekarHandelse) => {
      if (dragStartY.current === null) return
      const y = getY(e)
      if (y === null) return
      const offset = Math.max(0, y - dragStartY.current)
      setDragOffset(offset)
    }
    const onUp = (e: PekarHandelse) => {
      const y = getY(e)
      const offset = (y !== null && dragStartY.current !== null) ? Math.max(0, y - dragStartY.current) : dragOffset
      setIsDragging(false)
      dragStartY.current = null
      // Reset offset alltid — om föräldern visar confirm-dialog vid intent-close
      // ska sheet snappa tillbaka medan dialog visas över. Om föräldern faktiskt
      // stänger (open → false) tar exit-anim över.
      setDragOffset(0)
      if (offset > 120) handleClose()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', onMove)
    document.addEventListener('touchend', onUp)
    document.addEventListener('touchcancel', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onUp)
      document.removeEventListener('touchcancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging])

  const onDragStart = (e: PekarHandelse) => {
    const y = (typeof e.clientY === 'number')
      ? e.clientY
      : (e.touches && e.touches[0] ? e.touches[0].clientY : null)
    if (y === null) return
    dragStartY.current = y
    setDragOffset(0)
    setIsDragging(true)
  }

  if (!open && !closing) return null

  // Spring: cubic-bezier(0.32, 0.72, 0, 1) — iOS-stil med liten överskjutning
  const springEasing = 'cubic-bezier(0.32, 0.72, 0, 1)'
  const exitEasing = 'cubic-bezier(0.4, 0, 1, 1)'

  return (
    <>
      <div
        onClick={handleClose}
        className="red-overlay"
        style={{
          ...styles.overlay,
          animation: closing ? 'fadeOut 0.28s ease forwards' : 'fadeIn 0.22s ease',
          transition: 'backdrop-filter 0.2s ease',
        }}
      />
      <div
        className="red-ark"
        style={{
          ...styles.sheet,
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: isDragging ? 'none' : `transform 0.32s ${springEasing}`,
          animation: closing
            ? `slideDown 0.28s ${exitEasing} forwards`
            : (isDragging ? 'none' : `slideUp 0.42s ${springEasing}`),
        }}
      >
        <div
          data-ark-grepp=""
          style={{ ...styles.sheetHandle, cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
        >
          <div style={styles.sheetBar} />
        </div>
        <div style={{
          ...styles.sheetHeader,
          borderBottom: `1px solid ${scrolled ? FARG.linje : 'transparent'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, paddingLeft: onBack ? 0 : AVSTAND.s }}>
            {onBack && (
              <button onClick={onBack} aria-label="Tillbaka" data-ark-tillbaka="" style={ARK_KNAPP}>
                <Ikon namn="chevron_left" storlek={IKON.rad} farg={FARG.bla} />
              </button>
            )}
            <div style={{ ...styles.sheetTitel, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
            <button onClick={handleClose} aria-label="Stäng" data-ark-stang="" style={ARK_KNAPP}>
              <Ikon namn="close" storlek={IKON.rad} farg={FARG.text2} />
            </button>
          </div>
          {subtitel}
        </div>
        <div style={{ ...styles.scrollFade, opacity: scrolled ? 1 : 0 }} />
        <div ref={contentRef} style={styles.sheetContent} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 10)}>
          {children}
        </div>
        {footer && <div style={styles.sheetFooter}>{footer}</div>}
      </div>
    </>
  )
}





// Rad i "Mer om objektet" — navigerar till en undersida i sheeten
function NavRad({ label, summary, warn, onClick }: any) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...styles.kravRad, background: hover ? 'rgba(255,255,255,0.03)' : 'transparent' }}
    >
      <span style={styles.directRowLabel}>{label}</span>
      <span style={{ ...styles.navSummary, ...(warn ? styles.navSummaryWarn : {}) } as any}>{summary}</span>
      <span style={styles.navPil}>›</span>
    </div>
  )
}



// Färdigskotat: skotad volym = skördad (på risjobb: riset som kördes ut). EN funktion för det gamla arkets knapp och
// översiktens "Sätt skotat till …" — samma skrivningar och samma skydd mot fördelningen per skotare.
async function sparaFardigskotat(obj: any, syskon: any[] | null | undefined, varde: number | null): Promise<{ ok: boolean; message: string; patch?: any; skotarIds: string[] }> {
  const arRisjobb = obj.risskotning === true || arGrotHuvudtyp(obj.huvudtyp)
  const skotarIds = raderForMaskinslag(syskon || [obj], 'forwarder', obj.objekt_id)
  const idagDatum = new Date().toISOString().slice(0, 10)
  const fel = (message: string) => ({ ok: false, message, skotarIds })
  // #1-FIX (defer till fördelning): en per-maskin-fördelning
  // (skotare_objekt_manuell, maskin_id SATT) ÄR den skotade volymen.
  // Färdigskotat-knappen får ALDRIG radera/klubba den — det var buggen som
  // skapade spök-NULL-rader (volym_m3=avverkat, maskin_id NULL). Finns en
  // fördelning och vi vill SÄTTA volym → deferra, rör inget.
  if (varde !== null && !arRisjobb) {
    const { data: perMaskin } = await supabase.from('skotare_objekt_manuell')
      .select('id').in('objekt_id', skotarIds).not('maskin_id', 'is', null).is('datum_fran', null).limit(1)
    if ((perMaskin || []).length > 0) {
      return fel('Det finns redan en fördelning per skotare ovan — den räknas som skotad volym. Redigera den i "Fördelning per skotare"; den här knappen skriver inte över den.')
    }
  }
  // På risjobb är detta ENDA klart-handlingen: den sätter både den
  // mätta volymen och avslutsdatumet — och tänder grot-automatiken.
  // TODO(#334): TILLFÄLLIG dubbel-skrivning till dim_objekt — tas bort i städ-PR.
  const patch: any = { skotad_volym_manuell: varde }
  if (arRisjobb) patch.skotning_avslutad = varde == null ? null : idagDatum
  const r = await direktPatchDimObjekt(skotarIds, patch)
  if (!r.ok) { return fel(r.message) }
  if (obj.tilldelad_skotare) {
    // TILLDELAD SKOTARE (t.ex. filfri JD810E) → färdigskotat = per-maskin-raden
    // får volymen (volym_egen_skotning), G15 behålls. Aldrig objekt-nivå-rad.
    const rp = await sparaPerMaskinSkotning(skotarIds, obj.tilldelad_skotare, { egen: varde })
    if (!rp.ok) { return fel(rp.message) }
  } else {
  // Spegla till skotare_objekt_manuell (primär läskälla sedan DEL 0).
  // UI-inmatning skriver om objektets manuella data i sin helhet — DELETE utan
  // maskin_id-filter tar även maskinspecifika rader så att prioritetsregeln
  // inte döljer det nya värdet.
  // Läs g15_timmar FÖRE raderingen — bevara alltid, oavsett om volym sätts eller nollas.
  // Ta NULL-maskin-rad om möjligt; annars maskin-specifik (migrationsdata).
  // "Ta bort färdigskotat" rör aldrig G15-timmar.
  const { data: befG15 } = await supabase.from('skotare_objekt_manuell')
    .select('objekt_id, maskin_id, g15_timmar').in('objekt_id', skotarIds)
  const g15Map = new Map<string, number | null>()
  for (const id of skotarIds as string[]) {
    const rows = (befG15 || []).filter((r: any) => r.objekt_id === id)
    const nullRad = rows.find((r: any) => r.maskin_id === null)
    const g15 = nullRad?.g15_timmar
      ?? rows.find((r: any) => (r.g15_timmar ?? 0) > 0)?.g15_timmar
      ?? null
    g15Map.set(id, g15 != null ? Number(g15) : null)
  }
  // #1-FIX: radera BARA objekt-nivå-raden (maskin_id NULL) — aldrig
  // per-maskin-fördelningen. Utan maskin_id-filtret klubbades fördelningen.
  const { error: delErr2 } = await supabase
    .from('skotare_objekt_manuell').delete().in('objekt_id', skotarIds).is('maskin_id', null)
  if (delErr2) { return fel('Skotarvolym (rensning): ' + delErr2.message) }
  if (varde === null) {
    // Volym nollad — återinsert bara om g15 fanns; annars radera rent.
    const medG15 = (skotarIds as string[])
      .map(id => ({ objekt_id: id, maskin_id: null as null, volym_m3: null as null, g15_timmar: g15Map.get(id) ?? null }))
      .filter(r => (r.g15_timmar ?? 0) > 0)
    if (medG15.length > 0) {
      const { error: insG15Err } = await supabase.from('skotare_objekt_manuell').insert(medG15)
      if (insG15Err) { return fel('G15-bevaring: ' + insG15Err.message) }
    }
  } else {
    const { error: insErr } = await supabase.from('skotare_objekt_manuell').insert(
      (skotarIds as string[]).map(id => ({
        objekt_id: id, maskin_id: null as null, volym_m3: Number(varde), g15_timmar: g15Map.get(id) ?? null,
      }))
    )
    if (insErr) { return fel('Skotarvolym (ny tabell): ' + insErr.message) }
  }
  } // slut: ingen tilldelad skotare (legacy objekt-nivå)
  if (arRisjobb) {
    // Automatiken körs EFTER att markeringen landat. Misslyckas den
    // visas felet — en halvkörd avbockning tigs aldrig ihjäl.
    const a = varde == null
      ? await angraGrotHamtadAutomatik(obj.objekt_id)
      : await grotHamtadAutomatik(obj.objekt_id, idagDatum)
    if (!a.ok) { return fel(a.message) }
  }
  return { ok: true, message: '', patch, skotarIds }
}

// ÖVERSIKTSSIDAN i sheeten: progressrad -> "Måste fyllas i" (öppna rader) ->
// "Mer om objektet" (undersidor) -> Exkludera. De obligatoriska fälten
// redigeras direkt här; allt annat nås via NavRad + oppnaSub.
// Planeringsstatusens val (objekt.status) — de skarpa värdena förarflödet sätter.
const STATUS_VAL = [
  { varde: 'oplanerad', label: 'Oplanerad' },
  { varde: 'planerad', label: 'Planerad (klar att köra)' },
  { varde: 'pagaende', label: 'Pågående' },
  { varde: 'avslutat', label: 'Avslutat' },
]

const fmtM3 = (n: any) => (Number(n) || 0).toLocaleString('sv-SE', { maximumFractionDigits: 1 })

// GROT-statusens skarpa värden (objekt.grot_status) — de som förarflödet/översikten sätter.
const GROT_STATUS_VAL = [
  { varde: 'ej_aktuellt', label: 'Ej aktuellt' },
  { varde: 'skotat', label: 'Skotat' },
  { varde: 'bortkord', label: 'Bortkörd' },
  { varde: 'flisad', label: 'Flisad' },
]


// ── Etapp 1b: direktsparande rader för trakt-fälten (objekt-tabellen) ──
// Alla tar `disabled` = objekt-rad saknas → visar "kräver trakt-import" i
// stället för kontrollen. Aldrig tyst misslyckande; ingen rad skapas (Etapp 0).
const PLAN_INPUT = { flex: 1, maxWidth: '62%', minHeight: 36, borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', fontSize: 14, fontFamily: 'inherit', padding: '0 8px', textAlign: 'right' } as any
const TRAKT_IMPORT_KRAVS = <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>kräver trakt-import</span>


// Är värdet en avtalsform (Au/Rp/LRK/VF/Bark)? Äldre rader har dem i åtgärden; de ska inte erbjudas som åtgärd.
const arAvtalsformVarde = (v: any) => AVTALSFORMER.some(a => a.toLowerCase() === String(v ?? '').trim().toLowerCase())





// Markägarens önskemål om GROT: bortkört senast <datum>, med skäl. Läses av GROT-arket i /oversikt-v2 (överst i listan).
// Direktsave via två-tabell-routern (verifierad: värdet läses tillbaka). Datumet bor på dim_objekt,
// så det kan sättas även för trakter som saknar objekt-rad i planeringen. Ett skäl utan datum är ett
// löst påstående som ingen vy visar — därför nollas skälet tillsammans med datumet, och skälvalet
// syns först när datum finns. Pekskärmen har ingen "rensa"-knapp i datumväljaren → egen knapp.
const GROT_SKAL_VAL = [
  { varde: 'markberedning', label: 'Markberedning' },
  { varde: 'plantering', label: 'Plantering' },
  { varde: 'annat', label: 'Annat' },
]
function GrotSenastFalt({ obj, direktSpara }: any) {
  const senast: string = obj.grot_senast || ''
  const skal: string | null = obj.grot_skal || null
  const [lokal, setLokal] = useState<string>(senast)
  useEffect(() => { setLokal(senast) }, [senast])
  const spara = async (patch: Record<string, any>) => {
    const ok = await direktSpara(patch)
    if (!ok) setLokal(senast) // misslyckad sparning ska inte lämna ett datum i fältet som inte finns i databasen
    return ok
  }
  return (
    <div data-grot-senast="">
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0` }}>
        <span style={{ ...TYP.listtitel }}>Markägaren vill ha GROT bort senast</span>
        <input type="date" value={lokal}
          onChange={(e) => {
            // Tomt värde betyder en halvskriven dag, inte "rensa" (rensa = knappen nedan). Och ett år som
            // "0002" är bara mellanläget när man skriver 2026 — spara först när datumet är rimligt.
            const v = e.target.value; setLokal(v)
            if (v >= '2000-01-01' && v <= '2100-12-31') spara({ grot_senast: v })
          }}
          style={{ background: FARG.fyllning, border: 'none', borderRadius: RADIE.rad, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, color: FARG.text, ...TYP.text, fontFamily: 'inherit', colorScheme: 'dark' }} />
      </label>
      {senast && (
        <>
          <div style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 ${AVSTAND.xs}px` }}>Varför?</div>
          {GROT_SKAL_VAL.map((o, i) => {
            const vald = skal === o.varde
            return (
              <Rad key={o.varde} titel={o.label} pil={false} sista={i === GROT_SKAL_VAL.length - 1}
                onTryck={() => spara({ grot_skal: vald ? null : o.varde })}
                attr={{ role: 'radio', 'aria-checked': String(vald), 'data-grot-skal': o.varde }}
                hoger={<Ikon namn={vald ? 'check_circle' : 'radio_button_unchecked'} storlek={IKON.rad} farg={vald ? FARG.text : FARG.text3} fylld={vald} />} />
            )
          })}
          <button type="button" onClick={() => spara({ grot_senast: null, grot_skal: null })} data-grot-senast-bort=""
            style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>
            Ta bort markägarens datum
          </button>
        </>
      )}
    </div>
  )
}



// EDITORN — hela redigeringssheeten (översikt + undersidor + dirty-guard +
// spara). EN delad instans används av både arbetslistan och Alla objekt —
// tidigare bar varje vy sin egen kopia av all denna logik.
function ObjektEditor({ obj, objekt, setObjekt, bolag, setBolag, inkopare, setInkopare, atgarderSlut, setAtgarderSlut, atgarderGallring, setAtgarderGallring, kortInfo, fildata, listAtgarder, onClose }: any) {
  const [valtObjekt, setValtObjekt] = useState<any>(null)
  const [originalObjekt, setOriginalObjekt] = useState<any>(null)
  const [subpage, setSubpage] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showDirtyDialog, setShowDirtyDialog] = useState(false)
  // PLANERING-sektionen (status/förare) bor på objekt-TABELLEN, inte dim_objekt
  // som resten av editorn. Hämtas separat när editorn öppnas; null = ingen
  // objekt-rad finns för VO-gruppen (→ "kräver trakt-import"-tillstånd).
  const [objektRad, setObjektRad] = useState<any>(null)
  const [objektRadLaddar, setObjektRadLaddar] = useState(false)
  const [medarbetare, setMedarbetare] = useState<any[]>([])
  // Trakt-dokument (privat bucket) öppnas in-app via PdfLasare — aldrig window.open i PWA:n.
  const [pdfDok, setPdfDok] = useState<{ url: string; titel: string } | null>(null)

  // Nytt objekt in -> snapshot för dirty-jämförelsen, börja på översikten
  useEffect(() => {
    if (obj) {
      const parsed = parseExternSkotning(obj)
      setValtObjekt(parsed)
      setOriginalObjekt(parsed)
      setSubpage(null)
      setSaved(false)
      setSaveError('')
    } else {
      setValtObjekt(null)
      setOriginalObjekt(null)
    }
  }, [obj])

  // Objekt-raden (status/förare) för VO-gruppen — FK-medvetet via routern.
  useEffect(() => {
    let avbruten = false
    if (!obj) { setObjektRad(null); return }
    const sysk = syskonRader(objekt, obj)
    const ids = sysk.map((o: any) => o.objekt_id)
    const vo = String(obj.vo_nummer ?? '').trim()
    setObjektRadLaddar(true)
    ;(async () => {
      const rad = await resolveObjektRad(ids, vo)
      if (avbruten) return
      if (!rad) { setObjektRad(null); setObjektRadLaddar(false); return }
      // atgard + avtalsform: "trakt säger" under Åtgärd/Avtalsform. avtalsform finns först efter migrationen 20261014125836 —
      // medAvtalsformSvar kör om utan kolumnen om den saknas, så resten av objektraden (kartor, tilldelning …) alltid laddas.
      const { data } = await medAvtalsformSvar((med) => supabase.from('objekt')
        .select(`id, status, assigned_skordare_user_id, assigned_skotare_user_id, skotare_band, skotare_band_par, skordare_band, skordare_band_par, manuell_prognos, volym_planerad, planerad_start, planerad_slut, typ, bolag, traktkarta_url, traktdirektiv_url, traktnr, fastighetsbeteckning, kontraktsnummer, grot_status, transport_kommentar, volym, vo_nummer, markagare, inkopare, avverkningsform, atgard${med ? ', avtalsform' : ''}`)
        .eq('id', rad.id).limit(1))
      if (avbruten) return
      setObjektRad((data && data[0]) || { id: rad.id })
      setObjektRadLaddar(false)
    })()
    return () => { avbruten = true }
  }, [obj, objekt])

  // Medarbetarlistan (förar-väljaren) — en gång.
  useEffect(() => {
    let avbruten = false
    ;(async () => {
      const { data } = await supabase.from('medarbetare').select('id, namn, roll').order('namn')
      if (!avbruten) setMedarbetare(data || [])
    })()
    return () => { avbruten = true }
  }, [])

  // Ändrade toppnivå-nycklar mot snapshotet — driver både dirty-guarden
  // och räknaren i Spara-knappen
  const andradeNycklar = (valtObjekt && originalObjekt)
    ? Object.keys({ ...originalObjekt, ...valtObjekt }).filter(k => JSON.stringify(valtObjekt[k]) !== JSON.stringify(originalObjekt[k]))
    : []
  const isDirty = andradeNycklar.length > 0

  const syskon = valtObjekt ? syskonRader(objekt, valtObjekt) : []
  const info = valtObjekt ? kortInfo[valtObjekt.objekt_id] : null
  const skordatTotal = syskon.reduce((sum: number, o: any) => sum + (kortInfo[o.objekt_id]?.skordatM3 || 0), 0)
  const skotatTotal = syskon.reduce((sum: number, o: any) => sum + (kortInfo[o.objekt_id]?.skotatM3 || 0), 0)
  const gruppSkotningAvslutad = syskon.some((o: any) => !!o.skotning_avslutad)
  const skotareSanderEj = gruppSkotareSanderEj(syskon, fildata)
  // Avslutsförslag för gruppen (end_date/stale) — samma som Pågående-kortet,
  // matchat per maskinslag till respektive undersida
  const sheetForslag = valtObjekt ? avslutsForslag({ rader: syskon, rep: valtObjekt }, fildata) : []
  const skordForslag = sheetForslag.find((f: any) => f.field === 'skordning_avslutad') || null
  const skotForslag = sheetForslag.find((f: any) => f.field === 'skotning_avslutad') || null

  // Gäller ALLA stängningsvägar (✕, Esc, drag, backdrop) — även från undersida
  const attemptCloseModal = () => {
    if (isDirty) setShowDirtyDialog(true)
    else onClose()
  }
  const closeAndDiscard = () => { setShowDirtyDialog(false); onClose() }
  const saveThenClose = () => { setShowDirtyDialog(false); sparaObjekt() }

  // Direktsparade rader (färdigskotat-knappen) speglas i lista + snapshot
  // så de inte räknas som osparade ändringar
  const raderUppdaterade = (ids: string[], patch: any) => {
    setObjekt((prev: any[]) => prev.map((o: any) => ids.includes(o.objekt_id) ? { ...o, ...patch } : o))
    setOriginalObjekt((prev: any) => prev && ids.includes(prev.objekt_id) ? { ...prev, ...patch } : prev)
  }

  // Direktsave för tredelningens fält (Etapp 1a). Sparar VERIFIERAT via
  // två-tabell-routern och speglar in resultatet i lokal state så inget räknas
  // som osparat — samma princip som färdigskotat-knappen (raderUppdaterade).
  // Dim-fält skrivs över hela VO-gruppen (som batch-saven); status/förare till
  // objekt-raden. Anropas BARA med gemensamma dim-fält + objekt-fält — aldrig
  // maskinspecifika (skördning/skotning-avslut bor kvar i sina undersidor med
  // rätt harvester/forwarder-split). Returnerar false vid fel (toast visas).
  // opts.ids = skriv dim-delen BARA till dessa rader (maskinspecifika fält:
  // skördning → harvester-raderna, skotning → forwarder-raderna, som batch-saven).
  // Utan opts.ids = hela VO-gruppen (gemensamma fält).
  async function direktSpara(patch: Record<string, any>, opts?: { ids?: string[]; tyst?: boolean }): Promise<boolean> {
    if (!valtObjekt) return false
    const sysk = syskonRader(objekt, valtObjekt)
    let dimIds = opts?.ids && opts.ids.length > 0 ? opts.ids : sysk.map((o: any) => o.objekt_id)
    // Ett nytt VO-nummer gäller raderna under objektets eget nummer, aldrig gruppens andra (lib/redigering/voGrupp.ts).
    if ('vo_nummer' in patch) {
      const forra = String(originalObjekt?.vo_nummer ?? valtObjekt.vo_nummer ?? '')
      dimIds = dimIds.filter(id => String(sysk.find((o: any) => o.objekt_id === id)?.vo_nummer ?? '') === forra)
    }
    const res = await sparaFalt(
      {
        dimObjektIds: dimIds,
        voNummer: String(originalObjekt?.vo_nummer ?? '').trim(),
        objektId: objektRad?.id,
      },
      patch,
    )
    if (!res.ok) {
      if (opts?.tyst) return false
      setSaveError(res.message || 'Kunde inte spara — försök igen')
      setTimeout(() => setSaveError(''), 6000)
      return false
    }
    // Dela upp per faktisk kolumn och spegla: dim → lista + snapshot (ej dirty),
    // objekt → objektRad-state. Nyckeln remappas via FALT_RUTT (markägare bor på
    // skogsagare i dim men markagare i objekt).
    const dimPatch: Record<string, any> = {}
    const objPatch: Record<string, any> = {}
    for (const k of Object.keys(patch)) {
      const rutt = FALT_RUTT[k]
      if (rutt?.dim) dimPatch[rutt.dim] = patch[k]
      if (rutt?.objekt) objPatch[rutt.objekt] = patch[k]
    }
    if (Object.keys(dimPatch).length > 0) {
      const gruppIds = dimIds
      setObjekt((prev: any[]) => prev.map((o: any) => gruppIds.includes(o.objekt_id) ? { ...o, ...dimPatch } : o))
      setValtObjekt((prev: any) => ({ ...prev, ...dimPatch }))
      setOriginalObjekt((prev: any) => ({ ...prev, ...dimPatch }))
    }
    if (Object.keys(objPatch).length > 0 && res.objektRadFanns) {
      setObjektRad((prev: any) => ({ ...(prev || {}), ...objPatch }))
    }
    return true
  }

  // Maskinspecifika dim-fält → bara det maskinslagets rader (som SKORDAR-/SKOTARFALT
  // i batch-saven). raderForMaskinslag faller tillbaka på öppnad rad om gruppen
  // saknar typade rader.
  async function direktSparaMaskin(patch: Record<string, any>, typ: 'harvester' | 'forwarder'): Promise<boolean> {
    if (!valtObjekt) return false
    const sysk = syskonRader(objekt, valtObjekt)
    return direktSpara(patch, { ids: raderForMaskinslag(sysk, typ, valtObjekt.objekt_id) })
  }

  // Avslutsdatum med samma automatik som batch-saven (F2): på RISJOBB driver
  // skotning_avslutad grot-avbockningen på de kopplade avverkningsobjekten.
  // Körs EFTER lyckad save; ett fel visas — en halvkörd avbockning tigs aldrig ihjäl.
  // Klar gäller HELA objektet (alla dess rader, samma som automatiken i databasen skriver) — Mölleryd har
  // skördarens och skotarens rader under två nummer, och ett "Inte klar än" på bara den ena raden lämnade
  // automatikens datum kvar på den andra. Saknas avslutskolumnerna (migration 20261024161546) sparas
  // utan dem.
  async function direktSparaAvslut(typ: 'harvester' | 'forwarder', patch: Record<string, any>): Promise<boolean> {
    if (!valtObjekt) return false
    const fore = valtObjekt.skotning_avslutad || null
    let ok = await direktSpara(patch, { tyst: harNyaFalt(patch) })
    if (!ok && harNyaFalt(patch)) ok = await direktSpara(utanNyaFalt(patch))
    if (!ok) return false
    if (typ === 'forwarder' && 'skotning_avslutad' in patch && arRisjobb(valtObjekt)) {
      const efter = patch.skotning_avslutad || null
      let autoFel = ''
      try {
        if (!fore && efter) {
          const r = await grotHamtadAutomatik(valtObjekt.objekt_id, efter)
          if (!r.ok) autoFel = 'Sparat — men grot-avbockningen: ' + r.message
        } else if (fore && !efter) {
          const r = await angraGrotHamtadAutomatik(valtObjekt.objekt_id)
          if (!r.ok) autoFel = 'Sparat — men ångrandet av grot-avbockningen: ' + r.message
        }
      } catch {
        autoFel = 'Sparat — men grot-avbockningen kunde inte köras'
      }
      if (autoFel) { setSaveError(autoFel); setTimeout(() => setSaveError(''), 8000); return false }
    }
    return true
  }

  // ── Undersidorna under Mer sparar direkt (2026-10-24), som resten av arket ──
  const skotarIdsNu = () => raderForMaskinslag(syskonRader(objekt, valtObjekt), 'forwarder', valtObjekt.objekt_id)

  // Extern skotare: ovrigt_info på skotarens rader. De härledda _extern_*-fälten följer med så inget räknas som osparat.
  async function direktSparaExtern(patch: Record<string, any>, typ: 'harvester' | 'forwarder'): Promise<boolean> {
    const ok = await direktSparaMaskin(patch, typ)
    if (ok) {
      const ny = (o: any) => {
        if (!o) return o
        const { _extern_skotning, _extern_foretag, _extern_pris_typ, _extern_pris, _extern_antal, ...rest } = o
        return parseExternSkotning(rest)
      }
      setValtObjekt((prev: any) => ny(prev))
      setOriginalObjekt((prev: any) => ny(prev))
    }
    return ok
  }

  // Skotarens G15 i ackordgrunden speglas till skotarraden (som batch-sparningen gjorde) — men utan att röra en fördelning.
  async function sparaSkotarG15(v: number | null): Promise<boolean> {
    if (!valtObjekt) return false
    const ids = skotarIdsNu()
    const fel = (m: string) => { setSaveError(m); setTimeout(() => setSaveError(''), 6000); return false }
    if (valtObjekt.tilldelad_skotare) {
      const r = await sparaPerMaskinSkotning(ids, valtObjekt.tilldelad_skotare, { g15: v })
      if (!r.ok) return fel(r.message)
    } else {
      const { data, error } = await supabase.from('skotare_objekt_manuell').update({ g15_timmar: v })
        .in('objekt_id', ids).is('maskin_id', null).is('datum_fran', null).select('id')
      if (error) return fel('Skotarraden: ' + error.message)
      if ((data || []).length === 0 && v != null) {
        const volym = Number(valtObjekt.skotad_volym_manuell) || 0
        const { error: e2 } = await supabase.from('skotare_objekt_manuell').insert(
          ids.map((id: string) => ({ objekt_id: id, maskin_id: null as null, volym_m3: volym > 0 ? volym : null, g15_timmar: v })))
        if (e2) return fel('Skotarraden: ' + e2.message)
      }
    }
    return direktSparaMaskin({ skotning_g15_manuell: v }, 'forwarder')
  }

  async function sattFardigskotat(varde: number | null): Promise<{ ok: boolean; message: string }> {
    if (!valtObjekt) return { ok: false, message: 'Inget objekt' }
    const r = await sparaFardigskotat(valtObjekt, syskon, varde)
    if (!r.ok) return { ok: false, message: r.message }
    setValtObjekt((prev: any) => ({ ...prev, ...r.patch }))
    raderUppdaterade(r.skotarIds, r.patch)
    return { ok: true, message: '' }
  }

  // Filfri skotare (t.ex. 810E): volym/G15 på maskinens rad, dim-kolumnerna speglas (#334).
  async function sparaFilfri(falt: 'egen' | 'g15', v: number | null): Promise<{ ok: boolean; message: string }> {
    if (!valtObjekt) return { ok: false, message: 'Inget objekt' }
    if (!valtObjekt.tilldelad_skotare) return { ok: false, message: 'Välj först vem som skotar.' }
    const dimKey = falt === 'egen' ? 'skotad_volym_manuell' : 'skotning_g15_manuell'
    const ids = skotarIdsNu()
    const r = await sparaPerMaskinSkotning(ids, valtObjekt.tilldelad_skotare, falt === 'egen' ? { egen: v } : { g15: v })
    if (!r.ok) return r
    const spegel = await direktPatchDimObjekt(ids, { [dimKey]: v })
    if (!spegel.ok) return { ok: false, message: 'Sparat på maskinen — men speglingen: ' + spegel.message }
    setValtObjekt((prev: any) => ({ ...prev, [dimKey]: v }))
    raderUppdaterade(ids, { [dimKey]: v })
    return { ok: true, message: '' }
  }

  // Vem skotar (planeringens skotare, dim_objekt.tilldelad_skotare) — hela VO-gruppen, värdet läses tillbaka.
  async function sattTilldelad(mid: string | null): Promise<{ ok: boolean; message: string }> {
    if (!valtObjekt) return { ok: false, message: 'Inget objekt' }
    const ids = syskonRader(objekt, valtObjekt).map((o: any) => o.objekt_id)
    const { data, error } = await supabase.from('dim_objekt').update({ tilldelad_skotare: mid }).in('objekt_id', ids).select('objekt_id, tilldelad_skotare')
    if (error) return { ok: false, message: 'Kunde inte spara: ' + error.message }
    if ((data || []).length !== ids.length) return { ok: false, message: `Bara ${(data || []).length} av ${ids.length} rader uppdaterades` }
    if ((data as any[]).some(r => (r.tilldelad_skotare || null) !== mid)) return { ok: false, message: 'Det sparades inte — ladda om och försök igen' }
    setValtObjekt((prev: any) => ({ ...prev, tilldelad_skotare: mid }))
    raderUppdaterade(ids, { tilldelad_skotare: mid })
    return { ok: true, message: '' }
  }

  async function sparaObjekt() {
    if (!valtObjekt) return
    setSaving(true)
    setSaveError('')
    const sysk = syskonRader(objekt, valtObjekt)
    let res = { ok: false, message: '' }
    try {
      res = await sparaObjektTillSupabase(valtObjekt, sysk)
    } catch (err) {
      res = { ok: false, message: 'Kunde inte spara — försök igen' }
    }
    if (res.ok) {
      // Synka den OPERATIVA objekt-tabellen (appens produktions-/kart-/listkälla) när vo/namn ändrats,
      // via två-tabell-routern (Etapp 0). Ersätter den tidigare inline .eq('vo_nummer')-synken (#407).
      // dim_objekt är REDAN sparad ovan (sparaObjektTillSupabase), så vi speglar BARA objekt-raden
      // (tabeller:['objekt']). Routern resolvar rätt rad FK-medvetet (objekt.dim_objekt_id) med
      // URSPRUNGS-vo som fallback — objekt-raden bär gamla vo tills vi skriver om det. Ingen rad →
      // tyst skip (objektRadFanns=false), verifierad skrivning (läser tillbaka värdet), ett DB-fel
      // tigs aldrig ihjäl. Rössmåla: dim fick nytt vo men objekt låg kvar → produktionen blev osynlig.
      const voAndrad = andradeNycklar.includes('vo_nummer')
      const namnAndrad = andradeNycklar.includes('object_name')
      if (voAndrad || namnAndrad) {
        const urspVo = String(originalObjekt?.vo_nummer ?? '').trim()
        const synkPatch: Record<string, any> = {}
        if (voAndrad && String(valtObjekt.vo_nummer ?? '').trim()) synkPatch.vo_nummer = valtObjekt.vo_nummer
        if (namnAndrad && String(valtObjekt.object_name ?? '').trim()) synkPatch.object_name = valtObjekt.object_name
        if (Object.keys(synkPatch).length > 0) {
          const synkRes = await sparaFalt(
            { dimObjektIds: sysk.map((o: any) => o.objekt_id), voNummer: urspVo },
            synkPatch,
            { tabeller: ['objekt'] },
          )
          if (!synkRes.ok) {
            setSaveError('Sparat i redigeringen — men objekt-synken misslyckades: ' + (synkRes.message || ''))
            setSaving(false)
            return
          }
        }
      }
      // Spegla multi-rad-saven i lokal state: gemensamt till hela VO-gruppen,
      // maskinspecifikt till respektive maskinslags rader
      const gruppIds = sysk.map((o: any) => o.objekt_id)
      const skordarIds = raderForMaskinslag(sysk, 'harvester', valtObjekt.objekt_id)
      const skotarIds = raderForMaskinslag(sysk, 'forwarder', valtObjekt.objekt_id)
      const gemensamt = plocka(valtObjekt, GEMENSAMMA_FALT)
      const skordarPatch = plocka(valtObjekt, SKORDARFALT)
      const skotarPatch = plocka(valtObjekt, SKOTARFALT)
      setObjekt((prev: any[]) => prev.map((o: any) => {
        if (o.objekt_id === valtObjekt.objekt_id) return valtObjekt
        let uppdaterad = o
        if (gruppIds.includes(o.objekt_id)) {
          // Rader under gruppens andra VO-nummer behåller sitt (samma regel som sparningen).
          const egetVo = String(o.vo_nummer ?? '') === String(sysk.find((x: any) => x.objekt_id === valtObjekt.objekt_id)?.vo_nummer ?? '')
          uppdaterad = { ...uppdaterad, ...gemensamt, ...(egetVo ? {} : { vo_nummer: o.vo_nummer }) }
        }
        if (skordarIds.includes(o.objekt_id)) uppdaterad = { ...uppdaterad, ...skordarPatch }
        if (skotarIds.includes(o.objekt_id)) uppdaterad = { ...uppdaterad, ...skotarPatch }
        return uppdaterad
      }))
      // F2: risjobbets färdigmarkering driver grot-avbockningen på de kopplade
      // avverkningsobjekten. Körs EFTER lyckad save — färdigmarkeringen ska ha
      // landat innan automatiken agerar på den. Misslyckas den stängs INTE
      // sheeten: felet syns, för en halvkörd avbockning ska aldrig tigas ihjäl.
      if (arRisjobb(valtObjekt)) {
        const fore = originalObjekt?.skotning_avslutad || null
        const efter = valtObjekt.skotning_avslutad || null
        let autoFel = ''
        try {
          if (!fore && efter) {
            const r = await grotHamtadAutomatik(valtObjekt.objekt_id, efter)
            if (!r.ok) autoFel = 'Sparat — men grot-avbockningen: ' + r.message
          } else if (fore && !efter) {
            const r = await angraGrotHamtadAutomatik(valtObjekt.objekt_id)
            if (!r.ok) autoFel = 'Sparat — men ångrandet av grot-avbockningen: ' + r.message
          }
        } catch {
          autoFel = 'Sparat — men grot-avbockningen kunde inte köras'
        }
        if (autoFel) {
          setSaveError(autoFel)
          setSaving(false)
          return
        }
      }
      setSaved(true)
      setTimeout(() => { setSaved(false); onClose() }, 600)
    } else {
      setSaveError(res.message || 'Kunde inte spara — försök igen')
      setTimeout(() => setSaveError(''), 6000)
    }
    setSaving(false)
  }

  // Identitet + Skördare är borta (Etapp 1c) — deras fält bor i tredelningen.
  // Kvar: arbetsflöden (Skotare), ekonomi (Extern skotare, Pris) och fil-info.
  const titlar: any = { filer: 'Filer', skotare: 'Skotare', skotning: 'Extern skotare', pris: 'Pris och ersättning' }
  // Ett ark per objekt: varje undersida öppnas från översikten och går tillbaka dit.
  const tillbaka = () => setSubpage(null)
  // Filer över hela VO-gruppen — ett fysiskt objekt är ofta flera rader,
  // och en kopplad maskinrad ska synas oavsett vilken rad som öppnas
  const filRader = valtObjekt && fildata?.status === 'ok'
    ? slaIhopFildata(syskon.map((o: any) => fildata.perObjekt.get(o.objekt_id)))
    : undefined
  const filerSummering = (() => {
    if (!valtObjekt) return { text: '', warn: false }
    const st = fildata?.status || 'laddar'
    if (st === 'fel') return { text: 'Kunde inte läsas', warn: true }
    if (st === 'laddar') return { text: 'Läser …', warn: false }
    const fil = filStatus(valtObjekt, filRader, { skotareSanderEjFiler: skotareSanderEj })
    const antal = (filRader || []).reduce((sum: number, r: any) => sum + (r.antalFiler || 0), 0)
    if (fil.ovantadSkotardata) return { text: 'Oväntad skotardata', warn: true }
    if (fil.ovantadSkordardata) return { text: 'Oväntad skördardata', warn: true }
    if (fil.skordare === 'saknas' && fil.skotare === 'saknas') return { text: 'Inget data ännu', warn: true }
    if (fil.skotare === 'saknas') return { text: 'Skotardata saknas', warn: true }
    if (fil.skordare === 'saknas') return { text: 'Skördardata saknas', warn: true }
    return { text: `${antal} ${antal === 1 ? 'fil' : 'filer'}`, warn: false }
  })()

  return (
    <>
      <EditSheet
        open={!!valtObjekt}
        onClose={attemptCloseModal}
        onBack={subpage ? tillbaka : undefined}
        title={valtObjekt ? (subpage ? titlar[subpage] : (valtObjekt.object_name || 'Namnlöst objekt')) : ''}
        subtitel={null}
        contentKey={subpage || 'oversikt'}
        // Undersidorna sparar allt direkt, så foten är tom. Bara om något ändå ligger osparat syns Spara.
        footer={valtObjekt && subpage && isDirty
          ? <button type="button" onClick={sparaObjekt} disabled={saving} data-ark-spara=""
              style={{ ...KNAPP.primar, ...(saving ? { opacity: 0.4 } : {}) }}>
              {saving ? 'Sparar …' : saved ? 'Sparat' : 'Spara ändringarna'}
            </button>
          : null}
      >
        {valtObjekt && !subpage && (
          <ObjektOversikt
            obj={valtObjekt} set={setValtObjekt} alla={objekt}
            objektRad={objektRad} objektRadLaddar={objektRadLaddar}
            medarbetare={medarbetare || []} statusVal={STATUS_VAL} bolagVal={bolag || []}
            skordat={skordatTotal} skotat={skotatTotal}
            filRader={filRader} filStatus={fildata?.status || 'laddar'}
            skordForslag={skordForslag} skotForslag={skotForslag}
            direktSpara={direktSpara} direktSparaAvslut={direktSparaAvslut}
            direktSparaMaskin={direktSparaMaskin}
            oppnaUnder={(sida) => setSubpage(sida)}
            atgardVal={(valtObjekt.huvudtyp === 'Gallring' ? atgarderGallring : atgarderSlut) || []}
            filerSummering={filerSummering}
            dokument={(objektRad?.traktdirektiv_url || objektRad?.traktkarta_url)
              ? <DokumentChips traktdirektivUrl={objektRad.traktdirektiv_url} traktkartaUrl={objektRad.traktkarta_url}
                  typ={valtObjekt.huvudtyp === 'Slutavverkning' ? 'slut' : null}
                  onOppna={(url: string, titel: string) => setPdfDok({ url, titel })} />
              : null}
            grotSenast={<GrotSenastFalt obj={valtObjekt} direktSpara={direktSpara} />}
            sattSkotat={async (volym: number) => {
              const r = await sparaFardigskotat(valtObjekt, syskon, volym)
              if (!r.ok) { setSaveError(r.message || 'Kunde inte spara'); setTimeout(() => setSaveError(''), 6000); return false }
              setValtObjekt((prev: any) => ({ ...prev, ...r.patch }))
              raderUppdaterade(r.skotarIds, r.patch)
              return true
            }}
            taBort={async () => { const ok = await direktSpara({ exkludera: true }); if (ok) onClose(); return ok }}
            gruppRader={syskon}
          />
        )}
        {valtObjekt && subpage === 'filer' && (
          <FilerSida rader={filRader as any} status={fildata?.status || 'laddar'} skordningKlar={valtObjekt.skordning_avslutad || null}
            lage={fildata?.status === 'ok' ? filStatus(valtObjekt, filRader, { skotareSanderEjFiler: skotareSanderEj }) as any : null} />
        )}
        {valtObjekt && subpage === 'skotare' && (
          <SkotareSida obj={valtObjekt} syskon={syskon} skotatLass={info?.skotatM3 ?? 0} skordatTotal={skordatTotal} skotatTotal={skotatTotal}
            gruppSkotningAvslutad={gruppSkotningAvslutad} skotareSanderEj={skotareSanderEj} externSkotare={harExternSkotning(valtObjekt)}
            sattFardigskotat={sattFardigskotat} sparaFilfri={sparaFilfri} sattTilldelad={sattTilldelad}
            fordelning={<SkotareFordelning objektId={valtObjekt.objekt_id} avverkatVolym={skordatTotal || 0} />} />
        )}
        {valtObjekt && subpage === 'skotning' && <ExternSida obj={valtObjekt} direktSparaMaskin={direktSparaExtern} />}
        {valtObjekt && subpage === 'pris' && (
          <PrisSida obj={valtObjekt} gruppIds={syskon.map((o: any) => o.objekt_id)}
            direktSpara={direktSpara} direktSparaMaskin={direktSparaMaskin} sparaSkotarG15={sparaSkotarG15} />
        )}
      </EditSheet>
      {pdfDok && <PdfLasare signedUrl={pdfDok.url} titel={pdfDok.titel} onClose={() => setPdfDok(null)} />}
      <ConfirmDialog
        open={showDirtyDialog}
        title="Du har osparade ändringar"
        message="Vill du spara innan du stänger?"
        confirmLabel={saving ? 'Sparar …' : 'Spara'}
        discardLabel="Stäng utan att spara"
        cancelLabel="Avbryt"
        onConfirm={saveThenClose}
        onDiscard={closeAndDiscard}
        onCancel={() => setShowDirtyDialog(false)}
      />
      {saveError && (
        <div style={styles.saveErrorToast} role="alert">{saveError}</div>
      )}
    </>
  )
}

// Objektnamn ur HPR-filnamnet — två kända mönster, null när filen är namnlös
// (Ponsse skriver ibland bara maskinid+tidsstämpel):
//   Ponsse: "Namn_MASKINID_ÅÅÅÅMMDDHHMMSS.hpr"
//   Rottne: "Namn ÅÅÅÅ-MM-DD[ HHMM].hpr"
function namnUrHprFilnamn(filnamn: string, maskinId: string): string | null {
  const f = String(filnamn || '')
  const ponsse = f.match(/^(.+)_[A-Za-z0-9]+_\d{14}\.hpr$/i)
  if (ponsse && ponsse[1].toLowerCase() !== maskinId.toLowerCase()) return ponsse[1]
  const rottne = f.match(/^(.+?)\s+\d{4}-\d{2}-\d{2}(\s+\d{4})?\.hpr$/i)
  if (rottne) return rottne[1]
  if (f.toLowerCase().startsWith(maskinId.toLowerCase())) return null
  return f.replace(/\.hpr$/i, '') || null
}

// Jobb med maskindata men utan objekt: hpr_filer vars VO (ur objekt_nyckel
// "maskin:vo", #78) inte matchar något dim_objekt.vo_nummer. Två hinkar:
// - larm: riktiga VO:n -> objektet saknas, ska kunna skapas
// - smajobb: Ponsses interna k-nummer (k63, k76 …) -> småjobb utan riktigt
//   VO, ingen åtgärd krävs, bara synliga bakom en nedtonad rad
function analyseraOkopplade(hprFiler: any[], objekt: any[]) {
  // Träff på BÅDE vo_nummer och objekt_id: när importen (eller Koppla-flödet)
  // skapat en rad vars objekt_id ÄR maskinens jobbnummer har jobbet ett
  // objekt — även om radens vo_nummer är ett annat (P-VO/riktigt VO).
  // Utan detta larmar redan-kopplade jobb för evigt (falsklarm).
  const kandaId = new Set(objekt.map((o: any) => o.objekt_id).filter(Boolean))
  const voSet = new Set(objekt.map((o: any) => o.vo_nummer).filter(Boolean))
  const perNyckel = new Map<string, any>()
  hprFiler.forEach((f: any) => {
    const nyckel = f.objekt_nyckel || ''
    const i = nyckel.indexOf(':')
    if (i <= 0) return
    const maskinId = nyckel.slice(0, i)
    const vo = nyckel.slice(i + 1)
    if (!vo || voSet.has(vo) || kandaId.has(vo)) return
    const prev = perNyckel.get(nyckel)
    if (!prev || (f.stammar_count || 0) > prev.stammar) {
      perNyckel.set(nyckel, { nyckel, maskinId, vo, stammar: f.stammar_count || 0, filnamn: f.filnamn || '' })
    }
  })
  const larm: any[] = []
  const smajobb: any[] = []
  perNyckel.forEach(j => {
    const jobb = { ...j, namn: namnUrHprFilnamn(j.filnamn, j.maskinId) }
    if (/^k\d+$/i.test(j.vo)) smajobb.push(jobb)
    else larm.push(jobb)
  })
  larm.sort((a, b) => b.stammar - a.stammar)
  smajobb.sort((a, b) => b.stammar - a.stammar)
  return { larm, smajobb }
}






// Suspense-gräns krävs för useSearchParams (samma mönster som /objekt)
export default function ObjektRedigering() {
  return <Suspense fallback={null}><ObjektRedigeringInner /></Suspense>
}

function ObjektRedigeringInner() {
  const [objektRa, setObjekt] = useState<any[]>([])
  const [maskiner, setMaskiner] = useState<Record<string, any>>({})
  // Aktiva skotare (aktiv_till IS NULL) för inline-tilldelning i listan. SÅLDA
  // maskiner ska ALDRIG vara valbara (Akelius-på-sålda-Elefant-buggen).
  const [aktivaSkotare, setAktivaSkotare] = useState<{ id: string; namn: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bolag, setBolag] = useState(STANDARD_BOLAG)
  const [inkopare, setInkopare] = useState<string[]>([])
  // Åtgärd, inte avtalsform: Au/Rp/LRK/VF/Bark har ett eget fält (Avtalsform) och står inte här.
  const [atgarderSlut, setAtgarderSlut] = useState(['Föryngring', 'Special'])
  const [atgarderGallring, setAtgarderGallring] = useState(['Första gallring', 'Andra gallring', 'Gallring', 'Lövgallring'])
  // Objektet som redigeras — all sheet-logik bor i ObjektEditor
  const [redigerObj, setRedigerObj] = useState<any>(null)
  const [saveError, setSaveError] = useState('')
  const [visaGamlaFiler, setVisaGamlaFiler] = useState(false)
  const [aldreMo, setAldreMo] = useState<MaskinobjektRad | null>(null)
  // Maskinfiler utan objekt (lib/redigering/filerUtanObjekt.ts): de senaste 30 dagarna är frågor i Behöver dig, äldre
  // ligger tyst bakom en rad längst ner i listan.
  const filerUO = useFilerUtanObjekt()
  // Samma objekt under två VO-nummer (Mölleryd: skördaren 11166477, skotaren 11271883) = EN grupp överallt.
  const voKarta = useMemo(
    () => filerUO.status === 'ok' ? voGruppKarta(filerUO.data.alias, filerUO.data.objekt, objektRa) : new Map<string, string>(),
    [filerUO.status, filerUO.data, objektRa],
  )
  const objekt = useMemo(() => medVoGrupp(objektRa, voKarta), [objektRa, voKarta])
  const sokParams = useSearchParams()
  const [hprFiler, setHprFiler] = useState<any[]>([])
  const [hprStatus, setHprStatus] = useState<'laddar' | 'fel' | 'ok'>('laddar')
  const [maskinTyper, setMaskinTyper] = useState<Record<string, string | null>>({})
  const [skapaJobb, setSkapaJobb] = useState<any>(null)
  const [skapar, setSkapar] = useState(false)
  const [visaSmajobb, setVisaSmajobb] = useState(false)
  const [oppetKopplaJobb, setOppetKopplaJobb] = useState<string | null>(null) // larmrad med expanderad kandidatlista
  const [kopplaVal, setKopplaVal] = useState<any>(null) // { jobb, kandidat } -> ConfirmDialog
  const [kopplar, setKopplar] = useState(false)
  const [avslutVal, setAvslutVal] = useState<any>(null) // { g, forslag } -> ConfirmDialog (massverkan från kort)
  const [avslutar, setAvslutar] = useState(false)
  // Berikning (volym, senaste aktivitet, maskintyp) per objekt_id
  const matchning = useMatchning()
  // Fildata per objekt (kortprickar + Filer-undersidan)
  const fildata = useFildata()
  // Prickar räknas över hela VO-gruppen — syskonradernas filer hör till objektet
  const filRaderGrupp = (obj: any) => fildata.status === 'ok'
    ? slaIhopFildata(syskonRader(objekt, obj).map((o: any) => fildata.perObjekt.get(o.objekt_id)))
    : undefined

  // Val-listorna (bolag/inköpare) förvaltas i sina tabeller — lägg till/
  // ta bort påverkar BARA listan, aldrig objekt som redan har värdet satt.
  // Ärlig sparning: 0 träffade rader visas som fel.
  const laggTillIVallista = async (tabell: string, namn: string) => {
    const { data, error: err } = await supabase.from(tabell).insert({ namn }).select('id')
    if (err || !data || data.length === 0) {
      setSaveError(`Kunde inte spara "${namn}" i listan — den försvinner vid omladdning`)
      setTimeout(() => setSaveError(''), 6000)
    }
  }
  const taBortUrVallista = async (tabell: string, namn: string, setLista: any) => {
    const { data, error: err } = await supabase.from(tabell).delete().eq('namn', namn).select('id')
    if (err || !data || data.length === 0) {
      setSaveError(`Kunde inte ta bort "${namn}" ur listan`)
      setTimeout(() => setSaveError(''), 6000)
      return
    }
    setLista((prev: string[]) => prev.filter(v => v !== namn))
  }
  const listAtgarder = {
    onAddBolag: (n: string) => laggTillIVallista('bolag', n),
    onRemoveBolag: (n: string) => taBortUrVallista('bolag', n, setBolag),
    onAddInkopare: (n: string) => laggTillIVallista('inkopare', n),
    onRemoveInkopare: (n: string) => taBortUrVallista('inkopare', n, setInkopare),
  }

  // Aktiva forwarders för inline-väljaren — aktiv_till IS NULL + bekräftad.
  useEffect(() => {
    let av = false
    ;(async () => {
      const { data } = await supabase
        .from('dim_maskin')
        .select('maskin_id, visningsnamn, modell, maskin_typ, aktiv_till, bekraftad')
        .is('aktiv_till', null).eq('bekraftad', true)
      if (av) return
      const sk = (data || [])
        .filter((m: any) => { const t = (m.maskin_typ || '').toLowerCase(); return t.includes('forward') || t.includes('skot') })
        .map((m: any) => ({ id: m.maskin_id, namn: (m.visningsnamn && String(m.visningsnamn).trim()) || m.modell || m.maskin_id }))
      setAktivaSkotare(sk)
    })()
    return () => { av = true }
  }, [])

  // Generisk inline-patch av dim_objekt-fält direkt från listan (utan att öppna
  // objektet), över hela VO-gruppen. Verifierad save: läser tillbaka VÄRDET på
  // varje patchat fält (inte bara radantal) — samma ärlighet som #222/#475.
  const patchGrupp = async (ids: string[], patch: Record<string, any>) => {
    const kolumner = ['objekt_id', ...Object.keys(patch)].join(',')
    const { data, error } = await supabase
      .from('dim_objekt').update(patch).in('objekt_id', ids).select(kolumner)
    if (error) { setSaveError('Kunde inte spara: ' + error.message); setTimeout(() => setSaveError(''), 6000); return }
    const rader = (data || []) as any[]
    const lika = (a: any, b: any) => (a ?? null) === (b ?? null)
    if (rader.length !== ids.length || rader.some(r => Object.keys(patch).some(k => !lika(r[k], patch[k])))) {
      setSaveError('Ändringen landade inte — ladda om och försök igen'); setTimeout(() => setSaveError(''), 6000); return
    }
    setObjekt(prev => prev.map(o => ids.includes(o.objekt_id) ? { ...o, ...patch } : o))
  }
  const tilldelaSkotareInline = (ids: string[], mid: string | null) => patchGrupp(ids, { tilldelad_skotare: mid })

  const openObjekt = (obj: any) => setRedigerObj(obj)

  // Deep-link: ?objekt=<objekt_id> öppnar editorn direkt (Mot ackord-detaljvyns
  // "Öppna i redigering"-knapp). Körs en gång när objektlistan laddats.
  const djupLankKord = useRef(false)
  useEffect(() => {
    if (djupLankKord.current || objekt.length === 0) return
    const vill = sokParams.get('objekt')
    if (!vill) { djupLankKord.current = true; return }
    djupLankKord.current = true
    const traff = objekt.find((o: any) => o.objekt_id === vill)
    if (traff) setRedigerObj(traff)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objekt])

  // Hämta från Supabase vid start
  useEffect(() => {
    Promise.all([
      hamtaObjektFranSupabase(),
      hamtaMaskinerFranSupabase(),
      supabase.from('hpr_filer').select('objekt_nyckel, filnamn, stammar_count'),
    ])
      .then(async ([objektData, maskinData, hprRes]) => {
        // Skapa lookup-objekt för maskiner: { maskin_id: modell }
        const maskinLookup: Record<string, string> = {}
        const maskinTypMap: Record<string, string | null> = {}
        maskinData.forEach(m => {
          maskinLookup[m.maskin_id] = (m.visningsnamn && String(m.visningsnamn).trim()) || m.modell
          maskinTypMap[m.maskin_id] = m.maskin_typ || null
        })
        // Berika varje objekt med maskin_typ så getWarnings + UI kan läsa direkt
        const berikade = (objektData || []).map(o => ({ ...o, maskin_typ: maskinTypMap[o.maskin_id] || null }))
        setObjekt(berikade)
        setMaskiner(maskinLookup)
        setMaskinTyper(maskinTypMap)
        // Ärligt läge: kan hpr_filer inte läsas ska larmsektionen säga det,
        // inte se ut som "inga okopplade jobb"
        if (hprRes.error) { setHprStatus('fel'); setHprFiler([]) }
        else { setHprStatus('ok'); setHprFiler(hprRes.data || []) }
        // Val-listorna bor i bolag/inkopare-tabellerna (persistent förvaltning:
        // Hantera-läget kan ta bort, nya chips läggs till). Tomma tabeller
        // seedas EN gång från standard + unika värden i datan. Kan tabellen
        // inte läsas faller vi tillbaka på härledd lista (utan Hantera-persistens).
        const [bolagRes, inkRes] = await Promise.all([
          supabase.from('bolag').select('namn'),
          supabase.from('inkopare').select('namn'),
        ])
        const unikaBolag = [...new Set(objektData.map((o: any) => o.bolag).filter(Boolean))] as string[]
        const unikaInkopare = Array.from(new Set(objektData.map((o: any) => o.inkopare).filter(Boolean))) as string[]
        let bolagLista: string[]
        if (!bolagRes.error) {
          bolagLista = (bolagRes.data || []).map((r: any) => r.namn).filter(Boolean)
          if (bolagLista.length === 0) {
            const seed = Array.from(new Set(STANDARD_BOLAG.concat(unikaBolag)))
            await supabase.from('bolag').insert(seed.map(namn => ({ namn })))
            bolagLista = seed
          }
        } else {
          bolagLista = Array.from(new Set(STANDARD_BOLAG.concat(unikaBolag)))
        }
        setBolag(bolagLista.sort())
        let inkopareLista: string[]
        if (!inkRes.error) {
          inkopareLista = (inkRes.data || []).map((r: any) => r.namn).filter(Boolean)
          if (inkopareLista.length === 0 && unikaInkopare.length > 0) {
            await supabase.from('inkopare').insert(unikaInkopare.map(namn => ({ namn })))
            inkopareLista = unikaInkopare
          }
        } else {
          inkopareLista = unikaInkopare
        }
        setInkopare(inkopareLista.sort())
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setError('Kunde inte ansluta till databasen')
        setLoading(false)
      })
  }, [])

  // Listorna arbetar per VO-GRUPP — ett fysiskt objekt = ett kort
  const allaGrupper = grupperaPerVo(objekt)
  const aktivaGrupper = allaGrupper.filter(g => g.rader.some((o: any) => o.exkludera !== true))
  const exkluderadeGrupper = allaGrupper.filter(g => g.rader.every((o: any) => o.exkludera === true))

  const gruppSenaste = (g: any) => g.rader.reduce((max: string, o: any) => {
    const d = kortInfo[o.objekt_id]?.senasteAktivitet || ''
    return d > max ? d : max
  }, '')
  const gruppKortInfo = (g: any) => ({
    senasteAktivitet: gruppSenaste(g) || null,
    skordatM3: g.rader.reduce((s: number, o: any) => s + (kortInfo[o.objekt_id]?.skordatM3 || 0), 0),
    skotatM3: g.rader.reduce((s: number, o: any) => s + (kortInfo[o.objekt_id]?.skotatM3 || 0), 0),
  })

  // Berikningsinfo per objekt_id (från useMatchning — kan saknas medan den laddar)
  const kortInfo: Record<string, any> = {}
  ;[...matchning.omatchadeMaskin, ...matchning.matchade.map(p => p.maskin)]
    .forEach(k => { kortInfo[k.objektId] = k })

  // PÅGÅENDE — det som körs just nu, färskast datadatum överst så det
  // Martin jobbar med idag ligger först. Grupper utan data hamnar sist.
  const pagaende = aktivaGrupper
    .filter(arPagaende)
    .sort((a, b) => (gruppSenasteData(b, fildata) || '').localeCompare(gruppSenasteData(a, fildata) || ''))

  // Ignorera = exkludera HELA VO-gruppen (annars ligger syskonraden kvar i
  // listan). Ärlig sparning enligt #222-mönstret: räkna rader OCH läs
  // tillbaka värdet.
  async function ignoreraGrupp(g: any) {
    setSaveError('')
    const ids = g.rader.map((o: any) => o.objekt_id)
    const { data, error: err } = await supabase
      .from('dim_objekt')
      .update({ exkludera: true })
      .in('objekt_id', ids)
      .select('objekt_id, exkludera')
    if (err || !data || data.length !== ids.length || (data as any[]).some(r => r.exkludera !== true)) {
      setSaveError('Kunde inte ignorera — inget eller bara delvis sparat')
      setTimeout(() => setSaveError(''), 6000)
      return
    }
    setObjekt(objekt.map(o => ids.includes(o.objekt_id) ? { ...o, exkludera: true } : o))
  }

  // Okopplade jobb räknas mot AKTUELL objektlista — när ett objekt skapas
  // med jobbets VO försvinner larmet av sig självt (samma vo-koppling som
  // resten av systemet använder)
  const okopplade = analyseraOkopplade(hprFiler, objekt)

  // Skapa objekt från ett okopplat maskinjobb: namn + VO förifyllda, sedan
  // rakt in i sheetens "Måste fyllas i". objekt_id = VO (maskinens
  // objektnummer) — samma id som importen använder när MOM-flödet så
  // småningom skriver raden, så de mergar istället för att dubblera.
  // Ärlig sparning: insert utan returnerad rad = fel, aldrig tyst succé.
  async function skapaObjektFranJobb() {
    if (!skapaJobb || skapar) return
    setSkapar(true)
    setSaveError('')
    const rad = {
      objekt_id: skapaJobb.vo,
      vo_nummer: skapaJobb.vo,
      object_name: skapaJobb.namn || null,
      maskin_id: skapaJobb.maskinId,
    }
    const { data, error: err } = await supabase.from('dim_objekt').insert(rad).select('*')
    if (err || !data || data.length === 0) {
      setSaveError('Kunde inte skapa objektet — inget sparades')
      setTimeout(() => setSaveError(''), 6000)
    } else {
      const ny = { ...data[0], maskin_typ: maskinTyper[skapaJobb.maskinId] || null }
      setObjekt((prev: any[]) => [...prev, ny])
      setSkapaJobb(null)
      setRedigerObj(ny)
    }
    setSkapar(false)
  }

  // Godkänn ett avslutsförslag (massverkan från kortet, via ConfirmDialog).
  // ALDRIG autoskriv — detta körs bara på Martins tryck + bekräftelse.
  // Direktskrivning till maskinslagets rader i gruppen, källmärkt auto=true,
  // med #222-värdeverifiering. Speglas i lokal state.
  async function godkannAvslut() {
    if (!avslutVal || avslutar) return
    const { g, forslag } = avslutVal
    setAvslutar(true)
    setSaveError('')
    const ids = raderForMaskinslag(g.rader, forslag.maskinTyp, g.rep.objekt_id)
    const patch = { [forslag.field]: forslag.datum, [forslag.autoField]: true }
    const r = await direktPatchDimObjekt(ids, patch)
    if (r.ok) {
      setObjekt((prev: any[]) => prev.map((o: any) => ids.includes(o.objekt_id) ? { ...o, ...patch } : o))
      setAvslutVal(null)
    } else {
      setSaveError(r.message || 'Kunde inte markera avslutad')
      setTimeout(() => setSaveError(''), 6000)
    }
    setAvslutar(false)
  }

  // Koppla maskinjobbet till ett BEFINTLIGT objekt: ny syskonrad i målets
  // VO-grupp med objekt_id = maskinens jobbnummer (så framtida import mergar
  // dit) och målets vo_nummer + gemensamma fält (multi-rad-modellens
  // invariant: gemensamt är lika över gruppen). Filerna syns därefter i
  // objektets Filer-undersida via VO-grupp-mergen. Ärlig sparning.
  async function kopplaJobbTillBefintligt() {
    if (!kopplaVal || kopplar) return
    setKopplar(true)
    setSaveError('')
    const { jobb, kandidat } = kopplaVal
    const ny = await kopplaJobbKarna(jobb, kandidat.objekt)
    if (ny) {
      setKopplaVal(null)
      setOppetKopplaJobb(null)
      setRedigerObj(ny) // öppna gruppen — Filer-undersidan visar nu jobbets filer
    }
    setKopplar(false)
  }

  // Själva kopplingen (delas av larmraden och Behöver dig-arket). null = inget sparades (felet visas).
  async function kopplaJobbKarna(jobb: any, mal: any): Promise<any | null> {
    const rad = {
      objekt_id: jobb.vo,
      vo_nummer: mal.vo_nummer,
      object_name: mal.object_name,
      maskin_id: jobb.maskinId,
      skogsagare: mal.skogsagare ?? null,
      bolag: mal.bolag ?? null,
      inkopare: mal.inkopare ?? null,
      huvudtyp: mal.huvudtyp ?? null,
      atgard: mal.atgard ?? null,
      grot_anpassad: mal.grot_anpassad === true,
      timpeng: mal.timpeng === true,
      exkludera: mal.exkludera === true,
    }
    const { data, error: err } = await supabase.from('dim_objekt').insert(rad).select('*')
    if (err || !data || data.length === 0) {
      setSaveError('Kunde inte koppla — inget sparades')
      setTimeout(() => setSaveError(''), 6000)
      return null
    }
    const ny = { ...data[0], maskin_typ: maskinTyper[jobb.maskinId] || null }
    setObjekt((prev: any[]) => [...prev, ny])
    return ny
  }

  // BEHÖVER DIG — det enda vyn frågar om (lib/redigering/behoverDig.ts). Fältsvar sparas över hela VO-gruppen
  // via sparaFalt (dim + objekt-spegeln, värdet läses tillbaka), samma väg som objektets ark.
  const behoverGrupper: BehoverGrupp[] = aktivaGrupper.map(g => {
    const varningar = gruppVarningar(g.rader, volymForGrupp(objekt, kortInfo, g.rep)).map((w: any) => ({ key: w.key, text: w.text }))
    if (!g.rep.object_name) varningar.unshift({ key: 'namn', text: 'Objektet saknar namn' })
    return { nyckel: g.nyckel, rep: g.rep, ids: g.rader.map((r: any) => r.objekt_id), varningar }
  })
  const filDelning = filerUO.status === 'ok'
    ? delaFilJobb(okopplatJobb(filerUO.data.filer, filerUO.data.objekt, filerUO.data.alias), filerUO.data.ignorerade, new Date())
    : { aktuella: [] as OkopplatJobb[], tysta: 0 }
  const filByten = filerUO.status === 'ok' ? nummerbyten(filerUO.data.alias, filerUO.data.objekt).length : 0
  // Maskinobjekt utan trakt (ersätter vyn Matchning, lib/redigering/maskinobjektUtanTrakt.ts): kört de senaste 30
  // dagarna = en fråga här; äldre ligger tyst under "Äldre maskinfiler". Kräver extra numren lästa — annars kan en
  // kopplad trakt (Mölleryd) se okopplad ut, och då frågar vi hellre inte alls.
  const moDelning = filerUO.status === 'ok' && matchning.status === 'ok'
    ? delaMaskinobjekt(
        matchning.omatchadeMaskin as MaskinobjektRad[],
        filerUO.data.alias,
        new Set(okopplatJobb(filerUO.data.filer, filerUO.data.objekt, filerUO.data.alias).map(j => String(j.ident ?? '').trim()).filter(Boolean)),
        new Date(),
      )
    : { aktuella: [] as MaskinobjektRad[], tysta: [] as MaskinobjektRad[] }
  const moSomFraga = (m: MaskinobjektRad): FilJobb & { _mo: MaskinobjektRad } => ({
    nyckel: `mo:${m.objektId}`, namn: m.namn, vo: String(m.voNummer ?? ''), stammar: 0, datum: m.senasteAktivitet,
    maskinNamn: maskinText(m), mangd: mangdText(m), slag: 'maskinobjekt',
    kandidater: filerUO.status === 'ok'
      ? kandidaterFor({ namn: m.namn }, filerUO.data.objekt).map(o => ({ objekt_id: o.id, vo_nummer: o.vo_nummer, object_name: o.namn }))
      : [],
    _mo: m,
  })
  const saker = byggSaker({
    grupper: behoverGrupper,
    alla: objekt,
    bolagVal: bolag,
    filJobb: ([] as FilJobb[]).concat(filDelning.aktuella.map((j: OkopplatJobb) => ({
      nyckel: j.nyckel ?? j.filnamn, namn: j.namn, vo: j.ident ?? '', stammar: j.stammar, datum: j.datum,
      maskinNamn: (j.maskin && maskiner[j.maskin]) || j.maskin || 'Maskin',
      kandidater: kandidaterFor(j, filerUO.data.objekt).map(o => ({ objekt_id: o.id, vo_nummer: o.vo_nummer, object_name: o.namn })),
      _jobb: j,
    } as FilJobb & { _jobb: OkopplatJobb })), moDelning.aktuella.map(moSomFraga)),
  })

  async function sparaSvar(sak: Extract<Sak, { typ: 'falt' }>, varde: string): Promise<boolean> {
    const patch = patchForSvar(sak.falt, varde)
    const res = await sparaFalt({ dimObjektIds: sak.grupp.ids, voNummer: String(sak.grupp.rep.vo_nummer ?? '').trim() }, patch)
    if (!res.ok) { setSaveError(res.message || 'Kunde inte spara'); setTimeout(() => setSaveError(''), 6000); return false }
    setObjekt((prev: any[]) => prev.map((o: any) => sak.grupp.ids.includes(o.objekt_id) ? { ...o, ...patch } : o))
    return true
  }
  // Koppla = filens nummer blir ett extra nummer på objektet (samma som importen gör vid namnträff). Räknas som gjort
  // först när filen är borta ur listan vid omläsning.
  async function kopplaSvar(jobb: FilJobb, kandidat: { objekt_id: string }): Promise<boolean> {
    const mo: MaskinobjektRad | undefined = (jobb as any)._mo
    if (mo) {
      // Maskinobjektets nummer blir ett extra nummer på trakten — objekt.dim_objekt_id rörs aldrig (den kan bara peka på
      // ett maskinobjekt, och en trakt har ofta två: skördarens och skotarens). Gjort först när numret finns vid omläsning.
      const rad = altNummerForMaskinobjekt(mo, kandidat.objekt_id)
      if (!rad) return false
      const { data: skrivet, error } = await supabase.from('objekt_alt_nummer').insert(rad).select('id')
      if (error || !skrivet || skrivet.length === 0) return false
      const ny = await filerUO.ladda()
      matchning.uppdatera()
      return !!ny && ny.alias.some(a => String(a.nummer).trim() === rad.nummer && !a.maskin_id)
    }
    const j: OkopplatJobb | undefined = (jobb as any)._jobb
    const rad = j ? altNummerAttSkriva(j, kandidat.objekt_id) : null
    if (!j || !rad) return false
    const { data: skrivet, error } = await supabase.from('objekt_alt_nummer').insert(rad).select('id')
    if (error || !skrivet || skrivet.length === 0) return false
    const ny = await filerUO.ladda()
    return !!ny && !okopplatJobb(ny.filer, ny.objekt, ny.alias).some(x => (x.nyckel ?? x.filnamn) === (j.nyckel ?? j.filnamn))
  }
  async function ignoreraSvar(jobb: FilJobb): Promise<boolean> {
    const mo: MaskinobjektRad | undefined = (jobb as any)._mo
    if (mo) {
      // Inget jobb för oss: döljs i listor och statistik (samma flagga som Ta bort objektet, går att ångra under Exkluderade).
      const { data, error } = await supabase.from('dim_objekt').update({ exkludera: true }).eq('objekt_id', mo.objektId).select('objekt_id')
      if (error || !data || data.length === 0) return false
      matchning.uppdatera()
      return true
    }
    const j: OkopplatJobb | undefined = (jobb as any)._jobb
    if (!j) return false
    const { data: skrivet, error } = await supabase.from('hpr_ignorerad').insert({ nyckel: ignoreradNyckel(j) }).select('nyckel')
    if (error || !skrivet || skrivet.length === 0) return false
    const ny = await filerUO.ladda()
    return !!ny && ny.ignorerade.has(ignoreradNyckel(j))
  }

  // En grupp som listan vill ha den (lib/redigering/listaVy.ts).
  function tillListGrupp(g: any): ListGrupp {
    const v = volymForGrupp(objekt, kortInfo, g.rep)
    return {
      nyckel: g.nyckel,
      namn: g.rep.object_name ?? null,
      vo: g.rep.vo_nummer ? String(g.rep.vo_nummer).trim() : null,
      typ: g.rep.huvudtyp ?? null,
      bolag: g.rep.bolag ?? null,
      skogsagare: g.rep.skogsagare ?? null,
      special: g.rader.some((o: any) => o.special === true),
      pagaende: arPagaende(g),
      skordningKlar: g.rader.some((o: any) => !!o.skordning_avslutad) || skordareForvantasEj(g.rader) !== null,
      skordningAvslutad: g.rader.map((o: any) => o.skordning_avslutad).filter(Boolean).sort().pop() ?? null,
      skotningAvslutad: g.rader.map((o: any) => o.skotning_avslutad).filter(Boolean).sort().pop() ?? null,
      skordat: v.skordat,
      skotat: v.skotat,
      senasteData: gruppSenasteData(g, fildata),
      avslutForslag: avslutsForslag(g, fildata).length > 0,
    }
  }

  // Läser
  if (loading) {
    return (
      <div style={{ ...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...TYP.text, color: FARG.text2 }}>Läser objekten …</div>
      </div>
    )
  }

  // Gick inte att läsa
  if (error) {
    return (
      <div style={{ ...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ ...TYP.rubrik, marginBottom: AVSTAND.s }}>Objekten kunde inte läsas</div>
          <div style={{ ...TYP.text, color: FARG.text2, marginBottom: AVSTAND.xl }}>Kontrollera nätet och försök igen.</div>
          <button type="button" onClick={() => window.location.reload()} style={{ ...KNAPP.primar }}>Försök igen</button>
        </div>
      </div>
    )
  }


  return (
    <div style={styles.container} className="red-rot" data-ark-oppet={redigerObj ? '' : undefined}>
      <style>{GLOBAL_CSS}</style>

      {/* BEHÖVER DIG — svaret först (markägarrapportens form), en rad per sak med appens förslag, och arket som tar
          en sak i taget. Ersätter rubriken "N att åtgärda", larmrutan för maskinjobb utan objekt och listan Att åtgärda. */}
      <div className="red-kolumn">
      {filerUO.status === 'fel' && (
        <p role="alert" style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.meta, color: FARG.rod }}>
          Kunde inte läsa maskinfilerna, så filer utan objekt kan inte visas. Ladda om sidan.
        </p>
      )}
      <BehoverDig
        saker={saker}
        antalObjekt={aktivaGrupper.length}
        onSparaFalt={sparaSvar}
        onKoppla={kopplaSvar}
        onIgnorera={ignoreraSvar}
        sokObjekt={(q: string) => sokPlanObjekt(filerUO.data.objekt, q).map(o => ({ objekt_id: o.id, vo_nummer: o.vo_nummer, object_name: o.namn }))}
        onOppnaObjekt={(g: BehoverGrupp) => openObjekt(g.rep)}
      />

      {/* OBJEKTEN — sök och typ, Pågår, Skotning kvar, senaste månaden, Tidigare per månad, Matchning och Exkluderade
          (lib/redigering/listaVy.ts). Ett tryck öppnar objektets ark. */}
      <ObjektLista
        grupper={aktivaGrupper.map(tillListGrupp)}
        exkluderade={exkluderadeGrupper.map(tillListGrupp)}
        onOppna={(nyckel: string) => { const g = allaGrupper.find(x => x.nyckel === nyckel); if (g) openObjekt(g.rep) }}
        aldreFiler={filDelning.tysta + filByten + moDelning.tysta.length > 0 ? { antal: filDelning.tysta, byten: filByten, maskinobjekt: moDelning.tysta.length } : null}
        onAldreFiler={() => setVisaGamlaFiler(true)}
      />
      {visaGamlaFiler && (
        <Ark rubrik="Äldre maskinfiler" stang="Klar" onStang={() => { setVisaGamlaFiler(false); void filerUO.ladda() }}>
          <p style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.text, color: FARG.text2 }}>
            Filer från jobb som är klara i skogen och aldrig kopplades till ett objekt. Inget behöver göras – koppla eller ignorera om du vill.
          </p>
          {filDelning.tysta + filByten > 0 && <OkopplFilerKort maskiner={maskiner} startOppen />}
          {moDelning.tysta.length > 0 && (
            <Sektion rubrik="Maskinobjekt utan trakt" kort={false}
              not="Maskinens objekt som aldrig knöts till en trakt. Nästan alla är avslutade jobb från innan planeringen fanns.">
              {moDelning.tysta.map((m, i) => (
                <Rad key={m.objektId} titel={(m.namn ?? '').trim() || (m.voNummer ? `VO ${m.voNummer}` : 'Namnlöst')}
                  under={[maskinText(m), m.senasteAktivitet ? `senast ${m.senasteAktivitet}` : null, mangdText(m)].filter(Boolean).join(' · ')}
                  attr={{ 'data-aldre-mo': m.objektId }} sista={i === moDelning.tysta.length - 1}
                  onTryck={() => setAldreMo(m)} />
              ))}
            </Sektion>
          )}
        </Ark>
      )}
      {aldreMo && (
        <EnFragaArk
          sak={{ typ: 'fil', nyckel: `mo:${aldreMo.objektId}`, jobb: moSomFraga(aldreMo), namn: aldreMo.namn || `VO ${aldreMo.voNummer}`, under: [maskinText(aldreMo), mangdText(aldreMo)].filter(Boolean).join(' · ') }}
          onStang={() => setAldreMo(null)}
          onKoppla={kopplaSvar} onIgnorera={ignoreraSvar}
          sokObjekt={(q: string) => sokPlanObjekt(filerUO.data.objekt, q).map(o => ({ objekt_id: o.id, vo_nummer: o.vo_nummer, object_name: o.namn }))}
        />
      )}

      </div>

      <ObjektEditor
        obj={redigerObj}
        objekt={objekt}
        setObjekt={setObjekt}
        bolag={bolag} setBolag={setBolag}
        inkopare={inkopare} setInkopare={setInkopare}
        atgarderSlut={atgarderSlut} setAtgarderSlut={setAtgarderSlut}
        atgarderGallring={atgarderGallring} setAtgarderGallring={setAtgarderGallring}
        kortInfo={kortInfo}
        fildata={fildata}
        listAtgarder={listAtgarder}
        onClose={() => setRedigerObj(null)}
      />
      <ConfirmDialog
        open={!!kopplaVal}
        title="Koppla till befintligt objekt?"
        message={kopplaVal ? `"${kopplaVal.jobb.namn || 'Namnlöst jobb'}" (VO ${kopplaVal.jobb.vo}, ${kopplaVal.jobb.stammar.toLocaleString('sv-SE')} stammar) kopplas till "${kopplaVal.kandidat.objekt.object_name}" (VO ${kopplaVal.kandidat.objekt.vo_nummer}). Maskindatans filer hamnar under objektets Filer.` : ''}
        confirmLabel={kopplar ? 'Kopplar …' : 'Koppla'}
        cancelLabel="Avbryt"
        onConfirm={kopplaJobbTillBefintligt}
        onCancel={() => setKopplaVal(null)}
      />
      <ConfirmDialog
        open={!!skapaJobb}
        title="Skapa objekt från maskindata?"
        message={skapaJobb ? `${skapaJobb.namn || 'Namnlöst jobb'} · VO ${skapaJobb.vo} — objektet skapas med namn och VO förifyllt, resten fyller du i direkt.` : ''}
        confirmLabel={skapar ? 'Skapar …' : 'Skapa objekt'}
        cancelLabel="Avbryt"
        onConfirm={skapaObjektFranJobb}
        onCancel={() => setSkapaJobb(null)}
      />
      <ConfirmDialog
        open={!!avslutVal}
        title="Markera avslutad?"
        message={avslutVal ? `${capFirst(avslutVal.forslag.label)} för "${avslutVal.g.rep.object_name || avslutVal.g.rep.vo_nummer}" markeras avslutad ${fmtKortDatum(avslutVal.forslag.datum)} — ${avslutVal.forslag.kalla === 'maskindata' ? 'datum ur maskindata' : `ingen data på ${avslutVal.forslag.dagar} dagar`}. Sätts som auto-bekräftat och går att ändra i sheeten.` : ''}
        confirmLabel={avslutar ? 'Sparar …' : 'Markera avslutad'}
        cancelLabel="Avbryt"
        onConfirm={godkannAvslut}
        onCancel={() => setAvslutVal(null)}
      />
      {saveError && (
        <div style={styles.saveErrorToast} role="alert">{saveError}</div>
      )}
    </div>
  )
}


const styles: Record<string, CSSProperties> = {
  container: { position: 'fixed', top: underTopbar(), left: 0, right: 0, bottom: 0, background: FARG.bg, fontFamily: FONT, color: FARG.text, padding: `${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl * 3}px`, WebkitFontSmoothing: 'antialiased', overflowY: 'auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerCenter: { textAlign: 'center', flex: 1 },
  backBtn: { width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 24, cursor: 'pointer', transition: 'all 0.2s ease' },
  titel: { fontSize: 32, fontWeight: 700 },
  subtitel: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  sectionTitel: { fontSize: 18, fontWeight: 600, flex: 1 },
  sectionCount: { fontSize: 14, fontWeight: 600, color: '#FF9F0A', background: 'rgba(255,159,10,0.15)', padding: '4px 12px', borderRadius: 12 },
  // Listfilter-piller (Att åtgärda / Pågående)
  filterToggleBar: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' },
  filterToggleBtn: { minHeight: 40, padding: '0 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s ease' },
  filterToggleBtnActive: { background: 'rgba(173,198,255,0.12)', borderColor: 'rgba(173,198,255,0.35)', color: '#adc6ff' },
  subsectionLabel: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.2px', marginTop: 20, marginBottom: 10 },
  validationWarning: { margin: '12px 16px 4px', padding: '10px 14px', borderRadius: 12, background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.25)', color: 'rgba(255,200,120,0.95)', fontSize: 13, lineHeight: 1.4 },
  saveErrorToast: { position: 'fixed', bottom: AVSTAND.xxl * 4, left: '50%', transform: 'translateX(-50%)', background: FARG.upphojt, color: FARG.rod, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.knapp, ...TYP.meta, fontFamily: 'inherit', zIndex: 250, animation: `fadeIn ${RORELSE.byte}ms ease`, maxWidth: '90%', textAlign: 'center' },
  iosGroupWrap: { marginBottom: 24 },
  iosGroupTitle: { fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.2px', padding: '0 4px', marginBottom: 8 },
  iosGroupCard: { background: '#1c1c1e', borderRadius: 14, overflow: 'hidden' },
  iosDivider: { height: 0.5, background: 'rgba(255,255,255,0.08)', marginLeft: 16 },
  chipInputBoxEmbedded: { padding: '14px 16px 16px' },
  // Rad i "Måste fyllas i"/"Mer om objektet" — iOS Settings-stil
  kravRad: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', minHeight: 56, cursor: 'pointer', transition: 'background 0.15s ease' },
  kravVarde: { fontSize: 15, color: 'rgba(255,255,255,0.55)', textAlign: 'right', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  kravValj: { fontSize: 15, fontWeight: 600, color: '#FF9F0A', flexShrink: 0 },
  navSummary: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'right', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  navSummaryWarn: { color: '#FF9F0A', fontWeight: 600 },
  navPil: { fontSize: 20, color: 'rgba(255,255,255,0.25)', flexShrink: 0, lineHeight: 1 },
  // ✕/‹ i sheetens header
  sheetNavBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 18, border: 'none', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: 16, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0, padding: 0 },
  // "Klar" på undersidor — går bara tillbaka, sparar inget (Spara bor på översikten)
  klarBtn: { width: '100%', padding: '18px', borderRadius: 16, border: '1px solid rgba(173,198,255,0.4)', background: 'rgba(173,198,255,0.12)', color: '#adc6ff', fontSize: 17, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  kostnadRad: { margin: '-14px 4px 24px', fontSize: 13, color: 'rgba(255,255,255,0.65)', fontVariantNumeric: 'tabular-nums' },
  // Larm: maskindata utan objekt — orange vänsterkant, överst i listan
  larmBox: { borderLeft: '3px solid #FF9F0A', border: '1px solid rgba(255,159,10,0.2)', background: 'rgba(255,159,10,0.05)', borderRadius: 14, marginBottom: 16, overflow: 'hidden' },
  larmHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', fontSize: 14, fontWeight: 600, color: 'rgba(255,200,120,0.95)' },
  larmIkon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 10, background: 'rgba(255,159,10,0.2)', color: '#FF9F0A', fontSize: 13, fontWeight: 700, flexShrink: 0 },
  larmRad: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' },
  skapaBtn: { flexShrink: 0, minHeight: 44, padding: '0 16px', borderRadius: 12, border: '1px solid rgba(173,198,255,0.4)', background: 'rgba(173,198,255,0.12)', color: '#adc6ff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  // Avslutsförslag på Pågående-kortet: godkänn med en tapp (ConfirmDialog i föräldern)
  forslagBtn: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '8px 14px', borderRadius: 12, border: '1px solid rgba(48,209,88,0.35)', background: 'rgba(48,209,88,0.10)', color: '#8ee6a4', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  forslagKalla: { flexShrink: 0, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.4)' },
  // Kandidatlista under larmrad — koppla till befintligt objekt
  kandidatLista: { padding: '10px 16px 14px', borderTop: '1px solid rgba(255,159,10,0.12)', background: 'rgba(0,0,0,0.15)' },
  kandidatRubrik: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2px', marginBottom: 8 },
  kandidatRad: { display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', minHeight: 48, padding: '8px 12px', marginBottom: 6, borderRadius: 12, border: '1px solid rgba(173,198,255,0.25)', background: 'rgba(173,198,255,0.07)', color: '#fff', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' },
  kandidatSkapaNytt: { display: 'block', width: '100%', minHeight: 40, padding: '8px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.45)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' },
  // Småjobb utan VO (k-nummer) — nedtonat, inget larm, ingen åtgärd
  smajobbWrap: { marginBottom: 20, fontSize: 13, color: 'rgba(255,255,255,0.45)' },
  smajobbToggle: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 40, padding: '8px 4px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.45)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' },
  smajobbRad: { display: 'flex', alignItems: 'baseline', gap: 10, padding: '6px 4px 6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  // Direkt-redigerbart fält i iOS Settings-stil: label vänster, input höger
  directRowStandalone: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', minHeight: 56, gap: 14, marginBottom: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, transition: 'border-color 0.18s ease' },
  directRowEmbedded: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', minHeight: 56, gap: 14, transition: 'background 0.18s ease' },
  directRowLabel: { fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.85)', flexShrink: 0 },
  directRowInput: { background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 17, fontFamily: 'inherit', textAlign: 'right', flex: 1, minWidth: 0, padding: 0, WebkitAppearance: 'none' },
  machineEndInfo: { marginTop: 12, padding: '14px 16px', borderRadius: 14, background: 'rgba(173,198,255,0.06)', border: '1px solid rgba(173,198,255,0.2)' },
  machineEndLabel: { fontSize: 11, fontWeight: 600, color: 'rgba(173,198,255,0.7)', letterSpacing: '0.2px', marginBottom: 4 },
  machineEndValue: { fontSize: 15, fontWeight: 500, color: '#fff', fontVariantNumeric: 'tabular-nums', marginBottom: 12 },
  machineEndFixBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 56, padding: '0 18px', borderRadius: 12, border: '1px solid rgba(173,198,255,0.35)', background: 'rgba(173,198,255,0.12)', color: '#adc6ff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', width: '100%', boxSizing: 'border-box' },
  machineEndDone: { fontSize: 13, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' },
  quickFixBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 56, marginTop: 8, padding: '0 18px', borderRadius: 12, background: 'rgba(255,159,10,0.10)', border: '1px solid rgba(255,159,10,0.30)', color: 'rgba(255,200,120,0.95)', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' },
  quickFixMessage: { marginTop: 8, padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.4 },
  quickFixMessageOk: { background: 'rgba(173,198,255,0.08)', border: '1px solid rgba(173,198,255,0.25)', color: 'rgba(173,198,255,0.95)' },
  quickFixMessageError: { background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.25)', color: 'rgba(255,200,120,0.95)' },
  kortBadges: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 12, color: 'rgba(255,200,120,0.95)' },
  kortBadge: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  kortBadgeMore: { color: 'rgba(255,255,255,0.45)' },
  allaDone: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, color: '#adc6ff', fontSize: 17, fontWeight: 600 },
  allaDoneCheck: { fontSize: 48, marginBottom: 16, filter: 'drop-shadow(0 0 20px rgba(173,198,255,0.5))' },
  lista: { display: 'flex', flexDirection: 'column', gap: 12 },
  kort: { background: 'rgba(255,255,255,0.03)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' },
  kortInner: { padding: '18px 20px' },
  kortTop: { display: 'flex', alignItems: 'center' },
  kortNamn: { fontSize: 17, fontWeight: 600, marginBottom: 4 },
  kortVo: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  kortPil: { fontSize: 24, color: 'rgba(255,255,255,0.2)', marginLeft: 12 },
  kortInfo: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 12 },
  kortMeta: { fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 4 },

  searchFilterPanel: { background: 'rgba(255,255,255,0.03)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.06)', padding: '20px', marginBottom: 24, animation: 'fadeIn 0.3s ease' },
  searchBox: { display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', padding: '14px 18px', marginBottom: 20 },
  searchInput: { flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: 16, outline: 'none' },
  searchClear: { width: 24, height: 24, borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer' },
  filterSection: { marginBottom: 16 },
  filterLabel: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2px', marginBottom: 10 },
  filterChips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  clearFiltersBtn: { width: '100%', padding: '12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginTop: 8 },
  emptyState: { textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)', fontSize: 15 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 },
  sheet: { position: 'fixed', bottom: 0, left: 0, right: 0, background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, zIndex: 101, maxHeight: '92vh', display: 'flex', flexDirection: 'column', fontFamily: FONT, color: FARG.text },
  sheetHandle: { padding: `${AVSTAND.s}px 0 ${AVSTAND.xs}px`, cursor: 'pointer', display: 'flex', justifyContent: 'center' },
  sheetBar: { width: AVSTAND.xxl + AVSTAND.s, height: AVSTAND.xs, borderRadius: AVSTAND.xs, background: FARG.text3 },
  sheetHeader: { padding: `0 ${AVSTAND.s}px ${AVSTAND.s}px`, transition: `border-color ${RORELSE.tryck}ms ease` },
  sheetTitel: { ...TYP.rubrik },
  scrollFade: { position: 'absolute', top: AVSTAND.xxl * 2, left: 0, right: 0, height: AVSTAND.xl, background: `linear-gradient(to bottom, ${FARG.kort}, transparent)`, zIndex: 1, pointerEvents: 'none', transition: `opacity ${RORELSE.tryck}ms ease` },
  sheetContent: { flex: 1, overflowY: 'auto', padding: `${AVSTAND.s}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.xl)}` },
  sheetFooter: { padding: `${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.l)}` },
  saveBtn: { width: '100%', padding: '18px', borderRadius: 16, border: 'none', background: '#adc6ff', color: '#000', fontSize: 17, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease' },
  progressHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' },
  progressText: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  chipInputBox: { marginBottom: 20 },
  chipInputHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  chipInputLabel: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2px' },
  chipSelected: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 14, background: 'rgba(173,198,255,0.15)', border: '1px solid rgba(173,198,255,0.3)', marginBottom: 10, fontSize: 16, fontWeight: 500, color: '#fff' },
  chipClear: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer', padding: 4 },
  chipInput: { width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 10, transition: 'border-color 0.2s ease' },
  chipGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, border: '1px solid', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s ease' },
  chipDelete: { background: 'rgba(255,69,58,0.18)', border: 'none', color: '#FF453A', fontSize: 14, width: 32, height: 32, borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipNew: { padding: '10px 14px', borderRadius: 12, border: '1px dashed rgba(173,198,255,0.4)', background: 'rgba(173,198,255,0.08)', color: '#adc6ff', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s ease' },
  switchList: { display: 'flex', flexDirection: 'column', gap: 8 },
  switchRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 14, border: '1px solid', cursor: 'pointer', transition: 'all 0.2s ease' },
  switchLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  switch: { width: 50, height: 30, borderRadius: 15, padding: 3, transition: 'all 0.2s ease' },
  switchKnob: { width: 24, height: 24, borderRadius: 12, background: '#fff', transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }
}
