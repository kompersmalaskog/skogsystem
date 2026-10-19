'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Ikon from '@/components/design/Ikon';
import RegistreraBevisSheet from '@/components/utbildning/RegistreraBevisSheet';
import {
  Vy, Topprad, Tal, Kort, Rad, FallUt, KlartKort, Grupprubrik,
  LoadingView, ErrorView, EmptyView, PrimaryButton,
} from '@/components/utbildning/ui';
import { AVSTAND, FARG, IKON } from '@/lib/design/tokens';
import {
  KRAVTYP_META,
  STATUS_META,
  arIgang,
  kravtypRang,
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

/** Konsekvensen bestämmer ordningen: lagkrav, sedan certifiering, sedan
 *  beställarkrav — och inom samma kravtyp det värsta först. Fyra rader som alla
 *  säger "7 personer saknar" säger inget om vilken man ska ta först. */
function ordna(a: Post, b: Post): number {
  return kravtypRang(a.typ.kravtyp) - kravtypRang(b.typ.kravtyp)
    || RANG[a.varst ?? 'giltig'] - RANG[b.varst ?? 'giltig']
    || a.typ.namn.localeCompare(b.typ.namn, 'sv');
}

/** Vem och varför — inte vilket förnyelseintervall. När något är fel vill man
 *  veta vem det gäller och när det hände. */
function varforText(p: Post): string {
  const n = p.atgarda.length;
  if (n === 0) return '';
  // Kravtypen står först: den säger vad det KOSTAR att raden ligger kvar, och
  // utan den såg fyra rader likadana ut ("7 personer saknar" × 4).
  const krav = KRAVTYP_META[p.typ.kravtyp].label;
  const vem = n === 1 ? visaNamn(p.atgarda[0].medarbetare_namn) : `${n} personer`;
  const r = p.atgarda[0];
  switch (p.varst) {
    case 'utgangen':
      return r.giltig_till ? `${krav} · ${vem} utgick ${dagManad(r.giltig_till)}` : `${krav} · ${vem} utgången`;
    case 'saknas':
      return `${krav} · ${vem} saknar`;
    case 'gar_ut_snart':
      return r.giltig_till ? `${krav} · ${vem} går ut i ${manadAr(r.giltig_till)}` : `${krav} · ${vem} går ut snart`;
    default:
      return '';
  }
}

/** Raden för en utbildning ingen är kopplad till. Säger vad den är värd att
 *  rätta (kravtypen) och vad som faktiskt saknas — ett val, inte ett bevis. */
function inteIgangUnder(p: Post): string {
  return `${KRAVTYP_META[p.typ.kravtyp].label} · ingen person vald`;
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

  // Tre grupper, inte två. En utbildning som ingen är kopplad till är varken
  // åtgärd eller "i ordning" — den är inte igång, och det måste synas.
  const inteIgang = poster.filter((p) => !arIgang(p.rader)).sort(ordna);
  const attAtgarda = poster.filter((p) => arIgang(p.rader) && p.atgarda.length > 0).sort(ordna);
  const iOrdning = poster.filter((p) => arIgang(p.rader) && p.atgarda.length === 0).sort(ordna);

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
          ) : inteIgang.length > 0 ? (
            <Tal tal={String(inteIgang.length)} under={inteIgang.length === 1 ? 'är inte igång' : 'är inte igång'} />
          ) : (
            <>
              {nasta
                ? <Tal tal={nasta.tal} under={nasta.under} />
                : <Tal tal={String(iOrdning.length)} under="utbildningar vi håller koll på" />}
              <KlartKort rubrik="Alla utbildningar är giltiga" rad={narmasteRad} />
            </>
          )}

          {/* Utbildningar ingen är kopplad till. De låg förut under "i ordning"
              och påstod att bl.a. två lagkrav var uppfyllda. Aldrig hopfällda. */}
          {inteIgang.length > 0 && (
            <>
              {attAtgarda.length > 0 && (
                <Grupprubrik ton="varning">
                  {inteIgang.length === 1 ? '1 utbildning är inte igång' : `${inteIgang.length} utbildningar är inte igång`}
                </Grupprubrik>
              )}
              <Kort>
                {inteIgang.map((p, i) => (
                  <Rad
                    key={p.typ.id}
                    href={`/utbildning/typ/${p.typ.id}`}
                    prick={FARG.orange}
                    titel={p.typ.namn}
                    under={inteIgangUnder(p)}
                    sista={i === inteIgang.length - 1}
                  />
                ))}
              </Kort>
            </>
          )}

          <FallUt
            etikett={attAtgarda.length > 0 ? iOrdningText(iOrdning.length) : `Visa alla ${iOrdning.length} utbildningar`}
            antal={iOrdning.length}
          >
            {iOrdning.map((p, i, arr) => (
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
