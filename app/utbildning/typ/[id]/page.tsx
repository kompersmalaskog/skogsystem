'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import BottomNav from '@/components/BottomNav';
import ListGroup from '@/components/ListGroup';
import ListRow from '@/components/ListRow';
import SectionHeader from '@/components/SectionHeader';
import RegistreraBevisSheet from '@/components/utbildning/RegistreraBevisSheet';
import BevisSheet from '@/components/utbildning/BevisSheet';
import { UtbHeader, LoadingView, ErrorView, EmptyView, KravtypBadge } from '@/components/utbildning/ui';
import {
  T,
  STATUS_META,
  formatDatum,
  visaNamn,
  type UtbildningTyp,
  type UtbildningStatusRad,
  type Medarbetare,
} from '@/lib/utbildning';

export default function UtbildningTypPage() {
  const params = useParams();
  const id = String(params.id);

  const [typ, setTyp] = useState<UtbildningTyp | null>(null);
  const [rader, setRader] = useState<UtbildningStatusRad[]>([]);
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [vald, setVald] = useState<UtbildningStatusRad | null>(null); // bevis-detalj
  const [registrera, setRegistrera] = useState(false);
  const [forvaldPerson, setForvaldPerson] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [typR, statusR, medR] = await Promise.all([
      supabase.from('utbildning_typ').select('*').eq('id', id).maybeSingle(),
      supabase.from('utbildning_status').select('*').eq('utbildning_typ_id', id),
      supabase.from('medarbetare').select('id, namn, roll, aktiv').eq('aktiv', true).order('namn'),
    ]);
    const felet = typR.error || statusR.error || medR.error;
    if (felet) {
      setError(felet.message);
      setLoading(false);
      return;
    }
    setTyp((typR.data as UtbildningTyp | null) ?? null);
    setRader((statusR.data as UtbildningStatusRad[]) ?? []);
    setMedarbetare((medR.data as Medarbetare[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const har = rader.filter((r) => r.status !== 'saknas');
  const saknar = rader.filter((r) => r.status === 'saknas');

  const giltighetText = typ
    ? typ.giltighet_manader == null
      ? 'Ingen utgång'
      : `Giltig ${typ.giltighet_manader} mån`
    : '';

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff, paddingBottom: 120, marginTop: 'calc(-56px - env(safe-area-inset-top))' }}>
      <UtbHeader
        title={typ?.namn ?? 'Utbildning'}
        back={{ href: '/utbildning', label: 'Utbildningar' }}
        action={typ ? <KravtypBadge kravtyp={typ.kravtyp} /> : undefined}
        subtitle={typ ? `${giltighetText}${typ.galler_alla ? ' · Gäller alla' : ''}` : undefined}
      />

      {loading && <LoadingView />}
      {!loading && error && <ErrorView error={error} onRetry={load} />}
      {!loading && !error && !typ && <EmptyView text="Utbildningen finns inte." />}

      {!loading && !error && typ && (
        <>
          {(typ.beskrivning || typ.anteckning) && (
            <div style={{ padding: '12px 16px 0' }}>
              <ListGroup>
                {typ.beskrivning && (
                  <div style={{ padding: '11px 16px', fontSize: 15, color: T.t1 }}>{typ.beskrivning}</div>
                )}
                {typ.anteckning && (
                  <div style={{ padding: '11px 16px', fontSize: 14, color: T.t2 }}>{typ.anteckning}</div>
                )}
              </ListGroup>
            </div>
          )}

          {/* Registrera bevis */}
          <div style={{ padding: '12px 16px 0' }}>
            <ListGroup>
              <ListRow
                title={<span style={{ color: T.blue }}>Registrera bevis</span>}
                leading={<span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22, color: T.blue }}>add_circle</span>}
                onClick={() => { setForvaldPerson(undefined); setRegistrera(true); }}
                chevron={false}
              />
            </ListGroup>
          </div>

          {/* Har utbildningen */}
          <SectionHeader>Har utbildningen ({har.length})</SectionHeader>
          <div style={{ padding: '0 16px' }}>
            {har.length === 0 ? (
              <EmptyView text="Ingen har registrerat bevis ännu." />
            ) : (
              <ListGroup>
                {har.map((r) => (
                  <ListRow
                    key={r.medarbetare_id}
                    status={r.status}
                    title={visaNamn(r.medarbetare_namn)}
                    subtitle={r.giltig_till ? `Giltig t.o.m. ${formatDatum(r.giltig_till)}` : 'Ingen utgång'}
                    value={STATUS_META[r.status].label}
                    valueColor={STATUS_META[r.status].color}
                    onClick={() => setVald(r)}
                  />
                ))}
              </ListGroup>
            )}
          </div>

          {/* Saknar */}
          {saknar.length > 0 && (
            <>
              <SectionHeader>Saknar ({saknar.length})</SectionHeader>
              <div style={{ padding: '0 16px' }}>
                <ListGroup>
                  {saknar.map((r) => (
                    <ListRow
                      key={r.medarbetare_id}
                      status="saknas"
                      title={visaNamn(r.medarbetare_namn)}
                      value="Registrera"
                      valueColor={T.blue}
                      onClick={() => { setForvaldPerson(r.medarbetare_id); setRegistrera(true); }}
                    />
                  ))}
                </ListGroup>
              </div>
            </>
          )}
        </>
      )}

      <BottomNav />

      <BevisSheet rad={vald} onClose={() => setVald(null)} onDeleted={() => { setVald(null); load(); }} />

      <RegistreraBevisSheet
        open={registrera}
        onClose={() => setRegistrera(false)}
        onSaved={() => { setRegistrera(false); load(); }}
        typer={typ ? [typ] : []}
        medarbetare={medarbetare}
        forvaldTypId={typ?.id}
        forvaldMedarbetareId={forvaldPerson}
      />
    </div>
  );
}
