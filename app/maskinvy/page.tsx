'use client'
import { AVSTAND, FARG, FONT, RADIE, RORELSE, TYP, VIKT, underTopbar } from '@/lib/design/tokens'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { navParam, skrivNavigering, useHornknapp, useNavSok } from '@/lib/maskinvy/historik'
import { MASKINER, type Maskin } from './OversiktShared'
import { useMaskinvyMaskiner } from './useMaskinvyMaskiner'
import Sidolista from './Sidolista'
import { SIDOLISTA_BREDD, SIDOLISTA_MIN_SKARM, type SidoRoll } from '@/lib/maskinvy/sidolista'
import Maskinvy from '../../maskinvy'
import SkotareVy from '../../skotare'
import MaskinLogg from './MaskinLogg'
import Jamforelse from './Jamforelse'
import OversiktNy from './OversiktNy'
import ProduktionNy from './ProduktionNy'
import AvbrottNy from './AvbrottNy'
import KapacitetNy from './KapacitetNy'
import IdagNy from './IdagNy'
import SkotareOversiktNy from './SkotareOversiktNy'
import SkotareProduktionNy from './SkotareProduktionNy'
import SkotareAvbrottNy from './SkotareAvbrottNy'
import SkotareIdagNy from './SkotareIdagNy'
import SkotareJamforelseNy from './SkotareJamforelseNy'

type Mode = 'skordare' | 'skotare' | 'jamforelse'

type SkotareMaskin = { id: string; namn: string }

// ──────────────────────────────────────────────────────────────
// Vy-nav för den nya maskinvyn (?ny=1).
// Datadriven — lägg till rader när nya vyer byggs.
// Tom key = default-vy (Översikt). Den måste vara först.
// ──────────────────────────────────────────────────────────────
const NY_VYER: { key: string; label: string }[] = [
  { key: '',           label: 'Översikt'   },
  { key: 'idag',       label: 'Idag'       },
  { key: 'produktion', label: 'Produktion' },
  { key: 'avbrott',    label: 'Avbrott'    },
  { key: 'kapacitet',  label: 'Kapacitet'  },
]

const SKOTARE_NY_VYER: { key: string; label: string }[] = [
  { key: '',            label: 'Översikt'   },
  { key: 'idag',        label: 'Idag'       },
  { key: 'produktion',  label: 'Produktion' },
  { key: 'avbrott',     label: 'Avbrott'    },
  { key: 'jamforelse',  label: 'Jämförelse' },
]

// Läge, flik och maskin ligger i adressen (lib/maskinvy/historik.ts): ett nytt ställe = en post i historiken, så systemets backa
// går ett steg i taget och en omladdning landar på samma flik och maskin. Utelämnad parameter = standardvärdet.
const LAGEN: readonly Mode[] = ['skordare', 'skotare', 'jamforelse']

export default function MaskinvyPage() {
  const sok = useNavSok()
  const ny = navParam(sok, 'ny') === '1'
  const lageParam = navParam(sok, 'lage')
  const mode: Mode = LAGEN.find(l => l === lageParam) ?? 'skordare'
  const vy = navParam(sok, 'vy') || ''
  const maskinSkordare: Maskin = MASKINER.find(m => m.id === navParam(sok, 'skordare')) ?? MASKINER[0]
  // Skotarlistan är dynamisk (dim_maskin, bekräftad + data) — ny maskin syns
  // automatiskt. Default = första i listan när den laddats.
  const { maskiner: skotareMaskiner, laddar: skotareLaddar } = useMaskinvyMaskiner('skotare')
  const maskinSkotare: SkotareMaskin | null =
    skotareMaskiner.find(m => m.id === navParam(sok, 'skotare')) ?? skotareMaskiner[0] ?? null

  // Maskinbyte = ett nytt ställe. Är maskinen redan vald händer ingenting (ingen tom post i historiken), och standardmaskinen
  // skrivs som "ingen parameter" så adressen är densamma oavsett vilken väg man kom dit.
  const valjSkordare = (m: Maskin) => {
    if (m.id === maskinSkordare.id) return
    skrivNavigering({ skordare: m.id === MASKINER[0].id ? null : m.id }, 'push')
  }
  const valjSkotare = (m: SkotareMaskin) => {
    if (m.id === maskinSkotare?.id) return
    skrivNavigering({ skotare: m.id === skotareMaskiner[0]?.id ? null : m.id }, 'push')
  }

  // Vy-navet visas när vi är i nya vyn på Skördare- eller Skotare-fliken.
  const showVyNav = ny && (mode === 'skordare' || mode === 'skotare')

  // Sidolistan (stor skärm): maskinvalet som en lista till vänster i stället för rullgardinen i varje vy. Bara i nya vyn och
  // inte i Jämförelse (som jämför maskinerna och inte har något maskinval). Under SIDOLISTA_MIN_SKARM gäller rullgardinen som förut.
  const [bred, setBred] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(`(min-width: ${SIDOLISTA_MIN_SKARM}px)`)
    const uppdatera = () => setBred(mq.matches)
    uppdatera()
    mq.addEventListener('change', uppdatera)
    return () => mq.removeEventListener('change', uppdatera)
  }, [])
  const visaSidolista = ny && bred && mode !== 'jamforelse'
  useEffect(() => {
    if (!visaSidolista) return
    document.body.setAttribute('data-mv-sidolista', '')
    return () => document.body.removeAttribute('data-mv-sidolista')
  }, [visaSidolista])
  const sidoMaskiner = useMemo(() => [
    ...MASKINER.map(m => ({ id: m.id, namn: m.namn, roll: 'skordare' as SidoRoll })),
    ...skotareMaskiner.map(m => ({ id: m.id, namn: m.namn, roll: 'skotare' as SidoRoll })),
  ], [skotareMaskiner])

  // Vilka vy-knappar ska visas i navet?
  const vyNavList = mode === 'skotare' ? SKOTARE_NY_VYER : NY_VYER

  // Flikbyte: ingen reload, ett steg i historiken (backa = föregående flik).
  const handleVyChange = (newVy: string) => {
    if (newVy === vy) return
    skrivNavigering({ vy: newVy || null }, 'push')
  }

  // Byte av läge (Skördare / Skotare / Jämförelse) = ett steg i historiken. Skördarens Kapacitet finns inte hos skotaren (och
  // tvärtom Jämförelse): står vyn kvar på en vy som den nya fliken saknar blir navet utan vald knapp och Översikt visas — då går
  // vi till Översikt, i SAMMA steg (en post, inte två). Bara i nya vyn: den gamla vyn rättar sig själv (okänd flik = Idag).
  const lagePost = (nytt: Mode, vyOverstyr: string | null | undefined) => ({
    lage: nytt === 'skordare' ? null : nytt,
    ...(vyOverstyr === undefined ? {} : { vy: vyOverstyr }),
  })
  const valjMode = (nytt: Mode, maskinAndring: { skordare?: string | null; skotare?: string | null } = {}) => {
    if (nytt === mode && Object.keys(maskinAndring).length === 0) return
    let vyOverstyr: string | null | undefined
    if (ny && nytt !== 'jamforelse') {
      const lista = nytt === 'skotare' ? SKOTARE_NY_VYER : NY_VYER
      if (!lista.some(v => v.key === vy)) vyOverstyr = null
    }
    skrivNavigering({ ...lagePost(nytt, vyOverstyr), ...maskinAndring }, 'push')
  }

  // Ett tryck i sidolistan: välj maskinen och byt till dess flik — ETT steg. Vyn (Idag, Produktion …) står kvar när fliken har den.
  const valjFranSidolista = (roll: SidoRoll, id: string) => {
    if (roll === 'skordare') {
      const m = MASKINER.find(x => x.id === id)
      if (m) valjMode('skordare', { skordare: m.id === MASKINER[0].id ? null : m.id })
    } else {
      const m = skotareMaskiner.find(x => x.id === id)
      if (m) valjMode('skotare', { skotare: m.id === skotareMaskiner[0]?.id ? null : m.id })
    }
  }

  // Knappen uppe till vänster (toppfältet) följer historiken, i båda vyerna: hem-ikonen på ingången, en blå tillbaka-knapp som backar
  // ETT steg (samma som systemets backa) så fort vyn lagt ett steg i historiken — flik, maskin, djupvy eller panel.
  useHornknapp()

  return (
    <>
      {/* Stäng-kryss (höger) — bara i ny-vyn. Hem-/tillbaka-knappen uppe till vänster är toppfältets (useHornknapp).
          z-index: 1001 — ovanför TopBar:ns 1000. */}
      {ny && (
        <>
          <Link
            href="/"
            style={{
              position: 'fixed',
              right: AVSTAND.m,
              top: `calc(env(safe-area-inset-top) + ${AVSTAND.s}px)`,
              width: 36,
              height: 36,
              borderRadius: RADIE.kort,
              background: FARG.linje,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              color: FARG.text,
              fontSize: TYP.text.fontSize,
              lineHeight: 1,
              zIndex: 1001,
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Stäng"
          >
            ✕
          </Link>
        </>
      )}

      {/* iOS-style segmented controls under TopBar */}
      <style>{`
        .mv-toggle-bar {
          position: fixed;
          top: ${underTopbar()};
          left: 0;
          right: 0;
          height: 52px;
          background: color-mix(in srgb, ${FARG.bg} 85%, transparent);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border-bottom: 0.5px solid ${FARG.linje};
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 ${AVSTAND.l}px;
          z-index: 60;
        }
        .mv-seg {
          position: relative;
          display: grid;
          grid-template-columns: repeat(3, minmax(96px, 140px));
          gap: 0;
          background: ${FARG.linje};
          border-radius: ${RADIE.rad}px;
          padding: ${AVSTAND.xs}px;
          height: 44px;
          width: 100%;
          max-width: 440px;
          box-sizing: border-box;
        }
        .mv-seg-ind {
          position: absolute;
          top: ${AVSTAND.xs}px;
          bottom: ${AVSTAND.xs}px;
          width: calc((100% - ${2 * AVSTAND.xs}px) / 3);
          background: ${FARG.fyllning};
          border-radius: ${RADIE.rad}px;
          transition: transform ${RORELSE.byte}ms ${RORELSE.kurva};
          pointer-events: none;
        }
        .mv-seg-btn {
          position: relative;
          z-index: 1;
          border: none;
          background: transparent;
          border-radius: ${RADIE.rad}px;
          font-family: ${FONT};
          font-size: ${TYP.meta.fontSize}px;
          font-weight: ${VIKT.normal};
          color: ${FARG.text2};
          cursor: pointer;
          letter-spacing: -0.2px;
          transition: color ${RORELSE.byte}ms ${RORELSE.kurva}, transform ${RORELSE.tryck}ms ${RORELSE.kurva};
          padding: 0;
        }
        .mv-seg-btn.active { color: ${FARG.text}; font-weight: ${VIKT.halvfet}; }
        .mv-seg-btn:active { transform: scale(0.97); }

        /* ── Vy-nav (Översikt | Produktion | ...) ─────────────────── */
        .mv-vy-bar {
          position: fixed;
          top: ${underTopbar(52)};
          left: 0;
          right: 0;
          height: 44px;
          background: color-mix(in srgb, ${FARG.bg} 85%, transparent);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border-bottom: 0.5px solid ${FARG.linje};
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 ${AVSTAND.l}px;
          z-index: 60;
        }
        .mv-vy-seg {
          display: inline-flex;
          background: ${FARG.linje};
          border-radius: ${RADIE.rad}px;
          padding: ${AVSTAND.xs}px;
          height: 38px;
          box-sizing: border-box;
        }
        .mv-vy-btn {
          min-width: 110px;
          padding: 0 ${AVSTAND.l}px;
          height: 30px;
          border: none;
          border-radius: ${RADIE.rad}px;
          background: transparent;
          color: ${FARG.text2};
          font-family: ${FONT};
          font-size: ${TYP.meta.fontSize}px;
          font-weight: ${VIKT.normal};
          letter-spacing: -0.2px;
          cursor: pointer;
          transition: color ${RORELSE.byte}ms ${RORELSE.kurva}, background ${RORELSE.byte}ms ${RORELSE.kurva}, transform ${RORELSE.tryck}ms ${RORELSE.kurva};
        }
        .mv-vy-btn.active {
          background: ${FARG.fyllning};
          color: ${FARG.text};
          font-weight: ${VIKT.halvfet};
        }
        .mv-vy-btn:active { transform: scale(0.97); }

        /* Push wrapped content below the toggle bar(s) */
        .mv-wrapper > div { top: ${underTopbar(52)} !important; }
        .mv-wrapper.with-vy-nav > div { top: ${underTopbar(96)} !important; }

        /* ── Sidolistan står: allt flyttas höger om den, rullgardinen i vyerna blir bara ett namn ──
           Attributet sätts på body bara medan listan renderas (stor skärm, nya vyn, inte Jämförelse). */
        body[data-mv-sidolista] .mv-toggle-bar,
        body[data-mv-sidolista] .mv-vy-bar { left: ${SIDOLISTA_BREDD}px; }
        body[data-mv-sidolista] .mv-wrapper > div,
        body[data-mv-sidolista] .mv-djup { left: ${SIDOLISTA_BREDD}px !important; }
        body[data-mv-sidolista] .mv-maskinval { pointer-events: none; cursor: default; }
        body[data-mv-sidolista] .mv-maskinval-pil { display: none; }
      `}</style>

      <div className="mv-toggle-bar">
        <div className="mv-seg" role="tablist" aria-label="Maskinvy">
          <div
            className="mv-seg-ind"
            style={{ transform: `translateX(${mode === 'skordare' ? 0 : mode === 'skotare' ? 100 : 200}%)` }}
          />
          <button role="tab" aria-selected={mode === 'skordare'} className={`mv-seg-btn${mode === 'skordare' ? ' active' : ''}`} onClick={() => valjMode('skordare')}>Skördare</button>
          <button role="tab" aria-selected={mode === 'skotare'} className={`mv-seg-btn${mode === 'skotare' ? ' active' : ''}`} onClick={() => valjMode('skotare')}>Skotare</button>
          <button role="tab" aria-selected={mode === 'jamforelse'} className={`mv-seg-btn${mode === 'jamforelse' ? ' active' : ''}`} onClick={() => valjMode('jamforelse')}>Jämförelse</button>
        </div>
      </div>

      {showVyNav && (
        <div className="mv-vy-bar">
          <div className="mv-vy-seg" role="tablist" aria-label="Maskinvy-vy">
            {vyNavList.map(v => (
              <button
                key={v.key || 'default'}
                role="tab"
                aria-selected={vy === v.key}
                className={`mv-vy-btn${vy === v.key ? ' active' : ''}`}
                onClick={() => handleVyChange(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {visaSidolista && (
        <Sidolista
          maskiner={sidoMaskiner}
          skotareLaddar={skotareLaddar}
          valdRoll={mode === 'skordare' || mode === 'skotare' ? mode : null}
          valdId={mode === 'skordare' ? maskinSkordare.id : mode === 'skotare' ? (maskinSkotare?.id ?? null) : null}
          onVal={valjFranSidolista}
        />
      )}

      {mode === 'jamforelse' ? (
        <Jamforelse />
      ) : (
        <>
          <div className={`mv-wrapper${showVyNav ? ' with-vy-nav' : ''}`}>
            {mode === 'skordare'
              ? (ny
                  ? (vy === 'produktion' ? <ProduktionNy maskin={maskinSkordare} onMaskinChange={valjSkordare} />
                     : vy === 'avbrott'    ? <AvbrottNy maskin={maskinSkordare} onMaskinChange={valjSkordare} />
                     : vy === 'kapacitet'  ? <KapacitetNy maskin={maskinSkordare} onMaskinChange={valjSkordare} />
                     : vy === 'idag'       ? <IdagNy maskin={maskinSkordare} onMaskinChange={valjSkordare} />
                     : <OversiktNy maskin={maskinSkordare} onMaskinChange={valjSkordare} />)
                  : <Maskinvy />)
              : (ny
                  ? (vy === 'jamforelse' ? <SkotareJamforelseNy />
                     : !maskinSkotare ? <div style={{ padding: AVSTAND.xl, color: FARG.text2, fontSize: TYP.meta.fontSize }}>Laddar maskiner …</div>
                     : vy === 'produktion'  ? <SkotareProduktionNy maskin={maskinSkotare} onMaskinChange={valjSkotare} />
                     : vy === 'avbrott'   ? <SkotareAvbrottNy maskin={maskinSkotare} onMaskinChange={valjSkotare} />
                     : vy === 'idag'      ? <SkotareIdagNy maskin={maskinSkotare} onMaskinChange={valjSkotare} />
                     : <SkotareOversiktNy maskin={maskinSkotare} onMaskinChange={valjSkotare} />)
                  : <SkotareVy />)}
          </div>
          {!(ny && (mode === 'skordare' || mode === 'skotare')) && <MaskinLogg mode={mode} />}
        </>
      )}
    </>
  )
}
