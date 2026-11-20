'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import RegistreraBevisSheet from '@/components/utbildning/RegistreraBevisSheet';
import BevisSheet from '@/components/utbildning/BevisSheet';
import {
  Vy, Topprad, Etikett, Tal, Kort, Rad, FallUt, KlartKort,
  LoadingView, ErrorView, EmptyView, PrimaryButton,
} from '@/components/utbildning/ui';
import { AVSTAND } from '@/lib/design/tokens';
import {
  STATUS_META,
  dagManad,
  delaPaAtgard,
  iOrdningText,
  manadAr,
  tidTillNasta,
  visaNamn,
  type Medarbetare,
  type UtbildningStatusRad,
  type UtbildningTyp,
} from '@/lib/utbildning';

function varfor(r: UtbildningStatusRad): string {
  switch (r.status) {
    case 'utgangen':
      return r.giltig_till
        ? `Gick ${dagManad(r.genomford_datum)} · utgick ${dagManad(r.giltig_till)}`
        : 'Utgången';
    case 'saknas':
      return 'Aldrig registrerad';
    case 'gar_ut_snart':
      return r.giltig_till ? `Går ut ${manadAr(r.giltig_till)}` : 'Går ut snart';
    default:
      return '';
  }
}

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

  const { atgarda, klara } = useMemo(() => delaPaAtgard(rader), [rader]);
  const nasta = tidTillNasta(rader);

  // Utbildningar i katalogen som INTE gäller personen — syns, men undanlagda.
  const gallerInte = useMemo(() => {
    const mina = new Set(rader.map((r) => r.utbildning_typ_id));
    return typer.filter((t) => !mina.has(t.id));
  }, [typer, rader]);

  const etikett = person
    ? [visaNamn(person.namn), person.roll].filter(Boolean).join(' · ')
    : 'Medarbetare';

  return (
    <Vy>
      <Topprad bak={{ href: '/utbildning', label: 'Utbildningar' }} />

      {loading && <LoadingView />}
      {!loading && error && <ErrorView error={error} onRetry={load} />}
      {!loading && !error && !person && <EmptyView text="Medarbetaren finns inte." />}

      {!loading && !error && person && (
        <>
          <Etikett>{etikett}</Etikett>

          {atgarda.length > 0 ? (
            <>
              <Tal tal={String(atgarda.length)} under="behöver åtgärdas" />
              <Kort>
                {atgarda.map((r, i) => (
                  <Rad
                    key={r.utbildning_typ_id}
                    prick={STATUS_META[r.status].farg}
                    titel={r.utbildning_namn}
                    under={varfor(r)}
                    sista={i === atgarda.length - 1}
                    onClick={() => {
                      if (r.bevis_id) { setVald(r); return; }
                      setForvaldTyp(r.utbildning_typ_id);
                      setRegistrera(true);
                    }}
                  />
                ))}
              </Kort>
            </>
          ) : rader.length === 0 ? (
            <>
              <Tal tal="0" under="utbildningar gäller" />
              <EmptyView text="Inga utbildningar gäller den här personen." />
            </>
          ) : (
            <>
              {nasta
                ? <Tal tal={nasta.tal} under={nasta.under} />
                : <Tal tal={String(rader.length)} under="utbildningar · alla giltiga" />}
              <KlartKort rubrik="Alla utbildningar är giltiga" />
            </>
          )}

          <FallUt
            etikett={atgarda.length > 0 ? iOrdningText(klara.length) : `Visa alla ${rader.length} utbildningar`}
            antal={atgarda.length > 0 ? klara.length : rader.length}
          >
            {(atgarda.length > 0 ? klara : rader).map((r, i, arr) => (
              <Rad
                key={r.utbildning_typ_id}
                prick={STATUS_META[r.status].farg}
                titel={r.utbildning_namn}
                under={r.genomford_datum ? `Gick ${dagManad(r.genomford_datum)}` : undefined}
                varde={r.giltig_till ? manadAr(r.giltig_till) : 'Ingen utgång'}
                sista={i === arr.length - 1}
                onClick={() => setVald(r)}
              />
            ))}
          </FallUt>

          <FallUt etikett={`${gallerInte.length} gäller inte ${visaNamn(person.namn).split(' ')[0]}`} antal={gallerInte.length}>
            {gallerInte.map((t, i) => (
              <Rad key={t.id} titel={t.namn} dampad pil="ingen" sista={i === gallerInte.length - 1} />
            ))}
          </FallUt>

          <div style={{ marginTop: AVSTAND.xl }}>
            <PrimaryButton onClick={() => { setForvaldTyp(undefined); setRegistrera(true); }}>
              Registrera bevis
            </PrimaryButton>
          </div>
        </>
      )}


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
    </Vy>
  );
}
