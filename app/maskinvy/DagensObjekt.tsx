'use client'
import { TYP, VIKT, RADIE, AVSTAND, FARG, FONT } from '@/lib/design/tokens'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { dagensObjekt, type ObjektRad } from '@/lib/maskinvy/dagensObjekt'
import { hamtaSpecialObjekt, specialPerNamn } from '@/lib/maskinvy/specialObjekt'
import { fmtSv } from './OversiktShared'
import { ObjektNamn } from './SpecialBadge'

// ─────────────────────────────────────────────────────────────
// DagensObjekt — vilket objekt (eller vilka) maskinen arbetade på den dag Idag visar. Under siffrorna i Idag, båda rollerna.
//
//   OBJEKT
//   Hålabäck RP 2026                          412 m³
//   Vällust gallring                           38 m³
//
// Ett enda objekt: bara namnet (volymen står redan i siffrorna ovanför). Flera: volym per objekt, störst först.
// Namn ur dim_objekt; objekt som inte finns där heter "Okänt objekt". Går namnen inte att läsa sägs det — vi gissar inget.
// ─────────────────────────────────────────────────────────────

async function hamtaNamn(ids: string[]): Promise<Record<string, string | null>> {
  const { data, error } = await supabase.from('dim_objekt').select('objekt_id, object_name').in('objekt_id', ids)
  if (error) throw error
  const ut: Record<string, string | null> = {}
  for (const o of (data || []) as { objekt_id: string; object_name: string | null }[]) ut[o.objekt_id] = o.object_name
  return ut
}

export default function DagensObjekt({ rader, loading }: { rader: ObjektRad[] | null; loading: boolean }) {
  const ids = useMemo(
    () => Array.from(new Set((rader || []).map(r => r.objekt_id).filter((x): x is string => !!x))).sort(),
    [rader],
  )
  const nyckel = ids.join('|')
  const [namn, setNamn] = useState<Record<string, string | null> | null>(null)
  const [fel, setFel] = useState(false)
  const [special, setSpecial] = useState<Awaited<ReturnType<typeof hamtaSpecialObjekt>>>(new Map())

  useEffect(() => {
    let avbruten = false
    setNamn(null); setFel(false)
    if (ids.length === 0) { setNamn({}); return }
    hamtaNamn(ids)
      .then(n => { if (!avbruten) setNamn(n) })
      .catch(() => { if (!avbruten) setFel(true) })
    hamtaSpecialObjekt().then(s => { if (!avbruten) setSpecial(s) })
    return () => { avbruten = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel])

  const lista = useMemo(() => (rader && namn ? dagensObjekt(rader, namn) : null), [rader, namn])
  const specialNamn = useMemo(() => (namn ? specialPerNamn(ids, namn, special) : {}), [ids, namn, special])

  if (loading || rader == null) return null

  const rubrik: CSSProperties = { fontSize: TYP.micro.fontSize, color: FARG.text2, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: VIKT.fet }
  const meta: CSSProperties = { fontSize: TYP.meta.fontSize, color: FARG.text2 }
  const flera = (lista?.objekt.length ?? 0) > 1

  return (
    <div data-dagens-objekt style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.m}px`, marginBottom: 12, fontFamily: FONT }}>
      <div style={{ marginBottom: AVSTAND.s }}><span style={rubrik}>Objekt</span></div>
      {fel ? (
        <div style={meta}>Objektnamnen kunde inte läsas — ladda om sidan.</div>
      ) : !lista ? (
        <div style={meta}>Läser objekt …</div>
      ) : lista.objekt.length === 0 ? (
        <div style={meta}>Dagens rader saknar objekt i datan.</div>
      ) : (
        <>
          {lista.objekt.map(o => (
            <div key={o.nyckel} data-objekt-rad style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m, padding: `${AVSTAND.s}px 0` }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: TYP.text.fontSize, color: o.kand ? FARG.text : FARG.text2 }}>
                <ObjektNamn radbryt namn={o.namn} special={o.kand && o.namn in specialNamn} skal={specialNamn[o.namn]} />
              </div>
              {flera && (
                <div style={{ ...meta, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtSv(o.volym, 0)} m³</div>
              )}
            </div>
          ))}
          {lista.utanObjektVolym > 0 && (
            <div data-objekt-not style={{ ...meta, marginTop: AVSTAND.xs }}>{fmtSv(lista.utanObjektVolym, 0)} m³ saknar objekt i datan.</div>
          )}
        </>
      )}
    </div>
  )
}
