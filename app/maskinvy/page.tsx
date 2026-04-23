'use client'

import { useState } from 'react'
import Maskinvy from '../../maskinvy'
import SkotareVy from '../../skotare'
import MaskinLogg from './MaskinLogg'
import Jamforelse from './Jamforelse'

type Mode = 'skordare' | 'skotare' | 'jamforelse'

export default function MaskinvyPage() {
  const [mode, setMode] = useState<Mode>('skordare')

  return (
    <>
      {/* iOS-style segmented control between TopBar and content */}
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
          border-radius: 9px;
          padding: 2px;
          height: 32px;
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
        /* Push content down by 52px below the taller toggle bar */
        .mv-wrapper > div { top: 108px !important; }
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

      {mode === 'jamforelse' ? (
        <Jamforelse />
      ) : (
        <>
          <div className="mv-wrapper">
            {mode === 'skordare' ? <Maskinvy /> : <SkotareVy />}
          </div>
          <MaskinLogg mode={mode} />
        </>
      )}
    </>
  )
}
