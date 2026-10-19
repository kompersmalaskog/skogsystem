'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Ikon from '@/components/design/Ikon';
import RegistreraBevisSheet from '@/components/utbildning/RegistreraBevisSheet';
import {
  Vy, Topprad, Etikett, Tal, Kort, Rad, FallUt, KlartKort,
  LoadingView, ErrorView, EmptyView, PrimaryButton,
} from '@/components/utbildning/ui';
import { AVSTAND, FARG, IKON } from '@/lib/design/tokens';
import {
  STATUS_META,
  dagManad,
  fornyelseText,
  iOrdningText,
  kraverAtgard,
  manadAr,
  tidTillNasta,
  varstaStatus,
  visaNamn,
  type Medarbetare,
  type UtbStatus,
  type UtbildningStatusRad,
  type UtbildningTyp,
} from '@/lib/utbildning';

type Post = {
  typ: UtbildningTyp;
  rader: UtbildningStatusRad[];
  atgarda: UtbildningStatusRad[];
  varst: UtbStatus | null;
  /** Närmaste utgångsdatum bland raderna — används för talet när allt är klart. */
  narmaste: string | null;
};

// Värst först i åtgärdslistan.
const RANG: Record<UtbStatus, number> = { utgangen: 0, saknas: 1, gar_ut_snart: 2, giltig: 3 };

/** Vem och varför — inte vilket förnyelseintervall. När något är fel vill man
 *  veta vem det gäller och när det hände. */
function varforText(p: Post): string {
  const n = p.atgarda.length;
  if (n === 0) return '';
  const vem = n === 1 ? visaNamn(p.atgarda[0].medarbetare_namn) : `${n} personer`;
  const r = p.atgarda[0];
  switch (p.varst) {
    case 'utgangen':
      return r.giltig_till ? `${vem} · utgick ${dagManad(r.giltig_till)}` : `${vem} · utgången`;
    case 'saknas':
      return n === 1 ? `${vem} saknar` : `${vem} saknar`;
    case 'gar_ut_snart':
      return r.giltig_till ? `${vem} · går ut i ${manadAr(r.giltig_till)}` : `${vem} · går ut snart`;
    default:
      return '';
  }
}

/** Raden för en utbildning som är i ordning: hur många och när den går ut. */
function iOrdningUnder(p: Post): string {
  const antal = p.rader.length;
  const vem = antal === 1 ? '1 person' : `Alla ${antal}`;
  if (p.typ.giltighet_manader == null) return `${vem} · ingen utgång`;
  return p.narmaste ? `${vem} · går ut ${manadAr(p.narmaste)}` : `${vem} · ${fornyelseText(p.typ.giltighet_manader)}`;
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

  const poster: Post[] = useMemo(() => (typer ?? []).map((typ) => {
    const rader = status.filter((r) => r.utbildning_typ_id === typ.id);
    const atgarda = rader
      .filter((r) => kraverAtgard(r.status))
      .sort((a, b) => RANG[a.status] - RANG[b.status]);
    const datum = rader.map((r) => r.giltig_till).filter((d): d is string => !!d).sort();
    return { typ, rader, atgarda, varst: varstaStatus(rader.map((r) => r.status)), narmaste: datum[0] ?? null };
  }), [typer, status]);

  const attAtgarda = poster
    .filter((p) => p.atgarda.length > 0)
    .sort((a, b) => RANG[a.varst ?? 'giltig'] - RANG[b.varst ?? 'giltig'] || a.typ.namn.localeCompare(b.typ.namn, 'sv'));
  const iOrdning = poster
    .filter((p) => p.atgarda.length === 0)
    .sort((a, b) => a.typ.namn.localeCompare(b.typ.namn, 'sv'));

  const nasta = tidTillNasta(status);

  // Vilken utbildning som går ut först — raden under den gröna bocken.
  const narmastePost = poster
    .filter((p) => p.narmaste)
    .sort((a, b) => (a.narmaste! < b.narmaste! ? -1 : 1))[0];
  const narmasteRad = narmastePost
    ? `${narmastePost.typ.namn} går ut ${manadAr(narmastePost.narmaste)}`
    : undefined;

  return (
    <Vy>
      <Topprad
        atgard={
          <Link href="/utbildning/katalog" aria-label="Katalog" style={{ color: FARG.bla, display: 'inline-flex', alignItems: 'center', padding: AVSTAND.xs }}>
            <Ikon namn="settings" storlek={IKON.rad} farg={FARG.bla} />
          </Link>
        }
      />
      <Etikett>Utbildningar</Etikett>

      {loading && <LoadingView />}
      {!loading && error && <ErrorView error={error} onRetry={load} />}

      {!loading && !error && typer && typer.length === 0 && (
        <EmptyView text="Katalogen är tom. Lägg till en utbildning under inställningar." />
      )}

      {!loading && !error && typer && typer.length > 0 && (
        <>
          {attAtgarda.length > 0 ? (
            <>
              <Tal tal={String(attAtgarda.length)} under="behöver åtgärdas" />
              <Kort>
                {attAtgarda.map((p, i) => (
                  <Rad
                    key={p.typ.id}
                    href={`/utbildning/typ/${p.typ.id}`}
                    prick={STATUS_META[p.varst ?? 'giltig'].farg}
                    titel={p.typ.namn}
                    under={varforText(p)}
                    sista={i === attAtgarda.length - 1}
                  />
                ))}
              </Kort>
            </>
          ) : (
            <>
              {nasta
                ? <Tal tal={nasta.tal} under={nasta.under} />
                : <Tal tal={String(poster.length)} under="utbildningar vi håller koll på" />}
              <KlartKort rubrik="Alla utbildningar är giltiga" rad={narmasteRad} />
            </>
          )}

          <FallUt
            etikett={attAtgarda.length > 0 ? iOrdningText(iOrdning.length) : `Visa alla ${poster.length} utbildningar`}
            antal={attAtgarda.length > 0 ? iOrdning.length : poster.length}
          >
            {(attAtgarda.length > 0 ? iOrdning : poster).map((p, i, arr) => (
              <Rad
                key={p.typ.id}
                href={`/utbildning/typ/${p.typ.id}`}
                prick={STATUS_META[p.varst ?? 'giltig'].farg}
                titel={p.typ.namn}
                under={p.atgarda.length > 0 ? varforText(p) : iOrdningUnder(p)}
                sista={i === arr.length - 1}
              />
            ))}
          </FallUt>

          <div style={{ marginTop: AVSTAND.xl }}>
            <PrimaryButton onClick={() => setRegistrera(true)}>Registrera utbildning</PrimaryButton>
          </div>
        </>
      )}


      <RegistreraBevisSheet
        open={registrera}
        onClose={() => setRegistrera(false)}
        onSaved={() => { setRegistrera(false); load(); }}
        typer={typer ?? []}
        medarbetare={medarbetare}
      />
    </Vy>
  );
}
