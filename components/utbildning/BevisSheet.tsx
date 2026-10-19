'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Ikon from '@/components/design/Ikon';
import { Sheet, ConfirmDialog } from '@/components/Sheet';
import { Kort, Rad } from '@/components/utbildning/ui';
import { AVSTAND, FARG, IKON, RADIE, TYP } from '@/lib/design/tokens';
import { STATUS_META, formatDatum, visaNamn, type UtbildningStatusRad } from '@/lib/utbildning';

const BUCKET = 'utbildningsbevis';

// Detaljvy för ett bevis: status, länkar till person/utbildning, visa PDF
// (tillfällig signerad länk mot privat bucket) och mjuk radering.
export default function BevisSheet({
  rad,
  onClose,
  onDeleted,
}: {
  rad: UtbildningStatusRad | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [bekrafta, setBekrafta] = useState(false);
  const [tarBort, setTarBort] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [bevisFel, setBevisFel] = useState<string | null>(null);

  async function visaBevis() {
    if (!rad?.pdf_url) return;
    setBevisFel(null);
    // Öppna fliken synkront (bevarar användargesten), fyll i URL:en efter await.
    const w = window.open('', '_blank');
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(rad.pdf_url, 60);
    if (error || !data?.signedUrl) {
      if (w) w.close();
      setBevisFel(error?.message || 'Kunde inte skapa länk till beviset');
      return;
    }
    if (w) w.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  }

  async function taBort() {
    if (!rad?.bevis_id) return;
    setTarBort(true);
    setFel(null);
    const { error } = await supabase
      .from('utbildning_bevis')
      .update({ aktiv: false, borttagen: new Date().toISOString() })
      .eq('id', rad.bevis_id);
    if (error) {
      setFel(error.message);
      setTarBort(false);
      return;
    }
    setTarBort(false);
    setBekrafta(false);
    onDeleted();
  }

  return (
    <>
      <Sheet open={!!rad} onClose={onClose} title={rad ? rad.utbildning_namn : ''}>
        {rad && (
          <>
            <Kort>
              <Rad titel="Person" href={`/utbildning/person/${rad.medarbetare_id}`} varde={visaNamn(rad.medarbetare_namn)} />
              <Rad
                titel="Status"
                pil="ingen"
                varde={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.inuti, color: STATUS_META[rad.status].farg }}>
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: RADIE.cirkel, background: STATUS_META[rad.status].farg }} />
                    {STATUS_META[rad.status].label}
                  </span>
                }
              />
              <Rad titel="Genomförd" pil="ingen" varde={formatDatum(rad.genomford_datum) || '—'} />
              <Rad titel="Giltig t.o.m." pil="ingen" sista varde={rad.giltig_till ? formatDatum(rad.giltig_till) : 'Ingen utgång'} />
            </Kort>

            <Kort>
              {rad.pdf_url && (
                <Rad
                  titel="Visa bevis (PDF)"
                  onClick={visaBevis}
                  pil="hoger"
                  varde={<Ikon namn="picture_as_pdf" storlek={IKON.text} farg={FARG.text2} />}
                />
              )}
              <Rad titel="Öppna utbildning" href={`/utbildning/typ/${rad.utbildning_typ_id}`} sista />
            </Kort>

            {bevisFel && <p style={{ ...TYP.meta, color: FARG.rod, margin: `${AVSTAND.m}px 0 0` }}>{bevisFel}</p>}
            {fel && <p style={{ ...TYP.meta, color: FARG.rod, margin: `${AVSTAND.m}px 0 0` }}>Kunde inte ta bort: {fel}</p>}

            <div style={{ marginTop: AVSTAND.l }}>
              <button
                type="button"
                onClick={() => setBekrafta(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.inuti, background: 'none', border: 'none', color: FARG.rod, cursor: 'pointer', fontFamily: 'inherit', ...TYP.text, minHeight: 44, padding: 0 }}
              >
                <Ikon namn="delete" storlek={IKON.text} farg={FARG.rod} />
                Ta bort bevis
              </button>
            </div>
          </>
        )}
      </Sheet>

      <ConfirmDialog
        open={bekrafta}
        title="Ta bort bevis?"
        message="Beviset markeras som borttaget. Det går inte att ångra härifrån."
        confirmLabel="Ta bort"
        busy={tarBort}
        onConfirm={taBort}
        onCancel={() => setBekrafta(false)}
      />
    </>
  );
}
