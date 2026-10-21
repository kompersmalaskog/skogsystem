'use client';

// Lägg till något på en plats. Obligatoriskt först, valfritt sist och märkt "valfritt".
//
//   1. Namnet. Medan man skriver föreslås det som redan finns — väljer man det skapas bara en rad på platsen, så samma
//      sak inte läggs upp två gånger.
//   2. Hur den hålls koll på: "Bara var den finns" (förvalt — verktyg, reservdelar), "Två lådor" (förbrukning: beställ
//      när reservlådan påbörjas, skanna QR-koden på den — ingen räknar) eller "Räknas" (antal och minnivå).
//      En befintlig förbrukningsartikel väljer bara mellan Två lådor och Räknas för den här platsen.
//   3. Plats (bara när arket öppnats utan plats, från sökningens "Lägg till den där den ligger").
//   4. Valfritt: hylla, reservdel till maskin + sitter på (hydraulslangar), artikelnummer.

import { useMemo, useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import TalRad from '@/components/design/TalRad';
import { INAKTIV, KNAPP } from '@/lib/design/tokens';
import { skapaArtikel, skapaRad } from '@/lib/inventarier/data';
import type { Artikel, ArtikelTyp, Inventarier } from '@/lib/inventarier/typer';
import { artikelForslag, artikelTitel, heltal, maskinNamn, sitterPaForslag } from '@/lib/inventarier/vy';
import { ArkFel, ValRad } from './delar';
import { MIN_FORKLARING } from './RadArk';

type Vy = 'form' | 'maskin' | 'plats';
/** Hur raden hålls koll på. Två lådor och Räknas är båda förbrukning. */
type Lage = 'utrustning' | 'tva_lador' | 'raknas';

type Props = {
  inv: Inventarier;
  /** Platsen man står i. Utan plats väljs den i arket. */
  platsId: string | null;
  startNamn?: string;
  onStang: () => void;
  onKlar: (kvitto: string) => void;
};

export default function LaggTillArk({ inv, platsId: startPlats, startNamn = '', onStang, onKlar }: Props) {
  const [vy, setVy] = useState<Vy>('form');
  const [namn, setNamn] = useState(startNamn);
  const [vald, setVald] = useState<Artikel | null>(null);
  const [lage, setLage] = useState<Lage>('utrustning');
  const [antal, setAntal] = useState('');
  const [minAntal, setMinAntal] = useState('');
  const [platsId, setPlatsId] = useState<string | null>(startPlats);
  const [hylla, setHylla] = useState('');
  const [maskinId, setMaskinId] = useState<string | null>(null);
  const [sitterPa, setSitterPa] = useState('');
  const [artikelnr, setArtikelnr] = useState('');
  const [fel, setFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);

  const typ: ArtikelTyp = lage === 'utrustning' ? 'utrustning' : 'forbrukning';
  const effektivTyp: ArtikelTyp = vald ? vald.typ : typ;
  // En befintlig förbrukningsartikel: Två lådor eller Räknas (aldrig "bara var den finns").
  const effektivtLage: Lage = effektivTyp === 'utrustning' ? 'utrustning' : lage === 'raknas' ? 'raknas' : 'tva_lador';
  const forbrukning = effektivtLage === 'raknas';
  const plats = platsId ? inv.platser.find(p => p.id === platsId) ?? null : null;
  const maskin = maskinId ? inv.maskiner.find(m => m.maskin_id === maskinId) ?? null : null;

  const forslag = useMemo(() => (vald ? [] : artikelForslag(inv.artiklar, namn)), [vald, inv.artiklar, namn]);
  const sitterForslag = vald ? [] : sitterPaForslag(inv.artiklar, maskinId, sitterPa);
  const finnsRedanHar = !!(vald && platsId && inv.rader.some(r => r.artikel_id === vald.id && r.plats_id === platsId));

  const nyttAntal = heltal(antal);
  const nyttMin = minAntal.trim() === '' ? null : heltal(minAntal);
  const giltigt = !!namn.trim() && !!platsId && !finnsRedanHar
    && (!forbrukning || (nyttAntal != null && (minAntal.trim() === '' || nyttMin != null)));

  async function korLaggTill() {
    if (!giltigt || !platsId) return;
    setSparar(true); setFel(null);
    let artikel = vald;
    if (!artikel) {
      const t = (s: string) => s.trim() || null;
      const s = await skapaArtikel({
        namn: namn.trim(), typ, maskin_id: maskinId, sitter_pa: t(sitterPa), artikelnr: t(artikelnr), leverantor: null,
      });
      if (!s.ok) { setSparar(false); setFel(s.fel); return; }
      artikel = s.varde;
    }
    const r = await skapaRad({
      artikel_id: artikel.id,
      plats_id: platsId,
      hylla: hylla.trim() || null,
      antal: forbrukning ? nyttAntal : null,
      min_antal: forbrukning ? nyttMin : null,
      tva_lador: effektivtLage === 'tva_lador',
    });
    setSparar(false);
    if (!r.ok) { setFel(r.fel); return; }
    onKlar(`${artikelTitel(artikel)} tillagd i ${plats?.namn ?? 'platsen'}`);
  }

  const tillbaka = () => { setFel(null); if (vy === 'form') onStang(); else setVy('form'); };

  const fot = vy === 'form' ? (
    <button type="button" onClick={korLaggTill} data-testid="lagg-till"
      style={{ ...KNAPP.primar, ...((!giltigt || sparar) ? INAKTIV : null) }}>
      {sparar ? 'Sparar…' : 'Lägg till'}
    </button>
  ) : undefined;

  return (
    <Ark rubrik={vy === 'maskin' ? 'Till maskin' : vy === 'plats' ? 'Plats' : 'Lägg till'} onStang={tillbaka} fot={fot}>
      {vy === 'form' && (
        <>
          {vald ? (
            <Sektion rubrik="Finns redan" kort={false}>
              <Rad titel={artikelTitel(vald)} under={vald.typ === 'forbrukning' ? 'Förbrukning' : 'Bara var den finns'}
                hoger="Byt" onTryck={() => { setVald(null); setNamn(vald.namn); }} pil={false} sista />
            </Sektion>
          ) : (
            <Falt etikett="Vad är det?" value={namn} onChange={setNamn} placeholder="Mutterknackare" autoFocus />
          )}
          {forslag.length > 0 && (
            <Sektion rubrik="Finns redan" kort={false} not="Välj den, så läggs den inte upp två gånger.">
              {forslag.map((a, i) => (
                <Rad key={a.id} titel={artikelTitel(a)} under={a.typ === 'forbrukning' ? 'Förbrukning' : 'Bara var den finns'}
                  onTryck={() => { setVald(a); setNamn(a.namn); }} pil={false} sista={i === forslag.length - 1}
                  attr={{ 'data-forslag': a.id }} />
              ))}
            </Sektion>
          )}
          {finnsRedanHar && <ArkFel fel={`${artikelTitel(vald!)} finns redan i ${plats?.namn}. Öppna den raden i stället.`} />}

          {(!vald || vald.typ === 'forbrukning') && (
            <Sektion rubrik="Hur håller vi koll?" kort={false}>
              {!vald && (
                <ValRad titel="Bara var den finns" under="Verktyg och reservdelar — inget antal" vald={effektivtLage === 'utrustning'}
                  onTryck={() => setLage('utrustning')} attr={{ 'data-typ': 'utrustning' }} />
              )}
              <ValRad titel="Två lådor" under="Beställ när reservlådan påbörjas — skanna koden på den" vald={effektivtLage === 'tva_lador'}
                onTryck={() => setLage('tva_lador')} attr={{ 'data-typ': 'tva_lador' }} />
              <ValRad titel="Räknas" under="Antal och minnivå — tryck Tog 1 varje gång" vald={effektivtLage === 'raknas'}
                onTryck={() => setLage('raknas')} sista attr={{ 'data-typ': 'forbrukning' }} />
            </Sektion>
          )}

          {forbrukning && (
            <Sektion rubrik="Antal" kort={false}>
              <TalRad etikett="Antal" value={antal} onChange={setAntal}
                under={antal.trim() !== '' && nyttAntal == null ? 'Skriv ett heltal' : 'kvar här nu'}
                underTon={antal.trim() !== '' && nyttAntal == null ? 'orange' : 'dampad'} attr={{ 'data-falt': 'antal' }} />
              <TalRad etikett="Minnivå" value={minAntal} onChange={setMinAntal} sista
                under={minAntal.trim() !== '' && nyttMin == null ? 'Skriv ett heltal' : MIN_FORKLARING}
                underTon={minAntal.trim() !== '' && nyttMin == null ? 'orange' : 'dampad'} attr={{ 'data-falt': 'min' }} />
            </Sektion>
          )}

          {!startPlats && (
            <Sektion rubrik="Var ligger den?" kort={false}>
              <Rad titel="Plats" hoger={plats?.namn ?? 'Välj'} onTryck={() => setVy('plats')} sista />
            </Sektion>
          )}

          <Falt etikett="Hylla (valfritt)" value={hylla} onChange={setHylla} placeholder="3" />
          {!vald && (
            <>
              <Sektion rubrik="Reservdel till maskin (valfritt)" kort={false}>
                <Rad titel="Till maskin" hoger={maskinNamn(maskin) ?? 'Ingen särskild'} onTryck={() => setVy('maskin')} sista />
              </Sektion>
              <Falt etikett="Sitter på (valfritt)" value={sitterPa} onChange={setSitterPa} placeholder="Hjularm vänster" />
              {sitterForslag.length > 0 && (
                <Sektion rubrik="Skrivet förut" kort={false}>
                  {sitterForslag.map((f, i) => <Rad key={f} titel={f} onTryck={() => setSitterPa(f)} pil={false} sista={i === sitterForslag.length - 1} />)}
                </Sektion>
              )}
              <Falt etikett="Artikelnummer (valfritt)" value={artikelnr} onChange={setArtikelnr} />
            </>
          )}
          <ArkFel fel={fel} />
        </>
      )}

      {vy === 'maskin' && (
        <Sektion rubrik="Maskin" kort={false}>
          <ValRad titel="Ingen särskild" vald={maskinId == null} onTryck={() => { setMaskinId(null); setVy('form'); }} />
          {inv.maskiner.filter(m => m.aktiv).map((m, i, alla) => (
            <ValRad key={m.maskin_id} titel={maskinNamn(m)} vald={maskinId === m.maskin_id}
              onTryck={() => { setMaskinId(m.maskin_id); setVy('form'); }} sista={i === alla.length - 1} />
          ))}
        </Sektion>
      )}

      {vy === 'plats' && (
        <Sektion rubrik="Plats" kort={false}>
          {inv.platser.filter(p => p.aktiv).map((p, i, alla) => (
            <ValRad key={p.id} titel={p.namn} vald={platsId === p.id}
              onTryck={() => { setPlatsId(p.id); setVy('form'); }} sista={i === alla.length - 1} attr={{ 'data-plats': p.id }} />
          ))}
        </Sektion>
      )}
    </Ark>
  );
}
