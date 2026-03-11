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
      {/* Toggle bar between TopBar and content */}
      <style>{`
        .mv-toggle-bar {
          position: fixed;
          top: 56px;
          left: 0;
          right: 0;
          height: 44px;
          background: rgba(17,17,16,0.95);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 60;
        }
        .mv-toggle-pills {
          display: flex;
          gap: 2px;
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          padding: 3px;
        }
        .mv-toggle-btn {
          padding: 5px 20px;
          border: none;
          background: transparent;
          border-radius: 6px;
          font-family: 'Geist', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #7a7a72;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: -0.2px;
        }
        .mv-toggle-btn.active {
          background: #222220;
          color: #e8e8e4;
        }
        .mv-toggle-btn:hover:not(.active) {
          color: #e8e8e4;
        }
        /* Push both maskinvy and skotare content down by 44px */
        .mv-wrapper > div {
          top: 100px !important;
        }
      `}</style>

      <div className="mv-toggle-bar">
        <div className="mv-toggle-pills">
          <button
            className={`mv-toggle-btn${mode === 'skordare' ? ' active' : ''}`}
            onClick={() => setMode('skordare')}
          >
            Skördare
          </button>
          <button
            className={`mv-toggle-btn${mode === 'skotare' ? ' active' : ''}`}
            onClick={() => setMode('skotare')}
          >
            Skotare
          </button>
          <button
            className={`mv-toggle-btn${mode === 'jamforelse' ? ' active' : ''}`}
            onClick={() => setMode('jamforelse')}
          >
            Jämförelse
          </button>
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
