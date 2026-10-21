'use client';

// /inventarier/etiketter[?plats=<id>] — skriv ut QR-etiketter att sätta på lådorna.
//
// Förvalt: allt som är förbrukning (reservlådorna och det som räknas) — det är dem appen behöver en kod på. Utrustning
// bockas i för hand. ?plats= visar bara den platsen (länken från en plats sida). Ett tryck på en rad bockar i eller ur;
// Skriv ut är skärmens enda vita knapp och säger hur många ("Skriv ut 6 etiketter").
//
// QR-koderna räknas i webbläsaren (qrcode) och pekar alltid på produktionens adress (lib/inventarier/qr.ts).

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, TYP, medSafeBotten } from '@/lib/design/tokens';
import { etikettText, forvaldaEtiketter, qrAdress } from '@/lib/inventarier/qr';
import type { VisadRad } from '@/lib/inventarier/typer';
import { artikelTitel, platsGrupper, visadeRader } from '@/lib/inventarier/vy';
import { FelLage, InvVy, Laddar, Tillbaka } from './delar';
import EtikettUtskrift, { type UtskriftEtikett } from './EtikettUtskrift';
import { useInventarier } from './useInventarier';

export default function Etiketter() {
  // ?plats= läses ur adressen en gång (som ?rad= på startsidan) — useSearchParams kräver en Suspense-gräns runt sidan.
  const [platsFilter] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get('plats'));
  const { state, forsokIgen } = useInventarier();
  const inv = state.lage === 'klar' ? state.inv : null;

  const rader = useMemo(
    () => (inv ? visadeRader(inv).filter(v => !platsFilter || v.plats.id === platsFilter) : []),
    [inv, platsFilter],
  );
  const [valda, setValda] = useState<Set<string> | null>(null);
  const [svg, setSvg] = useState<Record<string, string>>({});
  const [qrFel, setQrFel] = useState<string | null>(null);

  // Förvalet sätts EN gång när raderna är lästa — därefter är det användarens bockar.
  useEffect(() => {
    if (inv && valda == null) setValda(new Set(forvaldaEtiketter(rader)));
  }, [inv, rader, valda]);

  const valdaRader = useMemo(() => rader.filter(v => valda?.has(v.rad.id)), [rader, valda]);

  // QR-koden för varje vald rad, en gång per rad.
  useEffect(() => {
    let levande = true;
    const saknas = valdaRader.filter(v => !svg[v.rad.id]);
    if (saknas.length === 0) return;
    Promise.all(saknas.map(async v => [v.rad.id, await QRCode.toString(qrAdress(v.rad.id), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })] as const))
      .then(par => { if (levande) setSvg(s => ({ ...s, ...Object.fromEntries(par) })); })
      .catch(e => { if (levande) setQrFel(e?.message ?? 'Kunde inte skapa QR-koderna'); });
    return () => { levande = false; };
  }, [valdaRader, svg]);

  const utskrift: UtskriftEtikett[] = valdaRader
    .filter(v => svg[v.rad.id])
    .map(v => ({ id: v.rad.id, svg: svg[v.rad.id], text: etikettText(v) }));
  const klar = valdaRader.length > 0 && utskrift.length === valdaRader.length;

  function vaxla(id: string) {
    setValda(prev => {
      const n = new Set(prev ?? []);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  if (state.lage === 'laddar') return <InvVy><Laddar text="Läser inventarierna…" /></InvVy>;
  if (state.lage === 'fel' || !inv) return <InvVy><FelLage fel={state.lage === 'fel' ? state.fel : ''} onForsok={forsokIgen} /></InvVy>;

  const plats = platsFilter ? inv.platser.find(p => p.id === platsFilter) ?? null : null;
  const grupper = platsGrupper(inv.platser, null)
    .flatMap(g => g.platser)
    .map(p => ({ plats: p, rader: rader.filter(v => v.plats.id === p.id).sort((a, b) => artikelTitel(a.artikel).localeCompare(artikelTitel(b.artikel), 'sv')) }))
    .filter(g => g.rader.length > 0);

  return (
    <InvVy>
      <Tillbaka href={plats ? `/inventarier/plats/${plats.id}` : '/inventarier'} text={plats ? plats.namn : 'Inventarier'} />
      <h1 style={{ ...TYP.titel, margin: `${AVSTAND.s}px 0 ${AVSTAND.xs}px` }}>Etiketter</h1>
      <p style={{ ...TYP.text, color: FARG.text2, margin: `0 0 ${AVSTAND.xl}px` }}>
        Sätt koden på lådan. En skanning med kameran gör resten.
      </p>

      {grupper.length === 0 ? (
        <p style={{ ...TYP.text, color: FARG.text2 }} data-testid="etiketter-tomt">
          Inget registrerat{plats ? ` i ${plats.namn}` : ''} än. Lägg till grejerna först.
        </p>
      ) : grupper.map(g => (
        <Sektion key={g.plats.id} rubrik={g.plats.namn}>
          {g.rader.map((v, i) => <BockRad key={v.rad.id} v={v} vald={!!valda?.has(v.rad.id)} onTryck={() => vaxla(v.rad.id)} sista={i === g.rader.length - 1} />)}
        </Sektion>
      ))}

      {qrFel && <p role="alert" style={{ ...TYP.meta, color: FARG.orange }}>{qrFel}</p>}

      <div style={{ position: 'sticky', bottom: 0, background: FARG.bg, paddingTop: AVSTAND.m, paddingBottom: medSafeBotten(AVSTAND.m) }}>
        <button type="button" data-testid="skriv-ut" onClick={() => window.print()}
          style={{ ...KNAPP.primar, ...(!klar ? INAKTIV : null) }} disabled={!klar}>
          {valdaRader.length === 0 ? 'Välj vad som ska ha etikett'
            : `Skriv ut ${valdaRader.length} ${valdaRader.length === 1 ? 'etikett' : 'etiketter'}`}
        </button>
        <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0`, textAlign: 'center' }}>
          A4 med 3 × 7 etiketter, 70 × 42 mm
        </p>
      </div>

      <EtikettUtskrift etiketter={utskrift} />
    </InvVy>
  );
}

/** Fylld ring = vald, tom ring = inte vald (formen bär det, inte färgen). Under: vad en skanning gör. */
function BockRad({ v, vald, onTryck, sista }: { v: VisadRad; vald: boolean; onTryck: () => void; sista?: boolean }) {
  const t = etikettText(v);
  return (
    <Rad
      titel={t.titel}
      under={t.gor}
      onTryck={onTryck}
      pil={false}
      sista={sista}
      hoger={<Ikon namn={vald ? 'check_circle' : 'radio_button_unchecked'} storlek={IKON.rad} farg={vald ? FARG.text : FARG.text2} fylld={vald} />}
      attr={{ role: 'checkbox', 'aria-checked': vald ? 'true' : 'false', 'data-etikett-val': v.rad.id }}
    />
  );
}
