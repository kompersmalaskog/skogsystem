'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Ikon from '@/components/design/Ikon';
import { Sheet, ConfirmDialog } from '@/components/Sheet';
import NyUtbildningSheet from '@/components/utbildning/NyUtbildningSheet';
import {
  Vy, Topprad, Etikett, Tal, Kort, Rad, FallUt,
  LoadingView, ErrorView, EmptyView, KravtypBadge, PrimaryButton,
} from '@/components/utbildning/ui';
import { AVSTAND, FARG, IKON, TRAFFYTA, TYP } from '@/lib/design/tokens';
import {
  KRAVTYP_ORDNING,
  KRAVTYP_META,
  fornyelseText,
  omfattningText,
  dagManad,
  type UtbildningTyp,
  type Medarbetare,
} from '@/lib/utbildning';

function kravtypRang(t: UtbildningTyp): number {
  const i = KRAVTYP_ORDNING.indexOf(t.kravtyp);
  return i === -1 ? 99 : i;
}

export default function KatalogPage() {
  const [typer, setTyper] = useState<UtbildningTyp[] | null>(null);
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [kravAntal, setKravAntal] = useState<Record<string, number>>({});
  const [bevisAntal, setBevisAntal] = useState<Record<string, number>>({});
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
    const [typR, medR, kravR, bevisR] = await Promise.all([
      supabase.from('utbildning_typ').select('*').order('namn'),
      supabase.from('medarbetare').select('id, namn, roll, aktiv').eq('aktiv', true).order('namn'),
      supabase.from('utbildning_krav').select('utbildning_typ_id'),
      supabase.from('utbildning_bevis').select('utbildning_typ_id').eq('aktiv', true),
    ]);
    const felet = typR.error || medR.error || kravR.error || bevisR.error;
    if (felet) {
      setError(felet.message);
      setLoading(false);
      return;
    }
    const krav: Record<string, number> = {};
    for (const r of (kravR.data as { utbildning_typ_id: string }[]) ?? []) krav[r.utbildning_typ_id] = (krav[r.utbildning_typ_id] ?? 0) + 1;
    const bevis: Record<string, number> = {};
    for (const r of (bevisR.data as { utbildning_typ_id: string }[]) ?? []) bevis[r.utbildning_typ_id] = (bevis[r.utbildning_typ_id] ?? 0) + 1;
    setKravAntal(krav);
    setBevisAntal(bevis);
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

  const aktiva = (typer ?? [])
    .filter((t) => t.aktiv)
    .sort((a, b) => kravtypRang(a) - kravtypRang(b) || a.namn.localeCompare(b.namn, 'sv'));
  const inaktiva = (typer ?? []).filter((t) => !t.aktiv);

  function aktivUnderrad(t: UtbildningTyp): string {
    return `${KRAVTYP_META[t.kravtyp].label} · ${fornyelseText(t.giltighet_manader)} · ${omfattningText(t.galler_alla, kravAntal[t.id] ?? 0)}`;
  }

  function inaktivUnderrad(t: UtbildningTyp): string {
    const n = bevisAntal[t.id] ?? 0;
    return `Inaktiverad ${dagManad(t.uppdaterad)} · ${n} bevis ${n === 1 ? 'sparat' : 'sparade'}`;
  }

  return (
    <Vy>
      <Topprad
        bak={{ href: '/utbildning', label: 'Utbildningar' }}
        atgard={
          <button
            onClick={() => setNy(true)}
            aria-label="Ny utbildning"
            style={{ background: 'none', border: 'none', color: FARG.bla, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', minHeight: TRAFFYTA.min, padding: AVSTAND.xs }}
          >
            <Ikon namn="add" storlek={IKON.rad} farg={FARG.bla} />
          </button>
        }
      />
      <Etikett>Katalog</Etikett>

      {loading && <LoadingView text="Hämtar katalogen…" />}
      {!loading && error && <ErrorView error={error} onRetry={load} />}

      {!loading && !error && typer && (
        <>
          {typer.length === 0 ? (
            <>
              <Tal tal="0" under="utbildningar i katalogen" />
              <EmptyView text="Katalogen är tom. Tryck + för att lägga till." />
            </>
          ) : (
            <>
              {/* Katalogen är undantaget: här finns inget att åtgärda — listan ÄR innehållet. */}
              <Tal tal={String(aktiva.length)} under="utbildningar vi håller koll på" />
              <Kort>
                {aktiva.map((t, i) => (
                  <Rad
                    key={t.id}
                    titel={t.namn}
                    under={aktivUnderrad(t)}
                    sista={i === aktiva.length - 1}
                    onClick={() => { setVald(t); setAndraFel(null); }}
                  />
                ))}
              </Kort>

              <FallUt
                etikett={`${inaktiva.length} inaktiverad${inaktiva.length === 1 ? '' : 'e'} utbildning${inaktiva.length === 1 ? '' : 'ar'}`}
                antal={inaktiva.length}
              >
                {inaktiva.map((t, i) => (
                  <Rad
                    key={t.id}
                    titel={t.namn}
                    under={inaktivUnderrad(t)}
                    dampad
                    sista={i === inaktiva.length - 1}
                    onClick={() => { setVald(t); setAndraFel(null); }}
                  />
                ))}
              </FallUt>
            </>
          )}
        </>
      )}


      {/* Typ-detalj */}
      <Sheet open={!!vald} onClose={() => setVald(null)} title={vald ? vald.namn : ''}>
        {vald && (
          <>
            <Kort>
              <Rad titel="Kravtyp" pil="ingen" varde={<KravtypBadge kravtyp={vald.kravtyp} />} />
              <Rad titel="Förnyelse" pil="ingen" varde={fornyelseText(vald.giltighet_manader)} />
              <Rad titel="Gäller" pil="ingen" sista varde={omfattningText(vald.galler_alla, kravAntal[vald.id] ?? 0)} />
            </Kort>

            {(vald.beskrivning || vald.anteckning) && (
              <Kort>
                {vald.beskrivning && (
                  <div style={{ ...TYP.text, color: FARG.text, padding: `${AVSTAND.m}px 0`, borderBottom: vald.anteckning ? `1px solid ${FARG.linje}` : 'none' }}>
                    {vald.beskrivning}
                  </div>
                )}
                {vald.anteckning && (
                  <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>{vald.anteckning}</div>
                )}
              </Kort>
            )}

            {andraFel && (
              <p style={{ ...TYP.meta, color: FARG.rod, margin: `${AVSTAND.m}px 0 0` }}>Kunde inte ändra: {andraFel}</p>
            )}

            <div style={{ marginTop: AVSTAND.xl }}>
              {vald.aktiv ? (
                <PrimaryButton destruktiv onClick={() => setBekraftaInaktivera(true)} disabled={andrar}>
                  Inaktivera utbildning
                </PrimaryButton>
              ) : (
                <PrimaryButton onClick={() => settAktiv(vald, true)} disabled={andrar}>
                  {andrar ? 'Aktiverar…' : 'Aktivera utbildning'}
                </PrimaryButton>
              )}
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
    </Vy>
  );
}
