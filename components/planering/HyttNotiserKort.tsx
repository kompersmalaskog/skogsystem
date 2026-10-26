'use client';
// Notiser i hytten — kortet i Inställningar (bara maskindatorn). Svaret först: är maskinen redo? Sedan raderna som visar varför inte, knappen som skickar en testnotis,
// och brytaren för fara, besök och område. Brytaren är PÅ från start på en maskin (ingen ska behöva slå på den); testnotisen är kvar för den som vill se hur en notis ser ut.
//
// Testnotisen väntar TEST_FORDROJNING_S sekunder innan den skickas, så att föraren hinner byta till ett annat program — notisen är till för när appen INTE är framme.
// Svaren från notisen (Uppfattat, Öppna kartan) kommer som meddelanden från service workern (public/sw.js) och sparas på enheten.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, KNAPP, TNUM, TYP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Svarsrad from '@/components/design/Svarsrad';
import { lasFonsterLage } from '@/lib/hytt/notisFonster';
import { hamtaEnhetMaskin } from '@/lib/enhetMaskin';
import { lasHyttNotiserPa, lasTestResultat, sparaHyttNotiserPa, sparaTestResultat, type TestResultat } from '@/lib/hytt/notisInstallning';
import { arInstallerad, beOmBehorighet, notisStod, stangHyttNotiser, visaHyttNotis } from '@/lib/hytt/notisVisa';
import { testNotis } from '@/lib/hytt/notiser';
import { byggRapport, svarsrubrik, testRader, type RapportRad } from '@/lib/hytt/notisRapport';

export const TEST_FORDROJNING_S = 10;

const STATUS_ORD: Record<RapportRad['status'], string> = { ok: 'Ok', fixa: 'Fixa', kolla: 'Kolla själv' };

async function swStatus(): Promise<{ aktiv: boolean; prenumeration: boolean }> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return { aktiv: false, prenumeration: false };
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg?.pushManager ? await reg.pushManager.getSubscription().catch(() => null) : null;
    return { aktiv: !!reg?.active, prenumeration: !!sub };
  } catch { return { aktiv: false, prenumeration: false }; }
}

export default function HyttNotiserKort() {
  const [rapport, setRapport] = useState<RapportRad[]>(() => byggRapport({ stods: false, installerad: false, behorighet: 'saknas', swAktiv: false }));
  const [test, setTest] = useState<TestResultat>({});
  const [pa, setPa] = useState(false);
  const [nedrakning, setNedrakning] = useState<number | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const lasRapport = useCallback(async () => {
    const s = notisStod();
    const sw = await swStatus();
    setRapport(byggRapport({ stods: s.stods, installerad: arInstallerad(), behorighet: s.behorighet, swAktiv: sw.aktiv, maskin: hamtaEnhetMaskin() != null, pushPrenumeration: sw.prenumeration }));
  }, []);

  useEffect(() => {
    void lasRapport();
    setTest(lasTestResultat());
    setPa(lasHyttNotiserPa());
    // Svar från notisen: service workern berättar (Uppfattat / Öppna kartan). Sparas direkt, så resultatet finns även om fönstret var nedminimerat.
    const vidMeddelande = (e: MessageEvent) => {
      const d = e.data as { typ?: string; test?: boolean; tid?: number } | null;
      if (!d) return;
      if (d.typ === 'hytt-uppfattat' && d.test) { const n = { ...lasTestResultat(), uppfattat: d.tid ?? Date.now() }; sparaTestResultat(n); setTest(n); }
      if (d.typ === 'hytt-testnotis-oppnad') { const n = { ...lasTestResultat(), oppnad: d.tid ?? Date.now() }; sparaTestResultat(n); setTest(n); }
    };
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    sw?.addEventListener('message', vidMeddelande);
    // Läser om rapporten när fönstret blir synligt (tillståndet kan ha ändrats i Chromes inställningar).
    const vidSynlig = () => { if (document.visibilityState === 'visible') { void lasRapport(); setTest(lasTestResultat()); } };
    document.addEventListener('visibilitychange', vidSynlig);
    return () => {
      sw?.removeEventListener('message', vidMeddelande);
      document.removeEventListener('visibilitychange', vidSynlig);
      if (timer.current) clearInterval(timer.current);
    };
  }, [lasRapport]);

  const tillat = async () => {
    setFel(null);
    const b = await beOmBehorighet();
    if (b !== 'granted') setFel(b === 'denied' ? 'Notiser är blockerade i Chrome. Tillåt dem via lås-symbolen vid adressen.' : 'Notiser tillåts inte just nu.');
    await lasRapport();
  };

  const skickaTest = () => {
    setFel(null);
    if (timer.current) clearInterval(timer.current);
    setNedrakning(TEST_FORDROJNING_S);
    let kvar = TEST_FORDROJNING_S;
    timer.current = setInterval(async () => {
      kvar -= 1;
      if (kvar > 0) { setNedrakning(kvar); return; }
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setNedrakning(null);
      const lage = lasFonsterLage();
      const ok = await visaHyttNotis(testNotis('/planering'));
      if (!ok) { setFel('Notisen kunde inte visas. Kontrollera raderna ovan.'); return; }
      const n: TestResultat = { skickad: Date.now(), lage };   // nytt test: gamla svar nollas
      sparaTestResultat(n);
      setTest(n);
    }, 1000);
  };

  const stangTest = () => { void stangHyttNotiser(['hytt-test']); };

  const andraPa = (nytt: boolean) => { sparaHyttNotiserPa(nytt); setPa(nytt); };

  const { rubrik, avvikelse } = svarsrubrik(rapport);
  const behorighetFixa = rapport.find((r) => r.id === 'tillstand')?.status === 'fixa';
  const kanTilllata = notisStod().behorighet === 'default';
  const kanTesta = rapport.filter((r) => r.id !== 'maskin' && r.id !== 'push').every((r) => r.status !== 'fixa');
  const rader = testRader(test);

  return (
    <div data-testid="hytt-notiser-kort" style={{ marginBottom: AVSTAND.xl }}>
      <Svarsrad rubrik={rubrik} avvikelse={avvikelse}
        rad="Windows-notiser när fara, besök eller område kommer och appen inte är framme."
        varning={fel} />

      <Sektion rubrik="Maskinen">
        {rapport.map((r, i) => (
          <Rad key={r.id} titel={r.rubrik} under={r.text} hoger={STATUS_ORD[r.status]} sista={i === rapport.length - 1}
            attr={{ 'data-testid': `hytt-rapport-${r.id}`, 'data-status': r.status }} />
        ))}
      </Sektion>

      {kanTilllata && behorighetFixa && (
        <button type="button" data-testid="hytt-tillat" onClick={tillat} style={{ ...KNAPP.sekundar, marginBottom: AVSTAND.l }}>Tillåt notiser</button>
      )}

      <Sektion rubrik="Testa" not={`Tryck, byt sedan till ett annat program. Notisen kommer efter ${TEST_FORDROJNING_S} sekunder.`}>
        <div style={{ padding: `${AVSTAND.m}px 0` }}>
          <button type="button" data-testid="hytt-skicka-test" onClick={skickaTest} disabled={!kanTesta || nedrakning != null}
            style={{ ...KNAPP.sekundar, opacity: !kanTesta || nedrakning != null ? 0.4 : 1 }}>
            {nedrakning != null ? <span style={TNUM}>Skickar om {nedrakning} s…</span> : 'Skicka testnotis'}
          </button>
          {rader.length > 0 && (
            <div data-testid="hytt-test-resultat" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>
              {rader.map((t) => <div key={t}>{t}</div>)}
              <button type="button" onClick={stangTest} style={{ ...KNAPP.tertiar, marginTop: AVSTAND.xs }}>Stäng testnotisen</button>
            </div>
          )}
        </div>
      </Sektion>

      <Sektion rubrik="Använd i hytten"
        not="Fara, besök och område ger notis när appen inte är framme. Besök kommer också när appen är minimerad. Appen fungerar som förut utan.">
        <Rad titel="Notiser i hytten" under={pa ? 'På – den här datorn' : 'Av'}
          hoger={
            <button type="button" role="switch" aria-checked={pa} data-testid="hytt-brytare"
              onClick={() => andraPa(!pa)}
              style={{ ...KNAPP.tertiar, color: pa ? FARG.gron : FARG.text2 }}>
              {pa ? 'Stäng av' : 'Slå på'}
            </button>
          } sista />
      </Sektion>
    </div>
  );
}
