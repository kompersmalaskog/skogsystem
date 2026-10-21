'use client';

import { useEffect, useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, KNAPP, TYP } from '@/lib/design/tokens';
import { bolagNyckel, hamtaBolag, skapaBolag, sokBolag, type Bolag } from '@/lib/objekt/bolag';

// Välj bland bolagen, eller skriv ett nytt namn och skapa det — samma förmåga som det gamla beställningsformuläret (steg 2 "Välj bolag" med
// "Sök eller skriv nytt" → POST /api/bolag). Det är så en ny kund (ATA Timber) kommer in utan att någon ändrar kod. Ett eget ark i samma
// flöde: Avbryt tar tillbaka formuläret, det man fyllt i överlever. Listan är ett läsfel eller en lista — aldrig en tom lista som ser ut som
// "inga bolag".
type Hamtat = { lage: 'laddar' } | { lage: 'fel'; text: string } | { lage: 'klar'; alla: Bolag[] };

export default function BolagValjare({ valt, onVal, onTillbaka, rubrik = 'Välj bolag', upptagna = [] }: {
  valt: Bolag | null;
  onVal: (b: Bolag) => void;
  onTillbaka: () => void;
  rubrik?: string;
  /** Bolag som redan har en sektion i arket: visas nedtonade och går inte att välja. Det ogiltiga läget förhindras i stället för att rapporteras efteråt. */
  upptagna?: readonly number[];
}) {
  const [hamtat, setHamtat] = useState<Hamtat>({ lage: 'laddar' });
  const [q, setQ] = useState('');
  const [skapar, setSkapar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [forsok, setForsok] = useState(0);

  useEffect(() => {
    let avbruten = false;
    setHamtat({ lage: 'laddar' });
    hamtaBolag()
      .then(alla => { if (!avbruten) setHamtat({ lage: 'klar', alla }); })
      .catch(e => { if (!avbruten) setHamtat({ lage: 'fel', text: e instanceof Error ? e.message : String(e) }); });
    return () => { avbruten = true; };
  }, [forsok]);

  const sok = hamtat.lage === 'klar' ? sokBolag(hamtat.alla, q) : { traffar: [], kanSkapa: false };

  async function skapa() {
    setSkapar(true); setFel(null);
    try {
      const b = await skapaBolag(q);
      // Servern returnerar det befintliga bolaget om namnet redan fanns (annan versalisering): är det upptaget går det inte att välja.
      if (upptagna.includes(b.id)) { setFel(`${b.namn} finns redan i arket.`); setSkapar(false); return; }
      onVal(b);
    } catch (e) {
      setFel(e instanceof Error ? e.message : String(e));
      setSkapar(false);
    }
  }

  return (
    <Ark rubrik={rubrik} onStang={onTillbaka}>
      <div data-bolagvaljare="">
        <Falt etikett="Sök eller skriv nytt" value={q} onChange={setQ} autoFocus placeholder="Till exempel ATA Timber" name="bolag" />
        {hamtat.lage === 'laddar' && <p role="status" style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Läser bolagen …</p>}
        {hamtat.lage === 'fel' && (
          <div role="alert">
            <p style={{ margin: `0 0 ${AVSTAND.s}px`, ...TYP.text, color: FARG.orange }}>Kunde inte läsa bolagen. {hamtat.text}</p>
            <button type="button" style={KNAPP.lank} onClick={() => setForsok(n => n + 1)}>Försök igen</button>
          </div>
        )}
        {hamtat.lage === 'klar' && (
          <>
            {sok.kanSkapa && (
              <Sektion rubrik="Nytt bolag" kort={false}>
                <Rad titel={skapar ? 'Skapar …' : `Lägg till ”${q.trim()}”`} under="Skapar bolaget och väljer det" sista pil={false}
                  hoger={<Ikon namn="add" storlek={IKON.rad} farg={FARG.text} />}
                  onTryck={skapar ? undefined : skapa} attr={{ 'data-skapa-bolag': q.trim() }} />
              </Sektion>
            )}
            {fel && <p role="alert" style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.orange }}>{fel}</p>}
            {sok.traffar.length > 0 && (
              <Sektion rubrik="Bolag" kort={false}>
                {sok.traffar.map((b, i) => {
                  const ar = valt != null && bolagNyckel(valt.namn) === bolagNyckel(b.namn);
                  const upptaget = upptagna.includes(b.id) && !ar;
                  return (
                    <Rad key={b.id} titel={b.namn} sista={i === sok.traffar.length - 1} pil={false} dampad={upptaget}
                      under={upptaget ? 'Finns redan i arket' : undefined}
                      hoger={ar ? <Ikon namn="check_circle" fylld storlek={IKON.rad} farg={FARG.text} /> : undefined}
                      onTryck={upptaget ? undefined : () => onVal(b)}
                      attr={{ 'data-bolag-val': String(b.id), 'aria-pressed': String(ar), ...(upptaget ? { 'data-upptaget': '' } : null) }} />
                  );
                })}
              </Sektion>
            )}
            {sok.traffar.length === 0 && !sok.kanSkapa && (
              <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Inga bolag finns än. Skriv ett namn för att skapa det första.</p>
            )}
          </>
        )}
      </div>
    </Ark>
  );
}
