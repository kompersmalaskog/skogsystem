'use client'
import { AVSTAND, FARG, FONT, RADIE, RORELSE, TYP, VIKT, underTopbar } from '@/lib/design/tokens'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { MASKINER, type Maskin } from './OversiktShared'
import { useMaskinvyMaskiner } from './useMaskinvyMaskiner'
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

export default function MaskinvyPage() {
  const [mode, setMode] = useState<Mode>('skordare')
  const [ny, setNy] = useState(false)
  const [vy, setVy] = useState<string>('')
  const [maskinSkordare, setMaskinSkordare] = useState<Maskin>(MASKINER[0])
  // Skotarlistan är dynamisk (dim_maskin, bekräftad + data) — ny maskin syns
  // automatiskt. Default = första i listan när den laddats.
  const { maskiner: skotareMaskiner } = useMaskinvyMaskiner('skotare')
  const [maskinSkotare, setMaskinSkotare] = useState<SkotareMaskin | null>(null)
  useEffect(() => {
    if (!maskinSkotare && skotareMaskiner.length > 0) setMaskinSkotare(skotareMaskiner[0])
  }, [skotareMaskiner, maskinSkotare])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setNy(params.get('ny') === '1')
    setVy(params.get('vy') || '')
  }, [])

  // Vy-navet visas när vi är i nya vyn på Skördare- eller Skotare-fliken.
  const showVyNav = ny && (mode === 'skordare' || mode === 'skotare')

  // Vilka vy-knappar ska visas i navet?
  const vyNavList = mode === 'skotare' ? SKOTARE_NY_VYER : NY_VYER

  // Mjuk vy-byte: ingen reload, bara state + URL silent update.
  const handleVyChange = (newVy: string) => {
    setVy(newVy)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (newVy) url.searchParams.set('vy', newVy)
    else      url.searchParams.delete('vy')
    history.replaceState({}, '', url.toString())
  }

  // Dölj TopBar-hemknappen i ny-vyn — vi visar egen bakåtpil + kryss istället.
  useEffect(() => {
    if (!ny) return
    document.body.setAttribute('data-hide-home', '')
    return () => document.body.removeAttribute('data-hide-home')
  }, [ny])

  return (
    <>
      {/* Bakåtknapp (vänster) + Stäng-kryss (höger) — bara i ny-vyn.
          Placeras i TopBar-zonen ovanför .mv-toggle-bar.
          z-index: 1001 — ovanför TopBar:ns 1000. */}
      {ny && (
        <>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                window.history.back()
              } else {
                window.location.href = '/'
              }
            }}
            style={{
              position: 'fixed',
              left: AVSTAND.m,
              top: `calc(env(safe-area-inset-top) + ${AVSTAND.s}px)`,
              width: 36,
              height: 36,
              borderRadius: RADIE.kort,
              background: FARG.linje,
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: FARG.text,
              fontSize: TYP.rubrik.fontSize,
              lineHeight: 1,
              zIndex: 1001,
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Gå tillbaka"
          >
            ‹
          </button>
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
      `}</style>

      <div className="mv-toggle-bar">
        <div className="mv-seg" role="tablist" aria-label="Maskinvy">
          <div
            className="mv-seg-ind"
            style={{ transform: `translateX(${mode === 'skordare' ? 0 : mode === 'skotare' ? 100 : 200}%)` }}
          />
          <button role="tab" aria-selected={mode === 'skordare'} className={`mv-seg-btn${mode === 'skordare' ? ' active' : ''}`} onClick={() => setMode('skordare')}>Skördare</button>
          <button role="tab" aria-selected={mode === 'skotare'} className={`mv-seg-btn${mode === 'skotare' ? ' active' : ''}`} onClick={() => setMode('skotare')}>Skotare</button>
          <button role="tab" aria-selected={mode === 'jamforelse'} className={`mv-seg-btn${mode === 'jamforelse' ? ' active' : ''}`} onClick={() => setMode('jamforelse')}>Jämförelse</button>
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

      {mode === 'jamforelse' ? (
        <Jamforelse />
      ) : (
        <>
          <div className={`mv-wrapper${showVyNav ? ' with-vy-nav' : ''}`}>
            {mode === 'skordare'
              ? (ny
                  ? (vy === 'produktion' ? <ProduktionNy maskin={maskinSkordare} onMaskinChange={setMaskinSkordare} />
                     : vy === 'avbrott'    ? <AvbrottNy maskin={maskinSkordare} onMaskinChange={setMaskinSkordare} />
                     : vy === 'kapacitet'  ? <KapacitetNy maskin={maskinSkordare} onMaskinChange={setMaskinSkordare} />
                     : vy === 'idag'       ? <IdagNy maskin={maskinSkordare} onMaskinChange={setMaskinSkordare} />
                     : <OversiktNy maskin={maskinSkordare} onMaskinChange={setMaskinSkordare} />)
                  : <Maskinvy />)
              : (ny
                  ? (vy === 'jamforelse' ? <SkotareJamforelseNy />
                     : !maskinSkotare ? <div style={{ padding: AVSTAND.xl, color: FARG.text2, fontSize: TYP.meta.fontSize }}>Laddar maskiner …</div>
                     : vy === 'produktion'  ? <SkotareProduktionNy maskin={maskinSkotare} onMaskinChange={setMaskinSkotare} />
                     : vy === 'avbrott'   ? <SkotareAvbrottNy maskin={maskinSkotare} onMaskinChange={setMaskinSkotare} />
                     : vy === 'idag'      ? <SkotareIdagNy maskin={maskinSkotare} onMaskinChange={setMaskinSkotare} />
                     : <SkotareOversiktNy maskin={maskinSkotare} onMaskinChange={setMaskinSkotare} />)
                  : <SkotareVy />)}
          </div>
          {!(ny && (mode === 'skordare' || mode === 'skotare')) && <MaskinLogg mode={mode} />}
        </>
      )}
    </>
  )
}
