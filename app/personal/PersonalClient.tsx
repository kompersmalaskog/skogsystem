'use client';
// Personal — "Är alla nåbara och behöriga?" (omtag 2026-11-01, bygginstruktionen i projektet "Personal vyn").
//
// Admin: listan och en person. Förare: bara sin egen sida ("Mina uppgifter").
// Bredd, samma brytpunkter som Arbetsrapport (CLAUDE.md "Bredd — Kolumnen"):
//  - under 1000 px: EN sak per skärm — listan, eller personen med "‹ Personal" (KOLUMN.smal från 670 px);
//  - från 1000 px: listan till vänster (320 px), personen till höger (högst KOLUMN.smal), som Mail.
// Vald person står i adressen (?p=<id>) så att en länk och en omladdning landar rätt.
//
// Ägarskap: telefon och anhörig ägs här. Utbildning (utbildning_status) och ledighet (ledighet_ansokningar)
// ägs av sina vyer — här står bara en rad om dem. Lön, adress, roll och maskin ändras i Admin › Medarbetare.
import { useCallback, useEffect, useState } from 'react';
import AndraArk from '@/components/personal/AndraArk';
import MatArk from '@/components/personal/MatArk';
import PersonLista from '@/components/personal/PersonLista';
import PersonSida from '@/components/personal/PersonSida';
import VyKolumn from '@/components/design/VyKolumn';
import {
  AVSTAND, FARG, KNAPP, KOLUMN, KOLUMN_CSS, LAYOUT, RADIE, ROT_MIN_HOJD, TYP, VY_ROT, designCss, medSafeBotten,
} from '@/lib/design/tokens';
import { antalAttGora, behoverAtgard, type Person, type Skyddsombud } from '@/lib/personal';

/** Från den här fönsterbredden står listan och personen bredvid varandra. Samma tal som Arbetsrapportens sidomeny. */
export const PERSONAL_DELAD_FRAN_PX = 1000;
const LISTA_BREDD_PX = 320;

// Selektorer utan citattecken: React escapar dem i <style> vid serverrendering (CLAUDE.md, Markägarrapport).
const PERSONAL_CSS = `
.ps-rad { margin: 0 -${AVSTAND.l}px; padding: 0 ${AVSTAND.l}px; }
@media (max-width: ${PERSONAL_DELAD_FRAN_PX - 1}px) {
  .ps-ram[data-vy=person] .ps-lista { display: none; }
  .ps-ram[data-vy=lista] .ps-person { display: none; }
}
@media (min-width: ${PERSONAL_DELAD_FRAN_PX}px) {
  .ps-ram { display: grid; grid-template-columns: ${LISTA_BREDD_PX}px minmax(0, ${KOLUMN.smal}px); gap: ${AVSTAND.xxl}px; justify-content: center; align-items: start; }
  .ps-lista { position: sticky; top: ${LAYOUT.topbar}; max-height: calc(100vh - ${LAYOUT.topbar}); overflow-y: auto; }
  .ps-tillbaka { display: none; }
  .ps-vald { background: ${FARG.upphojt}; border-radius: ${RADIE.kort}px; }
}
`;

type Data = { arAdmin: boolean; egenId: string | null; skyddsombud: Skyddsombud | null; personal: Person[] };

function lasValdUrAdress(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('p');
}

function skrivAdress(id: string | null, satt: 'push' | 'replace') {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('p', id); else url.searchParams.delete('p');
  window.history[satt === 'push' ? 'pushState' : 'replaceState'](null, '', url.toString());
}

export default function PersonalClient() {
  const [data, setData] = useState<Data | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState(false);
  const [vald, setVald] = useState<string | null>(null);
  const [andrar, setAndrar] = useState(false);
  const [matAndrar, setMatAndrar] = useState(false);

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(false);
    try {
      const r = await fetch('/api/personal', { cache: 'no-store' });
      const body = await r.json();
      if (!r.ok || !body.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setData({ arAdmin: !!body.arAdmin, egenId: body.egenId ?? null, skyddsombud: body.skyddsombud ?? null, personal: body.personal ?? [] });
    } catch (e) {
      console.error('[personal] hämta', e);
      setFel(true);
    }
    setLaddar(false);
  }, []);

  useEffect(() => {
    setVald(lasValdUrAdress());
    hamta();
    const tillbaka = () => setVald(lasValdUrAdress());
    window.addEventListener('popstate', tillbaka);
    return () => window.removeEventListener('popstate', tillbaka);
  }, [hamta]);

  const valj = (id: string) => { setVald(id); skrivAdress(id, 'push'); window.scrollTo(0, 0); };
  const tillListan = () => { setVald(null); skrivAdress(null, 'replace'); };

  const rot = { ...VY_ROT, minHeight: ROT_MIN_HOJD, paddingBottom: medSafeBotten(AVSTAND.xxl) };
  const stil = <style>{designCss}{KOLUMN_CSS}{PERSONAL_CSS}</style>;

  if (laddar && !data) {
    return <div style={rot}>{stil}<VyKolumn><Besked text="Hämtar personalen…" /></VyKolumn></div>;
  }
  if (fel || !data) {
    return (
      <div style={rot}>{stil}
        <VyKolumn>
          <Besked text="Kunde inte hämta personalen. Kontrollera nätet och försök igen." />
          <button type="button" onClick={hamta} style={KNAPP.sekundar} data-forsok-igen>Försök igen</button>
        </VyKolumn>
      </div>
    );
  }

  const { arAdmin, egenId, skyddsombud, personal } = data;

  // ── Föraren: bara sin egen sida ──
  if (!arAdmin) {
    const jag = personal[0];
    return (
      <div style={rot}>{stil}
        <VyKolumn>
          {jag
            ? <PersonSida person={jag} arAdmin={false} arJag onAndra={() => setAndrar(true)} onAndraMat={() => setMatAndrar(true)} />
            : <Besked text="Din rad saknas i personalregistret. Be en admin lägga till dig i Admin › Medarbetare." />}
        </VyKolumn>
        {andrar && jag && <AndraArk person={jag} arJag onStang={() => setAndrar(false)} onSparad={() => { setAndrar(false); hamta(); }} />}
        {matAndrar && jag && <MatArk person={jag} arJag onStang={() => setMatAndrar(false)} onSparad={() => { setMatAndrar(false); hamta(); }} />}
      </div>
    );
  }

  // ── Admin ──
  if (personal.length === 0) {
    return <div style={rot}>{stil}<VyKolumn><Besked text="Inga medarbetare. Lägg till i Admin › Medarbetare." /></VyKolumn></div>;
  }

  // På stor skärm står alltid en person bredvid listan: den valda, annars den första som behöver något, annars den första.
  const nu = new Date();
  const valdPerson = vald ? personal.find((p) => p.id === vald) ?? null : null;
  const visad = valdPerson ?? personal.find((p) => behoverAtgard(p, nu)) ?? personal[0];
  const arJag = visad.id === egenId;

  return (
    <div style={rot}>{stil}
      <div className="ps-ram" data-vy={valdPerson ? 'person' : 'lista'} data-antal-atgard={antalAttGora(personal, nu)}>
        <div className="ps-lista">
          <VyKolumn>
            <PersonLista personal={personal} skyddsombud={skyddsombud} valdId={visad.id} onValj={valj} />
          </VyKolumn>
        </div>
        <div className="ps-person">
          <VyKolumn>
            <PersonSida person={visad} arAdmin arJag={arJag} onAndra={() => setAndrar(true)} onAndraMat={() => setMatAndrar(true)} onTillbaka={tillListan} />
          </VyKolumn>
        </div>
      </div>
      {andrar && <AndraArk key={visad.id} person={visad} arJag={arJag} onStang={() => setAndrar(false)} onSparad={() => { setAndrar(false); hamta(); }} />}
      {matAndrar && <MatArk key={visad.id} person={visad} arJag={arJag} onStang={() => setMatAndrar(false)} onSparad={() => { setMatAndrar(false); hamta(); }} />}
    </div>
  );
}

function Besked({ text }: { text: string }) {
  return <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.xl}px 0 ${AVSTAND.l}px` }} role="status">{text}</p>;
}
