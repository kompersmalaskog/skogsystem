'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import BottomNav from '@/components/BottomNav';
import ListGroup from '@/components/ListGroup';
import ListRow from '@/components/ListRow';
import SectionHeader from '@/components/SectionHeader';
import RegistreraBevisSheet from '@/components/utbildning/RegistreraBevisSheet';
import BevisSheet from '@/components/utbildning/BevisSheet';
import { UtbHeader, LoadingView, ErrorView, EmptyView } from '@/components/utbildning/ui';
import {
  T,
  STATUS_META,
  formatDatum,
  visaNamn,
  type UtbildningTyp,
  type UtbildningStatusRad,
  type Medarbetare,
} from '@/lib/utbildning';

export default function UtbildningPersonPage() {
  const params = useParams();
  const id = String(params.id);

  const [person, setPerson] = useState<Medarbetare | null>(null);
  const [rader, setRader] = useState<UtbildningStatusRad[]>([]);
  const [typer, setTyper] = useState<UtbildningTyp[]>([]);
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [vald, setVald] = useState<UtbildningStatusRad | null>(null);
  const [registrera, setRegistrera] = useState(false);
  const [forvaldTyp, setForvaldTyp] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [personR, statusR, typR, medR] = await Promise.all([
      supabase.from('medarbetare').select('id, namn, roll, aktiv').eq('id', id).maybeSingle(),
      supabase.from('utbildning_status').select('*').eq('medarbetare_id', id),
      supabase.from('utbildning_typ').select('*').eq('aktiv', true).order('namn'),
      supabase.from('medarbetare').select('id, namn, roll, aktiv').eq('aktiv', true).order('namn'),
    ]);
    const felet = personR.error || statusR.error || typR.error || medR.error;
    if (felet) {
      setError(felet.message);
      setLoading(false);
      return;
    }
    setPerson((personR.data as Medarbetare | null) ?? null);
    setRader((statusR.data as UtbildningStatusRad[]) ?? []);
    setTyper((typR.data as UtbildningTyp[]) ?? []);
    setMedarbetare((medR.data as Medarbetare[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const har = rader.filter((r) => r.status !== 'saknas');
  const saknar = rader.filter((r) => r.status === 'saknas');

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff, paddingBottom: 120 }}>
      <UtbHeader title={person ? visaNamn(person.namn) : 'Medarbetare'} back={{ href: '/utbildning', label: 'Utbildningar' }} />

      {loading && <LoadingView />}
      {!loading && error && <ErrorView error={error} onRetry={load} />}
      {!loading && !error && !person && <EmptyView text="Medarbetaren finns inte." />}

      {!loading && !error && person && (
        <>
          <SectionHeader>Har ({har.length})</SectionHeader>
          <div style={{ padding: '0 16px' }}>
            {har.length === 0 ? (
              <EmptyView text="Inga giltiga utbildningar." />
            ) : (
              <ListGroup>
                {har.map((r) => (
                  <ListRow
                    key={r.utbildning_typ_id}
                    status={r.status}
                    title={r.utbildning_namn}
                    subtitle={r.giltig_till ? `Giltig t.o.m. ${formatDatum(r.giltig_till)}` : 'Ingen utgång'}
                    value={STATUS_META[r.status].label}
                    valueColor={STATUS_META[r.status].color}
                    onClick={() => setVald(r)}
                  />
                ))}
              </ListGroup>
            )}
          </div>

          {saknar.length > 0 && (
            <>
              <SectionHeader>Saknar ({saknar.length})</SectionHeader>
              <div style={{ padding: '0 16px' }}>
                <ListGroup>
                  {saknar.map((r) => (
                    <ListRow
                      key={r.utbildning_typ_id}
                      status="saknas"
                      title={r.utbildning_namn}
                      value="Registrera"
                      valueColor={T.blue}
                      onClick={() => { setForvaldTyp(r.utbildning_typ_id); setRegistrera(true); }}
                    />
                  ))}
                </ListGroup>
              </div>
            </>
          )}

          {rader.length === 0 && <EmptyView text="Inga utbildningar gäller den här personen." />}
        </>
      )}

      <BottomNav />

      <BevisSheet rad={vald} onClose={() => setVald(null)} onDeleted={() => { setVald(null); load(); }} />

      <RegistreraBevisSheet
        open={registrera}
        onClose={() => setRegistrera(false)}
        onSaved={() => { setRegistrera(false); load(); }}
        typer={typer}
        medarbetare={medarbetare}
        forvaldTypId={forvaldTyp}
        forvaldMedarbetareId={person?.id}
      />
    </div>
  );
}
