// @ts-nocheck
'use client'
import { useState } from 'react'

// Svenska röda dagar 2026
const RODA_DAGAR_2026 = [
  '2026-01-01', // Nyårsdagen
  '2026-01-06', // Trettondedag jul
  '2026-04-03', // Långfredagen
  '2026-04-06', // Annandag påsk
  '2026-05-01', // Första maj
  '2026-05-14', // Kristi himmelsfärdsdag
  '2026-06-06', // Nationaldagen
  '2026-06-19', // Midsommarafton
  '2026-12-25', // Juldagen
  '2026-12-26', // Annandag jul
]

// Räkna arbetsdagar i en månad
function getArbetsdagar(ar: number, manad: number) {
  const forstaDag = new Date(ar, manad - 1, 1)
  const sistaDag = new Date(ar, manad, 0)
  
  let arbetsdagar = 0
  
  for (let d = new Date(forstaDag); d <= sistaDag; d.setDate(d.getDate() + 1)) {
    const dag = d.getDay()
    const datumStr = d.toISOString().split('T')[0]
    
    // Mån-Fre (1-5) och inte röd dag
    if (dag >= 1 && dag <= 5 && !RODA_DAGAR_2026.includes(datumStr)) {
      arbetsdagar++
    }
  }
  
  return arbetsdagar
}

// Räkna arbetsdagar som gått
function getArbetsdagarGatt(ar: number, manad: number, idag: number) {
  const forstaDag = new Date(ar, manad - 1, 1)
  const tillDag = new Date(ar, manad - 1, idag)
  
  let arbetsdagar = 0
  
  for (let d = new Date(forstaDag); d <= tillDag; d.setDate(d.getDate() + 1)) {
    const dag = d.getDay()
    const datumStr = d.toISOString().split('T')[0]
    
    if (dag >= 1 && dag <= 5 && !RODA_DAGAR_2026.includes(datumStr)) {
      arbetsdagar++
    }
  }
  
  return arbetsdagar
}

const DEMO_DATA = {
  ar: 2026,
  manad: 3, // Mars
  dagensDatum: 12, // 12 mars
  
  slut: { 
    bestallning: 8000,
    skordare: 3500,
    skotare: 2800
  },
  gallring: { 
    bestallning: 1200,
    skordare: 600,
    skotare: 350
  }
}

const MANAD_NAMN = ['', 'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 
                    'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

export default function HelikopterPage() {
  const [data] = useState(DEMO_DATA)

  // Exakta arbetsdagar
  const arbetsdagar = getArbetsdagar(data.ar, data.manad)
  const dagarGatt = getArbetsdagarGatt(data.ar, data.manad, data.dagensDatum)
  const dagarKvar = arbetsdagar - dagarGatt
  const procGatt = dagarGatt / arbetsdagar
  
  // Slutavverkning - Skördare
  const slutSkordKvar = data.slut.bestallning - data.slut.skordare
  const slutSkordProc = Math.round((data.slut.skordare / data.slut.bestallning) * 100)
  const slutSkordPerDag = Math.ceil(slutSkordKvar / dagarKvar)
  const slutSkordBorde = Math.round(procGatt * data.slut.bestallning)
  const slutSkordDiff = data.slut.skordare - slutSkordBorde
  
  // Slutavverkning - Skotare
  const slutSkotKvar = data.slut.bestallning - data.slut.skotare
  const slutSkotProc = Math.round((data.slut.skotare / data.slut.bestallning) * 100)
  const slutSkotPerDag = Math.ceil(slutSkotKvar / dagarKvar)
  const slutSkotBorde = Math.round(procGatt * data.slut.bestallning)
  const slutSkotDiff = data.slut.skotare - slutSkotBorde
  
  // Gallring - Skördare
  const gallSkordKvar = data.gallring.bestallning - data.gallring.skordare
  const gallSkordProc = Math.round((data.gallring.skordare / data.gallring.bestallning) * 100)
  const gallSkordPerDag = Math.ceil(gallSkordKvar / dagarKvar)
  const gallSkordBorde = Math.round(procGatt * data.gallring.bestallning)
  const gallSkordDiff = data.gallring.skordare - gallSkordBorde
  
  // Gallring - Skotare
  const gallSkotKvar = data.gallring.bestallning - data.gallring.skotare
  const gallSkotProc = Math.round((data.gallring.skotare / data.gallring.bestallning) * 100)
  const gallSkotPerDag = Math.ceil(gallSkotKvar / dagarKvar)
  const gallSkotBorde = Math.round(procGatt * data.gallring.bestallning)
  const gallSkotDiff = data.gallring.skotare - gallSkotBorde

  // Status
  const allOK = slutSkordDiff >= 0 && slutSkotDiff >= -500 && gallSkordDiff >= 0 && gallSkotDiff >= -200

  // Maskin-rad komponent
  const MaskinRad = ({ emoji, namn, levererat, bestallning, kvar, perDag, diff, farg }) => {
    const ok = diff >= 0
    
    return (
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 20,
        padding: 20,
        marginBottom: 10
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{emoji}</span>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{namn}</span>
          </div>
          <div style={{ 
            fontSize: 14, 
            fontWeight: 600,
            color: ok ? '#34C759' : '#FF453A',
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
            <span style={{ 
              fontSize: 12, 
              opacity: 0.8 
            }}>
              {diff >= 0 ? 'Före' : 'Efter'}
            </span>
            {Math.abs(diff)} m³
          </div>
        </div>

        {/* Stor siffra */}
        <div style={{ 
          marginBottom: 12
        }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: farg }}>
            {levererat.toLocaleString()}
          </span>
          <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>
            / {bestallning.toLocaleString()} m³
          </span>
        </div>

        {/* Progress */}
        <div style={{
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 4,
          height: 6,
          marginBottom: 16
        }}>
          <div style={{
            background: farg,
            height: '100%',
            width: `${Math.round((levererat / bestallning) * 100)}%`,
            borderRadius: 4
          }} />
        </div>

        {/* Kvar + Behöver */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{
            flex: 1,
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: 12,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Kvar</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{kvar.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>m³</div>
          </div>
          <div style={{
            flex: 1,
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: 12,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Behöver</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: farg }}>{perDag}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>m³/dag</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
      color: '#fff',
      padding: '60px 24px 100px'
    }}>
      
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ 
          fontSize: 40, 
          fontWeight: 700, 
          margin: 0,
          letterSpacing: '-1px'
        }}>
          {MANAD_NAMN[data.manad]}
        </h1>
        <p style={{ 
          fontSize: 17, 
          color: 'rgba(255,255,255,0.4)', 
          marginTop: 8 
        }}>
          Dag {dagarGatt} av {arbetsdagar} · {dagarKvar} kvar
        </p>
      </div>



      {/* Slutavverkning */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 10,
          marginBottom: 12,
          paddingLeft: 4
        }}>
          <span style={{ fontSize: 22 }}>🪵</span>
          <span style={{ fontSize: 22, fontWeight: 700 }}>Slutavverkning</span>
          <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
            Beställt {data.slut.bestallning.toLocaleString()} m³
          </span>
        </div>
        
        <MaskinRad
          emoji="🪓"
          namn="Skördare"
          levererat={data.slut.skordare}
          bestallning={data.slut.bestallning}
          kvar={slutSkordKvar}
          perDag={slutSkordPerDag}
          diff={slutSkordDiff}
          farg="#FF9500"
        />
        
        <MaskinRad
          emoji="🚛"
          namn="Skotare"
          levererat={data.slut.skotare}
          bestallning={data.slut.bestallning}
          kvar={slutSkotKvar}
          perDag={slutSkotPerDag}
          diff={slutSkotDiff}
          farg="#FF9500"
        />
      </div>

      {/* Gallring */}
      <div>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 10,
          marginBottom: 12,
          paddingLeft: 4
        }}>
          <span style={{ fontSize: 22 }}>🌲</span>
          <span style={{ fontSize: 22, fontWeight: 700 }}>Gallring</span>
          <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
            Beställt {data.gallring.bestallning.toLocaleString()} m³
          </span>
        </div>
        
        <MaskinRad
          emoji="🪓"
          namn="Skördare"
          levererat={data.gallring.skordare}
          bestallning={data.gallring.bestallning}
          kvar={gallSkordKvar}
          perDag={gallSkordPerDag}
          diff={gallSkordDiff}
          farg="#34C759"
        />
        
        <MaskinRad
          emoji="🚛"
          namn="Skotare"
          levererat={data.gallring.skotare}
          bestallning={data.gallring.bestallning}
          kvar={gallSkotKvar}
          perDag={gallSkotPerDag}
          diff={gallSkotDiff}
          farg="#34C759"
        />
      </div>

    </div>
  )
}
