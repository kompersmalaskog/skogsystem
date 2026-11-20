'use client';
// Ändra telefon och anhörig — de enda fälten Personal äger. Allt annat ändras i Admin › Medarbetare.
// Dirty-state bor på Spara-knappen (inaktiv tills något ändrats), inget annat.
import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import { fornamn, type Person } from '@/lib/personal';

type Varden = { telefon: string; anhorig_namn: string; anhorig_relation: string; anhorig_telefon: string };

function franPerson(p: Person): Varden {
  return {
    telefon: p.telefon ?? '',
    anhorig_namn: p.anhorig_namn ?? '',
    anhorig_relation: p.anhorig_relation ?? '',
    anhorig_telefon: p.anhorig_telefon ?? '',
  };
}

export default function AndraArk({ person, arJag, onStang, onSparad }: {
  person: Person;
  arJag: boolean;
  onStang: () => void;
  onSparad: () => void;
}) {
  const [start] = useState(() => franPerson(person));
  const [v, setV] = useState<Varden>(start);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const andrad = (Object.keys(start) as (keyof Varden)[]).some((k) => v[k].trim() !== start[k].trim());
  const satt = (k: keyof Varden) => (x: string) => { setV((o) => ({ ...o, [k]: x })); setFel(null); };

  async function spara() {
    setSparar(true); setFel(null);
    try {
      const r = await fetch(`/api/personal/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body.ok) throw new Error(body.error || `HTTP ${r.status}`);
      onSparad();
    } catch (e) {
      console.error('[personal] spara', e);
      setFel('Kunde inte spara. Kontrollera nätet och försök igen.');
      setSparar(false);
    }
  }

  const fot = (
    <>
      {fel && <div style={{ ...TYP.meta, color: FARG.orange }} role="alert">{fel}</div>}
      <button type="button" onClick={spara} style={{ ...KNAPP.primar, ...(!andrad || sparar ? INAKTIV : null) }} disabled={!andrad || sparar} data-spara>
        {sparar ? 'Sparar…' : 'Spara'}
      </button>
    </>
  );

  return (
    <Ark rubrik={arJag ? 'Telefon och anhörig' : fornamn(person.namn)} onStang={onStang} fot={fot}>
      <div style={{ height: AVSTAND.s }} />
      <Sektion rubrik={arJag ? 'Ditt nummer' : 'Telefon'} kort={false}>
        <Falt etikett="Telefon" typ="tel" value={v.telefon} onChange={satt('telefon')} placeholder="070-123 45 67" name="telefon" />
      </Sektion>
      <Sektion rubrik="Anhörig" kort={false} not={arJag ? 'Den vi ringer om något händer dig i skogen.' : 'Den vi ringer vid en olycka.'}>
        <Falt etikett="Namn" value={v.anhorig_namn} onChange={satt('anhorig_namn')} placeholder="Anna Andersson" name="anhorig_namn" />
        <Falt etikett="Relation" value={v.anhorig_relation} onChange={satt('anhorig_relation')} placeholder="Fru, sambo, pappa" name="anhorig_relation" />
        <Falt etikett="Telefon" typ="tel" value={v.anhorig_telefon} onChange={satt('anhorig_telefon')} placeholder="070-765 43 21" name="anhorig_telefon" />
      </Sektion>
    </Ark>
  );
}
