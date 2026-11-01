'use client';
// Mat — vad vi ska tänka på när vi beställer mat (laktosfri, vegetarian). Personens EGEN uppgift: den kan vara en
// hälsouppgift, så den lämnas frivilligt och bara personen själv och admin ser den (tabellen medarbetare_mat, RLS).
// Tomt sparas som "inget särskilt" (raden tas bort). Spara är inaktiv tills något ändrats.
import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import { AVSTAND, FARG, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import { fornamn, type Person } from '@/lib/personal';

export default function MatArk({ person, arJag, onStang, onSparad }: {
  person: Person;
  arJag: boolean;
  onStang: () => void;
  onSparad: () => void;
}) {
  const [start] = useState(() => (person.mat ?? '').trim());
  const [v, setV] = useState(start);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const andrad = v.trim() !== start;

  async function spara() {
    setSparar(true); setFel(null);
    try {
      const r = await fetch(`/api/personal/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mat: v }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body.ok) throw new Error(body.error || `HTTP ${r.status}`);
      onSparad();
    } catch (e) {
      console.error('[personal] spara mat', e);
      setFel('Kunde inte spara. Kontrollera nätet och försök igen.');
      setSparar(false);
    }
  }

  const fot = (
    <>
      {fel && <div style={{ ...TYP.meta, color: FARG.orange }} role="alert">{fel}</div>}
      <button type="button" onClick={spara} style={{ ...KNAPP.primar, ...(!andrad || sparar ? INAKTIV : null) }} disabled={!andrad || sparar} data-spara-mat>
        {sparar ? 'Sparar…' : 'Spara'}
      </button>
    </>
  );

  return (
    <Ark rubrik={arJag ? 'Mat' : `Mat · ${fornamn(person.namn)}`} onStang={onStang} fot={fot}>
      <div style={{ height: AVSTAND.s }} />
      <Falt
        etikett={arJag ? 'Vad ska vi tänka på när vi beställer mat till dig?' : 'Vad ska vi tänka på när vi beställer mat?'}
        value={v}
        onChange={(x) => { setV(x); setFel(null); }}
        placeholder="Laktosfri, vegetarian …"
        name="mat"
        stod={arJag ? 'Frivilligt. Bara du och admin ser det. Lämna tomt om det inte finns något.' : 'Bara personen själv och admin ser det.'}
      />
    </Ark>
  );
}
