"use client"

import { useState, useEffect, useRef, Fragment, Children } from 'react'
import { supabase } from '@/lib/supabase'
import { hamtaRisKandidater, hamtaKopplingar, sparaKopplingar, grotHamtadAutomatik, angraGrotHamtadAutomatik } from '@/lib/grot-koppling'
import { useMatchning } from './hooks/useMatchning'
import { useFildata, filStatus, slaIhopFildata, harExternSkotning } from './hooks/useFildata'
import MatchningsVy from './MatchningsVy'

// Standardval som alltid ska finnas som chips (riktiga bolag) —
// kompletteras med unika värden ur datan vid inläsning.
// Inköpare seedas ENBART ur datan (inga hårdkodade namn).
const STANDARD_BOLAG = ['Vida', 'ATA', 'Privat', 'JGA', 'Rönås', 'Södra']
const HUVUDTYPER = ['Slutavverkning', 'Gallring']

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
`

// Egenskaper per maskinslag — sheeten visar bara det som är relevant för
// objektet (styrt av FAKTISK data via useMatchning, aldrig dim_objekt.maskin_id
// som är opålitlig på delade objekt).
// OBS Klippning hör till SKOTAREN — energiaggregatet sitter på skotaren.
const EGENSKAPER_SKORDARE = [
  { key: 'grot_anpassad', label: 'GROT-anpassad' },
  { key: 'stubbbehandling', label: 'Stubbbehandling' },
]

const EGENSKAPER_SKOTARE = [
  { key: 'risskotning', label: 'Risskotning' },
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
  return data || []
}

async function hamtaMaskinerFranSupabase() {
  const { data, error } = await supabase
    .from('dim_maskin')
    .select('maskin_id, modell, maskin_typ')
  if (error) throw new Error('Kunde inte hämta maskiner: ' + error.message)
  return data || []
}

// Fältklasser för multi-rad-saven. Ett objekt är ibland FLERA dim_objekt-
// rader (skördare + skotare med samma VO, P-VO-flödet) — gemensamma fält
// fylls i EN gång och skrivs till ALLA rader i gruppen; maskinspecifika
// skrivs till respektive maskinslags rader.
const GEMENSAMMA_FALT = ['vo_nummer', 'object_name', 'skogsagare', 'bolag', 'inkopare',
  'huvudtyp', 'atgard', 'grot_anpassad', 'timpeng', 'exkludera',
  'timpeng_undantag_timmar_skordare', 'timpeng_undantag_timmar_skotare',
  'timpeng_undantag_volym', 'timpeng_undantag_dra_skordare', 'timpeng_undantag_dra_skotare']
const SKORDARFALT = ['stubbbehandling', 'skordning_avslutad']
const SKOTARFALT = ['risskotning', 'egen_skotning', 'extra_vagn', 'klippning',
  'skotad_volym_manuell', 'skotning_avslutad', 'ovrigt_info']

// Rader som hör till samma objekt: samma icke-tomma vo_nummer, annars bara
// raden själv. maskin_typ är berikad vid inläsning.
function syskonRader(allaObjekt: any[], obj: any): any[] {
  if (!obj?.vo_nummer) return [obj]
  const grupp = allaObjekt.filter(o => o.vo_nummer === obj.vo_nummer)
  return grupp.length > 0 ? grupp : [obj]
}

// Har VO-gruppen en skotarmaskin som aldrig sänder filer (dim_maskin.
// sander_filer=false, t.ex. JD810E)? Styr grå prick + proaktiv uppräkning.
function gruppSkotareSanderEj(syskon: any[], fildata: any): boolean {
  if (!fildata?.maskinInfo) return false
  return (syskon || []).some((o: any) => {
    const mi = fildata.maskinInfo.get(o.maskin_id)
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
    const vo = o.vo_nummer && String(o.vo_nummer).trim() ? String(o.vo_nummer) : null
    const nyckel = vo || `__rad__${o.objekt_id}`
    const lista = grupper.get(nyckel) || []
    lista.push(o)
    grupper.set(nyckel, lista)
  })
  const poang = (o: any) => ['huvudtyp', 'bolag', 'skogsagare', 'atgard'].filter(f => o[f]).length + (o.object_name ? 10 : 0)
  return Array.from(grupper.entries()).map(([nyckel, lista]) => {
    const rep = lista.reduce((basta: any, o: any) => poang(o) > poang(basta) ? o : basta, lista[0])
    return { nyckel, rep, rader: lista }
  })
}

// Union av varningar över gruppens rader (dedupe per varningstyp) — en
// varning på NÅGON rad gör gruppen åtgärdskrävande
function gruppVarningar(rader: any[], volym: { skordat: number; skotat: number }): any[] {
  const per = new Map<string, any>()
  rader.forEach((o: any) => getWarnings(o, volym).forEach((w: any) => { if (!per.has(w.key)) per.set(w.key, w) }))
  return Array.from(per.values())
}

// Gruppens maskinmodeller för kortet: "Rottne + Wisent 2015"
function gruppModeller(g: any, maskiner: Record<string, any>): string {
  return Array.from(new Set(g.rader.map((o: any) => maskiner[o.maskin_id]).filter(Boolean))).join(' + ')
}

// Boolean-switchar vars VÄRDE läses tillbaka efter save. Radräkning bevisar
// att en rad rördes — inte att switchen faktiskt landade i den. En stale
// klient som utelämnar fältet, ett RLS-partiellt skriv eller en felroutad
// fältklass ger rätt radantal men fel värde: "ser sparad ut men är det inte".
// Just den tysta lögnen ska switchar aldrig kunna bära igen.
const VERIFIERA_BOOL = ['grot_anpassad', 'timpeng', 'exkludera', 'stubbbehandling',
  'risskotning', 'egen_skotning', 'extra_vagn', 'klippning',
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
  for (const f of ['grot_anpassad', 'timpeng', 'exkludera', 'stubbbehandling', 'risskotning', 'egen_skotning', 'extra_vagn', 'klippning']) {
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

  const r1 = await direktPatchDimObjekt(gruppIds, gemensamt)
  if (!r1.ok) return r1
  const r2 = await direktPatchDimObjekt(skordarIds, skordarPatch)
  if (!r2.ok) return { ok: false, message: 'Skördarfälten: ' + r2.message }
  const r3 = await direktPatchDimObjekt(skotarIds, skotarPatch)
  if (!r3.ok) return { ok: false, message: 'Skotarfälten: ' + r3.message }
  return { ok: true, message: '' }
}
// === SLUT SUPABASE ===

function parseExternSkotning(obj) {
  const copy = { ...obj };
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
function looksLikeAutoDate(name) {
  if (!name) return false
  return /^\d+$/.test(String(name).trim())
}

// Vilket avslutsfält som hör till maskintypen
function avslutadFieldFor(maskin_typ) {
  if (maskin_typ === 'Harvester') return { field: 'skordning_avslutad', label: 'skördning' }
  if (maskin_typ === 'Forwarder') return { field: 'skotning_avslutad', label: 'skotning' }
  return null
}

// Antal dagar sedan en ISO-tidsstämpel, eller null om ogiltig
function daysSinceISO(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

// Formatera ISO-tidsstämpel till YYYY-MM-DD (för date-input + display)
function formatYMD(iso) {
  if (!iso) return null
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// Användarvänlig tidsstämpel: "2026-04-27 17:12"
function formatEndDateDisplay(iso) {
  if (!iso) return null
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`
}

// Versaliserar första bokstaven
function capFirst(s) { return s ? s[0].toUpperCase() + s.slice(1) : s }

// Konkreta varningar för fält som behöver fixas (oftast import-fel).
// volym (skördat/skotat över VO-gruppen) är valfri — anropare med kortInfo
// skickar den så luckvarningen "skotning klar men 0 m³" kan räknas.
function getWarnings(obj, volym?: { skordat: number; skotat: number }) {
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
    if (obj.huvudtyp && !obj.atgard) w.push({ key: 'atgard', text: 'Saknar åtgärd', target: 'atgard-section' })
  }
  if (looksLikeAutoDate(obj.object_name)) w.push({ key: 'autoname', text: 'Autogenererat namn', target: 'object_name-section' })
  if (!obj.skogsagare) w.push({ key: 'skogsagare', text: 'Saknar markägare', target: 'skogsagare-section' })
  if (!obj.bolag) w.push({ key: 'bolag', text: 'Saknar bolag', target: 'bolag-section' })

  // Steg J: Maskinen har EndDate i fil men användaren har inte markerat avslutad.
  // Avslutsfälten bor numera i respektive maskinsektion — hoppa till rätt.
  const av = avslutadFieldFor(obj.maskin_typ)
  const avslutTarget = av?.field === 'skordning_avslutad' ? 'avslut-skordare-section' : 'avslut-skotare-section'
  if (av && obj.end_date && !obj[av.field]) {
    w.push({
      key: 'reported_end',
      text: `Maskinen rapporterar ${av.label} avslutad — ej markerad`,
      target: avslutTarget
    })
  }

  // Steg K: 14-dagars-heuristik (plan B när maskinen INTE rapporterat EndDate)
  if (av && !obj.end_date && !obj[av.field]) {
    const days = daysSinceISO(obj.start_date)
    if (days !== null && days >= 14) {
      w.push({
        key: 'maybe_done',
        text: `${capFirst(av.label)} verkar klar (startade för ${days} dagar sedan)`,
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

// TYP-REGEL: risskotning = true ÄR jobbets typ. Typ-tagg och grot-filter
// härleds ALLTID ur flaggan, aldrig ur huvudtyp.
export function arRisjobb(obj: any): boolean {
  return obj?.risskotning === true
}

// Risjobb har ingen huvudtyp — och därmed ingen åtgärd, eftersom åtgärds-
// listan väljs UR huvudtypen (utan huvudtyp finns inget att välja bland).
// Att kräva dem tvingade fram felmärkningar: alla 12 risjobb stod som
// Slutavverkning/Gallring/tom. Krav som inte går att uppfylla är en fälla,
// inte en kvalitetskontroll.
function kravFaltFor(obj: any) {
  return arRisjobb(obj)
    ? KRAV_FALT.filter(f => f.key !== 'huvudtyp' && f.key !== 'atgard')
    : KRAV_FALT
}

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

// Smooth scroll + flash highlight i 0.6s
function scrollAndFlash(targetId) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(targetId)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('flash-highlight')
  setTimeout(() => el.classList.remove('flash-highlight'), 700)
}

// Snabbfix för Object_name — slår mot meta_importerade_filer (FPR-filer
// för objektets maskin_id) och matchar mot dim_objekt.start_date.
// Samma logik som SQL-fixet:
//   date(fil_dag) = date(d.start_date)
//   AND extract(hour from filnamnets klockslag) = extract(hour from d.start_date)
async function hamtaNamnFranFilnamn(obj) {
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

// Mini progress ring
function MiniRing({ progress, size = 32, stroke = 3 }) {
  const radius = (size - stroke) / 2
  const circ = radius * 2 * Math.PI
  const offset = circ - progress * circ
  const color = progress === 1 ? '#adc6ff' : '#FF9F0A'
  
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 8px ${color}50)` }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }} />
    </svg>
  )
}

// Animated Card
function AnimatedCard({ children, delay, onClick }) {
  const [visible, setVisible] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [hover, setHover] = useState(false)
  
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  const handleClick = () => {
    setPressed(true)
    setTimeout(() => {
      setPressed(false)
      onClick()
    }, 150)
  }

  return (
    <div 
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styles.kort,
        opacity: visible ? 1 : 0,
        transform: visible ? (pressed ? 'scale(0.97)' : hover ? 'scale(1.01) translateY(-2px)' : 'translateY(0)') : 'translateY(20px)',
        boxShadow: hover ? '0 8px 30px rgba(0,0,0,0.3)' : 'none',
        borderColor: hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
        transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)'
      }}
    >
      {children}
    </div>
  )
}

// Chip with hover
function Chip({ label, selected, onClick, editMode, onDelete }) {
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

// Filter Chip
function FilterChip({ label, active, onClick }) {
  const [hover, setHover] = useState(false)
  
  return (
    <div 
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '8px 14px',
        borderRadius: 10,
        border: '1px solid',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        background: active ? 'rgba(255,255,255,0.15)' : hover ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
        borderColor: active ? 'rgba(255,255,255,0.3)' : hover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
        color: active ? '#fff' : 'rgba(255,255,255,0.6)',
        transform: hover ? 'scale(1.03)' : 'scale(1)'
      }}
    >
      {label}
      {active && <span style={{ marginLeft: 6, opacity: 0.6 }}>✕</span>}
    </div>
  )
}

// Chip Input
function ChipInput({ label, value, options, setOptions, onChange, embedded = false, onAddOption, onRemoveOption }: any) {
  const [input, setInput] = useState('')
  const [hantera, setHantera] = useState(false)
  const filtered = input.trim() ? options.filter(o => o.toLowerCase().includes(input.toLowerCase())) : options

  const handleSelect = (val) => { onChange(val); setInput('') }
  const handleCreate = () => {
    if (!input.trim()) return
    const newVal = input.trim()
    if (!options.includes(newVal)) {
      setOptions([...options, newVal].sort())
      if (onAddOption) onAddOption(newVal) // persistera i val-listan (ärlig sparning i föräldern)
    }
    onChange(newVal)
    setInput('')
  }
  const handleRemove = (val: any) => {
    if (onRemoveOption) onRemoveOption(val) // föräldern tar bort ur tabellen + listan
  }

  return (
    <div style={embedded ? styles.chipInputBoxEmbedded : styles.chipInputBox}>
      {(label || onRemoveOption) && (
      <div style={styles.chipInputHeader}>
        <span style={styles.chipInputLabel}>{label}</span>
        {onRemoveOption && (
          <button
            onClick={() => setHantera(!hantera)}
            className="tap-press"
            style={{ background: 'none', border: 'none', color: hantera ? '#adc6ff' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px' }}
          >
            {hantera ? 'Klar' : 'Hantera'}
          </button>
        )}
      </div>
      )}
      {value && (
        <div style={styles.chipSelected}>
          <span>{value}</span>
          <button onClick={() => onChange('')} style={styles.chipClear}>✕</button>
        </div>
      )}
      {!value && (
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (filtered.length === 1) handleSelect(filtered[0])
            else if (input.trim() && !options.includes(input.trim())) handleCreate()
            else if (filtered.length > 0) handleSelect(filtered[0])
          }
        }} placeholder="Sök eller skriv ny …" style={styles.chipInput} />
      )}
      <div style={styles.chipGrid}>
        {filtered.map(opt => (
          <Chip
            key={opt}
            label={opt}
            selected={value === opt}
            onClick={() => hantera ? null : handleSelect(opt)}
            editMode={hantera}
            onDelete={() => handleRemove(opt)}
          />
        ))}
        {input.trim() && !options.some(o => o.toLowerCase() === input.toLowerCase()) && (
          <div onClick={handleCreate} style={styles.chipNew}>+ {input}</div>
        )}
      </div>
    </div>
  )
}

// Egenskap Switch
function EgenskapSwitch({ label, active, onClick, orange }) {
  const [bounce, setBounce] = useState(false)
  const [hover, setHover] = useState(false)
  const activeColor = orange ? '#FF9F0A' : '#adc6ff'
  const activeBg = orange ? 'rgba(255,159,10,0.10)' : 'rgba(173,198,255,0.10)'
  const activeBorder = orange ? 'rgba(255,159,10,0.30)' : 'rgba(173,198,255,0.30)'
  
  const handleClick = () => {
    setBounce(true)
    setTimeout(() => setBounce(false), 300)
    onClick()
  }

  return (
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
  )
}

// DateToggle (för avslut-datum)
function DateToggle({ label, date, onToggle, onDateChange }) {
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

// Locked Input (som VO-nummer men för vanliga fält)
// Direkt-redigerbart fält i iOS Settings-stil: label vänster, input höger.
// onChange uppdaterar state vid varje keystroke; spara till Supabase sker
// vid stora gröna Spara-knappen i footern.
function LockedInput({ label, value, onChange, placeholder, embedded = false }) {
  const [focused, setFocused] = useState(false)
  const baseStyle = embedded ? styles.directRowEmbedded : styles.directRowStandalone
  return (
    <div
      style={embedded
        ? { ...baseStyle, background: focused ? 'rgba(173,198,255,0.06)' : 'transparent' }
        : { ...baseStyle, borderColor: focused ? 'rgba(173,198,255,0.35)' : 'rgba(255,255,255,0.08)' }
      }
    >
      <span style={styles.directRowLabel}>{label}</span>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={styles.directRowInput}
      />
    </div>
  )
}

// Save button — dimmad när inget är ändrat, tänd blå med ändringsräknare vid dirty.
// Sparandet triggas bara härifrån (undersidor har bara "Klar" som går tillbaka).
function SaveButton({ onClick, saving, saved, dirty, antal }: any) {
  const [pulse, setPulse] = useState(false)
  const inaktiv = !dirty && !saving && !saved

  const handleClick = () => {
    if (saving || inaktiv) return
    setPulse(true)
    onClick()
  }

  const label = saved ? 'Sparat!'
    : saving ? 'Sparar...'
    : dirty ? `Spara · ${antal} ${antal === 1 ? 'ändring' : 'ändringar'}`
    : 'Spara'

  return (
    <button
      onClick={handleClick}
      disabled={saving || inaktiv}
      style={{
        ...styles.saveBtn,
        background: inaktiv ? 'rgba(255,255,255,0.08)' : saving ? 'rgba(173,198,255,0.5)' : '#adc6ff',
        color: inaktiv ? 'rgba(255,255,255,0.35)' : '#000',
        cursor: inaktiv ? 'default' : 'pointer',
        boxShadow: inaktiv ? 'none' : pulse ? '0 0 30px rgba(173,198,255,0.8)' : '0 4px 20px rgba(173,198,255,0.3)',
        transform: pulse ? 'scale(0.98)' : 'scale(1)'
      }}
    >
      {label}
    </button>
  )
}

// Confirm-dialog — Apple-stil. 2 eller 3 knappar (om discardLabel + onDiscard
// är satta visas en mellan-knapp för "destructive non-cancel"-val, t.ex.
// "Stäng utan att spara"). 3-val renderas vertikalt.
function ConfirmDialog({
  open, title, message,
  confirmLabel = 'Fortsätt', cancelLabel = 'Avbryt',
  discardLabel = null as any, onDiscard = null as any,
  onConfirm, onCancel, destructive = false,
}) {
  if (!open) return null
  const showDiscard = !!(discardLabel && onDiscard)
  const btnBase = {
    minHeight: 56, padding: '0 14px', borderRadius: 12,
    fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  }
  const confirmBtn = (
    <button onClick={onConfirm} className="tap-press" style={{
      ...btnBase, flex: showDiscard ? undefined : 1, width: showDiscard ? '100%' : undefined,
      border: 'none', background: destructive ? '#FF453A' : '#adc6ff', color: '#000',
    }}>{confirmLabel}</button>
  )
  const discardBtn = showDiscard && (
    <button onClick={onDiscard} className="tap-press" style={{
      ...btnBase, width: '100%',
      border: '1px solid rgba(255,69,58,0.35)', background: 'rgba(255,69,58,0.08)',
      color: 'rgba(255,140,140,0.95)',
    }}>{discardLabel}</button>
  )
  const cancelBtn = (
    <button onClick={onCancel} className="tap-press" style={{
      ...btnBase, flex: showDiscard ? undefined : 1, width: showDiscard ? '100%' : undefined,
      border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
      color: 'rgba(255,255,255,0.75)',
    }}>{cancelLabel}</button>
  )

  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: '#1c1c1e', borderRadius: 18, padding: '22px 22px 18px',
        width: 'calc(100% - 40px)', maxWidth: 340, zIndex: 201,
        border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        fontFamily: "'Geist', system-ui, sans-serif", color: '#fff',
        animation: 'fadeIn 0.18s ease',
      }}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.45, marginBottom: 18 }}>{message}</div>
        {showDiscard ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {confirmBtn}
            {discardBtn}
            {cancelBtn}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            {cancelBtn}
            {confirmBtn}
          </div>
        )}
      </div>
    </>
  )
}

// Subtila text-badges på listkort med vad som saknas (max 3, +N fler)
function KortBadges({ obj, volym, warnings: fardiga }: any) {
  const warnings = fardiga ?? getWarnings(obj, volym)
  if (warnings.length === 0) return null
  const visible = warnings.slice(0, 3)
  const more = warnings.length - visible.length
  return (
    <div style={styles.kortBadges}>
      {visible.map((w: any, i: number) => (
        <span key={w.key} style={styles.kortBadge}>
          {i > 0 && <span style={{ color: 'rgba(255,255,255,0.2)', marginRight: 6 }}>·</span>}
          {w.text}
        </span>
      ))}
      {more > 0 && <span style={styles.kortBadgeMore}>+{more} fler</span>}
    </div>
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
function EditSheet({ open, onClose, onBack, title, subtitel, footer, contentKey, children }: any) {
  const [closing, setClosing] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(null)
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
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Drag-listening på document — bara aktiv under drag
  useEffect(() => {
    if (!isDragging) return
    const getY = (e) => {
      if (typeof e.clientY === 'number') return e.clientY
      if (e.touches && e.touches[0]) return e.touches[0].clientY
      if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY
      return null
    }
    const onMove = (e) => {
      if (dragStartY.current === null) return
      const y = getY(e)
      if (y === null) return
      const offset = Math.max(0, y - dragStartY.current)
      setDragOffset(offset)
    }
    const onUp = (e) => {
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

  const onDragStart = (e) => {
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
        style={{
          ...styles.overlay,
          animation: closing ? 'fadeOut 0.28s ease forwards' : 'fadeIn 0.22s ease',
          transition: 'backdrop-filter 0.2s ease',
        }}
      />
      <div
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
          style={{ ...styles.sheetHandle, cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
        >
          <div style={styles.sheetBar} />
        </div>
        <div style={{
          ...styles.sheetHeader,
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {onBack && (
              <button onClick={onBack} className="tap-press" aria-label="Tillbaka" style={{ ...styles.sheetNavBtn, fontSize: 22 }}>‹</button>
            )}
            <div style={{ ...styles.sheetTitel, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
            <button onClick={handleClose} className="tap-press" aria-label="Stäng" style={styles.sheetNavBtn}>✕</button>
          </div>
          {subtitel}
        </div>
        <div style={{ ...styles.scrollFade, opacity: scrolled ? 1 : 0 }} />
        <div ref={contentRef} style={styles.sheetContent} onScroll={(e) => setScrolled(e.target.scrollTop > 10)}>
          {children}
        </div>
        {footer && <div style={styles.sheetFooter}>{footer}</div>}
      </div>
    </>
  )
}

// iOS Settings-stil grupp: kort med tunna avdelare mellan rader
function IosGroup({ title, children }) {
  const items = Children.toArray(children).filter(Boolean)
  if (items.length === 0) return null
  return (
    <div style={styles.iosGroupWrap}>
      {title && <div style={styles.iosGroupTitle}>{title}</div>}
      <div style={styles.iosGroupCard}>
        {items.map((child, i) => (
          <Fragment key={i}>
            {child}
            {i < items.length - 1 && <div style={styles.iosDivider} />}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// Talfält med svensk decimalkomma. Rå text lokalt (så "5," går att skriva),
// parsat värde (eller null) propageras vid varje ändring. Ogiltig text får
// röd kant och propagerar null — aldrig ett tyst 0.
function NumField({ label, value, onChange, placeholder, suffix }: any) {
  const [raw, setRaw] = useState(value == null ? '' : String(value).replace('.', ','))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    // Synka utifrån bara när fältet inte är fokuserat (annars förstörs pågående skrivning)
    if (!focused) setRaw(value == null ? '' : String(value).replace('.', ','))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const invalid = raw.trim() !== '' && !Number.isFinite(parseFloat(raw.replace(',', '.')))
  const handle = (t: string) => {
    setRaw(t)
    const parsed = parseFloat(t.replace(',', '.'))
    onChange(Number.isFinite(parsed) ? parsed : null)
  }
  return (
    <div style={{ ...styles.directRowEmbedded, background: focused ? 'rgba(173,198,255,0.06)' : 'transparent' }}>
      <span style={styles.directRowLabel}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
        <input
          type="text"
          inputMode="decimal"
          value={raw}
          onChange={(e) => handle(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder || ''}
          style={{
            ...styles.directRowInput, flex: 'none', width: 110,
            padding: '4px 8px', borderRadius: 8,
            border: `1px solid ${invalid ? 'rgba(255,69,58,0.6)' : 'transparent'}`,
            color: invalid ? '#FF453A' : '#fff',
          } as any}
        />
        {suffix && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{suffix}</span>}
      </div>
    </div>
  )
}

// Segmented control (två-tre val i rad) — samma visuella språk som
// Ackord/Timpeng-väljaren
function Segment({ value, options, onChange }: any) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {options.map((o: any) => {
        const vald = value === o.varde
        return (
          <button
            key={o.label}
            onClick={() => onChange(o.varde)}
            className="tap-press"
            style={{
              flex: 1, minHeight: 44, borderRadius: 12, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              border: `1px solid ${vald ? 'rgba(173,198,255,0.45)' : 'rgba(255,255,255,0.1)'}`,
              background: vald ? 'rgba(173,198,255,0.14)' : 'transparent',
              color: vald ? '#adc6ff' : 'rgba(255,255,255,0.55)',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// Rad i "Måste fyllas i" — kollapsad visar värdet (grått) eller "Välj ›"
// (orange), tryck expanderar redigeraren under raden
function KravRad({ label, value, expanded, onToggle, children }: any) {
  const [hover, setHover] = useState(false)
  return (
    <div>
      <div
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ ...styles.kravRad, background: hover || expanded ? 'rgba(255,255,255,0.03)' : 'transparent' }}
      >
        <span style={styles.directRowLabel}>{label}</span>
        {value
          ? <span style={styles.kravVarde as any}>{value}</span>
          : <span style={styles.kravValj}>Välj ›</span>}
      </div>
      {expanded && <div style={{ animation: 'fadeIn 0.15s ease' }}>{children}</div>}
    </div>
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

// Maskin-badges för sheetens header — VILKA MASKINER som skickat filer för
// objektet (namn/modell primärt, volym sekundärt), unionerat över VO-gruppens
// rader. Ligger i fasta headern — syns alltid, utan scroll.
function MaskinBadges({ syskon, kortInfo }: any) {
  const skordat = (syskon || []).reduce((sum: number, o: any) => sum + (kortInfo[o.objekt_id]?.skordatM3 || 0), 0)
  const lass = (syskon || []).reduce((sum: number, o: any) => sum + (kortInfo[o.objekt_id]?.skotatM3 || 0), 0)
  const manuell = Math.max(0, ...(syskon || []).map((o: any) => Number(o.skotad_volym_manuell) || 0))
  const skotat = manuell > 0 ? manuell : lass

  // Union av gruppens maskiner, dedupe på maskin_id, skördare först
  const perId = new Map<string, any>()
  ;(syskon || []).forEach((o: any) => {
    (kortInfo[o.objekt_id]?.maskiner || []).forEach((m: any) => { if (!perId.has(m.id)) perId.set(m.id, m) })
  })
  const maskiner = Array.from(perId.values())
    .sort((a: any, b: any) => (a.typ === b.typ ? 0 : a.typ === 'skordare' ? -1 : 1))

  const badge = (nyckel: string, bg: string, farg: string, text: string) => (
    <span key={nyckel} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: bg, color: farg, whiteSpace: 'nowrap' }}>{text}</span>
  )
  const antalPerTyp = (typ: string) => maskiner.filter((m: any) => m.typ === typ).length

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      {maskiner.map((m: any) => {
        const arSk = m.typ === 'skordare'
        const ikon = arSk ? '🌲' : m.typ === 'skotare' ? '🚜' : '⚙'
        const namn = m.modell || m.id
        // Volymen visas bara när typen har EN maskin — annars vore samma
        // total upprepad per maskin och se ut som per-maskin-siffror
        const volym = arSk
          ? (antalPerTyp('skordare') === 1 && skordat > 0 ? ` · ${Math.round(skordat).toLocaleString('sv-SE')} m³` : '')
          : (m.typ === 'skotare' && antalPerTyp('skotare') === 1 && skotat > 0 ? ` · ${Math.round(skotat).toLocaleString('sv-SE')} m³${manuell > 0 ? ' (manuell)' : ''}` : '')
        return badge(m.id,
          arSk ? 'rgba(168,213,130,0.12)' : 'rgba(240,178,76,0.12)',
          arSk ? '#a8d582' : '#f0b24c',
          `${ikon} ${namn}${volym}`)
      })}
      {maskiner.length === 0 && (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Ingen maskindata ännu</span>
      )}
    </div>
  )
}

// "Maskinen rapporterar avslut"-ruta + snabbfix. end_date och maskin_id
// skrivs av SAMMA fil vid varje import — end_date tillhör alltså maskinen i
// maskin_id. Anroparen renderar rutan bara i rätt maskinslags undersida.
function MaskinAvslutRuta({ obj, set, field, label }: any) {
  if (!obj.end_date) return null
  const display = formatEndDateDisplay(obj.end_date)
  const ymd = formatYMD(obj.end_date)
  const alreadySet = obj[field]
  return (
    <div style={styles.machineEndInfo}>
      <div style={styles.machineEndLabel}>Maskinen rapporterar avslut</div>
      <div style={styles.machineEndValue}>{display}</div>
      {!alreadySet && ymd && (
        <button
          onClick={() => set({ ...obj, [field]: ymd })}
          className="tap-press"
          style={styles.machineEndFixBtn}
        >
          Sätt {label} avslutad till {ymd}
        </button>
      )}
      {alreadySet && (
        <div style={styles.machineEndDone}>{capFirst(label)} redan markerad avslutad ({obj[field]})</div>
      )}
    </div>
  )
}

// UNDERSIDA: Identitet — VO-nummer, objektnamn (+ hämta-från-filnamn), inköpare.
// Inköpare bor här (inte i "Måste fyllas i") — den ingår inte i de
// obligatoriska fälten i datamodellen (getSaknas/KRAV_FALT).
function SubIdentitet({ obj, set, inkopare, setInkopare, listAtgarder }: any) {
  const [quickFixState, setQuickFixState] = useState({ status: 'idle', message: '' })
  const showQuickFixName = looksLikeAutoDate(obj.object_name)
  const runQuickFix = async () => {
    setQuickFixState({ status: 'loading', message: '' })
    const r = await hamtaNamnFranFilnamn(obj)
    if (r.ok) {
      set({ ...obj, object_name: r.name })
      setQuickFixState({ status: 'done', message: `Hämtat: ${r.name}` })
      setTimeout(() => setQuickFixState({ status: 'idle', message: '' }), 2200)
    } else {
      setQuickFixState({ status: 'error', message: r.message })
      setTimeout(() => setQuickFixState({ status: 'idle', message: '' }), 3500)
    }
  }
  return (
    <IosGroup title="Identitet">
      <LockedInput embedded label="VO-nummer" value={obj.vo_nummer} onChange={(v: any) => set({ ...obj, vo_nummer: v })} placeholder="Ange VO-nummer …" />
      <div>
        <LockedInput embedded label="Objektnamn" value={obj.object_name || ''} onChange={(v: any) => set({ ...obj, object_name: v })} placeholder="T.ex. Lindön AU 2025" />
        {showQuickFixName && (
          <div style={{ padding: '0 16px 14px' }}>
            <button
              onClick={runQuickFix}
              disabled={quickFixState.status === 'loading'}
              className="tap-press"
              style={{
                ...styles.quickFixBtn,
                opacity: quickFixState.status === 'loading' ? 0.6 : 1,
                cursor: quickFixState.status === 'loading' ? 'wait' : 'pointer',
              }}
            >
              {quickFixState.status === 'loading' ? 'Hämtar …' : 'Hämta från filnamn'}
            </button>
            {quickFixState.message && (
              <div style={{
                ...styles.quickFixMessage,
                ...(quickFixState.status === 'error' ? styles.quickFixMessageError : styles.quickFixMessageOk),
              }}>
                {quickFixState.message}
              </div>
            )}
          </div>
        )}
      </div>
      <ChipInput embedded label="Inköpare" value={obj.inkopare || ''} options={inkopare} setOptions={setInkopare} onChange={(v: any) => set({ ...obj, inkopare: v })} onAddOption={listAtgarder?.onAddInkopare} onRemoveOption={listAtgarder?.onRemoveInkopare} />
    </IosGroup>
  )
}

// UNDERSIDA: Skördare — egenskaper + avslut (synlighet styrs av faktisk data
// i översikten, #167: rätt fält för rätt maskin)
function SubSkordare({ obj, set, syskon, onRaderUppdaterade }: any) {
  const radMaskinTyp = (obj.maskin_typ || '').toLowerCase()
  const [grotSpar, setGrotSpar] = useState({ sparar: false, fel: '' })

  // grot_hamtad är ett GEMENSAMT objekt-faktum → skrivs till HELA VO-gruppen.
  // Verifierad sparning enligt #222-mönstret: läs tillbaka VÄRDET (satt/null),
  // inte bara radantalet — en markering som ser sparad ut men inte är det ska
  // aldrig kunna passera.
  const gruppIds = (syskon && syskon.length ? syskon : [obj]).map((o: any) => o.objekt_id)
  const sattGrotHamtad = async (varde: string | null) => {
    setGrotSpar({ sparar: true, fel: '' })
    const { data, error } = await supabase
      .from('dim_objekt').update({ grot_hamtad: varde }).in('objekt_id', gruppIds).select('objekt_id, grot_hamtad')
    if (error) { setGrotSpar({ sparar: false, fel: 'Kunde inte spara: ' + error.message }); return }
    if ((data || []).length !== gruppIds.length) { setGrotSpar({ sparar: false, fel: `Bara ${(data || []).length} av ${gruppIds.length} rader uppdaterades — inte komplett sparat` }); return }
    const missad = (data as any[]).find(r => (r.grot_hamtad != null) !== (varde != null))
    if (missad) { setGrotSpar({ sparar: false, fel: 'Markeringen landade inte — ladda om och försök igen' }); return }
    set({ ...obj, grot_hamtad: varde })
    if (onRaderUppdaterade) onRaderUppdaterade(gruppIds, { grot_hamtad: varde })
    setGrotSpar({ sparar: false, fel: '' })
  }

  return (
    <IosGroup title="🌲 Skördare">
      <div style={{ padding: '14px 16px' }}>
        <div style={styles.switchList}>
          {EGENSKAPER_SKORDARE.map(e => (
            <EgenskapSwitch key={e.key} label={e.label} active={obj[e.key] === true} onClick={() => set({ ...obj, [e.key]: !obj[e.key] })} orange={false} />
          ))}
        </div>
        {/* Grot hämtad — bara på grot-anpassade objekt. Frikopplar riset från
            virket: så länge grot_hamtad är NULL räknas riset som kvar på hygget,
            oavsett om virket är skotat. Ångerbar. */}
        {obj.grot_anpassad === true && (
          <div style={{ marginTop: 12 }}>
            {!obj.grot_hamtad ? (
              <button
                onClick={() => sattGrotHamtad(new Date().toISOString().slice(0, 10))}
                disabled={grotSpar.sparar}
                className="tap-press"
                style={{ width: '100%', minHeight: 48, borderRadius: 12, border: 'none', background: '#f0b24c', color: '#000', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', opacity: grotSpar.sparar ? 0.6 : 1 }}
              >
                {grotSpar.sparar ? 'Sparar …' : 'Markera grot hämtad'}
              </button>
            ) : (
              <button
                onClick={() => sattGrotHamtad(null)}
                disabled={grotSpar.sparar}
                className="tap-press"
                style={{ width: '100%', minHeight: 44, borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', opacity: grotSpar.sparar ? 0.6 : 1 }}
              >
                {grotSpar.sparar ? 'Sparar …' : `Grot hämtad ${fmtKortDatum(obj.grot_hamtad)} · ångra`}
              </button>
            )}
            {grotSpar.fel && <div style={{ ...styles.validationWarning, margin: '8px 0 0' }}>{grotSpar.fel}</div>}
          </div>
        )}
      </div>
      <div id="avslut-skordare-section" style={{ padding: '4px 16px 14px' }}>
        <div style={styles.switchList}>
          <DateToggle
            label="Skördning avslutad"
            date={obj.skordning_avslutad || null}
            onToggle={(val: any) => set({ ...obj, skordning_avslutad: val })}
            onDateChange={(val: any) => set({ ...obj, skordning_avslutad: val })}
          />
        </div>
        {radMaskinTyp === 'harvester' && <MaskinAvslutRuta obj={obj} set={set} field="skordning_avslutad" label="skördning" />}
      </div>
    </IosGroup>
  )
}

// Kortindikator: två prickar (skördare, skotare). Grön = data finns,
// gul = förväntas men saknas, grå = förväntas ej. Ingen text på kortet —
// detaljerna bor i Filer-undersidan.
function MaskinPrickar({ obj, rader, sanderEj }: any) {
  const s = filStatus(obj, rader, { skotareSanderEjFiler: sanderEj })
  const farg = (st: any) => st === 'data' ? '#30d158' : st === 'saknas' ? '#FF9F0A' : 'rgba(255,255,255,0.18)'
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', flexShrink: 0 }} aria-label="Fildata skördare/skotare">
      <span style={{ width: 7, height: 7, borderRadius: 4, background: farg(s.skordare) }} />
      <span style={{ width: 7, height: 7, borderRadius: 4, background: farg(s.skotare) }} />
    </span>
  )
}

// UNDERSIDA: Filer — vilka maskinfiler som bär objektets data, per maskinslag.
// Datumet är primärsignalen; antal/typer är dämpad sekundärrad. Statusraden
// överst knyter ihop förväntan (egenskaperna) med vad som faktiskt kommit in.
function SubFiler({ obj, rader, hamtStatus, skotareSanderEj }: any) {
  if (hamtStatus === 'fel') {
    return (
      <IosGroup title="Filer">
        <div style={{ padding: '14px 16px', fontSize: 14, color: 'rgba(255,160,160,0.9)' }}>Kunde inte hämta fildata</div>
      </IosGroup>
    )
  }
  if (hamtStatus === 'laddar') {
    return (
      <IosGroup title="Filer">
        <div style={{ padding: '14px 16px', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Läser fildata …</div>
      </IosGroup>
    )
  }

  const s = filStatus(obj, rader, { skotareSanderEjFiler: skotareSanderEj })
  const alla = rader || []
  const skordare = alla.filter((r: any) => r.typ === 'skordare')
  const skotare = alla.filter((r: any) => r.typ === 'skotare')
  const okanda = alla.filter((r: any) => r.typ === null)

  let statusText: string
  let statusTon: 'gron' | 'gul'
  if (s.ovantadSkotardata) {
    statusTon = 'gul'
    statusText = `Skotardata finns trots ${s.skotareEjOrsak} — kontrollera egenskapen`
  } else if (s.skordare === 'saknas' && s.skotare === 'saknas') {
    statusTon = 'gul'
    statusText = 'Inget fildata ännu'
  } else if (s.skotare === 'saknas') {
    statusTon = 'gul'
    statusText = obj.skordning_avslutad
      ? `Inget skotardata ännu — skördning klar ${fmtKortDatum(obj.skordning_avslutad)}`
      : 'Inget skotardata ännu'
  } else if (s.skordare === 'saknas') {
    statusTon = 'gul'
    statusText = 'Inget skördardata ännu'
  } else {
    statusTon = 'gron'
    statusText = s.skordare === 'data' && s.skotare === 'data' ? 'Data från båda maskinslagen'
      : s.skordare === 'data' ? 'Data från skördaren'
      : 'Data från skotaren'
  }

  const maskinRad = (r: any) => (
    <div key={r.maskinId} style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.85)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.modell || r.maskinId}</span>
        <span style={{ fontSize: 15, color: '#fff', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {r.senasteData ? `data t.o.m. ${fmtKortDatum(r.senasteData)}` : 'inget datum'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
        {r.antalFiler} {r.antalFiler === 1 ? 'fil' : 'filer'} · {r.filtyper.join(', ')}
        {r.senasteImport ? ` · importerad ${fmtKortDatum(r.senasteImport)}` : ''}
      </div>
    </div>
  )

  const tomRad = (text: string, ton: 'gul' | 'gra') => (
    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: ton === 'gul' ? '#FF9F0A' : 'rgba(255,255,255,0.18)' }} />
      <span style={{ fontSize: 14, color: ton === 'gul' ? 'rgba(255,200,120,0.95)' : 'rgba(255,255,255,0.4)' }}>{text}</span>
    </div>
  )

  return (
    <>
      <div style={{
        ...styles.progressHeader,
        border: `1px solid ${statusTon === 'gul' ? 'rgba(255,159,10,0.25)' : 'rgba(48,209,88,0.25)'}`,
        background: statusTon === 'gul' ? 'rgba(255,159,10,0.07)' : 'rgba(48,209,88,0.06)',
      }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, background: statusTon === 'gul' ? '#FF9F0A' : '#30d158' }} />
        <span style={{ ...styles.progressText, color: statusTon === 'gul' ? 'rgba(255,200,120,0.95)' : 'rgba(180,235,190,0.95)' }}>{statusText}</span>
      </div>

      <IosGroup title="Skördare">
        {skordare.length > 0 ? skordare.map(maskinRad)
          : s.skordare === 'forvantas_ej' ? tomRad(`Förväntas ej (${s.skordareEjOrsak})`, 'gra')
          : tomRad('Inget data ännu', 'gul')}
      </IosGroup>

      <IosGroup title="Skotare">
        {skotare.length > 0 ? skotare.map(maskinRad)
          : s.skotare === 'forvantas_ej' ? tomRad(`Förväntas ej (${s.skotareEjOrsak})`, 'gra')
          : tomRad(obj.skordning_avslutad ? `Inget data ännu — skördning klar ${fmtKortDatum(obj.skordning_avslutad)}` : 'Inget data ännu', 'gul')}
      </IosGroup>

      {okanda.length > 0 && (
        <IosGroup title="Okänd maskintyp">{okanda.map(maskinRad)}</IosGroup>
      )}
    </>
  )
}

// UNDERSIDA: Pris & ersättning — Ackord/Timpeng + timpeng-undantag.
// dim_objekt.timpeng är ENDA källan för flaggan.
function SubPris({ obj, set }: any) {
  return (
    <IosGroup title="Pris & ersättning">
      <div id="timpeng-section" style={{ padding: '14px 16px 4px' }}>
        <Segment
          value={obj.timpeng === true}
          options={[
            { varde: false, label: 'Ackord' },
            { varde: true, label: 'Timpeng' },
          ]}
          onChange={(v: boolean) => set({ ...obj, timpeng: v })}
        />
      </div>
      {obj.timpeng !== true && (
        <div style={{ padding: '4px 16px 10px' }}>
          <div style={{ ...styles.subsectionLabel, marginTop: 4 }}>Timpeng-undantag</div>
          <NumField
            label="Skördare"
            value={obj.timpeng_undantag_timmar_skordare}
            onChange={(v: number | null) => set({ ...obj, timpeng_undantag_timmar_skordare: v })}
            placeholder="t.ex. 5,5"
            suffix="h timpeng"
          />
          <NumField
            label="Skotare"
            value={obj.timpeng_undantag_timmar_skotare}
            onChange={(v: number | null) => set({ ...obj, timpeng_undantag_timmar_skotare: v })}
            placeholder="t.ex. 3"
            suffix="h timpeng"
          />
          <NumField
            label="Volym"
            value={obj.timpeng_undantag_volym}
            onChange={(v: number | null) => set({ ...obj, timpeng_undantag_volym: v })}
            placeholder="0"
            suffix="m³"
          />
          {(Number(obj.timpeng_undantag_volym) || 0) > 0 && (
            <div style={styles.switchList as any}>
              <EgenskapSwitch
                label="Dra volymen från skördarackordet"
                active={obj.timpeng_undantag_dra_skordare !== false}
                onClick={() => set({ ...obj, timpeng_undantag_dra_skordare: !(obj.timpeng_undantag_dra_skordare !== false) })}
                orange={false}
              />
              <EgenskapSwitch
                label="Dra volymen från skotarackordet"
                active={obj.timpeng_undantag_dra_skotare !== false}
                onClick={() => set({ ...obj, timpeng_undantag_dra_skotare: !(obj.timpeng_undantag_dra_skotare !== false) })}
                orange={false}
              />
            </div>
          )}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, padding: '6px 2px 0' }}>
            Del av objektet körd på timpeng. Tomt fält = ingen timpeng-del för den
            maskinen (rent ackord). Timmarna faktureras respektive maskins timpris;
            volymen dras från ackordet enligt valen — annars dubbelbetald. Uträkningen
            syns i Ekonomi → Per objekt → &quot;Så räknades priset&quot;.
          </div>
        </div>
      )}
    </IosGroup>
  )
}

// UNDERSIDA: Skotning — egen/extern skotning. Alltid åtkomlig, oavsett
// maskindata: extern skotning = någon annan skotar = det kommer ALDRIG en
// skotarfil från oss, så fältet måste gå att sätta på rena skördarobjekt
// (skotar-undersidan visas ju bara när skotardata finns). Uppföljningen
// räknar externt skotade objekt som INTE oskotade.
function SubSkotning({ obj, set }: any) {
  const typTimme = obj._extern_pris_typ === 'timme'
  const pris = Number(obj._extern_pris) || 0
  const antal = Number(obj._extern_antal) || 0
  const radRam = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }
  return (
    <>
      <IosGroup title="Skotning">
        <div style={{ padding: '14px 16px' }}>
          <div style={styles.switchList}>
            <EgenskapSwitch label="Egen skotning" active={obj.egen_skotning === true} onClick={() => set({ ...obj, egen_skotning: !obj.egen_skotning })} orange={false} />
            <EgenskapSwitch label="Extern skotare (inlejd)" active={obj._extern_skotning === true} onClick={() => set({ ...obj, _extern_skotning: !obj._extern_skotning })} orange={false} />
          </div>
          {obj._extern_skotning && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <LockedInput label="Företag / person" value={obj._extern_foretag || ''} onChange={(v: any) => set({ ...obj, _extern_foretag: v })} placeholder="Namn på extern skotare …" />
              <Segment
                value={typTimme ? 'timme' : 'm3'}
                options={[
                  { varde: 'm3', label: 'per m³' },
                  { varde: 'timme', label: 'per timme' },
                ]}
                onChange={(v: string) => set({ ...obj, _extern_pris_typ: v })}
              />
              <div style={radRam}>
                <NumField
                  label={`Pris per ${typTimme ? 'timme' : 'm³'}`}
                  value={obj._extern_pris ?? null}
                  onChange={(v: number | null) => set({ ...obj, _extern_pris: v })}
                  placeholder="0"
                  suffix="kr"
                />
              </div>
              <div style={radRam}>
                <NumField
                  label={`Antal ${typTimme ? 'timmar' : 'm³'}`}
                  value={obj._extern_antal ?? null}
                  onChange={(v: number | null) => set({ ...obj, _extern_antal: v })}
                  placeholder="0"
                  suffix={typTimme ? 'h' : 'm³'}
                />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                Externt skotade objekt räknas inte som oskotade i uppföljningen — någon annan tar volymen.
              </div>
            </div>
          )}
        </div>
      </IosGroup>
      {obj._extern_skotning === true && pris > 0 && antal > 0 && (
        <div style={styles.kostnadRad}>
          Beräknad kostnad: {Math.round(pris * antal).toLocaleString('sv-SE')} kr
        </div>
      )}
    </>
  )
}

// UNDERSIDA: Skotare — skotad volym/färdigskotat (direktsparas), egenskaper,
// avslut. Färdigskotat-knappen skriver direkt till DB (ärlig sparning med
// radräkning) och speglas i snapshotet via onRaderUppdaterade så den inte
// räknas som osparad ändring.
function SubSkotare({ obj, set, info, skordatTotal, skotatTotal, gruppSkotningAvslutad, skotareSanderEj, syskon, onRaderUppdaterade }: any) {
  const [fardigskotat, setFardigskotat] = useState({ sparar: false, fel: '' })
  const radMaskinTyp = (obj.maskin_typ || '').toLowerCase()

  // F1: RISJOBBETS KOPPLING — vilka avverkningsobjekt hämtas riset från?
  // Fångas vid källan (här, där risskotning sätts) så avbockningen kan bli
  // automatisk när jobbet markeras färdigt. Går att hoppa över (allt ris har
  // inte känt ursprung, t.ex. "Ris över väg") och komplettera när som helst.
  const arRisjobb = obj.risskotning === true
  const [risKand, setRisKand] = useState<any[]>([])
  const [valdaRis, setValdaRis] = useState<string[]>([])
  const [risLage, setRisLage] = useState({ laddar: false, sparar: false, fel: '', sparat: false })

  useEffect(() => {
    if (!arRisjobb || !obj.objekt_id) return
    let avbruten = false
    ;(async () => {
      setRisLage(l => ({ ...l, laddar: true, fel: '' }))
      const [kand, kopp] = await Promise.all([hamtaRisKandidater(), hamtaKopplingar(obj.objekt_id)])
      if (avbruten) return
      if (!kand.ok || !kopp.ok) {
        setRisLage({ laddar: false, sparar: false, fel: kand.message || kopp.message, sparat: false })
        return
      }
      setRisKand(kand.rader)
      setValdaRis(kopp.rader.map(r => r.avverknings_objekt_id))
      setRisLage({ laddar: false, sparar: false, fel: '', sparat: false })
    })()
    return () => { avbruten = true }
  }, [arRisjobb, obj.objekt_id])

  const vaxlaRis = (id: string) =>
    setValdaRis(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id])

  const sparaRisKoppling = async () => {
    setRisLage(l => ({ ...l, sparar: true, fel: '', sparat: false }))
    const r = await sparaKopplingar(obj.objekt_id, valdaRis)
    setRisLage({ laddar: false, sparar: false, fel: r.ok ? '' : r.message, sparat: r.ok })
  }

  // Proaktiv uppräkningsfråga: (skotning avslutad ELLER icke-filsändande
  // skotare) OCH (lass + manuell) < skördat. Skrivningen är samma verifierade
  // färdigskotat-knapp nedanför — frågan pekar bara på den.
  // SAMMA gate som luckvarningen i getWarnings: tyst vid egen skotning
  // (markägaren skotar — inte vår volym) och extern skotare (redovisas via
  // prisfälten). Fråga och varning ska aldrig säga olika saker.
  const manuellMax = Math.max(0, ...(syskon && syskon.length ? syskon : [obj]).map((o: any) => Number(o.skotad_volym_manuell) || 0))
  const totSkotat = Math.round((Number(skotatTotal) || 0) + manuellMax)
  const totSkordat = Math.round(Number(skordatTotal) || 0)
  const skotningKlarDatum = (syskon && syskon.length ? syskon : [obj])
    .map((o: any) => o.skotning_avslutad).filter(Boolean).sort().slice(-1)[0] || null
  const visaUpprakningsFraga = (gruppSkotningAvslutad || skotareSanderEj)
    && totSkordat > 0 && totSkotat < totSkordat
    && obj.egen_skotning !== true && !harExternSkotning(obj)

  const skotningWarning = (() => {
    if (!obj.skotning_avslutad) return null
    if (!obj.skordning_avslutad) {
      // Grot-/rena skotarobjekt skördas aldrig — att skördning saknar
      // avslut är normalläget där, ingen varning. (skordatTotal räknar
      // över alla syskonrader, så P-VO-objektens skördarrad missas inte.)
      if ((Number(skordatTotal) || 0) === 0) return null
      return 'Skördning är inte avslutad än.'
    }
    if (obj.skotning_avslutad < obj.skordning_avslutad) return 'Skotning är satt före skördningens avslutsdatum.'
    return null
  })()

  return (
    <IosGroup title="🚜 Skotare">
      {/* Skotad volym — lass från maskinen, eller manuellt angiven verklig
          volym. Källan märks ALLTID ut; falska lass skrivs aldrig. */}
      <div style={{ padding: '14px 16px 4px' }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>
          {(Number(obj.skotad_volym_manuell) || 0) > 0 ? (
            <>Skotat: <span style={{ color: '#fff', fontWeight: 600 }}>{Number(obj.skotad_volym_manuell).toLocaleString('sv-SE')} m³</span>{' '}
              <span style={{ color: '#FF9F0A', fontWeight: 600 }}>(manuellt angivet)</span>
              <span style={{ color: 'rgba(255,255,255,0.35)' }}> · lass: {(info?.skotatM3 ?? 0).toLocaleString('sv-SE')} m³</span></>
          ) : (
            <>Skotat: <span style={{ color: '#fff', fontWeight: 600 }}>{(info?.skotatM3 ?? 0).toLocaleString('sv-SE')} m³</span> <span style={{ color: 'rgba(255,255,255,0.35)' }}>(lass)</span></>
          )}
        </div>
        {visaUpprakningsFraga && (
          <div style={{ ...styles.validationWarning, margin: '0 0 10px' }}>
            {gruppSkotningAvslutad
              ? `Skotning klar${skotningKlarDatum ? ` ${fmtKortDatum(skotningKlarDatum)}` : ''} men ${totSkotat.toLocaleString('sv-SE')} m³ skotat — rapportera upp till skördad volym (${totSkordat.toLocaleString('sv-SE')} m³)?`
              : `Skotaren sänder inte filer — rapportera upp till skördad volym (${totSkordat.toLocaleString('sv-SE')} m³)?`}
          </div>
        )}
        {(() => {
          const manuell = (Number(obj.skotad_volym_manuell) || 0) > 0
          // RISJOBB: "färdigskotat" betyder RISET HÄMTAT, jobbet klart. Samma
          // knapp, annan innebörd — ingen egen knapp (ett begrepp, ett ställe).
          // Bekräftelsen utgår från MÄTT lass-volym (riset som faktiskt kördes
          // ut); ett risjobb skördar inget, så skördad stamvolym är alltid 0
          // och gråade tidigare ut knappen — automatiken hade ingen tändning.
          const volymAttSatta = Math.round(Number(arRisjobb ? skotatTotal : skordatTotal) || 0)
          const skotarIds = raderForMaskinslag(syskon || [obj], 'forwarder', obj.objekt_id)
          const idagDatum = new Date().toISOString().slice(0, 10)
          const satt = async (varde: number | null) => {
            setFardigskotat({ sparar: true, fel: '' })
            // På risjobb är detta ENDA klart-handlingen: den sätter både den
            // mätta volymen och avslutsdatumet — och tänder grot-automatiken.
            const patch: any = { skotad_volym_manuell: varde }
            if (arRisjobb) patch.skotning_avslutad = varde == null ? null : idagDatum
            const r = await direktPatchDimObjekt(skotarIds, patch)
            if (!r.ok) { setFardigskotat({ sparar: false, fel: r.message }); return }
            if (arRisjobb) {
              // Automatiken körs EFTER att markeringen landat. Misslyckas den
              // visas felet — en halvkörd avbockning tigs aldrig ihjäl.
              const a = varde == null
                ? await angraGrotHamtadAutomatik(obj.objekt_id)
                : await grotHamtadAutomatik(obj.objekt_id, idagDatum)
              if (!a.ok) { setFardigskotat({ sparar: false, fel: a.message }); return }
            }
            set({ ...obj, ...patch })
            if (onRaderUppdaterade) onRaderUppdaterade(skotarIds, patch)
            setFardigskotat({ sparar: false, fel: '' })
          }
          return (
            <div>
              {!manuell ? (
                <button
                  onClick={() => satt(volymAttSatta)}
                  disabled={fardigskotat.sparar || volymAttSatta <= 0}
                  className="tap-press"
                  style={{
                    width: '100%', minHeight: 48, borderRadius: 12, border: 'none',
                    background: volymAttSatta > 0 ? '#adc6ff' : 'rgba(255,255,255,0.08)',
                    color: volymAttSatta > 0 ? '#000' : 'rgba(255,255,255,0.35)',
                    fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                    cursor: volymAttSatta > 0 ? 'pointer' : 'not-allowed',
                    opacity: fardigskotat.sparar ? 0.6 : 1,
                  }}
                >
                  {fardigskotat.sparar ? 'Sparar …' : volymAttSatta > 0
                    ? (arRisjobb
                        ? `Färdigskotat · ${volymAttSatta.toLocaleString('sv-SE')} m³ ris hämtat`
                        : `Markera som färdigskotat (${volymAttSatta.toLocaleString('sv-SE')} m³)`)
                    : (arRisjobb
                        ? 'Färdigskotat — inga lass registrerade än'
                        : 'Färdigskotat — ingen skördad volym att utgå från')}
                </button>
              ) : (
                <button
                  onClick={() => satt(null)}
                  disabled={fardigskotat.sparar}
                  className="tap-press"
                  style={{
                    width: '100%', minHeight: 44, borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                    opacity: fardigskotat.sparar ? 0.6 : 1,
                  }}
                >
                  {fardigskotat.sparar ? 'Sparar …' : (arRisjobb
                    ? 'Ångra — riset inte hämtat än'
                    : 'Ta bort färdigskotat-markeringen')}
                </button>
              )}
              {fardigskotat.fel && (
                <div style={{ ...styles.validationWarning, margin: '8px 0 0' }}>{fardigskotat.fel}</div>
              )}
            </div>
          )
        })()}
      </div>
      <div style={{ padding: '4px 16px' }}>
        <div style={styles.switchList}>
          {EGENSKAPER_SKOTARE.map(e => (
            <EgenskapSwitch key={e.key} label={e.label} active={obj[e.key] === true} onClick={() => set({ ...obj, [e.key]: !obj[e.key] })} orange={false} />
          ))}
        </div>
        {arRisjobb && (
          <div style={{ marginTop: 14 }}>
            <div style={{ ...styles.subsectionLabel, marginTop: 0 }}>Ris hämtas från</div>
            {risLage.laddar ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', padding: '6px 0' }}>Läser objekt …</div>
            ) : risLage.fel && risKand.length === 0 ? (
              <div style={{ ...styles.validationWarning, margin: '4px 0 0' }}>{risLage.fel}</div>
            ) : risKand.length === 0 ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', padding: '6px 0' }}>
                Inga grot-anpassade objekt med ris kvar just nu.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 8, lineHeight: 1.45 }}>
                  Markera de avverkningsobjekt riset kommer från. När jobbet markeras skotat bockas groten av på dem automatiskt. Kan hoppas över och fyllas i senare.
                  {' '}<span style={{ color: 'rgba(255,255,255,0.62)' }}>Vanligtvis ett hygge per risjobb — välj flera bara om rundan blandade ris från flera.</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {risKand.map((k: any) => {
                    const vald = valdaRis.includes(k.objekt_id)
                    const dagar = k.sista_datum ? Math.max(0, Math.round((Date.now() - new Date(k.sista_datum).getTime()) / 864e5)) : null
                    return (
                      <button
                        key={k.objekt_id}
                        onClick={() => vaxlaRis(k.objekt_id)}
                        className="tap-press"
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 11px', borderRadius: 10, border: vald ? '1px solid rgba(240,178,76,0.55)' : '1px solid rgba(255,255,255,0.10)', background: vald ? 'rgba(240,178,76,0.10)' : 'transparent', color: '#fff', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, border: vald ? 'none' : '1px solid rgba(255,255,255,0.3)', background: vald ? '#f0b24c' : 'transparent', color: '#000', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{vald ? '✓' : ''}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.namn}</span>
                          <span style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums' }}>
                            {Math.round(k.volym_m3sub).toLocaleString('sv-SE')} m³ avverkat{dagar != null ? ` · legat ${dagar} dgr` : ''}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={sparaRisKoppling}
                  disabled={risLage.sparar}
                  className="tap-press"
                  style={{ width: '100%', minHeight: 44, marginTop: 10, borderRadius: 12, border: 'none', background: '#adc6ff', color: '#000', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', opacity: risLage.sparar ? 0.6 : 1 }}
                >
                  {risLage.sparar ? 'Sparar …' : `Spara koppling (${valdaRis.length} valda)`}
                </button>
                {risLage.fel && <div style={{ ...styles.validationWarning, margin: '8px 0 0' }}>{risLage.fel}</div>}
                {risLage.sparat && <div style={{ fontSize: 12, color: '#a8d582', marginTop: 8 }}>Kopplingen sparad</div>}
              </>
            )}
          </div>
        )}
      </div>
      <div id="avslut-skotare-section" style={{ padding: '4px 16px 14px' }}>
        <div style={styles.switchList}>
          <DateToggle
            label="Skotning avslutad"
            date={obj.skotning_avslutad || null}
            onToggle={(val: any) => set({ ...obj, skotning_avslutad: val })}
            onDateChange={(val: any) => set({ ...obj, skotning_avslutad: val })}
          />
          {skotningWarning && <div style={{ ...styles.validationWarning, margin: '8px 0 0' }}>{skotningWarning}</div>}
        </div>
        {radMaskinTyp === 'forwarder' && <MaskinAvslutRuta obj={obj} set={set} field="skotning_avslutad" label="skotning" />}
      </div>
    </IosGroup>
  )
}

// ÖVERSIKTSSIDAN i sheeten: progressrad -> "Måste fyllas i" (öppna rader) ->
// "Mer om objektet" (undersidor) -> Exkludera. De obligatoriska fälten
// redigeras direkt här; allt annat nås via NavRad + oppnaSub.
function SheetOversikt({ obj, set, oppnaSub, bolag, setBolag, listAtgarder, atgarderSlut, setAtgarderSlut, atgarderGallring, setAtgarderGallring, info, filRader, filHamtStatus, gruppSkotningAvslutad, skotareSanderEj }: any) {
  const isGallring = obj.huvudtyp === 'Gallring'
  const atgarder = isGallring ? atgarderGallring : atgarderSlut
  const setAtgarder = isGallring ? setAtgarderGallring : setAtgarderSlut
  const [oppetFalt, setOppetFalt] = useState<any>(null)
  const [pendingHuvudtyp, setPendingHuvudtyp] = useState<any>(null)

  const kravFalt = kravFaltFor(obj)
  const saknas = kravFalt.filter(f => !obj[f.key])
  const warnings = getWarnings(obj)
  const avslutWarn = warnings.find(w => w.key === 'reported_end' || w.key === 'maybe_done')
  const radTyp = (obj.maskin_typ || '').toLowerCase()

  // Vilka maskinrader som visas styrs av FAKTISK data (useMatchning) — aldrig
  // dim_objekt.maskin_id, som på delade objekt bara pekar på senast skrivande
  // fil. Noll data -> visa båda raderna (gissa inte).
  const harSkordarData = (info?.skordatM3 ?? 0) > 0
  const harSkotarData = (info?.skotatM3 ?? 0) > 0 || (Number(obj.skotad_volym_manuell) || 0) > 0
  const ingenData = !harSkordarData && !harSkotarData
  const visaSkordare = harSkordarData || ingenData
  // Skotare-raden syns även utan data när skotningen är avslutad eller
  // skotarmaskinen aldrig sänder filer — uppräkningen måste vara nåbar
  // från noll (Åkarp-fallet: skotad utan en enda lassrad)
  const visaSkotare = harSkotarData || ingenData || !!gruppSkotningAvslutad || !!skotareSanderEj

  const requestHuvudtyp = (v: any) => {
    if (v === obj.huvudtyp) { setOppetFalt(null); return }
    if (obj.atgard) {
      setPendingHuvudtyp(v)
    } else {
      // Rör inte atgard här — den är redan tom, och null -> '' skulle
      // räknas som en fantomändring i Spara-räknaren
      set({ ...obj, huvudtyp: v })
      setOppetFalt(null)
    }
  }

  // Radsammanfattningar — det viktigaste utan att öppna undersidan
  const identitetSum = looksLikeAutoDate(obj.object_name)
    ? { text: 'Autogenererat namn', warn: true }
    : { text: obj.vo_nummer ? `VO ${obj.vo_nummer}` : 'VO saknas', warn: false }

  const maskinSum = (avslutadDatum: any, egenskaper: any[], arRadensTyp: boolean) => {
    const aktiva = egenskaper.filter(e => obj[e.key] === true).length
    const suffix = aktiva > 0 ? ` · ${aktiva} ${aktiva === 1 ? 'aktiv' : 'aktiva'}` : ''
    if (avslutWarn && arRadensTyp) {
      return { text: avslutWarn.key === 'reported_end' ? 'Avslut ej markerat' : 'Verkar klar — ej markerad', warn: true }
    }
    if (avslutadDatum) return { text: `Klar ${fmtKortDatum(avslutadDatum)}${suffix}`, warn: false }
    return { text: `Pågår${suffix}`, warn: false }
  }
  const skordareSum = maskinSum(obj.skordning_avslutad, EGENSKAPER_SKORDARE, radTyp === 'harvester')
  const skotareSum = maskinSum(obj.skotning_avslutad, EGENSKAPER_SKOTARE, radTyp === 'forwarder')

  const skotningSum = {
    text: obj._extern_skotning ? 'Extern skotare' : obj.egen_skotning ? 'Egen skotning' : '—',
    warn: false,
  }
  const harUndantag = obj.timpeng !== true && (
    (Number(obj.timpeng_undantag_timmar_skordare) || 0) > 0 ||
    (Number(obj.timpeng_undantag_timmar_skotare) || 0) > 0 ||
    (Number(obj.timpeng_undantag_volym) || 0) > 0)
  const prisSum = {
    text: `${obj.timpeng === true ? 'Timpeng' : 'Ackord'}${harUndantag ? ' · undantag' : ''}`,
    warn: false,
  }

  const fil = filStatus(obj, filRader, { skotareSanderEjFiler: skotareSanderEj })
  const antalFiler = (filRader || []).reduce((sum: number, r: any) => sum + (r.antalFiler || 0), 0)
  const filerSum = filHamtStatus === 'fel' ? { text: 'Kunde inte läsas', warn: true }
    : filHamtStatus === 'laddar' ? { text: 'Läser …', warn: false }
    : fil.ovantadSkotardata ? { text: 'Oväntad skotardata', warn: true }
    : fil.skordare === 'saknas' && fil.skotare === 'saknas' ? { text: 'Inget data ännu', warn: true }
    : fil.skotare === 'saknas' ? { text: 'Skotardata saknas', warn: true }
    : fil.skordare === 'saknas' ? { text: 'Skördardata saknas', warn: true }
    : { text: `${antalFiler} ${antalFiler === 1 ? 'fil' : 'filer'}`, warn: false }

  return (
    <>
      <div
        style={{ ...styles.progressHeader, cursor: saknas.length > 0 ? 'pointer' : 'default' }}
        onClick={() => {
          if (saknas.length === 0) return
          setOppetFalt(saknas[0].key)
          scrollAndFlash(saknas[0].target)
        }}
      >
        <MiniRing progress={(kravFalt.length - saknas.length) / kravFalt.length} />
        <span style={styles.progressText}>{progressText(saknas, kravFalt.length)}</span>
      </div>

      <IosGroup title="Måste fyllas i">
        <div id="huvudtyp-section">
          {arRisjobb(obj) ? (
            /* Typen ÄR risskotning — härledd, inte vald. Ingen väljare, inget
               krav: att tvinga fram Slutavverkning/Gallring på ett risjobb ger
               bara felmärkt data. */
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px' }}>
              <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)' }}>Typ</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#f0b24c' }}>
                Grot (risskotning)
              </span>
            </div>
          ) : (
            <KravRad label="Huvudtyp" value={obj.huvudtyp} expanded={oppetFalt === 'huvudtyp'} onToggle={() => setOppetFalt(oppetFalt === 'huvudtyp' ? null : 'huvudtyp')}>
              <div style={{ padding: '0 16px 16px' }}>
                <div style={styles.chipGrid as any}>
                  {HUVUDTYPER.map(h => (
                    <Chip key={h} label={h} selected={obj.huvudtyp === h} onClick={() => requestHuvudtyp(h)} editMode={false} onDelete={() => {}} />
                  ))}
                </div>
              </div>
            </KravRad>
          )}
        </div>
        <div id="bolag-section">
          <KravRad label="Bolag" value={obj.bolag} expanded={oppetFalt === 'bolag'} onToggle={() => setOppetFalt(oppetFalt === 'bolag' ? null : 'bolag')}>
            <ChipInput embedded label={null} value={obj.bolag || ''} options={bolag} setOptions={setBolag} onChange={(v: any) => { set({ ...obj, bolag: v }); if (v) setOppetFalt(null) }} onAddOption={listAtgarder?.onAddBolag} onRemoveOption={listAtgarder?.onRemoveBolag} />
          </KravRad>
        </div>
        <div id="skogsagare-section">
          <KravRad label="Markägare" value={obj.skogsagare} expanded={oppetFalt === 'skogsagare'} onToggle={() => setOppetFalt(oppetFalt === 'skogsagare' ? null : 'skogsagare')}>
            <div style={{ padding: '0 16px 16px' }}>
              <input
                autoFocus
                type="text"
                value={obj.skogsagare || ''}
                onChange={(e) => set({ ...obj, skogsagare: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') setOppetFalt(null) }}
                placeholder="Skriv markägarens namn …"
                style={{ ...styles.chipInput, marginBottom: 0 } as any}
              />
            </div>
          </KravRad>
        </div>
        <div id="atgard-section">
          <KravRad label="Åtgärd" value={obj.atgard} expanded={oppetFalt === 'atgard'} onToggle={() => setOppetFalt(oppetFalt === 'atgard' ? null : 'atgard')}>
            {obj.huvudtyp ? (
              <ChipInput embedded label={null} value={obj.atgard || ''} options={atgarder} setOptions={setAtgarder} onChange={(v: any) => { set({ ...obj, atgard: v }); if (v) setOppetFalt(null) }} />
            ) : (
              <div style={{ padding: '0 16px 16px', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Välj huvudtyp först.</div>
            )}
          </KravRad>
        </div>
      </IosGroup>

      <IosGroup title="Mer om objektet">
        <NavRad label="Identitet" summary={identitetSum.text} warn={identitetSum.warn} onClick={() => oppnaSub('identitet')} />
        <NavRad label="Filer" summary={filerSum.text} warn={filerSum.warn} onClick={() => oppnaSub('filer')} />
        {visaSkordare && <NavRad label="🌲 Skördare" summary={skordareSum.text} warn={skordareSum.warn} onClick={() => oppnaSub('skordare')} />}
        {visaSkotare && <NavRad label="🚜 Skotare" summary={skotareSum.text} warn={skotareSum.warn} onClick={() => oppnaSub('skotare')} />}
        <NavRad label="Skotning" summary={skotningSum.text} warn={skotningSum.warn} onClick={() => oppnaSub('skotning')} />
        <NavRad label="Pris & ersättning" summary={prisSum.text} warn={prisSum.warn} onClick={() => oppnaSub('pris')} />
      </IosGroup>

      {/* Exkludera — medvetet ÖPPEN rad längst ned, aldrig gömd i undersida */}
      <IosGroup title="Statistik">
        <div style={{ padding: '12px 16px' }}>
          <EgenskapSwitch
            label="Exkludera från statistik"
            active={obj.exkludera}
            onClick={() => set({ ...obj, exkludera: !obj.exkludera })}
            orange
          />
        </div>
      </IosGroup>

      <ConfirmDialog
        open={!!pendingHuvudtyp}
        title="Byt huvudtyp?"
        message={`Detta tar bort vald åtgärd ("${obj.atgard}"). Du måste välja åtgärd på nytt.`}
        confirmLabel="Byt huvudtyp"
        cancelLabel="Avbryt"
        onConfirm={() => {
          set({ ...obj, huvudtyp: pendingHuvudtyp, atgard: '' })
          setPendingHuvudtyp(null)
          setOppetFalt(null)
        }}
        onCancel={() => setPendingHuvudtyp(null)}
      />
    </>
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
        if (gruppIds.includes(o.objekt_id)) uppdaterad = { ...uppdaterad, ...gemensamt }
        if (skordarIds.includes(o.objekt_id)) uppdaterad = { ...uppdaterad, ...skordarPatch }
        if (skotarIds.includes(o.objekt_id)) uppdaterad = { ...uppdaterad, ...skotarPatch }
        return uppdaterad
      }))
      // F2: risjobbets färdigmarkering driver grot-avbockningen på de kopplade
      // avverkningsobjekten. Körs EFTER lyckad save — färdigmarkeringen ska ha
      // landat innan automatiken agerar på den. Misslyckas den stängs INTE
      // sheeten: felet syns, för en halvkörd avbockning ska aldrig tigas ihjäl.
      if (valtObjekt.risskotning === true) {
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

  const titlar: any = { identitet: 'Identitet', filer: 'Filer', skordare: '🌲 Skördare', skotare: '🚜 Skotare', skotning: 'Skotning', pris: 'Pris & ersättning' }
  // Filer över hela VO-gruppen — ett fysiskt objekt är ofta flera rader,
  // och en kopplad maskinrad ska synas oavsett vilken rad som öppnas
  const filRader = valtObjekt && fildata?.status === 'ok'
    ? slaIhopFildata(syskon.map((o: any) => fildata.perObjekt.get(o.objekt_id)))
    : undefined

  return (
    <>
      <EditSheet
        open={!!valtObjekt}
        onClose={attemptCloseModal}
        onBack={subpage ? () => setSubpage(null) : undefined}
        title={valtObjekt ? (subpage ? titlar[subpage] : (valtObjekt.object_name || 'Namnlöst objekt')) : ''}
        subtitel={valtObjekt && !subpage ? <MaskinBadges syskon={syskon} kortInfo={kortInfo} /> : null}
        contentKey={subpage || 'oversikt'}
        footer={valtObjekt && (subpage
          ? <button onClick={() => setSubpage(null)} className="tap-press" style={styles.klarBtn}>Klar</button>
          : <SaveButton onClick={sparaObjekt} saving={saving} saved={saved} dirty={isDirty} antal={andradeNycklar.length} />)}
      >
        {valtObjekt && !subpage && (
          <SheetOversikt
            obj={valtObjekt} set={setValtObjekt} oppnaSub={setSubpage}
            bolag={bolag} setBolag={setBolag} listAtgarder={listAtgarder}
            atgarderSlut={atgarderSlut} setAtgarderSlut={setAtgarderSlut}
            atgarderGallring={atgarderGallring} setAtgarderGallring={setAtgarderGallring}
            info={info} filRader={filRader} filHamtStatus={fildata?.status || 'laddar'}
            gruppSkotningAvslutad={gruppSkotningAvslutad} skotareSanderEj={skotareSanderEj}
          />
        )}
        {valtObjekt && subpage === 'filer' && (
          <SubFiler obj={valtObjekt} rader={filRader} hamtStatus={fildata?.status || 'laddar'} skotareSanderEj={skotareSanderEj} />
        )}
        {valtObjekt && subpage === 'identitet' && (
          <SubIdentitet obj={valtObjekt} set={setValtObjekt} inkopare={inkopare} setInkopare={setInkopare} listAtgarder={listAtgarder} />
        )}
        {valtObjekt && subpage === 'skordare' && <SubSkordare obj={valtObjekt} set={setValtObjekt} syskon={syskon} onRaderUppdaterade={raderUppdaterade} />}
        {valtObjekt && subpage === 'skotare' && (
          <SubSkotare obj={valtObjekt} set={setValtObjekt} info={info} skordatTotal={skordatTotal} skotatTotal={skotatTotal} gruppSkotningAvslutad={gruppSkotningAvslutad} skotareSanderEj={skotareSanderEj} syskon={syskon} onRaderUppdaterade={raderUppdaterade} />
        )}
        {valtObjekt && subpage === 'skotning' && <SubSkotning obj={valtObjekt} set={setValtObjekt} />}
        {valtObjekt && subpage === 'pris' && <SubPris obj={valtObjekt} set={setValtObjekt} />}
      </EditSheet>
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

// Tokenbaserad namn-/markägarlikhet för koppla-kandidater. Maskinens
// jobbnamn ("Görgen Gustafsson Amundshylte") jämförs mot objektnamn +
// markägare — minst hälften av jobbnamnets ord ska träffa.
function namnTokens(s: string): string[] {
  return String(s || '').toLowerCase().split(/[^a-zåäöé0-9]+/).filter(t => t.length >= 3)
}

function kandidatPoang(jobbNamn: string, obj: any): number {
  const jt = new Set(namnTokens(jobbNamn))
  if (jt.size === 0) return 0
  const ot = new Set([...namnTokens(obj.object_name || ''), ...namnTokens(obj.skogsagare || '')])
  let traff = 0
  jt.forEach(t => { if (ot.has(t)) traff++ })
  return traff / jt.size
}

// Topp 3 kandidater, dedupade per VO-grupp (en grupp = ett fysiskt objekt)
function hittaKandidater(jobb: any, objekt: any[]): any[] {
  if (!jobb.namn) return []
  const perVo = new Map<string, any>()
  objekt.forEach((o: any) => {
    if (o.exkludera === true) return
    const poang = kandidatPoang(jobb.namn, o)
    if (poang < 0.5) return
    const nyckel = o.vo_nummer || o.objekt_id
    const prev = perVo.get(nyckel)
    if (!prev || poang > prev.poang) perVo.set(nyckel, { objekt: o, poang })
  })
  return Array.from(perVo.values()).sort((a, b) => b.poang - a.poang).slice(0, 3)
}

// Kort i arbetslistan — visar VAD objektet ÄR (volym, senaste aktivitet,
// maskin, via useMatchning-berikningen) så man ser direkt om det är skräp
// eller riktigt utan att öppna det. Namnlöst är ett hederligt tillstånd
// med två åtgärder: Namnge (öppnar sheeten) eller Ignorera (exkludera).
function ArbetsKort({ obj, info, modell, fildata, filRader, sanderEj, volym, warnings, onOppna, onIgnorera, delay }: any) {
  const namnlos = !obj.object_name
  const meta = []
  if (modell) meta.push(modell)
  if (info?.senasteAktivitet) meta.push(`senast ${info.senasteAktivitet}`)
  if (info?.skordatM3 > 0) meta.push(`${info.skordatM3.toLocaleString('sv-SE')} m³ skördat`)
  if (info?.skotatM3 > 0) meta.push(`${info.skotatM3.toLocaleString('sv-SE')} m³ skotat`)
  const knapp = {
    flex: 1, minHeight: 44, borderRadius: 10, fontSize: 13, fontWeight: 600,
    fontFamily: 'inherit', cursor: 'pointer',
  }
  return (
    <AnimatedCard delay={delay} onClick={onOppna}>
      <div style={styles.kortInner}>
        <div style={styles.kortTop}>
          <div style={{ flex: 1 }}>
            {namnlos ? (
              <div style={{ ...styles.kortNamn, color: '#FF9F0A' }}>Namnlöst objekt</div>
            ) : (
              <div style={styles.kortNamn}>{obj.object_name}</div>
            )}
            <div style={styles.kortVo}>{obj.vo_nummer}</div>
          </div>
          {fildata?.status === 'ok' && <MaskinPrickar obj={obj} rader={filRader} sanderEj={sanderEj} />}
          <div style={styles.kortPil}>›</div>
        </div>
        {meta.length > 0 && <div style={styles.kortInfo}>{meta.join(' · ')}</div>}
        <KortBadges obj={obj} volym={volym} warnings={warnings} />
        {namnlos && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
            <button onClick={onOppna} className="tap-press" style={{ ...knapp, border: 'none', background: '#adc6ff', color: '#000' }}>Namnge</button>
            <button onClick={onIgnorera} className="tap-press" style={{ ...knapp, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.75)' }}>Ignorera</button>
          </div>
        )}
      </div>
    </AnimatedCard>
  )
}

export default function ObjektRedigering() {
  const [objekt, setObjekt] = useState<any[]>([])
  const [maskiner, setMaskiner] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bolag, setBolag] = useState(STANDARD_BOLAG)
  const [inkopare, setInkopare] = useState<string[]>([])
  const [atgarderSlut, setAtgarderSlut] = useState(['LRK', 'Rp', 'Au', 'Special', 'VF/Bark'])
  const [atgarderGallring, setAtgarderGallring] = useState(['Första gallring', 'Andra gallring'])
  // Objektet som redigeras — all sheet-logik bor i ObjektEditor
  const [redigerObj, setRedigerObj] = useState<any>(null)
  const [saveError, setSaveError] = useState('')
  const [visaAllaObjekt, setVisaAllaObjekt] = useState(false)
  const [visaMatchning, setVisaMatchning] = useState(false)
  // DEL 2: jobb med maskindata men utan objekt (hpr_filer-VO utan dim_objekt)
  const [hprFiler, setHprFiler] = useState<any[]>([])
  const [hprStatus, setHprStatus] = useState<'laddar' | 'fel' | 'ok'>('laddar')
  const [maskinTyper, setMaskinTyper] = useState<Record<string, string | null>>({})
  const [skapaJobb, setSkapaJobb] = useState<any>(null)
  const [skapar, setSkapar] = useState(false)
  const [visaSmajobb, setVisaSmajobb] = useState(false)
  const [oppetKopplaJobb, setOppetKopplaJobb] = useState<string | null>(null) // larmrad med expanderad kandidatlista
  const [kopplaVal, setKopplaVal] = useState<any>(null) // { jobb, kandidat } -> ConfirmDialog
  const [kopplar, setKopplar] = useState(false)
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

  const openObjekt = (obj: any) => setRedigerObj(obj)

  // Hämta från Supabase vid start
  useEffect(() => {
    Promise.all([
      hamtaObjektFranSupabase(),
      hamtaMaskinerFranSupabase(),
      supabase.from('hpr_filer').select('objekt_nyckel, filnamn, stammar_count'),
    ])
      .then(async ([objektData, maskinData, hprRes]) => {
        // Skapa lookup-objekt för maskiner: { maskin_id: modell }
        const maskinLookup = {}
        const maskinTypMap = {}
        maskinData.forEach(m => {
          maskinLookup[m.maskin_id] = m.modell
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

  // ARBETSLISTAN — det som behöver en människa, per VO-grupp. Namnlösa
  // först (importen hittar inte på namn längre), sedan grupper där NÅGON
  // rad har varningar, efter senaste aktivitet. Listans längd ÄR statusen.
  const namnlosa = aktivaGrupper.filter(g => !g.rep.object_name)
  const ofullstandiga = aktivaGrupper
    .filter(g => g.rep.object_name && gruppVarningar(g.rader, volymForGrupp(objekt, kortInfo, g.rep)).length > 0)
    .sort((a, b) => gruppSenaste(b).localeCompare(gruppSenaste(a)))
  const attAtgarda = [...namnlosa, ...ofullstandiga]

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
    const mal = kandidat.objekt
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
    } else {
      const ny = { ...data[0], maskin_typ: maskinTyper[jobb.maskinId] || null }
      setObjekt((prev: any[]) => [...prev, ny])
      setKopplaVal(null)
      setOppetKopplaJobb(null)
      setRedigerObj(ny) // öppna gruppen — Filer-undersidan visar nu jobbets filer
    }
    setKopplar(false)
  }

  // Loading-vy
  if (loading) {
    return (
      <div style={{...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh'}}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>Laddar objekt …</div>
        </div>
      </div>
    )
  }

  // Error-vy
  if (error) {
    return (
      <div style={{...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh'}}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ color: 'rgba(255,140,140,0.9)', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Kunde inte ansluta</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 20 }}>{error}</div>
          <button onClick={() => window.location.reload()} style={{ minHeight: 56, padding: '0 24px', borderRadius: 14, border: 'none', background: '#adc6ff', color: '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            Försök igen
          </button>
        </div>
      </div>
    )
  }

  if (visaMatchning) {
    return <MatchningsVy matchning={matchning} onBack={() => setVisaMatchning(false)} />
  }

  if (visaAllaObjekt) {
    return <AllaObjektVy objekt={objekt} setObjekt={setObjekt} bolag={bolag} setBolag={setBolag} inkopare={inkopare} setInkopare={setInkopare} atgarderSlut={atgarderSlut} setAtgarderSlut={setAtgarderSlut} atgarderGallring={atgarderGallring} setAtgarderGallring={setAtgarderGallring} maskiner={maskiner} kortInfo={kortInfo} fildata={fildata} listAtgarder={listAtgarder} onBack={() => setVisaAllaObjekt(false)} />
  }

  return (
    <div style={styles.container}>
      <style>{GLOBAL_CSS}</style>

      <div style={styles.header}>
        <div style={styles.headerCenter}>
          <div style={styles.titel}>Objekt</div>
          <div style={styles.subtitel}>{attAtgarda.length === 0 ? 'Allt åtgärdat' : `${attAtgarda.length} att åtgärda`}</div>
        </div>
      </div>

      {/* DEL 2: LARM — maskindata som inte hör till något objekt. Överst,
          orange vänsterkant: det här är riktiga jobb som är osynliga i
          resten av systemet tills objektet skapas. */}
      {hprStatus === 'fel' && (
        <div style={{ ...styles.smajobbWrap, color: 'rgba(255,160,160,0.9)' }}>
          Kunde inte läsa maskinjobben (hpr_filer) — okopplade jobb kan inte visas
        </div>
      )}
      {okopplade.larm.length > 0 && (
        <div style={styles.larmBox}>
          <div style={styles.larmHeader}>
            <span style={styles.larmIkon}>!</span>
            <span>{okopplade.larm.length} {okopplade.larm.length === 1 ? 'jobb har data men inget objekt' : 'jobb har data men inget objekt'}</span>
          </div>
          {okopplade.larm.map((j: any) => {
            const kandidater = hittaKandidater(j, objekt)
            const oppen = oppetKopplaJobb === j.nyckel
            return (
              <Fragment key={j.nyckel}>
                <div style={{ ...styles.larmRad, borderTop: '1px solid rgba(255,159,10,0.12)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {j.namn || 'Namnlöst jobb'}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                      VO {j.vo} · {j.stammar.toLocaleString('sv-SE')} stammar · {maskiner[j.maskinId] || j.maskinId}
                    </div>
                  </div>
                  {kandidater.length > 0 ? (
                    <button onClick={() => setOppetKopplaJobb(oppen ? null : j.nyckel)} className="tap-press" style={styles.skapaBtn}>Koppla ›</button>
                  ) : (
                    <button onClick={() => setSkapaJobb(j)} className="tap-press" style={styles.skapaBtn}>Skapa nytt ›</button>
                  )}
                </div>
                {oppen && (
                  <div style={styles.kandidatLista}>
                    <div style={styles.kandidatRubrik}>Koppla till befintligt objekt — troligast först</div>
                    {kandidater.map((k: any) => (
                      <button key={k.objekt.objekt_id} onClick={() => setKopplaVal({ jobb: j, kandidat: k })} className="tap-press" style={styles.kandidatRad as any}>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{k.objekt.object_name}</span>
                        <span style={{ flexShrink: 0, color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>VO {k.objekt.vo_nummer}{k.objekt.skogsagare ? ` · ${k.objekt.skogsagare}` : ''}</span>
                      </button>
                    ))}
                    <button onClick={() => { setOppetKopplaJobb(null); setSkapaJobb(j) }} className="tap-press" style={styles.kandidatSkapaNytt as any}>
                      Ingen av dessa stämmer — skapa nytt objekt
                    </button>
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      )}
      {okopplade.smajobb.length > 0 && (
        <div style={styles.smajobbWrap}>
          <button onClick={() => setVisaSmajobb(!visaSmajobb)} className="tap-press" style={styles.smajobbToggle as any}>
            <span style={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {okopplade.smajobb.length} småjobb utan VO · t.ex. {okopplade.smajobb.slice(0, 2).map((j: any) => j.namn || j.vo).join(', ')}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{visaSmajobb ? '▴' : '▾'}</span>
          </button>
          {visaSmajobb && okopplade.smajobb.map((j: any) => (
            <div key={j.nyckel} style={styles.smajobbRad}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.namn || 'Namnlöst'}</span>
              <span style={{ flexShrink: 0 }}>{j.vo} · {j.stammar.toLocaleString('sv-SE')} stammar · {maskiner[j.maskinId] || j.maskinId}</span>
            </div>
          ))}
        </div>
      )}

      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitel}>Att åtgärda</span>
        <span style={styles.sectionCount}>{attAtgarda.length}</span>
      </div>

      {attAtgarda.length === 0 ? (
        <div style={styles.allaDone}>
          <div style={styles.allaDoneCheck}>✓</div>
          <div>Inget att åtgärda</div>
        </div>
      ) : (
        <div style={styles.lista}>
          {attAtgarda.map((g, i) => (
            <ArbetsKort
              key={g.nyckel}
              obj={g.rep}
              info={gruppKortInfo(g)}
              modell={gruppModeller(g, maskiner)}
              fildata={fildata}
              filRader={filRaderGrupp(g.rep)}
              sanderEj={gruppSkotareSanderEj(g.rader, fildata)}
              volym={volymForGrupp(objekt, kortInfo, g.rep)}
              warnings={gruppVarningar(g.rader, volymForGrupp(objekt, kortInfo, g.rep))}
              delay={i * 60}
              onOppna={() => openObjekt(g.rep)}
              onIgnorera={() => ignoreraGrupp(g)}
            />
          ))}
        </div>
      )}

      {/* MATCHNING — summering + en knapp; listorna bor i egen vy så bara
          arbetslistan konkurrerar om uppmärksamheten på förstasidan */}
      <div style={{ ...styles.sectionHeader, marginTop: 28 }}>
        <span style={styles.sectionTitel}>Matchning</span>
      </div>
      <div style={{ margin: '0 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
        {matchning.status === 'ok' ? (
          <>
            {[
              { text: 'maskinobjekt utan planering', antal: matchning.omatchadeMaskin.length, varning: true },
              { text: 'planerade utan maskindata', antal: matchning.utanMaskindata.length, varning: true },
              { text: 'kopplade', antal: matchning.matchade.length, varning: false },
            ].map((rad, i) => (
              <div key={rad.text} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', fontSize: 13 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: rad.varning && rad.antal > 0 ? '#FF9F0A' : '#30d158', flexShrink: 0 }} />
                <span style={{ color: 'rgba(255,255,255,0.75)' }}>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{rad.antal}</span> {rad.text}
                </span>
              </div>
            ))}
            <button onClick={() => setVisaMatchning(true)} className="tap-press" style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent', color: '#adc6ff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
              Öppna matchning ›
            </button>
          </>
        ) : (
          <div style={{ padding: '12px 16px', fontSize: 12, color: matchning.status === 'fel' ? 'rgba(255,160,160,0.9)' : 'rgba(255,255,255,0.4)' }}>
            {matchning.status === 'fel' ? 'Kunde inte läsa matchningsdata' : 'Läser matchningsdata …'}
          </div>
        )}
      </div>

      <div style={{ padding: '24px 20px 0' }}>
        <button
          onClick={() => setVisaAllaObjekt(true)}
          className="tap-press"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 52, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'rgba(255,255,255,0.65)', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}
        >
          Alla objekt <span style={{ opacity: 0.6 }}>({aktivaGrupper.length})</span> ›
        </button>
      </div>

      {exkluderadeGrupper.length > 0 && (
        <>
          <div style={{...styles.sectionHeader, marginTop: 40}}>
            <span style={{...styles.sectionTitel, color: 'rgba(255,255,255,0.4)'}}>Exkluderade</span>
            <span style={{...styles.sectionCount, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)'}}>{exkluderadeGrupper.length}</span>
          </div>
          <div style={styles.lista}>
            {exkluderadeGrupper.map((g, i) => (
              <AnimatedCard key={g.nyckel} delay={i * 60} onClick={() => openObjekt(g.rep)}>
                <div style={{...styles.kortInner, opacity: 0.5}}>
                  <div style={styles.kortTop}>
                    <div style={{flex: 1}}>
                      <div style={styles.kortNamn}>{g.rep.object_name || 'Namnlöst objekt'}</div>
                      <div style={styles.kortVo}>{g.rep.vo_nummer}</div>
                    </div>
                    <div style={styles.kortPil}>›</div>
                  </div>
                  <div style={styles.kortInfo}>
                    {gruppModeller(g, maskiner) && <span>{gruppModeller(g, maskiner)}</span>}
                  </div>
                </div>
              </AnimatedCard>
            ))}
          </div>
        </>
      )}

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
      {saveError && (
        <div style={styles.saveErrorToast} role="alert">{saveError}</div>
      )}
    </div>
  )
}

// VY 2 - ALLA OBJEKT
function AllaObjektVy({ objekt, setObjekt, bolag, setBolag, inkopare, setInkopare, atgarderSlut, setAtgarderSlut, atgarderGallring, setAtgarderGallring, maskiner, kortInfo, fildata, listAtgarder, onBack }: any) {
  const [search, setSearch] = useState('')
  const [filterBolag, setFilterBolag] = useState(null)
  const [filterHuvudtyp, setFilterHuvudtyp] = useState(null)
  const [filterInkopare, setFilterInkopare] = useState(null)
  const [showSearch, setShowSearch] = useState(false)
  const [redigerObj, setRedigerObj] = useState<any>(null)
  const [backHover, setBackHover] = useState(false)
  const [titleHover, setTitleHover] = useState(false)

  const openObjekt = (obj: any) => setRedigerObj(obj)

  // "Alla objekt" = alla AKTIVA, grupperade per VO — ett fysiskt objekt är
  // ETT kort även när det består av flera maskinrader. Sök/filter träffar
  // om NÅGON rad i gruppen matchar.
  const allaAktiva = objekt.filter(o => o.exkludera !== true)
  const unikaBolag = [...new Set(allaAktiva.map(o => o.bolag).filter(Boolean))].sort()
  const unikaInkopare = [...new Set(allaAktiva.map(o => o.inkopare).filter(Boolean))].sort()

  let filtered = grupperaPerVo(objekt).filter(g => g.rader.some((o: any) => o.exkludera !== true))

  if (search.trim()) {
    const s = search.toLowerCase()
    filtered = filtered.filter(g => g.rader.some((o: any) =>
      o.object_name?.toLowerCase().includes(s) ||
      o.vo_nummer?.toLowerCase().includes(s) ||
      o.skogsagare?.toLowerCase().includes(s) ||
      o.bolag?.toLowerCase().includes(s) ||
      o.inkopare?.toLowerCase().includes(s)
    ))
  }

  if (filterBolag) filtered = filtered.filter(g => g.rader.some((o: any) => o.bolag === filterBolag))
  if (filterHuvudtyp) filtered = filtered.filter(g => g.rader.some((o: any) => o.huvudtyp === filterHuvudtyp))
  if (filterInkopare) filtered = filtered.filter(g => g.rader.some((o: any) => o.inkopare === filterInkopare))

  const hasActiveFilters = filterBolag || filterHuvudtyp || filterInkopare || search.trim()

  function clearFilters() {
    setFilterBolag(null)
    setFilterHuvudtyp(null)
    setFilterInkopare(null)
    setSearch('')
  }

  return (
    <div style={styles.container}>
      <style>{GLOBAL_CSS}</style>

      <div style={styles.header}>
        <button 
          onClick={onBack} 
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
          style={{
            ...styles.backBtn,
            background: backHover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
            transform: backHover ? 'scale(1.05)' : 'scale(1)'
          }}
        >‹</button>
        <div 
          style={{...styles.headerCenter, cursor: 'pointer'}}
          onClick={() => setShowSearch(!showSearch)}
          onMouseEnter={() => setTitleHover(true)}
          onMouseLeave={() => setTitleHover(false)}
        >
          <div style={{...styles.titel, transform: titleHover ? 'scale(1.02)' : 'scale(1)', transition: 'transform 0.2s ease'}}>Alla objekt</div>
          <div style={styles.subtitel}>
            {filtered.length} objekt {hasActiveFilters && '(filtrerat)'} 
            <span style={{ marginLeft: 8, opacity: titleHover ? 1 : 0.5, transition: 'opacity 0.2s ease' }}>
              {showSearch ? '▲' : '▼'}
            </span>
          </div>
        </div>
        <div style={{ width: 48 }} />
      </div>

      {showSearch && (
        <div style={styles.searchFilterPanel}>
          <div style={styles.searchBox}>
            <input 
              type="text" 
              placeholder="Sök objekt, markägare, bolag..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              style={styles.searchInput} 
              autoFocus
            />
            {search && <button onClick={() => setSearch('')} style={styles.searchClear}>✕</button>}
          </div>

          <div style={styles.filterSection}>
            <div style={styles.filterLabel}>Huvudtyp</div>
            <div style={styles.filterChips}>
              <FilterChip label="Slutavverkning" active={filterHuvudtyp === 'Slutavverkning'} onClick={() => setFilterHuvudtyp(filterHuvudtyp === 'Slutavverkning' ? null : 'Slutavverkning')} />
              <FilterChip label="Gallring" active={filterHuvudtyp === 'Gallring'} onClick={() => setFilterHuvudtyp(filterHuvudtyp === 'Gallring' ? null : 'Gallring')} />
            </div>
          </div>

          <div style={styles.filterSection}>
            <div style={styles.filterLabel}>Bolag</div>
            <div style={styles.filterChips}>
              {unikaBolag.map(b => (
                <FilterChip key={b} label={b} active={filterBolag === b} onClick={() => setFilterBolag(filterBolag === b ? null : b)} />
              ))}
            </div>
          </div>

          {unikaInkopare.length > 0 && (
            <div style={styles.filterSection}>
              <div style={styles.filterLabel}>Inköpare</div>
              <div style={styles.filterChips}>
                {unikaInkopare.map(i => (
                  <FilterChip key={i} label={i} active={filterInkopare === i} onClick={() => setFilterInkopare(filterInkopare === i ? null : i)} />
                ))}
              </div>
            </div>
          )}

          {hasActiveFilters && (
            <button onClick={clearFilters} style={styles.clearFiltersBtn}>
              Rensa alla filter
            </button>
          )}
        </div>
      )}

      <div style={styles.lista}>
        {filtered.map((g, i) => (
          <AnimatedCard key={g.nyckel} delay={i * 40} onClick={() => openObjekt(g.rep)}>
            <div style={styles.kortInner}>
              <div style={styles.kortTop}>
                <div style={{flex: 1}}>
                  <div style={g.rep.object_name ? styles.kortNamn : { ...styles.kortNamn, color: '#FF9F0A' }}>{g.rep.object_name || 'Namnlöst objekt'}</div>
                  <div style={styles.kortVo}>{g.rep.vo_nummer}</div>
                </div>
                {fildata?.status === 'ok' && <MaskinPrickar obj={g.rep} rader={slaIhopFildata(g.rader.map((o: any) => fildata.perObjekt.get(o.objekt_id)))} sanderEj={gruppSkotareSanderEj(g.rader, fildata)} />}
                <div style={styles.kortPil}>›</div>
              </div>
              <div style={styles.kortInfo}>
                {gruppModeller(g, maskiner) && <span>{gruppModeller(g, maskiner)} · </span>}
                {g.rep.huvudtyp} · {g.rep.bolag} · {g.rep.atgard}
              </div>
              <KortBadges obj={g.rep} warnings={gruppVarningar(g.rader, volymForGrupp(objekt, kortInfo, g.rep))} />
              <div style={styles.kortMeta}>{g.rep.skogsagare}</div>
            </div>
          </AnimatedCard>
        ))}
        {filtered.length === 0 && (
          <div style={styles.emptyState}>Inga objekt matchar</div>
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
    </div>
  )
}

const styles = {
  container: { position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, background: '#000', fontFamily: "'Geist', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", color: '#fff', padding: '16px 20px 100px', WebkitFontSmoothing: 'antialiased', overflowY: 'auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerCenter: { textAlign: 'center', flex: 1 },
  backBtn: { width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 24, cursor: 'pointer', transition: 'all 0.2s ease' },
  titel: { fontSize: 32, fontWeight: 700 },
  subtitel: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  sectionTitel: { fontSize: 18, fontWeight: 600, flex: 1 },
  sectionCount: { fontSize: 14, fontWeight: 600, color: '#FF9F0A', background: 'rgba(255,159,10,0.15)', padding: '4px 12px', borderRadius: 12 },
  subsectionLabel: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.2px', marginTop: 20, marginBottom: 10 },
  validationWarning: { margin: '12px 16px 4px', padding: '10px 14px', borderRadius: 12, background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.25)', color: 'rgba(255,200,120,0.95)', fontSize: 13, lineHeight: 1.4 },
  saveErrorToast: { position: 'fixed', bottom: 120, left: '50%', transform: 'translateX(-50%)', background: 'rgba(60,18,18,0.95)', color: 'rgba(255,160,160,0.98)', padding: '12px 18px', borderRadius: 12, fontSize: 14, fontWeight: 500, fontFamily: 'inherit', border: '1px solid rgba(255,69,58,0.35)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)', zIndex: 250, animation: 'fadeIn 0.2s ease', maxWidth: '90%', textAlign: 'center' },
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

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, backdropFilter: 'blur(10px)' },
  sheet: { position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1c1c1e', borderRadius: '24px 24px 0 0', zIndex: 101, maxHeight: '92vh', display: 'flex', flexDirection: 'column' },
  sheetHandle: { padding: '14px 0 10px', cursor: 'pointer', display: 'flex', justifyContent: 'center' },
  sheetBar: { width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' },
  sheetHeader: { padding: '4px 24px 20px', transition: 'border-color 0.2s ease' },
  sheetTitel: { fontSize: 22, fontWeight: 700 },
  scrollFade: { position: 'absolute', top: 80, left: 0, right: 0, height: 30, background: 'linear-gradient(to bottom, #1c1c1e, transparent)', zIndex: 1, pointerEvents: 'none', transition: 'opacity 0.2s ease' },
  sheetContent: { flex: 1, overflowY: 'auto', padding: '0 24px 24px' },
  sheetFooter: { padding: '16px 24px 40px' },
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
