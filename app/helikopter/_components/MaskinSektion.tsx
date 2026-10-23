'use client'

// MASKINER — Skördare och Skotare som två kort: en rad per aktiv maskin med månadens m³fub till höger och var hon kört · takt under.
// Ingen stapel, ingen färg (utfall, inget att göra). DIN MASKIN (förare med maskin) och ONSDAGSNOTIS (admin) bor också här.
import { useState } from 'react'
import { AVSTAND, FARG, INAKTIV, KNAPP, TNUM, TYP } from '@/lib/design/tokens'
import Rad from '@/components/design/Rad'
import Sektion from '@/components/design/Sektion'
import { RadLank } from '@/components/ui/RadGrupp'
import { dagarText, fmt, kortNamn } from '../_lib/format'
import { skickaVeckoNotis, type MaskinLage, type MaskinManad } from '../_lib/queries'
import { Matare } from './Lista'

export function MaskinSektion({ maskiner, fel, onRetry, manadNamn, manuella, roll }: {
  maskiner: MaskinManad[] | null; fel: string | null; onRetry: () => void; manadNamn: string; manuella: Set<string>; roll: 'skordare' | 'skotare'
}) {
  const rubrik = roll === 'skordare' ? 'Skördare' : 'Skotare'
  if (fel) {
    return (
      <Sektion rubrik={rubrik}>
        <RadLank orange text="Kunde inte läsa maskinerna" smakprov="försök igen" onClick={onRetry} sista />
      </Sektion>
    )
  }
  const rader = (maskiner ?? []).filter(m => m.roll === roll)
  return (
    <Sektion rubrik={rubrik}>
      {maskiner == null ? (
        <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Laddar maskiner…</div>
      ) : rader.length === 0 ? (
        <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga aktiva maskiner</div>
      ) : (
        rader.map((m, i) => {
          const har = m.volym_manad > 0
          const delar: string[] = []
          if (har && m.objekt_namn) delar.push(kortNamn(m.objekt_namn))
          if (har && m.takt_per_dag != null) delar.push(`${fmt(m.takt_per_dag)} per dag`)
          if (manuella.has(m.maskin_id)) delar.push('registreras för hand')
          return (
            <Rad
              key={m.maskin_id}
              titel={m.namn}
              under={har ? delar.join(' · ') : `Ingen produktion i ${manadNamn}`}
              hoger={har ? <>{fmt(m.volym_manad)}<span style={{ ...TYP.meta, color: FARG.text2 }}> m³fub</span></> : '–'}
              dampad={!har}
              sista={i === rader.length - 1}
              attr={{ 'data-maskin': m.maskin_id }}
            />
          )
        })
      )}
    </Sektion>
  )
}

/** DIN MASKIN — föraren ser sitt eget objekt: hur mycket som är gjort och ungefär hur många dagar som är kvar. */
export function DinMaskinSektion({ maskinNamn, lage, fel, onRetry }: { maskinNamn: string; lage: MaskinLage | null; fel: string | null; onRetry: () => void }) {
  if (fel) {
    return (
      <Sektion rubrik="Din maskin">
        <RadLank orange text="Kunde inte läsa maskinen" smakprov="försök igen" onClick={onRetry} sista />
      </Sektion>
    )
  }
  if (!lage) {
    return (
      <Sektion rubrik="Din maskin">
        <Rad titel={maskinNamn} under="Ingen produktion registrerad på maskinen än" hoger="–" dampad sista />
      </Sektion>
    )
  }
  const totalt = lage.gjort + (lage.kvar ?? 0)
  const dagarKvar = lage.kvar != null && lage.takt_per_dag != null && lage.takt_per_dag > 0 ? Math.round(lage.kvar / lage.takt_per_dag) : null
  const gjortOrd = lage.roll === 'skordare' ? 'Skördat' : 'Skotat'
  return (
    <Sektion rubrik="Din maskin">
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, padding: `${AVSTAND.l}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.m }}>
          <span style={{ ...TYP.listtitel, color: FARG.text }}>{kortNamn(lage.namn)}</span>
          <span style={{ ...TYP.text, ...TNUM, color: dagarKvar != null ? FARG.text : FARG.text3, flexShrink: 0 }}>{dagarKvar != null ? `ca ${dagarText(dagarKvar)} kvar` : '–'}</span>
        </div>
        {lage.kvar != null && totalt > 0 && <Matare andel={lage.gjort / totalt} />}
        <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>
          {gjortOrd} {fmt(lage.gjort)}{lage.kvar != null ? ` av ${fmt(totalt)}` : ''}{lage.planerad_namn ? ` · sedan ${kortNamn(lage.planerad_namn)}` : ''}
        </div>
      </div>
    </Sektion>
  )
}

/**
 * ONSDAGSNOTIS (admin): manuell utlösare för veckoläget som pushas onsdagar 12:00 (helikopter_notis_vecka + notis_kö).
 * Knappen köar och tömmer kön direkt; texten är samma som den automatiska. Tillståndet står under knappen, aldrig i en dialogruta.
 */
export function VeckoNotisSektion() {
  const [lage, setLage] = useState<{ status: 'vila' | 'skickar' | 'klar' | 'fel'; text: string | null }>({ status: 'vila', text: null })
  const skickar = lage.status === 'skickar'
  async function skicka() {
    setLage({ status: 'skickar', text: null })
    const r = await skickaVeckoNotis()
    if (r.error !== null || r.data == null) { setLage({ status: 'fel', text: 'Kunde inte skicka – försök igen' }); return }
    if (r.data.antal === 0) { setLage({ status: 'fel', text: 'Ingen mottagare hittades' }); return }
    const vem = r.data.antal === 1 ? '1 mottagare' : `${r.data.antal} mottagare`
    setLage({ status: 'klar', text: r.data.skickadNu ? `Skickad till ${vem}` : `Köad till ${vem} – går inom 5 minuter` })
  }
  return (
    <Sektion rubrik="Onsdagsnotis">
      <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.l}px 0`, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
        <span>Veckoläget pushas onsdagar 12:00. Samma text kan skickas nu.</span>
        <button type="button" onClick={skicka} disabled={skickar} aria-busy={skickar} style={{ ...KNAPP.sekundar, ...(skickar ? INAKTIV : null) }}>
          {skickar ? 'Skickar…' : 'Skicka veckoläge nu'}
        </button>
        {lage.text && (
          <span role="status" style={{ ...TYP.meta, ...TNUM, color: lage.status === 'fel' ? FARG.orange : FARG.text2 }}>{lage.text}</span>
        )}
      </div>
    </Sektion>
  )
}
