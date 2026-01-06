'use client'
import React, { useState } from 'react'

// Typer
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

// Månadsnamn
const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

// Formatera datum snyggt
function formatDatum(datum: string): string {
  const d = new Date(datum)
  return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export default function Bestallningar() {
  // Inloggad användare (kommer från inloggningen)
  const inloggadAnvandare = 'Erik'

  // Datum
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(0)

  // Beställningar med historik
  const [bestallningar, setBestallningar] = useState<Bestallning[]>([
    { 
      id: 1, year: 2026, month: 0, typ: 'slut', bolag: 'Vida', volym: 400,
      skapadAv: 'Erik', skapadDatum: '2026-01-02T08:30:00',
      andringar: []
    },
    { 
      id: 2, year: 2026, month: 0, typ: 'slut', bolag: 'Södra', volym: 300,
      skapadAv: 'Anna', skapadDatum: '2026-01-03T14:15:00',
      andringar: [
        { datum: '2026-01-04T09:20:00', av: 'Erik', fran: 250, till: 300 }
      ]
    },
    { 
      id: 3, year: 2026, month: 0, typ: 'gallring', bolag: 'Vida', volym: 250,
      skapadAv: 'Lars', skapadDatum: '2026-01-03T10:00:00',
      andringar: []
    },
    { 
      id: 4, year: 2026, month: 0, typ: 'gallring', bolag: 'ATA', volym: 150,
      skapadAv: 'Erik', skapadDatum: '2026-01-05T16:45:00',
      andringar: []
    },
  ])

  // Sparade bolag
  const [sparadeBolag, setSparadeBolag] = useState(['Vida', 'Södra', 'ATA'])

  // Modal
  const [visa, setVisa] = useState<string | null>(null)
  const [valdTyp, setValdTyp] = useState<'slut' | 'gallring' | null>(null)
  const [bolagInput, setBolagInput] = useState('')
  const [volym, setVolym] = useState('')
  const [redigerar, setRedigerar] = useState<Bestallning | null>(null)
  const [visaDetalj, setVisaDetalj] = useState<number | null>(null)

  // Filtrera
  const aktuella = bestallningar.filter(b => b.year === year && b.month === month)
  const slutBest = aktuella.filter(b => b.typ === 'slut')
  const gallBest = aktuella.filter(b => b.typ === 'gallring')
  const sumSlut = slutBest.reduce((s, b) => s + b.volym, 0)
  const sumGall = gallBest.reduce((s, b) => s + b.volym, 0)
  const sumTot = sumSlut + sumGall

  // Byt månad
  const bytManad = (dir: number) => {
    let m = month + dir
    let y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMonth(m)
    setYear(y)
  }

  // Ny beställning
  const starta = () => {
    setRedigerar(null)
    setValdTyp(null)
    setBolagInput('')
    setVolym('')
    setVisa('typ')
  }

  // Redigera
  const edit = (b: Bestallning) => {
    setRedigerar(b)
    setValdTyp(b.typ)
    setBolagInput(b.bolag)
    setVolym(b.volym.toString())
    setVisa('bolag')
  }

  // Spara
  const spara = () => {
    if (!valdTyp || !bolagInput.trim() || !volym) return
    
    // Spara bolaget om det är nytt
    if (!sparadeBolag.includes(bolagInput.trim())) {
      setSparadeBolag([...sparadeBolag, bolagInput.trim()])
    }

    if (redigerar) {
      // Lägg till ändring i historiken om volymen ändrats
      const gammalVolym = redigerar.volym
      const nyVolym = parseInt(volym)
      
      setBestallningar(bestallningar.map(b => {
        if (b.id === redigerar.id) {
          const andringar = [...b.andringar]
          if (gammalVolym !== nyVolym) {
            andringar.push({
              datum: new Date().toISOString(),
              av: inloggadAnvandare,
              fran: gammalVolym,
              till: nyVolym
            })
          }
          return { 
            ...b, 
            typ: valdTyp, 
            bolag: bolagInput.trim(), 
            volym: nyVolym,
            andringar
          }
        }
        return b
      }))
    } else {
      setBestallningar([...bestallningar, {
        id: Date.now(),
        year, month,
        typ: valdTyp,
        bolag: bolagInput.trim(),
        volym: parseInt(volym),
        skapadAv: inloggadAnvandare,
        skapadDatum: new Date().toISOString(),
        andringar: []
      }])
    }
    setVisa(null)
  }

  // Ta bort
  const taBort = (id: number) => {
    setBestallningar(bestallningar.filter(b => b.id !== id))
  }

  // Visa detaljer
  const detalj = visaDetalj ? bestallningar.find(b => b.id === visaDetalj) : null

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
          <div style={{ 
            width: '50px', height: '50px', 
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            borderRadius: '15px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px'
          }}>🌲</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '700', fontSize: '20px', color: '#1a1a1a' }}>Kompersmåla Skog</div>
            <div style={{ color: '#22c55e', fontWeight: '600' }}>Beställningar</div>
          </div>
          
          {/* Inloggad som (bara info) */}
          <div style={{
            padding: '10px 16px',
            background: '#f1f5f9',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            👤 {inloggadAnvandare}
          </div>
        </div>

        {/* MÅNADSVÄLJARE */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: '#f8fafc',
          borderRadius: '20px',
          padding: '8px'
        }}>
          <button 
            onClick={() => bytManad(-1)}
            style={{ 
              width: '50px', height: '50px', 
              background: 'white',
              border: 'none',
              borderRadius: '15px',
              fontSize: '24px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}
          >◀</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a' }}>
              {MANADER[month]} {year}
            </div>
          </div>
          <button 
            onClick={() => bytManad(1)}
            style={{ 
              width: '50px', height: '50px', 
              background: 'white',
              border: 'none',
              borderRadius: '15px',
              fontSize: '24px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}
          >▶</button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>

        {/* SAMMANFATTNING */}
        <div style={{ 
          background: 'white', 
          borderRadius: '24px', 
          padding: '24px',
          marginBottom: '16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '16px', color: '#666', marginBottom: '4px' }}>Totalt beställt</div>
            <div style={{ fontSize: '56px', fontWeight: '800', color: '#22c55e' }}>{sumTot}</div>
            <div style={{ fontSize: '20px', color: '#999' }}>kubikmeter</div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ 
              flex: 1, 
              background: '#fef3c7', 
              borderRadius: '16px', 
              padding: '16px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '4px' }}>🪵</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#b45309' }}>{sumSlut}</div>
              <div style={{ fontSize: '12px', color: '#92400e' }}>Slutavverkning</div>
            </div>
            <div style={{ 
              flex: 1, 
              background: '#d1fae5', 
              borderRadius: '16px', 
              padding: '16px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '4px' }}>🌲</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#059669' }}>{sumGall}</div>
              <div style={{ fontSize: '12px', color: '#047857' }}>Gallring</div>
            </div>
          </div>
        </div>

        {/* NY BESTÄLLNING */}
        <button 
          onClick={starta}
          style={{ 
            width: '100%',
            padding: '20px',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            border: 'none',
            borderRadius: '20px',
            fontSize: '20px',
            fontWeight: '700',
            color: 'white',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}
        >
          <span style={{ fontSize: '28px' }}>➕</span>
          Ny beställning
        </button>

        {/* BESTÄLLNINGAR */}
        {aktuella.length === 0 ? (
          <div style={{ 
            background: 'white', 
            borderRadius: '24px', 
            padding: '48px 24px',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>📋</div>
            <div style={{ fontSize: '20px', fontWeight: '600', color: '#1a1a1a' }}>Inga beställningar</div>
            <div style={{ color: '#999', marginTop: '8px' }}>Tryck på knappen för att lägga till</div>
          </div>
        ) : (
          <>
            {/* SLUTAVVERKNING */}
            {slutBest.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  marginBottom: '12px',
                  padding: '0 4px'
                }}>
                  <span style={{ fontSize: '28px' }}>🪵</span>
                  <span style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a' }}>Slutavverkning</span>
                  <span style={{ marginLeft: 'auto', fontSize: '20px', fontWeight: '700', color: '#b45309' }}>{sumSlut} m³</span>
                </div>
                {slutBest.map(b => (
                  <div key={b.id} style={{ 
                    background: 'white', 
                    borderRadius: '16px', 
                    padding: '16px',
                    marginBottom: '8px',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        width: '44px', height: '44px',
                        background: '#fef3c7',
                        borderRadius: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '20px'
                      }}>🪵</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a1a' }}>{b.bolag}</div>
                        <div style={{ fontSize: '12px', color: '#999' }}>
                          👤 {b.skapadAv} • {formatDatum(b.skapadDatum)}
                          {b.andringar.length > 0 && (
                            <span style={{ color: '#f59e0b', marginLeft: '8px' }}>✏️ Ändrad</span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a1a' }}>{b.volym} m³</div>
                    </div>
                    
                    {/* Knappar */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                      <button onClick={() => setVisaDetalj(b.id)} style={{ 
                        flex: 1, padding: '10px', background: '#f1f5f9', border: 'none', 
                        borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                      }}>📋 Info</button>
                      <button onClick={() => edit(b)} style={{ 
                        flex: 1, padding: '10px', background: '#f1f5f9', border: 'none', 
                        borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                      }}>✏️ Ändra</button>
                      <button onClick={() => taBort(b.id)} style={{ 
                        padding: '10px 14px', background: '#fee2e2', border: 'none', 
                        borderRadius: '10px', fontSize: '14px', cursor: 'pointer'
                      }}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* GALLRING */}
            {gallBest.length > 0 && (
              <div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  marginBottom: '12px',
                  padding: '0 4px'
                }}>
                  <span style={{ fontSize: '28px' }}>🌲</span>
                  <span style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a' }}>Gallring</span>
                  <span style={{ marginLeft: 'auto', fontSize: '20px', fontWeight: '700', color: '#059669' }}>{sumGall} m³</span>
                </div>
                {gallBest.map(b => (
                  <div key={b.id} style={{ 
                    background: 'white', 
                    borderRadius: '16px', 
                    padding: '16px',
                    marginBottom: '8px',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        width: '44px', height: '44px',
                        background: '#d1fae5',
                        borderRadius: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '20px'
                      }}>🌲</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a1a' }}>{b.bolag}</div>
                        <div style={{ fontSize: '12px', color: '#999' }}>
                          👤 {b.skapadAv} • {formatDatum(b.skapadDatum)}
                          {b.andringar.length > 0 && (
                            <span style={{ color: '#f59e0b', marginLeft: '8px' }}>✏️ Ändrad</span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a1a' }}>{b.volym} m³</div>
                    </div>
                    
                    {/* Knappar */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                      <button onClick={() => setVisaDetalj(b.id)} style={{ 
                        flex: 1, padding: '10px', background: '#f1f5f9', border: 'none', 
                        borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                      }}>📋 Info</button>
                      <button onClick={() => edit(b)} style={{ 
                        flex: 1, padding: '10px', background: '#f1f5f9', border: 'none', 
                        borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                      }}>✏️ Ändra</button>
                      <button onClick={() => taBort(b.id)} style={{ 
                        padding: '10px 14px', background: '#fee2e2', border: 'none', 
                        borderRadius: '10px', fontSize: '14px', cursor: 'pointer'
                      }}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL - Detaljer & Historik */}
      {detalj && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '32px',
            padding: '32px',
            width: '100%',
            maxWidth: '400px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ 
                width: '64px', height: '64px', 
                background: detalj.typ === 'slut' ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : 'linear-gradient(135deg, #34d399, #10b981)',
                borderRadius: '20px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '32px',
                margin: '0 auto 16px'
              }}>{detalj.typ === 'slut' ? '🪵' : '🌲'}</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a' }}>{detalj.bolag}</div>
              <div style={{ fontSize: '36px', fontWeight: '800', color: '#22c55e', marginTop: '8px' }}>{detalj.volym} m³</div>
              <div style={{ color: '#999' }}>{detalj.typ === 'slut' ? 'Slutavverkning' : 'Gallring'}</div>
            </div>

            {/* Skapad info */}
            <div style={{ 
              background: '#f8fafc', 
              borderRadius: '16px', 
              padding: '16px',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '14px', color: '#999', marginBottom: '8px' }}>Skapad</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>👤</span>
                <div>
                  <div style={{ fontWeight: '600', color: '#1a1a1a' }}>{detalj.skapadAv}</div>
                  <div style={{ fontSize: '14px', color: '#666' }}>{formatDatum(detalj.skapadDatum)}</div>
                </div>
              </div>
            </div>

            {/* Ändringshistorik */}
            {detalj.andringar.length > 0 && (
              <div style={{ 
                background: '#fef3c7', 
                borderRadius: '16px', 
                padding: '16px'
              }}>
                <div style={{ fontSize: '14px', color: '#92400e', marginBottom: '12px', fontWeight: '600' }}>
                  ✏️ Ändringshistorik
                </div>
                {detalj.andringar.map((a, i) => (
                  <div key={i} style={{ 
                    background: 'white', 
                    borderRadius: '12px', 
                    padding: '12px',
                    marginBottom: i < detalj.andringar.length - 1 ? '8px' : 0
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '600', color: '#1a1a1a' }}>👤 {a.av}</span>
                      <span style={{ fontSize: '12px', color: '#999' }}>{formatDatum(a.datum)}</span>
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                      Volym: <span style={{ textDecoration: 'line-through', color: '#ef4444' }}>{a.fran} m³</span>
                      <span style={{ margin: '0 8px' }}>→</span>
                      <span style={{ color: '#22c55e', fontWeight: '600' }}>{a.till} m³</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {detalj.andringar.length === 0 && (
              <div style={{ 
                background: '#d1fae5', 
                borderRadius: '16px', 
                padding: '16px',
                textAlign: 'center'
              }}>
                <span style={{ fontSize: '24px' }}>✅</span>
                <div style={{ color: '#059669', fontWeight: '600', marginTop: '8px' }}>Inga ändringar gjorda</div>
              </div>
            )}

            <button
              onClick={() => setVisaDetalj(null)}
              style={{
                width: '100%',
                padding: '16px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '16px',
                fontSize: '18px',
                fontWeight: '600',
                color: '#64748b',
                cursor: 'pointer',
                marginTop: '24px'
              }}
            >Stäng</button>
          </div>
        </div>
      )}

      {/* MODAL - Välj typ */}
      {visa === 'typ' && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '32px',
            padding: '32px',
            width: '100%',
            maxWidth: '400px'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a' }}>Vad ska göras?</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <button
                onClick={() => { setValdTyp('slut'); setVisa('bolag') }}
                style={{
                  padding: '28px',
                  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  boxShadow: '0 4px 20px rgba(251,191,36,0.4)'
                }}
              >
                <span style={{ fontSize: '48px' }}>🪵</span>
                <span style={{ fontSize: '24px', fontWeight: '700', color: 'white' }}>Slutavverkning</span>
              </button>

              <button
                onClick={() => { setValdTyp('gallring'); setVisa('bolag') }}
                style={{
                  padding: '28px',
                  background: 'linear-gradient(135deg, #34d399, #10b981)',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  boxShadow: '0 4px 20px rgba(52,211,153,0.4)'
                }}
              >
                <span style={{ fontSize: '48px' }}>🌲</span>
                <span style={{ fontSize: '24px', fontWeight: '700', color: 'white' }}>Gallring</span>
              </button>
            </div>

            <button
              onClick={() => setVisa(null)}
              style={{
                width: '100%',
                padding: '16px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '16px',
                fontSize: '18px',
                fontWeight: '600',
                color: '#64748b',
                cursor: 'pointer',
                marginTop: '24px'
              }}
            >Avbryt</button>
          </div>
        </div>
      )}

      {/* MODAL - Skriv bolag */}
      {visa === 'bolag' && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '32px',
            padding: '32px',
            width: '100%',
            maxWidth: '400px'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ 
                width: '64px', height: '64px', 
                background: valdTyp === 'slut' ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : 'linear-gradient(135deg, #34d399, #10b981)',
                borderRadius: '20px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '32px',
                margin: '0 auto 16px'
              }}>{valdTyp === 'slut' ? '🪵' : '🌲'}</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a' }}>Vilket bolag?</div>
            </div>

            <input
              type="text"
              value={bolagInput}
              onChange={(e) => setBolagInput(e.target.value)}
              placeholder="Skriv bolagets namn..."
              autoFocus
              style={{
                width: '100%',
                padding: '20px',
                background: '#f8fafc',
                border: '3px solid #e2e8f0',
                borderRadius: '16px',
                fontSize: '20px',
                fontWeight: '600',
                color: '#1a1a1a',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: '16px'
              }}
            />

            {sparadeBolag.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '14px', color: '#999', marginBottom: '8px' }}>Tidigare bolag:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {sparadeBolag.map(b => (
                    <button
                      key={b}
                      onClick={() => setBolagInput(b)}
                      style={{
                        padding: '10px 16px',
                        background: bolagInput === b ? '#22c55e' : '#f1f5f9',
                        color: bolagInput === b ? 'white' : '#1a1a1a',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: '16px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      🌲 {b}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => bolagInput.trim() && setVisa('volym')}
              disabled={!bolagInput.trim()}
              style={{
                width: '100%',
                padding: '18px',
                background: bolagInput.trim() ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#e2e8f0',
                border: 'none',
                borderRadius: '16px',
                fontSize: '18px',
                fontWeight: '700',
                color: bolagInput.trim() ? 'white' : '#94a3b8',
                cursor: bolagInput.trim() ? 'pointer' : 'default',
                boxShadow: bolagInput.trim() ? '0 4px 20px rgba(34,197,94,0.4)' : 'none'
              }}
            >Nästa →</button>

            <button
              onClick={() => setVisa('typ')}
              style={{
                width: '100%',
                padding: '16px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '16px',
                fontSize: '18px',
                fontWeight: '600',
                color: '#64748b',
                cursor: 'pointer',
                marginTop: '12px'
              }}
            >← Tillbaka</button>
          </div>
        </div>
      )}

      {/* MODAL - Ange volym */}
      {visa === 'volym' && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '32px',
            padding: '32px',
            width: '100%',
            maxWidth: '400px'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ 
                  width: '56px', height: '56px', 
                  background: valdTyp === 'slut' ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : 'linear-gradient(135deg, #34d399, #10b981)',
                  borderRadius: '16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '28px'
                }}>{valdTyp === 'slut' ? '🪵' : '🌲'}</div>
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a1a' }}>{bolagInput}</div>
              <div style={{ color: '#999' }}>{valdTyp === 'slut' ? 'Slutavverkning' : 'Gallring'}</div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ textAlign: 'center', color: '#666', marginBottom: '12px', fontSize: '18px' }}>
                Hur många kubikmeter?
              </div>
              <input
                type="number"
                value={volym}
                onChange={(e) => setVolym(e.target.value)}
                placeholder="0"
                autoFocus
                style={{
                  width: '100%',
                  padding: '24px',
                  background: '#f8fafc',
                  border: '3px solid #e2e8f0',
                  borderRadius: '20px',
                  fontSize: '48px',
                  fontWeight: '700',
                  textAlign: 'center',
                  color: '#1a1a1a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ textAlign: 'center', color: '#999', marginTop: '8px', fontSize: '20px' }}>m³</div>
            </div>

            <button
              onClick={spara}
              disabled={!volym}
              style={{
                width: '100%',
                padding: '20px',
                background: volym ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#e2e8f0',
                border: 'none',
                borderRadius: '16px',
                fontSize: '20px',
                fontWeight: '700',
                color: volym ? 'white' : '#94a3b8',
                cursor: volym ? 'pointer' : 'default',
                boxShadow: volym ? '0 4px 20px rgba(34,197,94,0.4)' : 'none'
              }}
            >{redigerar ? '✓ Spara' : '✓ Lägg till'}</button>

            <button
              onClick={() => setVisa('bolag')}
              style={{
                width: '100%',
                padding: '16px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '16px',
                fontSize: '18px',
                fontWeight: '600',
                color: '#64748b',
                cursor: 'pointer',
                marginTop: '12px'
              }}
            >← Tillbaka</button>
          </div>
        </div>
      )}

    </div>
  )
}
