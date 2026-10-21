'use client';
// Maskinfiltret: "Alla maskiner" och de aktiva skördarna (sålda döljs, historiken finns kvar i databasen). Sök visas först över tio maskiner.
import { useState } from 'react';
import Falt from '@/components/design/Falt';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import { FARG, IKON } from '@/lib/design/tokens';
import { maskinNamn } from '@/lib/kalibrering/ordlista';
import type { AlleMaskin } from '@/lib/kalibrering/typer';

const BOCK = <Ikon namn="check" storlek={IKON.rad} farg={FARG.text} />;

export default function MaskinArk({ maskiner, arAktiv, valdId, effektivId, onVal }: {
  maskiner: AlleMaskin[]; arAktiv: (id: string) => boolean; valdId: string | 'all'; effektivId: string | 'all'; onVal: (id: string | 'all') => void;
}) {
  const [sokning, setSokning] = useState('');
  const q = sokning.trim().toLowerCase();
  const lista = maskiner.filter(m => arAktiv(m.maskin_id)).filter(m => !q || maskinNamn(m).toLowerCase().includes(q));
  return (
    <>
      {maskiner.length > 10 && <Falt etikett="Sök maskin" value={sokning} onChange={setSokning} />}
      <div>
        <Rad titel="Alla maskiner" sista={lista.length === 0} onTryck={() => onVal('all')} pil={false} hoger={valdId === 'all' ? BOCK : undefined} />
        {lista.map((m, i) => (
          <Rad key={m.maskin_id} titel={maskinNamn(m)} sista={i === lista.length - 1} onTryck={() => onVal(m.maskin_id)} pil={false}
            hoger={effektivId === m.maskin_id ? BOCK : undefined} />
        ))}
      </div>
    </>
  );
}
