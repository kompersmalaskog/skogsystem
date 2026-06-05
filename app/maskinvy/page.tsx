'use client'

import { useEffect, useState } from 'react'
import Maskinvy from '../../maskinvy'
import SkotareVy from '../../skotare'
import MaskinLogg from './MaskinLogg'
import Jamforelse from './Jamforelse'
import OversiktNy from './OversiktNy'
import ProduktionNy from './ProduktionNy'
import AvbrottNy from './AvbrottNy'
import IdagNy from './IdagNy'
import SkotareOversiktNy from './SkotareOversiktNy'
import SkotareProduktionNy from './SkotareProduktionNy'

type Mode = 'skordare' | 'skotare' | 'jamforelse'

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
]

const SKOTARE_NY_VYER: { key: string; label: string }[] = [
  { key: '',           label: 'Översikt'   },
  { key: 'produktion', label: 'Produktion' },
]

export default function MaskinvyPage() {
  const [mode, setMode] = useState<Mode>('skordare')
  const [ny, setNy] = useState(false)
  const [vy, setVy] = useState<string>('')

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

  return (
    <>
      {/* iOS-style segmented controls under TopBar */}
      <style>{`
        .mv-toggle-bar {
          position: fixed;
          top: 56px;
          left: 0;
          right: 0;
          height: 52px;
          background: rgba(17,17,16,0.85);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border-bottom: 0.5px solid rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 16px;
          z-index: 60;
        }
        .mv-seg {
          position: relative;
          display: grid;
          grid-template-columns: repeat(3, minmax(96px, 140px));
          gap: 0;
          background: rgba(120,120,128,0.16);
          border-radius: 10px;
          padding: 2px;
          height: 44px;
          width: 100%;
          max-width: 440px;
        }
        .mv-seg-ind {
          position: absolute;
          top: 2px;
          bottom: 2px;
          width: calc((100% - 4px) / 3);
          background: #2c2c2a;
          border-radius: 7px;
          transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1);
          pointer-events: none;
        }
        .mv-seg-btn {
          position: relative;
          z-index: 1;
          border: none;
          background: transparent;
          border-radius: 7px;
          font-family: 'Geist', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #8e8e93;
          cursor: pointer;
          letter-spacing: -0.2px;
          transition: color 200ms ease, transform 120ms ease;
          padding: 0;
        }
        .mv-seg-btn.active { color: #ffffff; font-weight: 600; }
        .mv-seg-btn:active { transform: scale(0.97); }

        /* ── Vy-nav (Översikt | Produktion | ...) ─────────────────── */
        .mv-vy-bar {
          position: fixed;
          top: 108px;
          left: 0;
          right: 0;
          height: 44px;
          background: rgba(0,0,0,0.78);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border-bottom: 0.5px solid rgba(255,255,255,0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 16px;
          z-index: 60;
        }
        .mv-vy-seg {
          display: inline-flex;
          background: rgba(120,120,128,0.16);
          border-radius: 9px;
          padding: 2px;
          height: 34px;
        }
        .mv-vy-btn {
          min-width: 110px;
          padding: 0 16px;
          height: 30px;
          border: none;
          border-radius: 7px;
          background: transparent;
          color: #8e8e93;
          font-family: 'Geist', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.2px;
          cursor: pointer;
          transition: color 200ms ease, background 200ms ease, transform 120ms ease;
        }
        .mv-vy-btn.active {
          background: #3a3a3c;
          color: #ffffff;
          font-weight: 600;
        }
        .mv-vy-btn:active { transform: scale(0.97); }

        /* Push wrapped content below the toggle bar(s) */
        .mv-wrapper > div { top: 108px !important; }
        .mv-wrapper.with-vy-nav > div { top: 152px !important; }
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
                  ? (vy === 'produktion' ? <ProduktionNy />
                     : vy === 'avbrott'    ? <AvbrottNy />
                     : vy === 'idag'       ? <IdagNy />
                     : <OversiktNy />)
                  : <Maskinvy />)
              : (ny
                  ? (vy === 'produktion' ? <SkotareProduktionNy />
                     : <SkotareOversiktNy />)
                  : <SkotareVy />)}
          </div>
          {!(ny && (mode === 'skordare' || mode === 'skotare')) && <MaskinLogg mode={mode} />}
        </>
      )}
    </>
  )
}
