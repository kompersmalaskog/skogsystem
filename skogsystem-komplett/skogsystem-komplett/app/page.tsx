'use client'
import Link from 'next/link'

export default function Home() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px'
    }}>
      {/* HEADER */}
      <div style={{ 
        background: 'white', 
        padding: '24px', 
        borderRadius: '24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        marginBottom: '24px',
        textAlign: 'center'
      }}>
        <div style={{ 
          width: '80px', height: '80px', 
          background: 'linear-gradient(135deg, #22c55e, #16a34a)',
          borderRadius: '20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '48px',
          margin: '0 auto 16px'
        }}>🌲</div>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a', marginBottom: '8px' }}>
          Kompersmåla Skog
        </h1>
        <p style={{ color: '#64748b', fontSize: '16px' }}>Välj modul</p>
      </div>

      {/* MODULER */}
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        <Link href="/bestallningar">
          <div style={{ 
            background: 'white', 
            padding: '24px', 
            borderRadius: '20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            cursor: 'pointer',
            transition: 'transform 0.2s',
          }}>
            <div style={{
              width: '60px', height: '60px',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              borderRadius: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '32px'
            }}>📦</div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>
                Beställningar
              </h2>
              <p style={{ color: '#64748b', fontSize: '14px' }}>
                Hantera beställningar från bolagen
              </p>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '24px', color: '#94a3b8' }}>→</div>
          </div>
        </Link>

        <Link href="/objekt">
          <div style={{ 
            background: 'white', 
            padding: '24px', 
            borderRadius: '20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            cursor: 'pointer',
            transition: 'transform 0.2s',
          }}>
            <div style={{
              width: '60px', height: '60px',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              borderRadius: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '32px'
            }}>📍</div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>
                Objekt
              </h2>
              <p style={{ color: '#64748b', fontSize: '14px' }}>
                Trakter och avverkningsobjekt
              </p>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '24px', color: '#94a3b8' }}>→</div>
          </div>
        </Link>

        <div style={{ 
          background: 'white', 
          padding: '24px', 
          borderRadius: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          opacity: 0.5
        }}>
          <div style={{
            width: '60px', height: '60px',
            background: 'linear-gradient(135deg, #94a3b8, #64748b)',
            borderRadius: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '32px'
          }}>🗺️</div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>
              Karta
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px' }}>
              Kommer snart...
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
