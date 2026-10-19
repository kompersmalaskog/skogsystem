'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Ikon from '@/components/design/Ikon';
import Manadsvaljare from '@/components/design/Manadsvaljare';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Tillstand from '@/components/design/Tillstand';
import VyKolumn from '@/components/design/VyKolumn';
import { AVSTAND, FARG, FONT, IKON, INAKTIV, KNAPP, KOLUMN_CSS, ROT_MIN_HOJD, TYP, VY_ROT, designCss } from '@/lib/design/tokens';
import { hamtaObjektForManad, hamtaPoster, type ObjektRad, type Post } from '@/lib/objekt/data';
import { importeraTraktfil, type ImportUtfall } from '@/lib/objekt/importTraktfil';
import { lasManadUrl, manadEtikett, stegaManad, type Manad } from '@/lib/objekt/manad';
import { bestalltSumma, lageText, rubrikTal, inlagtSumma, TYPER, visadVolym, fmtM3, type ObjektTyp } from '@/lib/objekt/tackning';
import { saknas, tillstandId, TILLSTAND_TEXT, type TillstandId } from '@/lib/objekt/tillstand';
import BestallningArk from './BestallningArk';
import ManuellArk from './ManuellArk';

type Lage = { lage: 'laddar' } | { lage: 'fel'; text: string } | { lage: 'klar'; objekt: ObjektRad[]; poster: Post[] };

/** Tillståndsordet och dess färg: ordet bär betydelsen, färgen förstärker den. Klart är dämpat (hela raden), inte en egen färg. */
const TILLSTAND_FARG: Record<TillstandId, string> = {
  vantar: FARG.orange, planerad: FARG.text, igang: FARG.gron, klar: FARG.text2, okant: FARG.orange,
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
    return Promise.all([hamtaObjektForManad(manad), hamtaPoster(manad)])
      .then(([objekt, poster]) => ({ lage: 'klar', objekt, poster }) as const)
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

  const perTyp = TYPER.map(t => {
    const rader = objekt.filter(o => o.typ === t.id);
    const bestallt = bestalltSumma(poster.filter(p => p.typ === t.id));
    const inlagt = inlagtSumma(rader);
    return { ...t, rader, bestallt, inlagt, lage: lageText(inlagt, bestallt) };
  });
  const inlagtPerTyp = Object.fromEntries(perTyp.map(t => [t.id, t.inlagt])) as Record<ObjektTyp, number>;
  const antalPerTyp = Object.fromEntries(perTyp.map(t => [t.id, t.rader.length])) as Record<ObjektTyp, number>;
  const forvaldTyp = (perTyp.find(t => !t.lage.fylld) ?? perTyp[0]).id;
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
          <div style={{ display: 'flex', justifyContent: 'center' }}>
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
          {lage.lage === 'klar' && perTyp.map(t => (
            <Sektion key={t.id} rubrik={t.namn} hoger={rubrikTal(t.inlagt, t.bestallt)} onRubrikTryck={() => setArk('bestallning')}>
              {t.rader.length === 0 && (
                <p style={{ ...TYP.text, color: FARG.text2, margin: 0, padding: `${AVSTAND.m}px 0` }}>
                  Inga objekt inlagda i {manadEtikett(manad).toLowerCase()}. Importera en traktfil så dyker de upp här.
                </p>
              )}
              {t.rader.map(o => <ObjektListRad key={o.id} o={o} manadParam={manadParam} />)}
              <Rad
                titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}>
                  {t.lage.fylld && <Ikon namn="check_circle" fylld storlek={IKON.rad} farg={FARG.gron} />}
                  {t.lage.text}
                </span>}
                sista attr={{ 'data-lage': '' }} />
            </Sektion>
          ))}
        </Tillstand>
      </VyKolumn>

      {ark === 'bestallning' && klar && (
        <BestallningArk manad={manad} poster={poster} inlagt={inlagtPerTyp} antalObjekt={antalPerTyp}
          onStang={() => setArk(null)} onSparad={text => { setArk(null); setKvitto(text); laddaOmTyst(); }} />
      )}
      {ark === 'manuell' && (
        <ManuellArk manad={manad} forvaldTyp={forvaldTyp}
          bolagFor={typ => poster.find(p => p.typ === typ)?.bolag ?? poster[0]?.bolag ?? null}
          onStang={() => setArk(null)} onSparad={text => { setArk(null); setKvitto(text); laddaOmTyst(); }} />
      )}
    </div>
  );
}

function ObjektListRad({ o, manadParam }: { o: ObjektRad; manadParam: string }) {
  const id = tillstandId(o.status);
  const sak = saknas(o);
  const saknarVolym = !(typeof o.volym === 'number' && o.volym > 0);
  return (
    <Rad
      titel={o.namn}
      dampad={id === 'klar'}
      href={`/objekt/${o.id}${manadParam}`}
      hoger={saknarVolym ? <span style={{ color: FARG.orange }}>saknas</span> : fmtM3(visadVolym(o.volym))}
      under={
        <>
          <span style={{ color: TILLSTAND_FARG[id] }}>{TILLSTAND_TEXT[id]}</span>
          {sak.filter(s => s !== 'saknar volym').map(s => <span key={s} style={{ color: FARG.orange }}>{' · '}{s}</span>)}
        </>
      }
      attr={{ 'data-objekt': o.id, 'data-tillstand': id }}
    />
  );
}
