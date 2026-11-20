'use client';
// Åtgärder: vad som gjorts i maskinen och hur träffen var före och efter. Bor i Över tid, under kurvorna — där syns om en åtgärd hjälpte.
// Flyttad oförändrad ur Läget (2026-10-25); "Lägg till åtgärd" är fortfarande det ENDA stället man lägger till en åtgärd.
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON } from '@/lib/design/tokens';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { atgardRader } from '@/lib/kalibrering/laget';
import { Fyll, Meta, Status } from './delar';

export default function AtgarderSektion({ d, ark }: { d: KalibreringData; ark: KalibreringArk }) {
  const atgarder = atgardRader(d.bedomning);
  return (
    <Sektion rubrik="Åtgärder" not="Vad som gjorts, och hur träffen var 90 dagar före och efter.">
      {atgarder.map(r => (
        <Rad key={r.id} onTryck={() => ark.oppnaAtgard(r.id)} titel={r.titel} under={r.datumText}
          hoger={r.hoger} hogerUnder={r.riktning ? <Status farg={r.riktning === 'battre' ? FARG.gron : r.riktning === 'samre' ? FARG.rod : FARG.text3} ord={r.hogerUnder} /> : r.hogerUnder} />
      ))}
      {atgarder.length === 0 && <Fyll><Meta>Inga åtgärder markerade ännu.</Meta></Fyll>}
      <Rad sista pil={false} onTryck={ark.oppnaNyAtgard}
        titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}><Ikon namn="add" storlek={IKON.rad} farg={FARG.text} /><span>Lägg till åtgärd</span></span>} />
    </Sektion>
  );
}
