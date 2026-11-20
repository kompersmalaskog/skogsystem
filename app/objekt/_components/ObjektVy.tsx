'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Ikon from '@/components/design/Ikon';
import Manadsvaljare from '@/components/design/Manadsvaljare';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Tillstand from '@/components/design/Tillstand';
import VyKolumn from '@/components/design/VyKolumn';
import { AVSTAND, FARG, FONT, IKON, INAKTIV, KNAPP, KOLUMN_CSS, ROT_MIN_HOJD, TYP, VY_ROT, designCss } from '@/lib/design/tokens';
import { forifyllBolag } from '@/lib/objekt/bolag';
import { attKomplettera, grupperaPerBolag, type Saknas } from '@/lib/objekt/bolagGrupper';
import { hamtaLevandeObjekt, hamtaObjektForManad, hamtaPoster, type ObjektRad, type Post } from '@/lib/objekt/data';
import { importeraTraktfil, type ImportUtfall } from '@/lib/objekt/importTraktfil';
import { lasManadUrl, manadEtikett, stegaManad, type Manad } from '@/lib/objekt/manad';
import { ENHET_M3FUB, fmtM3, rubrikTal, typNamn, visadVolym } from '@/lib/objekt/tackning';
import { saknas, tillstandId, TILLSTAND_TEXT, type TillstandId } from '@/lib/objekt/tillstand';
import BestallningArk from './BestallningArk';
import ManuellArk from './ManuellArk';

type Lage = { lage: 'laddar' } | { lage: 'fel'; text: string } | { lage: 'klar'; objekt: ObjektRad[]; poster: Post[]; levande: ObjektRad[] };

/**
 * Tillståndsordets färg. Orange är RESERVERAT för det som kräver en hand (saknas, fråga, fel): "Väntar på planering" är normaltillståndet för
 * en nyss importerad trakt (3 av 6 oktoberobjekt) — vore det orange betydde orange ingenting. Aktivt (Igång) är grönt, planerat vitt, resten dämpat.
 */
const TILLSTAND_FARG: Record<TillstandId, string> = {
  vantar: FARG.text2, planerad: FARG.text, igang: FARG.gron, klar: FARG.text2, okant: FARG.orange,
};

export default function ObjektVy() {
  // Hooks ligger ALLTID före tidiga returer (skillen: React #310).
  const [manad, setManad] = useState<Manad>(() => lasManadUrl(typeof window === 'undefined' ? '' : window.location.search));
  const [lage, setLage] = useState<Lage>({ lage: 'laddar' });
  const [forsok, setForsok] = useState(0);
  const [ark, setArk] = useState<null | 'bestallning' | 'manuell'>(null);
  const [kvitto, setKvitto] = useState('');
  const [importerar, setImporterar] = useState<string | null>(null);
  const [utfall, setUtfall] = useState<ImportUtfall | null>(null);
  const filRef = useRef<HTMLInputElement>(null);

  const ladda = useCallback((tyst: boolean) => {
    if (!tyst) setLage({ lage: 'laddar' });
    return Promise.all([hamtaObjektForManad(manad), hamtaPoster(manad), hamtaLevandeObjekt()])
      .then(([objekt, poster, levande]) => ({ lage: 'klar', objekt, poster, levande }) as const)
      .catch(e => ({ lage: 'fel', text: e instanceof Error ? e.message : String(e) }) as const);
  }, [manad]);

  useEffect(() => {
    let avbruten = false;
    ladda(false).then(l => { if (!avbruten) setLage(l); });
    return () => { avbruten = true; };
  }, [ladda, forsok]);

  const laddaOmTyst = useCallback(() => { ladda(true).then(l => setLage(l)); }, [ladda]);

  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}?ar=${manad.ar}&manad=${manad.manad}`);
  }, [manad]);

  useEffect(() => {
    if (!kvitto) return;
    const t = setTimeout(() => setKvitto(''), 6000);
    return () => clearTimeout(t);
  }, [kvitto]);

  async function valdFil(e: React.ChangeEvent<HTMLInputElement>) {
    const fil = e.target.files?.[0];
    e.target.value = ''; // samma fil ska kunna väljas igen
    if (!fil) return;
    setUtfall(null);
    setImporterar('Förbereder …');
    const u = await importeraTraktfil(fil, manad, setImporterar);
    setImporterar(null);
    setUtfall(u);
    if (u.slag !== 'fel') laddaOmTyst();
  }

  const klar = lage.lage === 'klar';
  const objekt = klar ? lage.objekt : [];
  const poster = klar ? lage.poster : [];
  const levande = klar ? lage.levande : [];

  // Täckningen PER BOLAG: ett objekt med bolag X räknas mot bolag X:s beställning och aldrig mot någon annans (lib/objekt/bolagGrupper.ts).
  const grupper = grupperaPerBolag(objekt, poster);
  // Det som inte går att placera under ett bolag och en månad räknas inte någonstans — det står sist, med vad som fattas.
  const kompletteras = attKomplettera(levande, objekt);
  const manadParam = `?ar=${manad.ar}&manad=${manad.manad}`;

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD, fontFamily: FONT, WebkitFontSmoothing: 'antialiased', paddingBottom: AVSTAND.xxl }}>
      <style>{designCss}{KOLUMN_CSS}</style>
      <VyKolumn>
        <div style={{ paddingTop: AVSTAND.s }}>
          <Manadsvaljare etikett={manadEtikett(manad)} onBakat={() => setManad(m => stegaManad(m, -1))} onFramat={() => setManad(m => stegaManad(m, 1))} />
        </div>

        <div style={{ paddingTop: AVSTAND.s }}>
          <input ref={filRef} type="file" accept=".envz,.zip" onChange={valdFil} style={{ display: 'none' }} data-importfil="" />
          <button type="button" onClick={() => filRef.current?.click()} disabled={importerar != null}
            style={{ ...KNAPP.primar, ...(importerar != null ? INAKTIV : null) }}>
            <Ikon namn="upload_file" storlek={IKON.rad} farg="inherit" />
            Importera traktfil
          </button>
          {(importerar || utfall) && (
            <p role="status" data-importstatus="" style={{ margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0`, ...TYP.meta, color: !importerar && utfall && utfall.slag !== 'klart' ? FARG.orange : FARG.text2 }}>
              {importerar ?? utfall?.text}
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: AVSTAND.l, flexWrap: 'wrap' }}>
            {/* Beställningen nås också från varje typrubrik, men en månad utan beställning och utan objekt har ingen sådan rubrik. */}
            <button type="button" onClick={() => setArk('bestallning')} style={KNAPP.tertiar} data-bestallning-knapp="" disabled={!klar}>Ändra beställning</button>
            <button type="button" onClick={() => setArk('manuell')} style={KNAPP.tertiar} data-manuellt="">eller lägg in manuellt</button>
          </div>
        </div>

        {kvitto && <p role="status" data-kvitto="" style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>{kvitto}</p>}

        <Tillstand nyckel={lage.lage}>
          {lage.lage === 'laddar' && <p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Läser objekt och beställning …</p>}
          {lage.lage === 'fel' && (
            <div role="alert" style={{ padding: `${AVSTAND.xl}px 0`, textAlign: 'center' }}>
              <p style={{ ...TYP.text, color: FARG.orange, margin: `0 0 ${AVSTAND.s}px` }}>Kunde inte läsa objekten. {lage.text}</p>
              <button type="button" style={KNAPP.lank} onClick={() => setForsok(n => n + 1)}>Försök igen</button>
            </div>
          )}
          {lage.lage === 'klar' && (
            <>
              {grupper.length === 0 && (
                <p style={{ ...TYP.text, color: FARG.text2, margin: 0, padding: `${AVSTAND.m}px 0` }}>
                  Inga beställningar eller objekt med bolag i {manadEtikett(manad).toLowerCase()}. Importera en traktfil, lägg in ett objekt eller skriv in en beställning.
                </p>
              )}
              {grupper.map(g => (
                <div key={g.nyckel} data-bolaggrupp={g.bolag}>
                  <h2 style={{ margin: `${AVSTAND.s}px ${AVSTAND.xs}px ${AVSTAND.m}px`, ...TYP.rubrik, color: FARG.text }}>{g.bolag}</h2>
                  {g.typer.map(t => (
                    <Sektion key={t.typ} rubrik={t.namn} hoger={t.bestallt == null ? 'Ingen beställning' : rubrikTal(t.inlagt, t.bestallt)} onRubrikTryck={() => setArk('bestallning')}>
                      {t.objekt.length === 0 && (
                        <p style={{ ...TYP.text, color: FARG.text2, margin: 0, padding: `${AVSTAND.m}px 0` }}>
                          Inga objekt inlagda för {g.bolag} i {manadEtikett(manad).toLowerCase()}. Importera en traktfil så dyker de upp här.
                        </p>
                      )}
                      {t.objekt.map((o, i) => <ObjektListRad key={o.id} o={o} manadParam={manadParam} sista={t.lage == null && i === t.objekt.length - 1} />)}
                      {t.lage && (
                        <Rad
                          titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}>
                            {t.lage.fylld && <Ikon namn="check_circle" fylld storlek={IKON.rad} farg={FARG.gron} />}
                            {t.lage.text}
                          </span>}
                          sista attr={{ 'data-lage': '' }} />
                      )}
                    </Sektion>
                  ))}
                  {/* GROT har ingen beställning (bestallningar.typ tillåter bara gallring/slutavverkning), så ingen rubrikrad med tal och inget läge. */}
                  {g.grot.length > 0 && (
                    <Sektion rubrik="GROT">
                      {g.grot.map((o, i) => <ObjektListRad key={o.id} o={o} manadParam={manadParam} sista={i === g.grot.length - 1} />)}
                    </Sektion>
                  )}
                </div>
              ))}

              {/* Objekt som inte går att räkna: ingen månad eller inget bolag. Räknas inte i något bolag; vad som fattas står på varje rad. */}
              {kompletteras.length > 0 && (
                <Sektion rubrik={`Behöver kompletteras (${kompletteras.length})`} not="De räknas inte mot någon beställning förrän det som fattas är ifyllt. Öppna ett objekt för att ge det en månad.">
                  {kompletteras.map(({ objekt: o, saknas }, i) => <ObjektListRad key={o.id} o={o} manadParam={manadParam} visaTyp saknasRakna={saknas} sista={i === kompletteras.length - 1} />)}
                </Sektion>
              )}
            </>
          )}
        </Tillstand>
      </VyKolumn>

      {ark === 'bestallning' && klar && (
        <BestallningArk manad={manad} poster={poster} objekt={objekt}
          onStang={() => setArk(null)} onSparad={text => { setArk(null); setKvitto(text); laddaOmTyst(); }} />
      )}
      {ark === 'manuell' && (
        <ManuellArk manad={manad}
          forifyll={typ => forifyllBolag(poster, typ)}
          onStang={() => setArk(null)} onSparad={text => { setArk(null); setKvitto(text); laddaOmTyst(); }} />
      )}
    </div>
  );
}

function ObjektListRad({ o, manadParam, visaTyp, sista, saknasRakna }: { o: ObjektRad; manadParam: string; visaTyp?: boolean; sista?: boolean; saknasRakna?: Saknas[] }) {
  const id = tillstandId(o.status);
  const sak = saknas(o);
  const harBestallning = o.typ === 'gallring' || o.typ === 'slutavverkning';
  const harVolym = typeof o.volym === 'number' && o.volym > 0;
  return (
    <Rad
      titel={o.namn}
      sista={sista}
      href={`/objekt/${o.id}${manadParam}`}
      // Klart är dämpat i TILLSTÅNDSORDET, inte i talet: ett avslutat objekts volym är en del av täckningen och ritas som alla andra.
      hoger={harVolym ? `${fmtM3(visadVolym(o.volym))} ${ENHET_M3FUB}` : harBestallning && !saknasRakna ? <span style={{ color: FARG.orange }}>saknas</span> : undefined}
      under={
        <>
          {visaTyp && <span>{typNamn(o.typ)}{' · '}</span>}
          <span style={{ color: TILLSTAND_FARG[id] }}>{TILLSTAND_TEXT[id]}</span>
          {saknasRakna
            ? <span style={{ color: FARG.orange }} data-saknar="">{' · saknar '}{saknasRakna.join(' · ')}</span>
            : sak.filter(s => s !== 'saknar volym').map(s => <span key={s} style={{ color: FARG.orange }}>{' · '}{s}</span>)}
        </>
      }
      attr={{ 'data-objekt': o.id, 'data-tillstand': id }}
    />
  );
}
