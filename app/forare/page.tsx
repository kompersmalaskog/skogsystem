'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';

const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',system-ui,sans-serif";

type FarareObjekt = {
  id: string;
  namn: string;
  traktnr: string | null;
  areal: number | null;
  volym: number | null;
  typ: string | null;            // 'slutavverkning' / 'gallring'
  status: string;                 // 'planerad' | 'pagaende' i denna vy
  assigned_skordare_user_id: string | null;
  assigned_skotare_user_id: string | null;
  pagaende_startad_timestamp: string | null;
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 10) return 'God morgon';
  if (h < 18) return 'God dag';
  return 'God kväll';
}

function getFornamn(namn: string): string {
  return namn.split(' ')[0] || namn;
}

function typLabel(typ: string | null): string {
  if (typ === 'slutavverkning') return 'Slutavverkning';
  if (typ === 'gallring') return 'Gallring';
  return typ ?? '';
}

export default function FararePage() {
  const router = useRouter();
  const { medarbetare, loading: medarbetareLoading } = useCurrentMedarbetare();
  const [objektLista, setObjektLista] = useState<FarareObjekt[]>([]);
  const [loadingObjekt, setLoadingObjekt] = useState(true);
  const [startar, setStartar] = useState<string | null>(null); // objekt-id som startar

  useEffect(() => {
    if (medarbetareLoading) return;
    if (!medarbetare?.id) {
      setLoadingObjekt(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('objekt')
        .select('id, namn, traktnr, areal, volym, typ, status, assigned_skordare_user_id, assigned_skotare_user_id, pagaende_startad_timestamp')
        .or(`assigned_skordare_user_id.eq.${medarbetare.id},assigned_skotare_user_id.eq.${medarbetare.id}`)
        .in('status', ['planerad', 'pagaende']);

      if (cancelled) return;

      // Sortera: pagaende först, sen planerad. Inom samma status: alfabetiskt på namn.
      const sorted = (data || []).sort((a: any, b: any) => {
        if (a.status !== b.status) return a.status === 'pagaende' ? -1 : 1;
        return (a.namn || '').localeCompare(b.namn || '', 'sv');
      });

      setObjektLista(sorted as FarareObjekt[]);
      setLoadingObjekt(false);
    })();

    return () => { cancelled = true; };
  }, [medarbetare?.id, medarbetareLoading]);

  const handleStartObjekt = async (objekt: FarareObjekt) => {
    if (startar) return;
    setStartar(objekt.id);

    // 'planerad' → sätt pagaende + timestamp.
    // 'pagaende' (skördaren redan igång, skotaren ansluter) → ändra inget, bara routa.
    if (objekt.status === 'planerad') {
      await supabase.from('objekt').update({
        status: 'pagaende',
        pagaende_startad_timestamp: new Date().toISOString(),
      }).eq('id', objekt.id);
    }

    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    router.push(`/planering?objekt=${objekt.id}`);
  };

  // === RENDER ===

  if (medarbetareLoading) {
    return (
      <div style={{ padding: 24, color: '#a8a8ad', fontSize: 14, fontFamily: ff }}>
        Laddar…
      </div>
    );
  }

  if (!medarbetare) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center', color: '#fff', fontFamily: ff }}>
        <span className="material-symbols-outlined" aria-hidden="true"
          style={{ fontSize: 56, color: '#ff453a', marginBottom: 16, display: 'block' }}>
          error
        </span>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Användare hittades inte
        </div>
        <div style={{ fontSize: 14, color: '#a8a8ad', lineHeight: 1.4 }}>
          Kontakta administratör så att din inloggning kopplas till en medarbetar-profil.
        </div>
      </div>
    );
  }

  const primary = objektLista[0];
  const others = objektLista.slice(1);

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px - env(safe-area-inset-top))',
      padding: '16px 16px calc(env(safe-area-inset-bottom, 0px) + 100px)',
      color: '#fff',
      fontFamily: ff,
    }}>
      {/* Hälsning */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>
          {getGreeting()}, {getFornamn(medarbetare.namn)}
        </div>
      </div>

      {loadingObjekt && (
        <div style={{ color: '#a8a8ad', fontSize: 14 }}>Hämtar dina objekt…</div>
      )}

      {!loadingObjekt && objektLista.length === 0 && (
        <div style={{
          marginTop: 60, padding: '40px 20px', textAlign: 'center',
          background: 'rgba(255,255,255,0.03)', borderRadius: 16,
        }}>
          <span className="material-symbols-outlined" aria-hidden="true"
            style={{ fontSize: 48, color: '#a8a8ad', marginBottom: 12, display: 'block' }}>
            forest
          </span>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            Inga objekt tilldelade just nu
          </div>
          <div style={{ fontSize: 13, color: '#a8a8ad', lineHeight: 1.4 }}>
            När planeraren skickar ett objekt till dig syns det här.
          </div>
        </div>
      )}

      {/* Primärt kort */}
      {primary && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', borderRadius: 16,
          padding: '16px 18px 18px', marginBottom: 16,
          border: primary.status === 'pagaende'
            ? '1px solid rgba(48, 209, 88, 0.3)'
            : '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: '#a8a8ad',
            letterSpacing: 0.5, marginBottom: 8,
          }}>
            NÄSTA OBJEKT
          </div>

          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, lineHeight: 1.2 }}>
            {primary.namn}
          </div>

          <div style={{ fontSize: 14, color: '#a8a8ad', marginBottom: 6 }}>
            {[
              primary.traktnr && `T:${primary.traktnr}`,
              primary.areal && `${primary.areal} ha`,
              typLabel(primary.typ),
            ].filter(Boolean).join(' · ')}
          </div>

          {primary.volym ? (
            <div style={{ fontSize: 14, color: '#a8a8ad', marginBottom: 12 }}>
              {primary.volym} m³
            </div>
          ) : null}

          {/* Status-pill */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 12,
            background: primary.status === 'pagaende'
              ? 'rgba(48, 209, 88, 0.15)' : 'rgba(255, 255, 255, 0.08)',
            color: primary.status === 'pagaende' ? '#30d158' : '#a8a8ad',
            fontSize: 12, fontWeight: 600, marginBottom: 16,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: primary.status === 'pagaende' ? '#30d158' : '#a8a8ad',
            }} />
            {primary.status === 'pagaende' ? 'Pågående' : 'Planerad'}
          </div>

          <button
            type="button"
            onClick={() => handleStartObjekt(primary)}
            disabled={startar === primary.id}
            style={{
              width: '100%', minHeight: 56, padding: '0 20px',
              background: '#30d158', border: 'none', borderRadius: 14,
              color: '#fff', fontSize: 17, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              cursor: startar === primary.id ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: startar === primary.id ? 0.7 : 1,
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22 }}>
              {primary.status === 'pagaende' ? 'play_arrow' : 'rocket_launch'}
            </span>
            {startar === primary.id
              ? 'Öppnar…'
              : primary.status === 'pagaende' ? 'Fortsätt körning' : 'Starta körning'}
          </button>
        </div>
      )}

      {/* Övriga objekt */}
      {others.length > 0 && (
        <>
          <div style={{
            fontSize: 12, fontWeight: 600, color: '#a8a8ad',
            letterSpacing: 0.5, padding: '8px 12px',
          }}>
            ÖVRIGA OBJEKT
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, overflow: 'hidden' }}>
            {others.map((o, i) => (
              <button
                key={o.id}
                type="button"
                onClick={() => handleStartObjekt(o)}
                disabled={!!startar}
                style={{
                  width: '100%', minHeight: 56, padding: '12px 16px',
                  background: 'transparent', border: 'none',
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  color: '#fff', fontSize: 15, textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 12,
                  cursor: startar ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: o.status === 'pagaende' ? '#30d158' : '#a8a8ad',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.namn}
                  </div>
                  <div style={{ fontSize: 12, color: '#a8a8ad' }}>
                    {o.status === 'pagaende' ? 'Pågående' : 'Planerad'}
                  </div>
                </div>
                <span aria-hidden="true" style={{ color: '#666', fontSize: 18 }}>›</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
