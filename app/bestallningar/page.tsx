'use client'
import { useState } from 'react'
import Link from 'next/link'

const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

interface Andring {
  datum: string
  av: string
  fran: number
  till: number
}

interface Bestallning {
  id: number
  year: number
  month: number
  typ: 'slut' | 'gallring'
  bolag: string
  volym: number
  skapadAv: string
  skapadDatum: string
  andringar: Andring[]
}

export default function Bestallningar() {
  const inloggadAnvandare = 'Erik'
  
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(0)
  const [bestallningar, setBestallningar] = useState<Bestallning[]>([])
  const [sparadeBolag, setSparadeBolag] = useState(['Vida', 'Södra', 'ATA'])
  
  const [steg, setSteg] = useState(0)
  const [valdTyp, setValdTyp] = useState<'slut' | 'gallring' | null>(null)
  const [valtBolag, setValtBolag] = useState('')
  const [nyttBolagInput, setNyttBolagInput] = useState('')
  const [visaNyttBolag, setVisaNyttBolag] = useState(false)
  const [valdVolym, setValdVolym] = useState('')
  
  const [redigerar, setRedigerar] = useState<Bestallning | null>(null)
  const [visaInfo, setVisaInfo] = useState<Bestallning | null>(null)

  const aktuella = bestallningar.filter(b => b.year === year && b.month === month)
  const slutSum = aktuella.filter(b => b.typ === 'slut').reduce((s, b) => s + b.volym, 0)
  const gallSum = aktuella.filter(b => b.typ === 'gallring').reduce((s, b) => s + b.volym, 0)

  const formatDatum = (iso: string) => {
    const d = new Date(iso)
    return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const bytManad = (dir: number) => {
    let m = month + dir
    let y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMonth(m)
    setYear(y)
  }

  const openModal = () => {
    setSteg(1)
    setValdTyp(null)
    setValtBolag('')
    setValdVolym('')
    setRedigerar(null)
  }

  const valjTyp = (typ: 'slut' | 'gallring') => {
    setValdTyp(typ)
    setSteg(2)
  }

  const valjBolag = (bolag: string) => {
    setValtBolag(bolag)
    setSteg(3)
  }

  const laggTillBolag = () => {
    if (nyttBolagInput.trim() && !sparadeBolag.includes(nyttBolagInput.trim())) {
      setSparadeBolag([...sparadeBolag, nyttBolagInput.trim()])
      setValtBolag(nyttBolagInput.trim())
      setSteg(3)
    }
    setNyttBolagInput('')
    setVisaNyttBolag(false)
  }

  const spara = () => {
    if (!valdTyp || !valtBolag || !valdVolym) return
    const nyVolym = parseInt(valdVolym)
    
    if (redigerar) {
      setBestallningar(bestallningar.map(b => {
        if (b.id === redigerar.id) {
          const nyAndring: Andring = {
            datum: new Date().toISOString(),
            av: inloggadAnvandare,
            fran: b.volym,
            till: nyVolym
          }
          return { 
            ...b, 
            typ: valdTyp, 
            bolag: valtBolag, 
            volym: nyVolym,
            andringar: [...b.andringar, nyAndring]
          }
        }
        return b
      }))
    } else {
      const ny: Bestallning = {
        id: Date.now(),
        year, month,
        typ: valdTyp,
        bolag: valtBolag,
        volym: nyVolym,
        skapadAv: inloggadAnvandare,
        skapadDatum: new Date().toISOString(),
        andringar: []
      }
      setBestallningar([...bestallningar, ny])
    }
    setSteg(0)
  }

  const redigeraBestallning = (b: Bestallning) => {
    setRedigerar(b)
    setValdTyp(b.typ)
    setValtBolag(b.bolag)
    setValdVolym(b.volym.toString())
    setSteg(3)
  }

  const taBort = (id: number) => {
    setBestallningar(bestallningar.filter(b => b.id !== id))
  }

  const renderKort = (b: Bestallning) => {
    const harAndrats = b.andringar.length > 0
    return (
      <div key={b.id} style={{
        background: b.typ === 'slut' 
          ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
          : 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
        borderRadius: '20px',
        padding: '20px',
        marginBottom: '12px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '40px' }}>{b.typ === 'slut' ? '🪵' : '🌲'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '700', fontSize: '20px', color: '#1a1a1a' }}>{b.bolag}</div>
            <div style={{ fontSize: '14px', color: '#666', marginTop: '2px' }}>
              {b.typ === 'slut' ? 'Slutavverkning' : 'Gallring'}
              {harAndrats && <span style={{ marginLeft: '8px', color: '#f59e0b' }}>✏️ Ändrad</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#1a1a1a' }}>{b.volym}</div>
            <div style={{ fontSize: '14px', color: '#666' }}>m³</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button onClick={() => setVisaInfo(b)} style={{
            flex: 1, padding: '12px', background: 'rgba(255,255,255,0.7)',
            border: 'none', borderRadius: '12px', fontSize: '16px', cursor: 'pointer'
          }}>📋 Info</button>
          <button onClick={() => redigeraBestallning(b)} style={{
            flex: 1, padding: '12px', background: 'rgba(255,255,255,0.7)',
            border: 'none', borderRadius: '12px', fontSize: '16px', cursor: 'pointer'
          }}>✏️ Ändra</button>
          <button onClick={() => taBort(b.id)} style={{
            padding: '12px 16px', background: 'rgba(239,68,68,0.2)',
            border: 'none', borderRadius: '12px', fontSize: '16px', cursor: 'pointer'
          }}>🗑️</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* HEADER */}
      <div style={{ 
        background: 'white', 
        padding: '20px', 
        borderRadius: '0 0 30px 30px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <Link href="/" style={{
            width: '50px', height: '50px', 
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            borderRadius: '15px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px'
          }}>🌲</Link>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '700', fontSize: '20px', color: '#1a1a1a' }}>Kompersmåla Skog</div>
            <div style={{ color: '#3b82f6', fontWeight: '600' }}>Beställningar</div>
          </div>
          <div style={{
            padding: '10px 16px',
            background: '#f1f5f9',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600'
          }}>👤 {inloggadAnvandare}</div>
        </div>

        <div style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#f8fafc', borderRadius: '20px', padding: '8px'
        }}>
          <button onClick={() => bytManad(-1)} style={{ 
            width: '50px', height: '50px', background: 'white', border: 'none',
            borderRadius: '15px', fontSize: '24px', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
          }}>◀</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a' }}>
              {MANADER[month]} {year}
            </div>
          </div>
          <button onClick={() => bytManad(1)} style={{ 
            width: '50px', height: '50px', background: 'white', border: 'none',
            borderRadius: '15px', fontSize: '24px', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
          }}>▶</button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>
        {/* SUMMERING */}
        <div style={{ 
          display: 'flex', gap: '12px', marginBottom: '20px'
        }}>
          <div style={{ flex: 1, background: 'white', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a' }}>{slutSum + gallSum}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Totalt m³</div>
          </div>
          <div style={{ flex: 1, background: 'linear-gradient(135deg, #fef3c7, #fde68a)', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a' }}>{slutSum}</div>
            <div style={{ fontSize: '12px', color: '#92400e' }}>🪵 Slut</div>
          </div>
          <div style={{ flex: 1, background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a' }}>{gallSum}</div>
            <div style={{ fontSize: '12px', color: '#065f46' }}>🌲 Gallr</div>
          </div>
        </div>

        {/* NY BESTÄLLNING */}
        <button onClick={openModal} style={{ 
          width: '100%', padding: '20px',
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          border: 'none', borderRadius: '20px',
          fontSize: '20px', fontWeight: '700', color: 'white',
          cursor: 'pointer', boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
          marginBottom: '24px'
        }}>
          ➕ Ny beställning
        </button>

        {/* LISTA */}
        {aktuella.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
            Inga beställningar för {MANADER[month]}
          </div>
        ) : (
          aktuella.map(renderKort)
        )}
      </div>

      {/* MODAL */}
      {steg > 0 && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px', zIndex: 100
        }}>
          <div style={{
            background: 'white', borderRadius: '30px', padding: '28px',
            width: '100%', maxWidth: '400px'
          }}>
            {steg === 1 && (
              <>
                <h2 style={{ textAlign: 'center', marginBottom: '24px', fontSize: '24px' }}>Välj typ</h2>
                <button onClick={() => valjTyp('slut')} style={{
                  width: '100%', padding: '24px', marginBottom: '16px',
                  background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                  border: 'none', borderRadius: '20px', fontSize: '22px',
                  fontWeight: '700', cursor: 'pointer'
                }}>🪵 Slutavverkning</button>
                <button onClick={() => valjTyp('gallring')} style={{
                  width: '100%', padding: '24px',
                  background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
                  border: 'none', borderRadius: '20px', fontSize: '22px',
                  fontWeight: '700', cursor: 'pointer'
                }}>🌲 Gallring</button>
              </>
            )}

            {steg === 2 && (
              <>
                <h2 style={{ textAlign: 'center', marginBottom: '24px', fontSize: '24px' }}>Välj bolag</h2>
                {!visaNyttBolag ? (
                  <>
                    {sparadeBolag.map(b => (
                      <button key={b} onClick={() => valjBolag(b)} style={{
                        width: '100%', padding: '20px', marginBottom: '12px',
                        background: '#f1f5f9', border: 'none', borderRadius: '16px',
                        fontSize: '20px', fontWeight: '600', cursor: 'pointer'
                      }}>{b}</button>
                    ))}
                    <button onClick={() => setVisaNyttBolag(true)} style={{
                      width: '100%', padding: '20px', marginTop: '8px',
                      background: 'white', border: '3px dashed #d1d5db',
                      borderRadius: '16px', fontSize: '18px', color: '#64748b', cursor: 'pointer'
                    }}>+ Lägg till bolag</button>
                  </>
                ) : (
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <input type="text" value={nyttBolagInput}
                      onChange={e => setNyttBolagInput(e.target.value)}
                      placeholder="Bolagsnamn..." autoFocus
                      style={{
                        flex: 1, padding: '16px', background: '#f8fafc',
                        border: '2px solid #e2e8f0', borderRadius: '12px', fontSize: '18px'
                      }}
                    />
                    <button onClick={laggTillBolag} style={{
                      padding: '16px 24px', background: '#22c55e', color: 'white',
                      border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer'
                    }}>✓</button>
                  </div>
                )}
                <button onClick={() => setSteg(1)} style={{
                  width: '100%', padding: '16px', marginTop: '16px',
                  background: '#f1f5f9', border: 'none', borderRadius: '12px',
                  fontSize: '16px', cursor: 'pointer'
                }}>← Tillbaka</button>
              </>
            )}

            {steg === 3 && (
              <>
                <h2 style={{ textAlign: 'center', marginBottom: '8px', fontSize: '24px' }}>
                  {redigerar ? 'Ändra volym' : 'Ange volym'}
                </h2>
                <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '24px' }}>
                  {valdTyp === 'slut' ? '🪵' : '🌲'} {valtBolag}
                </p>
                <input type="number" value={valdVolym}
                  onChange={e => setValdVolym(e.target.value)}
                  placeholder="0" autoFocus
                  style={{
                    width: '100%', padding: '20px', background: '#f8fafc',
                    border: '2px solid #e2e8f0', borderRadius: '16px',
                    fontSize: '48px', fontWeight: '700', textAlign: 'center',
                    marginBottom: '8px', boxSizing: 'border-box'
                  }}
                />
                <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '24px' }}>m³</p>
                <button onClick={spara} disabled={!valdVolym}
                  style={{
                    width: '100%', padding: '20px',
                    background: valdVolym ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#e2e8f0',
                    border: 'none', borderRadius: '16px',
                    fontSize: '20px', fontWeight: '700',
                    color: valdVolym ? 'white' : '#94a3b8',
                    cursor: valdVolym ? 'pointer' : 'default'
                  }}
                >{redigerar ? '✓ Spara ändring' : '✓ Lägg till'}</button>
                <button onClick={() => redigerar ? setSteg(0) : setSteg(2)} style={{
                  width: '100%', padding: '16px', marginTop: '12px',
                  background: '#f1f5f9', border: 'none', borderRadius: '12px',
                  fontSize: '16px', cursor: 'pointer'
                }}>{redigerar ? 'Avbryt' : '← Tillbaka'}</button>
              </>
            )}

            {steg !== 3 && (
              <button onClick={() => setSteg(0)} style={{
                width: '100%', padding: '16px', marginTop: '16px',
                background: '#fee2e2', border: 'none', borderRadius: '12px',
                fontSize: '16px', color: '#dc2626', cursor: 'pointer'
              }}>Avbryt</button>
            )}
          </div>
        </div>
      )}

      {/* INFO MODAL */}
      {visaInfo && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px', zIndex: 100
        }} onClick={() => setVisaInfo(null)}>
          <div style={{
            background: 'white', borderRadius: '24px', padding: '24px',
            width: '100%', maxWidth: '400px'
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
              {visaInfo.typ === 'slut' ? '🪵' : '🌲'} {visaInfo.bolag}
            </h2>
            <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Skapad</div>
              <div style={{ fontWeight: '600' }}>
                {formatDatum(visaInfo.skapadDatum)} av {visaInfo.skapadAv}
              </div>
            </div>
            {visaInfo.andringar.length > 0 && (
              <div style={{ background: '#fef3c7', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontSize: '14px', color: '#92400e', marginBottom: '8px', fontWeight: '600' }}>
                  Ändringshistorik
                </div>
                {visaInfo.andringar.map((a, i) => (
                  <div key={i} style={{ 
                    padding: '8px 0', 
                    borderBottom: i < visaInfo.andringar.length - 1 ? '1px solid #fde68a' : 'none'
                  }}>
                    <div style={{ fontSize: '13px', color: '#92400e' }}>
                      {formatDatum(a.datum)} - {a.av}
                    </div>
                    <div style={{ fontWeight: '600' }}>
                      {a.fran} m³ → {a.till} m³
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setVisaInfo(null)} style={{
              width: '100%', padding: '16px', marginTop: '20px',
              background: '#f1f5f9', border: 'none', borderRadius: '12px',
              fontSize: '16px', fontWeight: '600', cursor: 'pointer'
            }}>Stäng</button>
          </div>
        </div>
      )}
    </div>
  )
}
