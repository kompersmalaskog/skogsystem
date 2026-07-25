'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import BottomNav from '@/components/BottomNav';
import ListGroup from '@/components/ListGroup';
import ListRow from '@/components/ListRow';
import SectionHeader from '@/components/SectionHeader';
import RegistreraBevisSheet from '@/components/utbildning/RegistreraBevisSheet';
import { UtbHeader, LoadingView, ErrorView, EmptyView } from '@/components/utbildning/ui';
import {
  T,
  KRAVTYP_ORDNING,
  KRAVTYP_META,
  varstaStatus,
  type UtbildningTyp,
  type UtbildningStatusRad,
  type Medarbetare,
  type UtbStatus,
} from '@/lib/utbildning';

type Aggregat = {
  antal: number;
  giltig: number;
  gar_ut_snart: number;
  utgangen: number;
  saknas: number;
  varst: UtbStatus | null;
};

function summering(a: Aggregat): string {
  if (a.antal === 0) return 'Inga personer';
  const delar: string[] = [];
  if (a.utgangen) delar.push(`${a.utgangen} utgången`);
  if (a.saknas) delar.push(`${a.saknas} saknas`);
  if (a.gar_ut_snart) delar.push(`${a.gar_ut_snart} går ut snart`);
  if (delar.length === 0) return `Alla giltiga · ${a.antal} personer`;
  return delar.join(' · ');
}

export default function UtbildningStartPage() {
  const [typer, setTyper] = useState<UtbildningTyp[] | null>(null);
  const [status, setStatus] = useState<UtbildningStatusRad[]>([]);
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registrera, setRegistrera] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [typR, statusR, medR] = await Promise.all([
      supabase.from('utbildning_typ').select('*').eq('aktiv', true).order('namn'),
      supabase.from('utbildning_status').select('*'),
      supabase.from('medarbetare').select('id, namn, roll, aktiv').eq('aktiv', true).order('namn'),
    ]);
    const felet = typR.error || statusR.error || medR.error;
    if (felet) {
      setError(felet.message);
      setLoading(false);
      return;
    }
    setTyper((typR.data as UtbildningTyp[]) ?? []);
    setStatus((statusR.data as UtbildningStatusRad[]) ?? []);
    setMedarbetare((medR.data as Medarbetare[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const aggregatFor = (typId: string): Aggregat => {
    const rader = status.filter((r) => r.utbildning_typ_id === typId);
    const a: Aggregat = { antal: rader.length, giltig: 0, gar_ut_snart: 0, utgangen: 0, saknas: 0, varst: null };
    for (const r of rader) a[r.status]++;
    a.varst = varstaStatus(rader.map((r) => r.status));
    return a;
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff, paddingBottom: 120 }}>
      <UtbHeader
        title="Utbildningar"
        action={
          <Link href="/utbildning/katalog" style={{ color: T.blue, textDecoration: 'none', fontSize: 17, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22 }}>settings</span>
          </Link>
        }
      />

      {loading && <LoadingView />}
      {!loading && error && <ErrorView error={error} onRetry={load} />}

      {!loading && !error && typer && (
        <>
          {/* Registrera bevis */}
          <div style={{ padding: '10px 16px 0' }}>
            <ListGroup>
              <ListRow
                title={<span style={{ color: T.blue }}>Registrera bevis</span>}
                leading={<span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22, color: T.blue }}>add_circle</span>}
                onClick={() => setRegistrera(true)}
                chevron={false}
              />
            </ListGroup>
          </div>

          {typer.length === 0 && (
            <EmptyView text="Katalogen är tom. Lägg till en utbildning under inställningar." />
          )}

          {KRAVTYP_ORDNING.map((kt) => {
            const lista = typer.filter((t) => t.kravtyp === kt);
            if (lista.length === 0) return null;
            return (
              <div key={kt}>
                <SectionHeader>{KRAVTYP_META[kt].label}</SectionHeader>
                <div style={{ padding: '0 16px' }}>
                  <ListGroup>
                    {lista.map((t) => {
                      const a = aggregatFor(t.id);
                      return (
                        <ListRow
                          key={t.id}
                          href={`/utbildning/typ/${t.id}`}
                          title={t.namn}
                          subtitle={summering(a)}
                          status={a.varst ?? undefined}
                        />
                      );
                    })}
                  </ListGroup>
                </div>
              </div>
            );
          })}
        </>
      )}

      <BottomNav />

      <RegistreraBevisSheet
        open={registrera}
        onClose={() => setRegistrera(false)}
        onSaved={() => { setRegistrera(false); load(); }}
        typer={typer ?? []}
        medarbetare={medarbetare}
      />
    </div>
  );
}
