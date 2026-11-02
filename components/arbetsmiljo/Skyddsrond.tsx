'use client';

// Skyddsronden — svarar på EN fråga: "Har vi gått igenom arbetsmiljön i år, och vad är fel?". Admin och skyddsombudet går den
// tillsammans en gång om året, område för område. Varje punkt: Bra · Brist (vad är fel?) · Gäller inte. En brist blir en åtgärd.
// Punkterna och reglerna: lib/arbetsmiljo/skyddsrond.ts.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { laggMaskinkollFoto } from '@/lib/maskinkoll/fotoKo';
import { fotoSokvag } from '@/lib/maskinkoll/regler';
import { fotoLank } from '@/lib/arbetsmiljo/atgarder';
import Ark from '@/components/design/Ark';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Falt from '@/components/design/Falt';
import PdfForhandsvisning from '@/app/helikopter/_components/PdfForhandsvisning';
import { AVSTAND, FARG, KNAPP, RADIE, ROT_MIN_HOJD, TRAFFYTA, TYP, VY_ROT, designCss, kolumnRot } from '@/lib/design/tokens';
import { datumText } from '@/lib/arbetsmiljo/introduktion';
import {
  antalBesvarade, antalBrister, avsluta, byggPunkter, grupperaPunkter, hamtaRondAtgarder, hamtaRonder, lage, startaRond, svara,
  type Punkt, type Rond, type SvarTyp,
} from '@/lib/arbetsmiljo/skyddsrond';

type Data = { ronder: Rond[]; maskiner: { id: string; namn: string }[] };

const SVAR_TEXT: Record<SvarTyp, string> = { ok: 'Bra', brist: 'Brist', galler_inte: 'Gäller inte' };

/** Bilden på en brist: en ny fil att ladda upp, eller sökvägen som redan är sparad. visa = det som visas (lokal eller signerad länk). */
type Bild = { fil: File | null; sokvag: string | null; visa: string | null };
const INGEN_BILD: Bild = { fil: null, sokvag: null, visa: null };

export default function Skyddsrond() {
  const { medarbetare } = useCurrentMedarbetare();
  const [bild, setBild] = useState<Bild>(INGEN_BILD);
  const [far, setFar] = useState<boolean | null>(null);
  const [data, setData] = useState<Data | null | 'fel'>(null);
  const [visad, setVisad] = useState<string | null>(null);
  const [valt, setValt] = useState<Punkt | null>(null);
  const [brist, setBrist] = useState<string | null>(null);
  const [avslut, setAvslut] = useState(false);
  const [deltagare, setDeltagare] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [pdf, setPdf] = useState(false);

  const hamta = useCallback(async () => {
    try {
      const { data: lasare, error } = await supabase.rpc('ar_am_lasare');
      if (error || typeof lasare !== 'boolean') { setData('fel'); return; }
      setFar(lasare);
      if (!lasare) return;
      const [ronder, m] = await Promise.all([
        hamtaRonder(supabase),
        supabase.from('dim_maskin').select('maskin_id, visningsnamn, aktiv_till'),
      ]);
      if (!ronder || m.error || !Array.isArray(m.data)) { setData('fel'); return; }
      const idag = new Date().toISOString().slice(0, 10);
      const maskiner = (m.data as { maskin_id: string; visningsnamn: string | null; aktiv_till: string | null }[])
        .filter(x => !x.aktiv_till || x.aktiv_till >= idag)
        .map(x => ({ id: x.maskin_id, namn: x.visningsnamn ?? x.maskin_id }))
        .sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
      setData({ ronder, maskiner });
    } catch { setData('fel'); }
  }, []);

  useEffect(() => { hamta(); }, [hamta]);

  const nu = new Date();
  const ok = data && data !== 'fel' ? data : null;
  const l = ok ? lage(ok.ronder, nu) : null;
  const rond = ok ? (visad ? ok.ronder.find(r => r.id === visad) ?? null : l?.typ === 'pagar' ? l.rond : null) : null;
  const last = !!rond?.klar;

  const starta = async () => {
    if (!ok) return;
    setSparar(true); setFel(null);
    const id = await startaRond(supabase, byggPunkter(ok.maskiner));
    setSparar(false);
    if (!id) { setFel('Kunde inte starta ronden. Försök igen.'); return; }
    await hamta();
  };

  const spara = async (svar: SvarTyp) => {
    if (!rond || !valt) return;
    setSparar(true); setFel(null);
    let foto: string | null = svar === 'brist' ? bild.sokvag : null;
    if (svar === 'brist' && bild.fil && medarbetare) {
      foto = fotoSokvag(medarbetare.id, 'skyddsrond', `${rond.id}-${valt.id}`, Date.now());
      // Fotot läggs i kön (sparat lokalt direkt, uppladdat när nätet finns) — samma som maskinkollen.
      try { await laggMaskinkollFoto(rond.id, valt.id, foto, bild.fil); }
      catch { setSparar(false); setFel('Bilden gick inte att läsa. Ta en ny.'); return; }
    }
    const lyckades = await svara(supabase, rond.id, valt, svar, svar === 'brist' ? brist : null, foto);
    setSparar(false);
    if (!lyckades) { setFel('Kunde inte spara. Försök igen.'); return; }
    stangPunkt();
    await hamta();
  };

  const klar = async () => {
    if (!rond) return;
    setSparar(true); setFel(null);
    const f = await avsluta(supabase, rond.id, deltagare);
    setSparar(false);
    if (f) { setFel(f); return; }
    setAvslut(false); setDeltagare('');
    await hamta();
  };

  const stangPunkt = () => { setValt(null); setBrist(null); setBild(INGEN_BILD); };

  const oppnaPunkt = (p: Punkt) => {
    const s = svarFor(p);
    setFel(null);
    setBrist(s?.svar === 'brist' ? s.beskrivning ?? '' : null);
    setBild(s?.svar === 'brist' && s.fotoUrl ? { fil: null, sokvag: s.fotoUrl, visa: null } : INGEN_BILD);
    setValt(p);
    if (s?.svar === 'brist' && s.fotoUrl) {
      const sokvag = s.fotoUrl;
      fotoLank(supabase, sokvag).then(u => setBild(b => (b.sokvag === sokvag && !b.fil ? { ...b, visa: u } : b)));
    }
  };

  const valjBild = (fil: File | undefined) => {
    if (!fil) return;
    setBild({ fil, sokvag: null, visa: URL.createObjectURL(fil) });
  };

  const svarFor = (p: Punkt) => rond?.svar.find(s => s.punkt === p.id) ?? null;

  const svarText = (() => {
    if (far === false) return 'Skyddsronden går arbetsledningen och skyddsombudet.';
    if (data === null) return 'Läser …';
    if (data === 'fel' || !l) return 'Kunde inte läsa skyddsronden.';
    if (rond) {
      const b = antalBrister(rond);
      if (rond.klar) return `Gjord ${datumText(rond.klar)} · ${b === 0 ? 'inga brister' : b === 1 ? '1 brist' : `${b} brister`}`;
      return `${antalBesvarade(rond)} av ${rond.punkter.length} klart`;
    }
    if (l.typ === 'dags') return l.senast ? `Senast ${datumText(l.senast.klar!)} · dags igen` : 'Ingen skyddsrond gjord än';
    if (l.typ === 'ok') return `Gjord ${datumText(l.senast.klar!)} · nästa senast ${datumText(l.nasta)}`;
    return '';
  })();

  const klara = ok ? ok.ronder.filter(r => r.klar) : [];
  const allaSvar = rond ? antalBesvarade(rond) === rond.punkter.length : false;

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD }}>
      <style>{designCss}</style>
      <div style={{ ...kolumnRot('smal'), paddingTop: AVSTAND.l, paddingBottom: `calc(${AVSTAND.xxl}px + env(safe-area-inset-bottom))` }}>
        <header style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
          {visad && <button type="button" data-testid="sr-tillbaka" onClick={() => setVisad(null)} style={{ ...KNAPP.lank, minHeight: TRAFFYTA.min, paddingLeft: 0 }}>‹ Skyddsrond</button>}
          <h1 style={{ margin: 0, ...TYP.titel, color: FARG.text }}>Skyddsrond</h1>
          <div data-testid="sr-svar" style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>{svarText}</div>
          {data === 'fel' && <button type="button" onClick={() => { setData(null); hamta(); }} style={{ ...KNAPP.lank, marginTop: AVSTAND.s }}>Försök igen</button>}
        </header>

        {ok && !rond && (
          <>
            <p style={{ ...TYP.text, color: FARG.text, margin: `0 0 ${AVSTAND.l}px` }}>
              En gång om året går arbetsledningen och skyddsombudet igenom arbetsmiljön tillsammans. Det som är fel blir en åtgärd.
            </p>
            <button type="button" data-testid="sr-starta" disabled={sparar} onClick={starta}
              style={{ ...(l?.typ === 'dags' ? KNAPP.primar : KNAPP.sekundar), width: '100%', marginBottom: AVSTAND.xl }}>
              {sparar ? 'Startar …' : 'Börja skyddsronden'}
            </button>
            {fel && <div role="status" data-testid="sr-fel" style={{ ...TYP.text, color: FARG.orange, marginBottom: AVSTAND.l }}>{fel}</div>}
            {klara.length > 0 && (
              <Sektion rubrik="Tidigare">
                {klara.map((r, i) => {
                  const b = antalBrister(r);
                  return <Rad key={r.id} titel={datumText(r.klar!)} under={[r.deltagare, b === 0 ? 'Inga brister' : b === 1 ? '1 brist' : `${b} brister`].filter(Boolean).join(' · ')}
                    onTryck={() => setVisad(r.id)} sista={i === klara.length - 1} attr={{ 'data-testid': `sr-tidigare-${r.id}` }} />;
                })}
              </Sektion>
            )}
          </>
        )}

        {rond && grupperaPunkter(rond.punkter).map(g => (
          <Sektion key={g.omrade} rubrik={g.namn}>
            {g.punkter.map((p, i) => {
              const s = svarFor(p);
              const under = !s ? undefined
                : s.svar === 'brist' ? <span style={{ color: FARG.orange }}>Brist: {s.beskrivning}{s.fotoUrl ? ' · Bild' : ''}</span>
                : s.svar === 'ok' ? <span style={{ color: FARG.gron }}>Bra</span>
                : 'Gäller inte';
              return <Rad key={p.id} titel={p.text} under={under} onTryck={last ? undefined : () => oppnaPunkt(p)}
                sista={i === g.punkter.length - 1} attr={{ 'data-testid': `sr-punkt-${p.id}` }} />;
            })}
          </Sektion>
        ))}

        {rond && !last && (
          <div style={{ marginTop: AVSTAND.l }}>
            <button type="button" data-testid="sr-klar" disabled={!allaSvar} onClick={() => { setFel(null); setAvslut(true); }}
              style={{ ...KNAPP.primar, width: '100%', ...(allaSvar ? null : { opacity: 0.4 }) }}>Klar med skyddsronden</button>
            {!allaSvar && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s, textAlign: 'center' }}>Svara på alla punkter först</div>}
          </div>
        )}
        {rond?.klar && rond.deltagare && <div style={{ ...TYP.meta, color: FARG.text2 }}>Gick ronden: {rond.deltagare}</div>}
        {rond?.klar && (
          <button type="button" data-testid="sr-pdf" onClick={() => setPdf(true)} style={{ ...KNAPP.sekundar, width: '100%', marginTop: AVSTAND.l }}>
            Dela som PDF
          </button>
        )}
      </div>

      {valt && rond && (
        <Ark rubrik={valt.text} onStang={stangPunkt}
          fot={brist !== null
            ? <>
                <button type="button" data-testid="sr-spara-brist" disabled={sparar || !brist.trim()} onClick={() => spara('brist')}
                  style={{ ...KNAPP.primar, width: '100%', ...(!brist.trim() ? { opacity: 0.4 } : null) }}>{sparar ? 'Sparar …' : 'Spara bristen'}</button>
                {fel && <div role="status" data-testid="sr-fel" style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.s }}>{fel}</div>}
              </>
            : fel ? <div role="status" data-testid="sr-fel" style={{ ...TYP.text, color: FARG.orange }}>{fel}</div> : undefined}>
          <div data-testid="sr-ark" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
            {valt.hjalp && <div style={{ ...TYP.text, color: FARG.text2 }}>{valt.hjalp}</div>}
            {valt.lank && <a href={valt.lank} style={{ ...KNAPP.lank, textDecoration: 'none' }}>Titta i appen ›</a>}
            {brist === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                {(['ok', 'brist', 'galler_inte'] as SvarTyp[]).map(s => (
                  <button key={s} type="button" data-testid={`sr-svar-${s}`} disabled={sparar}
                    onClick={() => (s === 'brist' ? setBrist('') : spara(s))}
                    style={{ ...KNAPP.sekundar, width: "100%" }}>{SVAR_TEXT[s]}</button>
                ))}
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>Vad är fel?</label>
                <textarea data-testid="sr-brist-text" value={brist} onChange={e => setBrist(e.target.value)} rows={3} autoFocus
                  placeholder="T.ex. Protokollet för Giant saknas"
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min * 2, border: 'none', borderRadius: RADIE.rad, background: FARG.fyllning, color: FARG.text, padding: AVSTAND.m, fontFamily: 'inherit', ...TYP.text, outline: 'none', resize: 'vertical' }} />
                <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Blir en åtgärd att göra inom 30 dagar.</div>
                {medarbetare && (bild.fil || bild.sokvag ? (
                  <div data-testid="sr-bild" style={{ marginTop: AVSTAND.l }}>
                    {bild.visa
                      ? <img src={bild.visa} alt="Bild på bristen" style={{ display: 'block', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: RADIE.kort, background: FARG.fyllning }} />
                      : <div style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: RADIE.kort, background: FARG.fyllning }} />}
                    <button type="button" data-testid="sr-bild-bort" onClick={() => setBild(INGEN_BILD)} style={{ ...KNAPP.lank, minHeight: TRAFFYTA.min, paddingLeft: 0 }}>Ta bort bilden</button>
                  </div>
                ) : (
                  <label data-testid="sr-bild-ta" style={{ ...KNAPP.sekundar, width: '100%', marginTop: AVSTAND.l, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', cursor: 'pointer' }}>
                    Ta en bild (valfritt)
                    <input type="file" accept="image/*" capture="environment" data-testid="sr-bild-fil" style={{ display: 'none' }}
                      onChange={e => { valjBild(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                ))}
              </div>
            )}
          </div>
        </Ark>
      )}

      {pdf && rond?.klar && (
        <PdfForhandsvisning
          skapa={async () => {
            const [{ skyddsrondDokument }, { skapaArbetsmiljoPdf }] = await Promise.all([import('@/lib/arbetsmiljo/dokument'), import('@/lib/arbetsmiljo/pdf')]);
            return skapaArbetsmiljoPdf(skyddsrondDokument(rond, await hamtaRondAtgarder(supabase)));
          }}
          filnamn={`skyddsrond-${rond.klar.slice(0, 10)}`}
          titel="Skyddsrond"
          onStang={() => setPdf(false)}
        />
      )}

      {avslut && rond && (
        <Ark rubrik="Klar med skyddsronden" onStang={() => setAvslut(false)}
          fot={<>
            <button type="button" data-testid="sr-avsluta" disabled={sparar || !deltagare.trim()} onClick={klar}
              style={{ ...KNAPP.primar, width: '100%', ...(!deltagare.trim() ? { opacity: 0.4 } : null) }}>{sparar ? 'Sparar …' : 'Spara skyddsronden'}</button>
            {fel && <div role="status" data-testid="sr-fel" style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.s }}>{fel}</div>}
          </>}>
          <Falt etikett="Vilka gick ronden?" value={deltagare} onChange={setDeltagare} placeholder="T.ex. Martin och Oskar (skyddsombud)" autoFocus
            stod={`${antalBrister(rond) === 0 ? 'Inga brister' : antalBrister(rond) === 1 ? '1 brist blir en åtgärd' : `${antalBrister(rond)} brister blir åtgärder`}. Ronden går inte att ändra efteråt.`} />
        </Ark>
      )}
    </div>
  );
}
