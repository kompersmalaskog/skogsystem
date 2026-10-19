'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Flikkontroll from '@/components/design/Flikkontroll';
import { AVSTAND, FARG, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import { laggInObjekt, standardBolag } from '@/lib/objekt/data';
import { manadEtikett, type Manad } from '@/lib/objekt/manad';
import { TYPER, type ObjektTyp } from '@/lib/objekt/tackning';

// "Eller lägg in manuellt": två fält, namn och volym. År och månad sätts av vyn (månaden som visas). Typen kan vyn inte veta — den väljs
// med ett tryck (förvald: den typ vars beställning inte är fylld). Resten av objektet fylls i när traktfilen importeras.
export default function ManuellArk({
  manad, forvaldTyp, bolagFor, onStang, onSparad,
}: {
  manad: Manad;
  forvaldTyp: ObjektTyp;
  /** Bolaget som hör till typens beställning den här månaden — null om månaden saknar beställning (då gäller det senast inlagda). */
  bolagFor: (typ: ObjektTyp) => string | null;
  onStang: () => void;
  onSparad: (text: string) => void;
}) {
  const [typ, setTyp] = useState<ObjektTyp>(forvaldTyp);
  const [namn, setNamn] = useState('');
  const [volym, setVolym] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const v = Number(volym.replace(/[\s ]/g, '').replace(',', '.'));
  const giltig = namn.trim() !== '' && Number.isFinite(v) && v > 0 && !sparar;

  async function spara() {
    setSparar(true); setFel(null);
    try {
      const bolag = bolagFor(typ) ?? (await standardBolag()).bolag;
      await laggInObjekt({ namn, volym: v, typ, bolag, ...manad });
      onSparad(`${namn.trim()} är inlagt.`);
    } catch (e) {
      setFel(e instanceof Error ? e.message : String(e));
      setSparar(false);
    }
  }

  return (
    <Ark rubrik="Lägg in objekt" onStang={onStang}
      fot={(
        <>
          {fel && <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>{fel}</p>}
          <button type="button" onClick={spara} disabled={!giltig} style={{ ...KNAPP.primar, ...(giltig ? null : INAKTIV) }}>
            {sparar ? 'Sparar …' : 'Lägg in'}
          </button>
        </>
      )}>
      <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.text, color: FARG.text2 }}>Läggs in i {manadEtikett(manad).toLowerCase()}.</p>
      <div style={{ marginBottom: AVSTAND.l }}>
        <Flikkontroll flikar={TYPER.map(t => [t.id, t.namn] as const)} aktiv={typ} onVal={setTyp} />
      </div>
      <Falt etikett="Namn" value={namn} onChange={setNamn} autoFocus placeholder="Till exempel Skälviken" />
      <Falt etikett="Volym" value={volym} onChange={setVolym} inputMode="numeric" enhet="m³fub" />
    </Ark>
  );
}
