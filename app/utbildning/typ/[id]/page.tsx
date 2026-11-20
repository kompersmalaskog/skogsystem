'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import RegistreraBevisSheet from '@/components/utbildning/RegistreraBevisSheet';
import BevisSheet from '@/components/utbildning/BevisSheet';
import GallerSheet from '@/components/utbildning/GallerSheet';
import {
  Vy, Topprad, Etikett, Tal, Kort, Rad, FallUt, KlartKort,
  LoadingView, ErrorView, EmptyView, KravtypBadge, PrimaryButton,
} from '@/components/utbildning/ui';
import { AVSTAND, FARG } from '@/lib/design/tokens';
import {
  STATUS_META,
  dagManad,
  delaPaAtgard,
  fornyelseText,
  iOrdningText,
  manadAr,
  tidTillNasta,
  visaNamn,
  type Medarbetare,
  type UtbildningStatusRad,
  type UtbildningTyp,
} from '@/lib/utbildning';

/** Varför den här personen står i åtgärdslistan. */
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
  const [gallerOppen, setGallerOppen] = useState(false);
  const [krav, setKrav] = useState<string[]>([]);
  const [forvaldPerson, setForvaldPerson] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [typR, statusR, medR, kravR] = await Promise.all([
      supabase.from('utbildning_typ').select('*').eq('id', id).maybeSingle(),
      supabase.from('utbildning_status').select('*').eq('utbildning_typ_id', id),
      supabase.from('medarbetare').select('id, namn, roll, aktiv').eq('aktiv', true).order('namn'),
      supabase.from('utbildning_krav').select('medarbetare_id').eq('utbildning_typ_id', id),
    ]);
    const felet = typR.error || statusR.error || medR.error || kravR.error;
    if (felet) {
      setError(felet.message);
      setLoading(false);
      return;
    }
    setTyp((typR.data as UtbildningTyp | null) ?? null);
    setRader((statusR.data as UtbildningStatusRad[]) ?? []);
    setMedarbetare((medR.data as Medarbetare[]) ?? []);
    setKrav(((kravR.data as { medarbetare_id: string }[]) ?? []).map((r) => r.medarbetare_id));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const { atgarda, klara } = useMemo(() => delaPaAtgard(rader), [rader]);
  const nasta = tidTillNasta(rader);

  const omfattning = typ?.galler_alla ? 'gäller alla' : `${rader.length} ${rader.length === 1 ? 'person' : 'personer'}`;

  return (
    <Vy>
      <Topprad
        bak={{ href: '/utbildning', label: 'Utbildningar' }}
        atgard={typ ? <KravtypBadge kravtyp={typ.kravtyp} /> : undefined}
      />

      {loading && <LoadingView />}
      {!loading && error && <ErrorView error={error} onRetry={load} />}
      {!loading && !error && !typ && <EmptyView text="Utbildningen finns inte." />}

      {!loading && !error && typ && (
        <>
          <Etikett>{typ.namn}</Etikett>

          {atgarda.length > 0 ? (
            <>
              <Tal tal={String(atgarda.length)} under="saknar giltig" />
              <Kort>
                {atgarda.map((r, i) => (
                  <Rad
                    key={r.medarbetare_id}
                    prick={STATUS_META[r.status].farg}
                    titel={visaNamn(r.medarbetare_namn)}
                    under={varfor(r)}
                    sista={i === atgarda.length - 1}
                    onClick={() => {
                      if (r.bevis_id) { setVald(r); return; }
                      setForvaldPerson(r.medarbetare_id);
                      setRegistrera(true);
                    }}
                  />
                ))}
              </Kort>
            </>
          ) : rader.length === 0 ? (
            // Inte igång: ingen är kopplad, så utbildningen kan varken saknas
            // eller gå ut. Enda vettiga handlingen här är att välja vilka.
            <>
              <Tal tal="0" under="personer omfattas" />
              <Kort>
                <Rad
                  titel="Välj vilka utbildningen gäller"
                  under="Tills någon är vald står den utanför alla kontroller"
                  prick={FARG.orange}
                  sista
                  onClick={() => setGallerOppen(true)}
                />
              </Kort>
            </>
          ) : (
            <>
              {nasta
                ? <Tal tal={nasta.tal} under={nasta.under} />
                : <Tal tal={String(rader.length)} under={rader.length === 1 ? 'person har den' : 'personer har den'} />}
              <KlartKort rubrik="Alla som omfattas har giltig" />
            </>
          )}

          <FallUt
            etikett={atgarda.length > 0 ? `${klara.length} har giltig` : `Visa alla ${rader.length}`}
            antal={atgarda.length > 0 ? klara.length : rader.length}
          >
            {(atgarda.length > 0 ? klara : rader).map((r, i, arr) => (
              <Rad
                key={r.medarbetare_id}
                prick={STATUS_META[r.status].farg}
                titel={visaNamn(r.medarbetare_namn)}
                under={r.genomford_datum ? `Gick ${dagManad(r.genomford_datum)}` : undefined}
                varde={r.giltig_till ? manadAr(r.giltig_till) : 'Ingen utgång'}
                sista={i === arr.length - 1}
                onClick={() => setVald(r)}
              />
            ))}
          </FallUt>

          {/* Referensinfo — inte något man behöver läsa varje gång. Omfattningen
              är dock det enda här som går att ÄNDRA, så den raden är tryckbar. */}
          <Kort>
            <Rad titel={`Förnyas ${fornyelseText(typ.giltighet_manader)}`} dampad pil="ingen" />
            <Rad titel="Gäller" varde={omfattning} dampad sista onClick={() => setGallerOppen(true)} />
          </Kort>

          <div style={{ marginTop: AVSTAND.xl }}>
            <PrimaryButton onClick={() => { setForvaldPerson(undefined); setRegistrera(true); }}>
              Registrera bevis
            </PrimaryButton>
          </div>
        </>
      )}


      <BevisSheet rad={vald} onClose={() => setVald(null)} onDeleted={() => { setVald(null); load(); }} />

      <GallerSheet
        open={gallerOppen}
        typ={typ}
        medarbetare={medarbetare}
        nuvarande={krav}
        onClose={() => setGallerOppen(false)}
        onSaved={() => { setGallerOppen(false); load(); }}
      />

      <RegistreraBevisSheet
        open={registrera}
        onClose={() => setRegistrera(false)}
        onSaved={() => { setRegistrera(false); load(); }}
        typer={typ ? [typ] : []}
        medarbetare={medarbetare}
        forvaldTypId={typ?.id}
        forvaldMedarbetareId={forvaldPerson}
      />
    </Vy>
  );
}
