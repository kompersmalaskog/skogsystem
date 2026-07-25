'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import BottomNav from '@/components/BottomNav';
import ListGroup from '@/components/ListGroup';
import ListRow from '@/components/ListRow';
import SectionHeader from '@/components/SectionHeader';
import { Sheet, ConfirmDialog } from '@/components/Sheet';
import NyUtbildningSheet from '@/components/utbildning/NyUtbildningSheet';
import { UtbHeader, LoadingView, ErrorView, EmptyView, KravtypBadge, PrimaryButton } from '@/components/utbildning/ui';
import {
  T,
  KRAVTYP_ORDNING,
  KRAVTYP_META,
  type UtbildningTyp,
  type Medarbetare,
} from '@/lib/utbildning';

function giltighetText(t: UtbildningTyp): string {
  const g = t.giltighet_manader == null ? 'Ingen utgång' : `Giltig ${t.giltighet_manader} mån`;
  return `${g} · ${t.galler_alla ? 'Alla' : 'Utvalda'}`;
}

export default function KatalogPage() {
  const [typer, setTyper] = useState<UtbildningTyp[] | null>(null);
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ny, setNy] = useState(false);
  const [vald, setVald] = useState<UtbildningTyp | null>(null);
  const [bekraftaInaktivera, setBekraftaInaktivera] = useState(false);
  const [andrar, setAndrar] = useState(false);
  const [andraFel, setAndraFel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [typR, medR] = await Promise.all([
      supabase.from('utbildning_typ').select('*').order('namn'),
      supabase.from('medarbetare').select('id, namn, roll, aktiv').eq('aktiv', true).order('namn'),
    ]);
    const felet = typR.error || medR.error;
    if (felet) {
      setError(felet.message);
      setLoading(false);
      return;
    }
    setTyper((typR.data as UtbildningTyp[]) ?? []);
    setMedarbetare((medR.data as Medarbetare[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function settAktiv(typ: UtbildningTyp, aktiv: boolean) {
    setAndrar(true);
    setAndraFel(null);
    const { error: err } = await supabase.from('utbildning_typ').update({ aktiv }).eq('id', typ.id);
    if (err) {
      setAndraFel(err.message);
      setAndrar(false);
      return;
    }
    setAndrar(false);
    setBekraftaInaktivera(false);
    setVald(null);
    load();
  }

  const aktiva = (typer ?? []).filter((t) => t.aktiv);
  const inaktiva = (typer ?? []).filter((t) => !t.aktiv);

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff, paddingBottom: 120 }}>
      <UtbHeader
        title="Katalog"
        back={{ href: '/utbildning', label: 'Utbildningar' }}
        action={
          <button onClick={() => setNy(true)} aria-label="Ny utbildning" style={{ background: 'none', border: 'none', color: T.blue, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: 4 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 28 }}>add</span>
          </button>
        }
      />

      {loading && <LoadingView />}
      {!loading && error && <ErrorView error={error} onRetry={load} />}

      {!loading && !error && typer && (
        <>
          {typer.length === 0 && <EmptyView text="Katalogen är tom. Tryck + för att lägga till." />}

          {KRAVTYP_ORDNING.map((kt) => {
            const lista = aktiva.filter((t) => t.kravtyp === kt);
            if (lista.length === 0) return null;
            return (
              <div key={kt}>
                <SectionHeader>{KRAVTYP_META[kt].label}</SectionHeader>
                <div style={{ padding: '0 16px' }}>
                  <ListGroup>
                    {lista.map((t) => (
                      <ListRow key={t.id} title={t.namn} subtitle={giltighetText(t)} onClick={() => { setVald(t); setAndraFel(null); }} />
                    ))}
                  </ListGroup>
                </div>
              </div>
            );
          })}

          {inaktiva.length > 0 && (
            <>
              <SectionHeader>Inaktiva</SectionHeader>
              <div style={{ padding: '0 16px' }}>
                <ListGroup>
                  {inaktiva.map((t) => (
                    <ListRow
                      key={t.id}
                      title={t.namn}
                      subtitle={`${KRAVTYP_META[t.kravtyp].label} · inaktiv`}
                      value="Aktivera"
                      valueColor={T.blue}
                      chevron={false}
                      onClick={() => settAktiv(t, true)}
                    />
                  ))}
                </ListGroup>
              </div>
            </>
          )}
        </>
      )}

      <BottomNav />

      {/* Typ-detalj */}
      <Sheet open={!!vald} onClose={() => setVald(null)} title={vald ? vald.namn : ''}>
        {vald && (
          <>
            <ListGroup>
              <ListRow title="Kravtyp" chevron={false} trailing={<KravtypBadge kravtyp={vald.kravtyp} />} />
              <ListRow title="Giltighet" chevron={false} value={vald.giltighet_manader == null ? 'Ingen utgång' : `${vald.giltighet_manader} mån`} />
              <ListRow title="Gäller" chevron={false} value={vald.galler_alla ? 'Alla' : 'Utvalda'} />
            </ListGroup>

            {(vald.beskrivning || vald.anteckning) && (
              <div style={{ padding: '12px 0 0' }}>
                <ListGroup>
                  {vald.beskrivning && <div style={{ padding: '11px 16px', fontSize: 15, color: T.t1 }}>{vald.beskrivning}</div>}
                  {vald.anteckning && <div style={{ padding: '11px 16px', fontSize: 14, color: T.t2 }}>{vald.anteckning}</div>}
                </ListGroup>
              </div>
            )}

            {andraFel && <div style={{ fontSize: 13, color: T.red, margin: '12px 0 0' }}>Kunde inte ändra: {andraFel}</div>}

            <div style={{ padding: '20px 0 0' }}>
              <PrimaryButton onClick={() => setBekraftaInaktivera(true)} color={T.red} disabled={andrar}>
                Inaktivera utbildning
              </PrimaryButton>
            </div>
          </>
        )}
      </Sheet>

      <ConfirmDialog
        open={bekraftaInaktivera}
        title="Inaktivera utbildning?"
        message="Den slutar gälla för alla och döljs från listorna. Du kan aktivera den igen senare."
        confirmLabel="Inaktivera"
        busy={andrar}
        onConfirm={() => vald && settAktiv(vald, false)}
        onCancel={() => setBekraftaInaktivera(false)}
      />

      <NyUtbildningSheet
        open={ny}
        onClose={() => setNy(false)}
        onSaved={() => { setNy(false); load(); }}
        medarbetare={medarbetare}
      />
    </div>
  );
}
