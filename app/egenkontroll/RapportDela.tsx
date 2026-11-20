'use client';

// "Rapport till Vida": A4:n och bilagan som PDF, med forhandsvisning (sida 1) innan man delar. Bara pa en AVSLUTAD runda -
// en rapport pa en pagaende runda ar ett utkast, och det finns ingen anledning att skicka ett utkast till Vida.
//
// BILAGAN HAMTAR ALLA FOTON INNAN FORHANDSVISNINGEN OPPNAS. Gar EN bild inte att hamta sager raden det ("1 av 5 bilder gick
// inte att hamta") och ingen PDF skapas: en bilaga med en lucka dar ett foto skulle vara marks forst nar mottagaren oppnar
// den. Det ar samma princip som vektorkartan (lib/egenkontrollRapportPdf.ts).
//
// Forhandsvisningskomponenten ar helikopterns (app/helikopter/_components/PdfForhandsvisning.tsx) - den ar generell (tar en
// skapa-funktion) och ligger kvar dar tills den flyttas till components/ av ytans agare. Den visar sida 1; hela filen delas.

import { useRef, useState } from 'react';
import Ikon from '@/components/design/Ikon';
import Sektion from '@/components/design/Sektion';
import PdfForhandsvisning from '@/app/helikopter/_components/PdfForhandsvisning';
import { AVSTAND, FARG, RAD, TYP } from '@/lib/design/tokens';
import { signeraFoto } from '@/lib/egenkontrollfoto';
import type { RapportModell } from '@/lib/egenkontrollRapport';
import { skapaBilagaPdf, skapaRapportPdf, type BildData } from '@/lib/egenkontrollRapportPdf';

type Visa = null | 'rapport' | 'bilaga';

async function hamtaBytes(sokvag: string): Promise<BildData | null> {
  const url = await signeraFoto(sokvag);
  if (!url) return null;
  const svar = await fetch(url);
  if (!svar.ok) return null;
  return { bytes: new Uint8Array(await svar.arrayBuffer()), typ: sokvag.toLowerCase().endsWith('.png') ? 'png' : 'jpg' };
}

export default function RapportDela({ modell }: { modell: RapportModell }) {
  const [visa, setVisa] = useState<Visa>(null);
  const [hamtar, setHamtar] = useState<string | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const cache = useRef(new Map<string, BildData>());

  const { bilder } = modell.bilaga;
  const harBilaga = bilder.length > 0 || modell.bilaga.karta.pinnar.length > 0 || modell.bilaga.karta.granser.length > 0;

  const oppnaBilaga = async () => {
    if (hamtar) return;
    setFel(null);
    setHamtar(`Hämtar bilder 0 av ${bilder.length}…`);
    let saknas = 0;
    let klara = 0;
    for (const b of bilder) {
      if (!cache.current.has(b.sokvag)) {
        try {
          const d = await hamtaBytes(b.sokvag);
          if (d) cache.current.set(b.sokvag, d); else saknas += 1;
        } catch { saknas += 1; }
      }
      klara += 1;
      setHamtar(`Hämtar bilder ${klara} av ${bilder.length}…`);
    }
    setHamtar(null);
    if (saknas > 0) {
      setFel(`${saknas} av ${bilder.length} bilder gick inte att hämta. Kontrollera täckningen och försök igen — bilagan skapas inte med luckor.`);
      return;
    }
    setVisa('bilaga');
  };

  const rad = (ikon: string, titel: string, under: string, onClick: () => void, inaktiv = false, sist = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={inaktiv || !!hamtar}
      style={{ ...RAD, width: '100%', background: 'none', border: 'none', color: FARG.text, textAlign: 'left', cursor: 'pointer', opacity: inaktiv ? 0.4 : 1, borderBottom: sist ? 'none' : RAD.borderBottom, gap: AVSTAND.m }}
    >
      <Ikon namn={ikon} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...TYP.listtitel, display: 'block' }}>{titel}</span>
        <span style={{ ...TYP.meta, color: FARG.text2, display: 'block' }}>{under}</span>
      </span>
      <Ikon namn="chevron_right" />
    </button>
  );

  return (
    <>
      <div style={{ marginTop: AVSTAND.xl }}>
        <Sektion rubrik="Rapport till Vida" not={modell.bilaga.utanText > 0
          ? `${modell.bilaga.utanText} ${modell.bilaga.utanText === 1 ? 'foto' : 'foton'} på punkter utan anmärkning och utan kommentar ingår inte i bilagan.`
          : undefined}>
          {rad('description', 'Rapport', 'A4 · antal, avvikelser och din kommentar', () => setVisa('rapport'))}
          {rad(
            'photo_library',
            'Bilaga',
            hamtar ?? (harBilaga ? `Karta${bilder.length > 0 ? ` och ${bilder.length} ${bilder.length === 1 ? 'foto' : 'foton'}` : ''}` : 'Inga foton och inga platser att visa'),
            oppnaBilaga,
            !harBilaga,
            true,
          )}
        </Sektion>
        {fel && (
          <div role="alert" style={{ ...TYP.meta, color: FARG.text, background: 'rgba(255,69,58,0.15)', borderRadius: 10, padding: AVSTAND.m }}>
            {fel}
          </div>
        )}
      </div>

      {visa === 'rapport' && (
        <PdfForhandsvisning
          skapa={() => skapaRapportPdf(modell)}
          filnamn={modell.filnamn}
          titel={`Egenkontroll ${modell.huvud.objektNamn}`}
          onStang={() => setVisa(null)}
        />
      )}
      {visa === 'bilaga' && (
        <PdfForhandsvisning
          skapa={() => skapaBilagaPdf(modell, async (sok) => cache.current.get(sok) ?? null)}
          filnamn={`${modell.filnamn}-bilaga`}
          titel={`Bilaga egenkontroll ${modell.huvud.objektNamn}`}
          onStang={() => setVisa(null)}
        />
      )}
    </>
  );
}
