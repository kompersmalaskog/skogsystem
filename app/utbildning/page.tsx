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
  KRAVTYP_META,
  fornyelseText,
  aggregatFarg,
  manadKort,
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
  narmasteGarUt: string | null; // närmaste giltig_till bland gar_ut_snart
};

// Sorteringsrang för listan: saknas, utgången, går ut snart, giltig (matchar 1b).
const LIST_RANG: Record<UtbStatus, number> = { saknas: 0, utgangen: 1, gar_ut_snart: 2, giltig: 3 };
function listRang(v: UtbStatus | null): number {
  return v == null ? 4 : LIST_RANG[v];
}

function radVarde(a: Aggregat): { text: string; color: string } {
  if (a.antal === 0) return { text: '', color: T.t2 };
  switch (a.varst) {
    case 'saknas':
      return { text: `${a.saknas} saknar`, color: T.red };
    case 'utgangen':
      return { text: `${a.utgangen} utgången`, color: T.red };
    case 'gar_ut_snart':
      return { text: a.narmasteGarUt ? `Går ut i ${manadKort(a.narmasteGarUt)}` : 'Går ut snart', color: T.orange };
    default:
      return { text: 'Klart', color: T.green };
  }
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
    const a: Aggregat = { antal: rader.length, giltig: 0, gar_ut_snart: 0, utgangen: 0, saknas: 0, varst: null, narmasteGarUt: null };
    for (const r of rader) {
      a[r.status]++;
      if (r.status === 'gar_ut_snart' && r.giltig_till) {
        if (!a.narmasteGarUt || r.giltig_till < a.narmasteGarUt) a.narmasteGarUt = r.giltig_till;
      }
    }
    a.varst = varstaStatus(rader.map((r) => r.status));
    return a;
  };

  // Aggregat per utbildning, sorterat efter allvarlighetsgrad.
  const lista = (typer ?? [])
    .map((t) => ({ t, a: aggregatFor(t.id) }))
    .sort((x, y) => listRang(x.a.varst) - listRang(y.a.varst) || x.t.namn.localeCompare(y.t.namn, 'sv'));

  // Sammanfattning: räkna utbildningar per värsta status.
  const nUtgangen = lista.filter((r) => r.a.varst === 'utgangen').length;
  const nSaknas = lista.filter((r) => r.a.varst === 'saknas').length;
  const nGarUt = lista.filter((r) => r.a.varst === 'gar_ut_snart').length;
  const nAtgard = nUtgangen + nSaknas + nGarUt;

  const sammanfattningUnder = [
    nUtgangen ? `${nUtgangen} utgången` : null,
    nSaknas ? `${nSaknas} saknas` : null,
    nGarUt ? `${nGarUt} går ut snart` : null,
  ].filter(Boolean).join(' · ');

  const sammanfattningPrick = nUtgangen || nSaknas ? T.red : nGarUt ? T.orange : T.green;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff, paddingBottom: 120, marginTop: 'calc(-56px - env(safe-area-inset-top))' }}>
      <UtbHeader
        title="Utbildningar"
        action={
          <Link href="/utbildning/katalog" aria-label="Katalog" style={{ color: T.blue, display: 'inline-flex', alignItems: 'center', padding: 4 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>settings</span>
          </Link>
        }
      />

      {loading && <LoadingView />}
      {!loading && error && <ErrorView error={error} onRetry={load} />}

      {!loading && !error && typer && (
        <>
          {/* Sammanfattning */}
          <div style={{ padding: '12px 16px 0' }}>
            <ListGroup>
              <ListRow
                dotColor={nAtgard ? sammanfattningPrick : T.green}
                title={nAtgard ? `${nAtgard} behöver åtgärdas` : 'Allt är klart'}
                subtitle={nAtgard ? sammanfattningUnder : undefined}
                chevron={nAtgard > 0}
              />
            </ListGroup>
          </div>

          {typer.length === 0 ? (
            <EmptyView text="Katalogen är tom. Lägg till en utbildning under inställningar." />
          ) : (
            <>
              <SectionHeader>Alla utbildningar</SectionHeader>
              <div style={{ padding: '0 16px' }}>
                <ListGroup>
                  {lista.map(({ t, a }) => {
                    const v = radVarde(a);
                    return (
                      <ListRow
                        key={t.id}
                        href={`/utbildning/typ/${t.id}`}
                        dotColor={a.varst ? aggregatFarg(a.varst) : undefined}
                        title={t.namn}
                        subtitle={`${KRAVTYP_META[t.kravtyp].label} · ${fornyelseText(t.giltighet_manader)}`}
                        value={v.text}
                        valueColor={v.color}
                      />
                    );
                  })}
                </ListGroup>
              </div>
            </>
          )}

          {/* Registrera utbildning */}
          <div style={{ padding: '22px 16px 0' }}>
            <ListGroup>
              <ListRow
                title={<span style={{ color: T.blue }}>Registrera utbildning</span>}
                onClick={() => setRegistrera(true)}
                chevron={false}
              />
            </ListGroup>
          </div>
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
