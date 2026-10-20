'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Flikkontroll from '@/components/design/Flikkontroll';
import { AVSTAND, FARG, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import { laggInObjekt, standardBolag } from '@/lib/objekt/data';
import { manadEtikett, type Manad } from '@/lib/objekt/manad';
import { MANUELLA_TYPER, type ObjektTyp, type SektionTyp } from '@/lib/objekt/tackning';

// "Eller lägg in manuellt": namn och volym. År och månad sätts av vyn (månaden som visas). Typen kan vyn inte veta — den väljs med ett tryck
// och har INGET förval: ett fel förval skriver tyst in en volym på fel typ, och felet syns först i täckningen. Ett extra tryck i ett
// sällanflöde är billigare. GROT har ingen beställning, så där är volymen valfri (och utan enhet — GROT mäts inte i m³fub).
export default function ManuellArk({
  manad, bolagFor, onStang, onSparad,
}: {
  manad: Manad;
  /** Bolaget som hör till typens beställning den här månaden — null om månaden saknar beställning (då gäller det senast inlagda). */
  bolagFor: (typ: ObjektTyp) => string | null;
  onStang: () => void;
  onSparad: (text: string) => void;
}) {
  const [typ, setTyp] = useState<SektionTyp | null>(null);
  const [namn, setNamn] = useState('');
  const [volym, setVolym] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const grot = typ === 'grot';
  const v = Number(volym.replace(/[\s ]/g, '').replace(',', '.'));
  const volymOk = volym.trim() === '' ? grot : Number.isFinite(v) && v > 0;
  const giltig = typ != null && namn.trim() !== '' && volymOk && !sparar;

  async function spara() {
    if (!typ) return;
    setSparar(true); setFel(null);
    try {
      // GROT har ingen beställning och därmed inget bolag att ärva — ingen gissning, kolumnen lämnas tom.
      const bolag = typ === 'grot' ? null : (bolagFor(typ) ?? (await standardBolag()).bolag);
      await laggInObjekt({ namn, volym: volym.trim() === '' ? null : v, typ, bolag, ...manad });
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
      <div style={{ marginBottom: AVSTAND.l }} data-typval="">
        <Flikkontroll flikar={MANUELLA_TYPER.map(t => [t.id, t.namn] as const)} aktiv={typ} onVal={setTyp} />
      </div>
      <Falt etikett="Namn" value={namn} onChange={setNamn} autoFocus placeholder="Till exempel Skälviken" />
      <Falt etikett={grot ? 'Volym (valfritt)' : 'Volym'} value={volym} onChange={setVolym} inputMode="numeric" enhet={grot ? undefined : 'm³fub'} />
    </Ark>
  );
}
