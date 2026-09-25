'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import ListGroup from '@/components/ListGroup';
import ListRow from '@/components/ListRow';
import StatusDot from '@/components/StatusDot';
import { Sheet, ConfirmDialog } from '@/components/Sheet';
import { T, STATUS_META, formatDatum, visaNamn, type UtbildningStatusRad } from '@/lib/utbildning';

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
            <ListGroup>
              <ListRow title="Person" href={`/utbildning/person/${rad.medarbetare_id}`} value={visaNamn(rad.medarbetare_namn)} />
              <ListRow
                title="Status"
                chevron={false}
                trailing={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: STATUS_META[rad.status].color, fontSize: 15 }}>
                    <StatusDot status={rad.status} />
                    {STATUS_META[rad.status].label}
                  </span>
                }
              />
              <ListRow title="Genomförd" value={formatDatum(rad.genomford_datum) || '—'} chevron={false} />
              <ListRow title="Giltig t.o.m." value={rad.giltig_till ? formatDatum(rad.giltig_till) : 'Ingen utgång'} chevron={false} />
            </ListGroup>

            <div style={{ padding: '12px 0 0' }}>
              <ListGroup>
                {rad.pdf_url && (
                  <ListRow
                    title={<span style={{ color: T.blue }}>Visa bevis (PDF)</span>}
                    onClick={visaBevis}
                    chevron={false}
                    leading={<span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20, color: T.blue }}>picture_as_pdf</span>}
                  />
                )}
                <ListRow title="Öppna utbildning" href={`/utbildning/typ/${rad.utbildning_typ_id}`} />
              </ListGroup>
            </div>

            {bevisFel && <div style={{ fontSize: 13, color: T.red, margin: '12px 0 0' }}>{bevisFel}</div>}
            {fel && <div style={{ fontSize: 13, color: T.red, margin: '12px 0 0' }}>Kunde inte ta bort: {fel}</div>}

            <div style={{ padding: '16px 0 0' }}>
              <ListGroup>
                <ListRow
                  title="Ta bort bevis"
                  danger
                  chevron={false}
                  onClick={() => setBekrafta(true)}
                  leading={<span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20, color: T.red }}>delete</span>}
                />
              </ListGroup>
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
