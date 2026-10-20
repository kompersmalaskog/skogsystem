'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Flikkontroll from '@/components/design/Flikkontroll';
import Rad from '@/components/design/Rad';
import { AVSTAND, FARG, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import type { Bolag } from '@/lib/objekt/bolag';
import { laggInObjekt } from '@/lib/objekt/data';
import { manadEtikett, type Manad } from '@/lib/objekt/manad';
import { MANUELLA_TYPER, type ObjektTyp, type SektionTyp } from '@/lib/objekt/tackning';
import BolagValjare from './BolagValjare';

// "Eller lägg in manuellt": namn och volym. År och månad sätts av vyn (månaden som visas). Typen kan vyn inte veta — den väljs med ett tryck
// och har INGET förval: ett fel förval skriver tyst in en volym på fel typ, och felet syns först i täckningen. Ett extra tryck i ett
// sällanflöde är billigare. GROT har ingen beställning, så där är volymen valfri (och utan enhet — GROT mäts inte i m³fub).
//
// BOLAGET: varje objekt får ett synligt bolag — det avgör vilket bolags beställning objektet räknas mot. För gallring och slutavverkning
// förifylls det från månadens beställning om den bara har ett bolag (raden visar det och går att byta); för GROT finns inget att ärva, så det
// väljs. Det finns inget standardbolag: utan valt bolag går inget att lägga in. Samma väljare som beställningsarket (välj eller skapa nytt).
export default function ManuellArk({
  manad, forifyll, onStang, onSparad,
}: {
  manad: Manad;
  /** Bolaget som hör till typens beställning den här månaden om den bara har ett — annars null. Bara förifyllning. */
  forifyll: (typ: ObjektTyp) => Bolag | null;
  onStang: () => void;
  onSparad: (text: string) => void;
}) {
  const [typ, setTyp] = useState<SektionTyp | null>(null);
  const [namn, setNamn] = useState('');
  const [volym, setVolym] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [valjer, setValjer] = useState(false);
  const [valtHand, setValtHand] = useState<Bolag | null>(null);

  const grot = typ === 'grot';
  // Det som visas är det som sparas: ett val för hand, annars förifyllningen (aldrig för GROT).
  const bolag: Bolag | null = valtHand ?? (typ != null && typ !== 'grot' ? forifyll(typ) : null);
  const v = Number(volym.replace(/[\s ]/g, '').replace(',', '.'));
  const volymOk = volym.trim() === '' ? grot : Number.isFinite(v) && v > 0;
  const giltig = typ != null && namn.trim() !== '' && volymOk && bolag != null && !sparar;

  async function spara() {
    if (!typ || !bolag) return;
    setSparar(true); setFel(null);
    try {
      await laggInObjekt({ namn, volym: volym.trim() === '' ? null : v, typ, bolag: bolag.namn, ...manad });
      onSparad(`${namn.trim()} är inlagt.`);
    } catch (e) {
      setFel(e instanceof Error ? e.message : String(e));
      setSparar(false);
    }
  }

  if (valjer) {
    return <BolagValjare valt={bolag} onVal={b => { setValtHand(b); setValjer(false); }} onTillbaka={() => setValjer(false)} />;
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
      {typ != null && (
        <div style={{ marginBottom: AVSTAND.l }}>
          <Rad titel="Bolag" sista
            under={bolag ? (valtHand ? 'Valt · tryck för att byta' : 'Förifyllt från månadens beställning · tryck för att byta') : 'Vilket bolags beställning räknas objektet mot?'}
            hoger={bolag ? bolag.namn : <span style={{ color: FARG.orange }}>Välj bolag</span>}
            onTryck={() => setValjer(true)} attr={{ 'data-bolag-rad': 'manuell', ...(bolag ? { 'data-bolag': bolag.namn } : { 'data-bolag-saknas': '' }) }} />
        </div>
      )}
      <Falt etikett="Namn" value={namn} onChange={setNamn} autoFocus placeholder="Till exempel Skälviken" />
      <Falt etikett={grot ? 'Volym (valfritt)' : 'Volym'} value={volym} onChange={setVolym} inputMode="numeric" enhet={grot ? undefined : 'm³fub'} />
    </Ark>
  );
}
