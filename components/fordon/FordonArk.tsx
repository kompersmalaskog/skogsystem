'use client';

// Lägg till eller ändra ett fordon — ett ark i iOS Settings-stil: det som krävs först, det valfria sist och märkt.
// Spara är grå tills något är ifyllt/ändrat. Ta bort bekräftas i SAMMA ark (ingen webbläsardialog, inget ark på ark).

import { useMemo, useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import type { Resurstyp } from '@/lib/kontrolltyper';
import { TYP_LABEL, fordonNamn, type Resurs } from '@/lib/kontroller-format';
import { ArkFel, ValRad } from './delar';

const TYPER: Resurstyp[] = ['bil', 'lastbil', 'slap', 'maskin', 'cistern'];

type Varden = {
  namn: string; typ: Resurstyp | null; regnr: string; marke: string; modell: string; arsmodell: string;
  anteckning: string; inkopspris: string; inkopsdatum: string;
};

function franResurs(r: Resurs | null): Varden {
  return {
    namn: r?.namn ?? '', typ: r?.typ ?? null, regnr: r?.regnr ?? '', marke: r?.marke ?? '', modell: r?.modell ?? '',
    arsmodell: r?.arsmodell != null ? String(r.arsmodell) : '', anteckning: r?.anteckning ?? '',
    inkopspris: r?.inkopspris != null ? String(r.inkopspris) : '', inkopsdatum: r?.inkopsdatum ?? '',
  };
}

function heltal(s: string): number | null {
  const n = parseInt(s.replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

export default function FordonArk({ befintlig, arAdmin, onStang, onSparad, onBorttagen }: {
  befintlig: Resurs | null;
  arAdmin: boolean;
  onStang: () => void;
  onSparad: (r: Resurs) => void;
  onBorttagen?: () => void;
}) {
  const start = useMemo(() => franResurs(befintlig), [befintlig]);
  const [v, setV] = useState<Varden>(start);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [taBort, setTaBort] = useState(false);

  const satt = <K extends keyof Varden>(k: K, varde: Varden[K]) => setV(prev => ({ ...prev, [k]: varde }));
  const andrat = JSON.stringify(v) !== JSON.stringify(start);
  const kanSpara = !!v.namn.trim() && !!v.typ && andrat && !sparar;

  async function spara() {
    if (!kanSpara) return;
    setSparar(true); setFel(null);
    const payload: Record<string, unknown> = {
      namn: v.namn.trim(),
      regnr: v.regnr.trim() || null,
      marke: v.marke.trim() || null,
      modell: v.modell.trim() || null,
      arsmodell: heltal(v.arsmodell),
      anteckning: v.anteckning.trim() || null,
    };
    if (!befintlig) payload.typ = v.typ;
    if (arAdmin) {
      payload.inkopspris = heltal(v.inkopspris);
      payload.inkopsdatum = v.inkopsdatum || null;
    }
    try {
      const res = await fetch(befintlig ? `/api/resurs/${befintlig.id}` : '/api/resurs', {
        method: befintlig ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) { setFel(`Kunde inte spara: ${body.error || res.status}. Försök igen.`); setSparar(false); return; }
      onSparad(body.resurs);
    } catch {
      setFel('Kunde inte spara. Kontrollera täckningen och försök igen.');
      setSparar(false);
    }
  }

  async function bekraftaTaBort() {
    if (!befintlig) return;
    setSparar(true); setFel(null);
    try {
      const res = await fetch(`/api/resurs/${befintlig.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) { setFel(`Kunde inte ta bort: ${body.error || res.status}. Försök igen.`); setSparar(false); return; }
      onBorttagen?.();
    } catch {
      setFel('Kunde inte ta bort. Kontrollera täckningen och försök igen.');
      setSparar(false);
    }
  }

  if (taBort && befintlig) {
    return (
      <Ark rubrik={`Ta bort ${fordonNamn(befintlig)}?`} onStang={() => setTaBort(false)}
        fot={<>
          <button type="button" onClick={bekraftaTaBort} disabled={sparar}
            style={{ ...KNAPP.sekundar, color: FARG.rod, ...(sparar ? INAKTIV : null) }} data-testid="bekrafta-ta-bort">
            {sparar ? 'Tar bort…' : 'Ta bort'}
          </button>
          <ArkFel fel={fel} />
        </>}>
        <p style={{ ...TYP.text, color: FARG.text, margin: `${AVSTAND.s}px 0` }}>
          Fordonet försvinner ur listan. Det som registrerats på det sparas.
        </p>
      </Ark>
    );
  }

  return (
    <Ark rubrik={befintlig ? 'Ändra fordon' : 'Nytt fordon'} onStang={onStang}
      fot={<>
        <button type="button" onClick={spara} disabled={!kanSpara}
          style={{ ...KNAPP.primar, ...(kanSpara ? null : INAKTIV) }} data-testid="spara-fordon">
          {sparar ? 'Sparar…' : 'Spara'}
        </button>
        <ArkFel fel={fel} />
      </>}>

      {!befintlig && (
        <Sektion rubrik="Vad är det?" kort={false}>
          {TYPER.map((t, i) => (
            <ValRad key={t} titel={TYP_LABEL[t]} vald={v.typ === t} onTryck={() => satt('typ', t)}
              sista={i === TYPER.length - 1} attr={{ 'data-typ': t }} />
          ))}
        </Sektion>
      )}

      <Falt etikett="Namn" value={v.namn} onChange={x => satt('namn', x)} placeholder="Volvo FH, Kilafors-släpet, Dieseltanken" name="namn" />

      <Sektion rubrik="Valfritt" kort={false}>
        <Falt etikett="Regnummer" value={v.regnr} onChange={x => satt('regnr', x.toUpperCase())} placeholder="ABC123" name="regnr" />
        <Falt etikett="Märke" value={v.marke} onChange={x => satt('marke', x)} name="marke" />
        <Falt etikett="Modell" value={v.modell} onChange={x => satt('modell', x)} name="modell" />
        <Falt etikett="Årsmodell" value={v.arsmodell} onChange={x => satt('arsmodell', x)} inputMode="numeric" name="arsmodell" />
        <Falt etikett="Anteckning" value={v.anteckning} onChange={x => satt('anteckning', x)} name="anteckning" />
      </Sektion>

      {arAdmin && (
        <Sektion rubrik="Ekonomi · bara admin" kort={false}>
          <Falt etikett="Inköpspris" value={v.inkopspris} onChange={x => satt('inkopspris', x)} inputMode="numeric" enhet="kr" name="inkopspris" />
          <Falt etikett="Inköpt" value={v.inkopsdatum} onChange={x => satt('inkopsdatum', x)} typ="date" name="inkopsdatum" />
        </Sektion>
      )}

      {befintlig && (
        <button type="button" onClick={() => { setFel(null); setTaBort(true); }} style={KNAPP.destruktiv} data-testid="ta-bort-fordon">
          Ta bort fordon
        </button>
      )}
    </Ark>
  );
}
