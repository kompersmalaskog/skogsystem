'use client'
// Fördelning per skotare — öppnas från Skotare-sidan ("Fördela mellan skotarna").
// Svaret först (hur mycket är skotat), sedan EN rad per skotare. Ett tryck öppnar
// skotaren i samma ark ("‹ Alla skotare"), aldrig ett ark ovanpå. Varje skotare
// sparas för sig.
//
// Reglerna är oförändrade:
//  - mätt lass är standard; ett ifyllt värde ERSÄTTER lassen (adderar aldrig)
//  - omlastning = arbete (lass + G15 räknas på maskinen) men volymen räknas ALDRIG
//    mot objektets skotade total; länkas till det riktiga objektet (avser_objekt_id)
//  - egen skotning får aldrig bli mer än skördat (+0,5 m³ avrundning), omlastning omfattas aldrig
//  - raden nycklas på maskinens HEM-objekt (där dess lass ligger)
//  - en gammal objekt-nivå-rad (maskin_id NULL): bara G15 → flyttas in i maskinens rad och tas bort;
//    med riktig volym → rörs aldrig tyst, frågas om.
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens'
import Sektion from '@/components/design/Sektion'
import Rad from '@/components/design/Rad'
import Falt from '@/components/design/Falt'
import Ikon from '@/components/design/Ikon'
import { Brytare } from '@/components/redigering/ObjektOversikt'
import { useSkotareLass, type SkotareInsats } from './hooks/useSkotareLass'

export type Utkast = { egen: string; omlastning: string; g15: string; blandad: boolean; avser: string | null }

export function tillUtkast(i: SkotareInsats): Utkast {
  // Nya fält först; gamla rader (volym_m3 + ar_omlastning) visas som de menades.
  const egenV = i.manuellEgen != null ? i.manuellEgen
    : (!i.arOmlastning && i.manuellVolym != null ? i.manuellVolym : null)
  const omlV = i.manuellOmlastning != null ? i.manuellOmlastning
    : (i.arOmlastning && i.manuellVolym != null ? i.manuellVolym : null)
  return {
    egen: egenV != null ? String(egenV).replace('.', ',') : '',
    omlastning: omlV != null ? String(omlV).replace('.', ',') : '',
    g15: i.manuellG15 != null ? String(i.manuellG15).replace('.', ',') : '',
    blandad: i.arOmlastning || i.manuellOmlastning != null,
    avser: i.avserObjektId,
  }
}
const TOM_UTKAST: Utkast = { egen: '', omlastning: '', g15: '', blandad: false, avser: null }

export const num = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, '').replace(',', '.'); if (t === '') return null
  const n = Number(t); return Number.isFinite(n) ? n : null
}
const ogiltigt = (s: string) => s.trim() !== '' && num(s) == null

/** Det som räknas mot skotat: ifyllt ersätter lassen; tomt = lassen; tomt på blandad = 0. */
export function effektivVolym(i: SkotareInsats, u: Utkast): number {
  const e = num(u.egen)
  if (e != null) return e
  return u.blandad ? 0 : i.mattVolym
}

export function arAndrad(i: SkotareInsats, u: Utkast): boolean {
  const o = tillUtkast(i)
  return num(u.egen) !== num(o.egen) || num(u.g15) !== num(o.g15)
    || u.blandad !== o.blandad
    || (u.blandad && (num(u.omlastning) !== num(o.omlastning) || (u.avser || null) !== (o.avser || null)))
}

const tal = (v: number, dec = 0) => v.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const m3 = (v: number) => `${tal(Math.round(v))} m³`

export default function SkotareFordelning({ objektId, avverkatVolym }: { objektId: string; avverkatVolym: number }) {
  const { insatser, forwarders, laddar, fel, ladda } = useSkotareLass(objektId)
  const [extra, setExtra] = useState<SkotareInsats[]>([])
  const [oppen, setOppen] = useState<string | null>(null)
  const [krockar, setKrockar] = useState<{ objektId: string; volym: number }[]>([])
  const [krockSparar, setKrockSparar] = useState(false)
  const [krockFel, setKrockFel] = useState('')

  useEffect(() => { setExtra(e => e.filter(x => !insatser.some(i => i.maskinId === x.maskinId))) }, [insatser])

  const alla = useMemo(() => [...insatser, ...extra], [insatser, extra])
  const sparade = useMemo(() => {
    const u: Record<string, Utkast> = {}
    for (const i of alla) u[i.maskinId] = tillUtkast(i)
    return u
  }, [alla])
  const summa = alla.reduce((s, i) => s + effektivVolym(i, sparade[i.maskinId]), 0)

  const laggTill = (m: { maskin_id: string; namn: string }) => {
    setExtra(e => [...e, {
      maskinId: m.maskin_id, namn: m.namn, hemObjektId: objektId, mattVolym: 0, mattAntalLass: 0, mattG15: 0,
      radId: null, manuellVolym: null, manuellEgen: null, manuellOmlastning: null, manuellG15: null,
      arOmlastning: false, avserObjektId: null, notering: null,
    }])
    setOppen(m.maskin_id)
  }

  const ersattObjektNiva = async (oid: string) => {
    setKrockSparar(true); setKrockFel('')
    const { error } = await supabase.from('skotare_objekt_manuell')
      .delete().eq('objekt_id', oid).is('maskin_id', null).is('datum_fran', null)
    if (error) { setKrockFel('Kunde inte ta bort den gamla volymen. Försök igen.'); setKrockSparar(false); return }
    await supabase.from('dim_objekt').update({ skotad_volym_manuell: null }).eq('objekt_id', oid)
    setKrockar(k => k.filter(x => x.objektId !== oid))
    setKrockSparar(false); ladda()
  }

  if (laddar) return <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Läser skotarna …</p>
  if (fel) return <p role="alert" style={{ margin: 0, ...TYP.text, color: FARG.rod }}>Skotarna kunde inte läsas.</p>

  const vald = oppen ? alla.find(i => i.maskinId === oppen) : null
  if (vald) {
    const ovriga = alla.filter(i => i.maskinId !== vald.maskinId).reduce((s, i) => s + effektivVolym(i, sparade[i.maskinId]), 0)
    return (
      <SkotareDetalj key={vald.maskinId} insats={vald} objektId={objektId} avverkat={avverkatVolym} ovrigaVolym={ovriga}
        onTillbaka={() => setOppen(null)}
        onSparad={(k) => { setKrockar(prev => [...prev.filter(x => !k.some(y => y.objektId === x.objektId)), ...k]); setOppen(null); ladda() }} />
    )
  }

  const kvar = forwarders.filter(f => !alla.some(i => i.maskinId === f.maskin_id))
  const over = avverkatVolym > 0 && summa > avverkatVolym + 0.5

  return (
    <div data-fordelning="">
      <div style={{ marginBottom: AVSTAND.xl }}>
        <div style={{ ...TYP.micro, color: FARG.text2 }}>Skotat</div>
        <div data-fordelning-summa="" style={{ ...TYP.tal, marginTop: AVSTAND.xs, ...TNUM }}>{m3(summa)}</div>
        <div style={{ ...TYP.text, color: over ? FARG.orange : FARG.text2, marginTop: AVSTAND.xs, ...TNUM }}>
          {avverkatVolym > 0
            ? (over ? `${m3(summa - avverkatVolym)} mer än skördat` : `av ${m3(avverkatVolym)} skördat`)
            : 'Inget skördat att jämföra med'}
        </div>
      </div>

      <Sektion rubrik="Skotarna" inset not={alla.length > 0 ? 'Tryck på en skotare för att ändra.' : undefined}>
        {alla.length === 0
          ? <Rad titel="Ingen skotare har skickat lass än" dampad sista />
          : alla.map((i, n) => {
            const u = sparade[i.maskinId]
            const egen = num(u.egen) != null
            const oml = u.blandad ? num(u.omlastning) : null
            const under = [
              i.mattAntalLass > 0 ? `Lassen: ${m3(i.mattVolym)} · ${i.mattAntalLass} lass` : 'Inga lass',
              egen ? 'du skrev in' : null,
              oml != null && oml > 0 ? `+ ${m3(oml)} omlastning` : null,
            ].filter(Boolean).join(' · ')
            return (
              <Rad key={i.maskinId} titel={i.namn} under={under} sista={n === alla.length - 1}
                hoger={m3(effektivVolym(i, u))}
                onTryck={() => setOppen(i.maskinId)} attr={{ 'data-fordelning-skotare': i.maskinId }} />
            )
          })}
      </Sektion>

      {kvar.length > 0 && (
        <Sektion rubrik="Körde en till skotare här?" inset>
          {kvar.map((f, n) => (
            <Rad key={f.maskin_id} titel={`Lägg till ${f.namn}`} sista={n === kvar.length - 1}
              onTryck={() => laggTill(f)} attr={{ 'data-fordelning-lagg-till': f.maskin_id }} />
          ))}
        </Sektion>
      )}

      {krockar.map(k => (
        <Sektion key={k.objektId} rubrik="En gammal volym ligger kvar" inset
          not={`${m3(k.volym)} är inskrivet för hela objektet utöver skotarna. Annars räknas det två gånger.`}>
          <Rad titel="Ta bort den gamla volymen" pil={false} sista attr={{ 'data-krock': k.objektId }}
            onTryck={krockSparar ? undefined : () => ersattObjektNiva(k.objektId)}
            hoger={krockSparar ? 'Tar bort …' : undefined} />
        </Sektion>
      ))}
      {krockFel && <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>{krockFel}</p>}
    </div>
  )
}

/* ───────────────────────── En skotare ───────────────────────── */

function SkotareDetalj({ insats: i, objektId, avverkat, ovrigaVolym, onTillbaka, onSparad }: {
  insats: SkotareInsats; objektId: string; avverkat: number; ovrigaVolym: number
  onTillbaka: () => void; onSparad: (krockar: { objektId: string; volym: number }[]) => void
}) {
  const start = tillUtkast(i)
  const [u, setU] = useState<Utkast>(start)
  const [sparar, setSparar] = useState(false)
  const [fel, setFel] = useState('')
  const satt = (p: Partial<Utkast>) => setU(x => ({ ...x, ...p }))

  const totalt = ovrigaVolym + effektivVolym(i, u)
  const over = avverkat > 0 && totalt > avverkat + 0.5
  const felTal = ogiltigt(u.egen) || ogiltigt(u.g15) || (u.blandad && ogiltigt(u.omlastning))
  const andrad = arAndrad(i, u)
  const kan = andrad && !over && !felTal && !sparar
  const harEgnaVarden = num(start.egen) != null || num(start.g15) != null || start.blandad
  // Lassens värden får inte heller ge mer än skördat.
  const overMedLassen = avverkat > 0 && ovrigaVolym + i.mattVolym > avverkat + 0.5

  const spara = async (utkast: Utkast) => {
    setSparar(true); setFel('')
    try {
      const egen = num(utkast.egen)
      const oml = utkast.blandad ? num(utkast.omlastning) : null
      const hem = i.hemObjektId || objektId
      const payload: any = {
        objekt_id: hem, maskin_id: i.maskinId, datum_fran: null,
        volym_egen_skotning: egen,          // räknas mot objektets skotade total
        volym_omlastning: oml,              // räknas ALDRIG mot total
        volym_m3: egen,                     // äldre läsare
        g15_timmar: num(utkast.g15),
        ar_omlastning: utkast.blandad,
        avser_objekt_id: utkast.blandad ? (utkast.avser || null) : null,
      }
      const q = i.radId
        ? supabase.from('skotare_objekt_manuell').update(payload).eq('id', i.radId).select('id')
        : supabase.from('skotare_objekt_manuell').insert(payload).select('id')
      const { data, error } = await q
      if (error || !data || data.length === 0) { setFel('Kunde inte spara. Försök igen.'); setSparar(false); return }

      // Gammal objekt-nivå-rad på samma objekt: bara G15 → in i den här raden och bort; med volym → fråga.
      const krockar: { objektId: string; volym: number }[] = []
      const { data: nullRader } = await supabase.from('skotare_objekt_manuell')
        .select('id, volym_m3, volym_egen_skotning, g15_timmar')
        .eq('objekt_id', hem).is('maskin_id', null).is('datum_fran', null)
      const nr = (nullRader || [])[0] as any
      if (nr) {
        const nrVol = Number(nr.volym_m3 ?? nr.volym_egen_skotning ?? 0)
        if (nrVol > 0) krockar.push({ objektId: hem, volym: nrVol })
        else {
          const g15 = Number(nr.g15_timmar) || 0
          if (g15 > 0 && num(utkast.g15) == null) {
            await supabase.from('skotare_objekt_manuell').update({ g15_timmar: g15 })
              .eq('objekt_id', hem).eq('maskin_id', i.maskinId).is('datum_fran', null)
          }
          await supabase.from('skotare_objekt_manuell').delete().eq('id', nr.id)
          await supabase.from('dim_objekt').update({ skotning_g15_manuell: null }).eq('objekt_id', hem)
        }
      }
      setSparar(false)
      onSparad(krockar)
    } catch {
      setFel('Kunde inte spara. Försök igen.'); setSparar(false)
    }
  }

  return (
    <div data-fordelning-detalj={i.maskinId}>
      <button type="button" onClick={onTillbaka} data-fordelning-tillbaka=""
        style={{ ...KNAPP.tertiar, width: 'auto', minHeight: TRAFFYTA.min, padding: 0, marginBottom: AVSTAND.s, display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}>
        <Ikon namn="chevron_left" storlek={TYP.text.fontSize as number} farg={FARG.bla} /> Alla skotare
      </button>

      <div style={{ marginBottom: AVSTAND.xl }}>
        <div style={{ ...TYP.rubrik }}>{i.namn}</div>
        <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs, ...TNUM }}>
          {i.mattAntalLass > 0
            ? `Lassen säger ${m3(i.mattVolym)} · ${i.mattAntalLass} lass · ${tal(i.mattG15, 1)} h`
            : 'Inga lass från maskinen – skriv in det den körde.'}
        </div>
      </div>

      <Falt etikett={u.blandad ? 'Egen skotning' : 'Utkört'} inputMode="decimal" enhet="m³" value={u.egen}
        placeholder={u.blandad ? '0' : String(Math.round(i.mattVolym))} onChange={v => satt({ egen: v })}
        stod={u.blandad ? 'Räknas mot det som är skotat.' : 'Tomt = det lassen säger.'} />
      <Falt etikett="G15-timmar" inputMode="decimal" enhet="h" value={u.g15}
        placeholder={tal(i.mattG15, 1)} onChange={v => satt({ g15: v })} stod="Tomt = det filerna säger." />

      <Sektion rubrik="Var en del omlastning?" inset
        not={u.blandad ? 'Omlastning är virke som flyttas en gång till. Det räknas som arbete men aldrig som skotat.' : undefined}>
        <Rad titel="Delvis omlastning" pil={false} sista={!u.blandad}
          hoger={<Brytare pa={u.blandad} etikett="Delvis omlastning" onByt={v => satt({ blandad: v })} />} />
        {u.blandad && (
          <div style={{ paddingTop: AVSTAND.m }}>
            <Falt etikett="Omlastning" inputMode="decimal" enhet="m³" value={u.omlastning} placeholder="0" onChange={v => satt({ omlastning: v })} />
            <AvserObjekt value={u.avser} onChange={id => satt({ avser: id })} />
          </div>
        )}
      </Sektion>

      {felTal && <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.orange }}>Skriv ett tal.</p>}
      {over && (
        <p data-over="" style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.orange, ...TNUM }}>
          Då blir skotat {m3(totalt)}, mer än skördat {m3(avverkat)}. Lägg det som är för mycket som omlastning.
        </p>
      )}
      {fel && <p role="alert" style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.rod }}>{fel}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
        <button type="button" data-fordelning-spara="" disabled={!kan} onClick={() => spara(u)}
          style={{ ...KNAPP.primar, ...(!kan ? INAKTIV : {}) }}>
          {sparar ? 'Sparar …' : 'Spara'}
        </button>
        {harEgnaVarden && (
          <button type="button" data-fordelning-lassen="" disabled={sparar || overMedLassen} onClick={() => spara({ ...TOM_UTKAST })}
            style={{ ...KNAPP.sekundar, ...(sparar || overMedLassen ? INAKTIV : {}) }}>
            Använd lassens värden
          </button>
        )}
      </div>
    </div>
  )
}

/** Vilket objekt omlastningen gäller (sök på namn eller VO). */
function AvserObjekt({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const [sok, setSok] = useState('')
  const [traffar, setTraffar] = useState<{ objekt_id: string; object_name: string; vo_nummer: string | null }[]>([])
  const [namn, setNamn] = useState<string | null>(null)

  useEffect(() => {
    if (!value) { setNamn(null); return }
    let av = false
    supabase.from('dim_objekt').select('object_name').eq('objekt_id', value).limit(1)
      .then(({ data }) => { if (!av) setNamn(data?.[0]?.object_name || value) })
    return () => { av = true }
  }, [value])

  useEffect(() => {
    const q = sok.trim(); if (q.length < 2) { setTraffar([]); return }
    let av = false
    const t = setTimeout(async () => {
      const { data } = await supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer')
        .or(`object_name.ilike.*${q}*,vo_nummer.ilike.*${q}*`).limit(8)
      if (!av) setTraffar(data || [])
    }, 250)
    return () => { av = true; clearTimeout(t) }
  }, [sok])

  if (value) {
    return (
      <Rad titel="Gäller objekt" under={namn || value} pil={false} sista
        hoger={<button type="button" onClick={() => { onChange(null); setSok('') }}
          style={{ ...KNAPP.tertiar, width: 'auto', minHeight: TRAFFYTA.min, padding: 0 }}>Byt</button>} />
    )
  }
  return (
    <>
      <Falt etikett="Gäller objekt" value={sok} onChange={setSok} placeholder="Sök namn eller VO" />
      {traffar.length > 0 && (
        <div style={{ background: FARG.upphojt, borderRadius: RADIE.rad, overflow: 'hidden', marginBottom: AVSTAND.l }}>
          {traffar.map((o, n) => (
            <Rad key={o.objekt_id} titel={o.object_name} under={o.vo_nummer ? `VO ${o.vo_nummer}` : undefined} pil={false}
              sista={n === traffar.length - 1} onTryck={() => { onChange(o.objekt_id); setTraffar([]); setSok('') }} />
          ))}
        </div>
      )}
    </>
  )
}
