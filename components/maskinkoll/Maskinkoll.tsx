'use client';

// Maskinkollen — förarens skyddsrond. EN fråga per skärm, Ja/Nej, Nej = foto. Skisserna: canvasen "Arbetsmiljö – skisser" (0–4).
// Spec: Claude Docs "Arbetsmiljö i Skogsystem – spec". Reglerna: lib/maskinkoll/regler.ts. Databasen gör resten (Nej → åtgärd,
// klar först när allt är besvarat + kontrollfoto).
//
// Designbeslut (Martin 2026-10-31):
//  - Ja/Nej är neutrala sekundärknappar — status är aldrig fyllning, rött är brunt i solljus. Frågan bär betydelsen.
//  - Ja/Nej är 56 px (TRAFFYTA.primar + AVSTAND.s) och TYP.rubrik: godkänt avsteg, tolv tryck i rad med handskar.
//  - Ingen "Vet ej". Vet man inte är svaret Nej.
//  - Kollen skapas vid första svaret, inte när vyn öppnas.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Ikon from '@/components/design/Ikon';
import Tillstand from '@/components/design/Tillstand';
import Svarsrad from '@/components/design/Svarsrad';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, KORT, RADIE, ROT_MIN_HOJD, TRAFFYTA, TYP, VY_ROT, designCss, kolumnRot } from '@/lib/design/tokens';
import { avsluta, godkann, hamtaLage, sparaSvar, startaKoll, type MaskinkollLage } from '@/lib/maskinkoll/data';
import { laggMaskinkollFoto } from '@/lib/maskinkoll/fotoKo';
import { datumText, enManadSenare, fotoSokvag, kontrollfotoFor, lage as raknaLage, type Fraga } from '@/lib/maskinkoll/regler';

type Steg = 'laddar' | 'fel' | 'ingenMaskin' | 'inteDags' | 'godkann' | 'fraga' | 'nej' | 'kontroll' | 'klar';

type Lokalt = { ok: boolean; bild: string | null; kommentar: string | null };

const KNAPP_JANEJ = { ...KNAPP.sekundar, minHeight: TRAFFYTA.primar + AVSTAND.s, ...TYP.rubrik };

export default function Maskinkoll() {
  const router = useRouter();
  const [steg, setSteg] = useState<Steg>('laddar');
  const [fel, setFel] = useState<string | null>(null);
  const [data, setData] = useState<MaskinkollLage | null>(null);
  const [kollId, setKollId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [svar, setSvar] = useState<Record<string, Lokalt>>({});
  const [utkast, setUtkast] = useState<{ fil: File | null; bild: string | null; kommentar: string }>({ fil: null, bild: null, kommentar: '' });
  const [kontroll, setKontroll] = useState<{ fil: File | null; bild: string | null }>({ fil: null, bild: null });
  const [sparar, setSparar] = useState(false);
  const [klarTid, setKlarTid] = useState<string | null>(null);
  const kamera = useRef<HTMLInputElement>(null);

  const ladda = useCallback(async () => {
    setSteg('laddar'); setFel(null);
    const r = await hamtaLage(supabase);
    if (!r.ok) { setFel(r.fel); setSteg('fel'); return; }
    if (!r.data) { setSteg('ingenMaskin'); return; }
    const d = r.data;
    if (d.fragor.length === 0) { setFel('Det finns inga frågor för den här maskinen.'); setSteg('fel'); return; }
    setData(d);
    const tidigare: Record<string, Lokalt> = {};
    for (const s of d.pagaende?.svar ?? []) tidigare[s.fraga_id] = { ok: s.ok, bild: null, kommentar: s.kommentar };
    setSvar(tidigare);
    setKollId(d.pagaende?.id ?? null);
    const l = raknaLage(d.fragor, d.pagaende?.svar ?? []);
    setIndex(Math.min(l.forstaObesvarade, d.fragor.length - 1));
    if (!d.godkand) setSteg('godkann');
    else if (!d.pagaende && !d.dags) setSteg('inteDags');
    else setSteg(d.pagaende && l.kvar === 0 ? 'kontroll' : 'fraga');
  }, []);

  useEffect(() => { void ladda(); }, [ladda]);

  const fraga: Fraga | null = data ? data.fragor[index] ?? null : null;
  const antal = data?.fragor.length ?? 0;

  /** Kollen skapas vid första svaret. */
  const sakerKoll = async (): Promise<string | null> => {
    if (kollId) return kollId;
    if (!data) return null;
    const r = await startaKoll(supabase, data.medarbetareId, data.maskin.id);
    if (!r.ok) { setFel(r.fel); return null; }
    setKollId(r.data);
    return r.data;
  };

  const nasta = () => {
    setFel(null);
    setUtkast({ fil: null, bild: null, kommentar: '' });
    if (index + 1 < antal) { setIndex(index + 1); setSteg('fraga'); }
    else setSteg('kontroll');
  };

  const svaraJa = async () => {
    if (!fraga || sparar) return;
    setSparar(true); setFel(null);
    const id = await sakerKoll();
    const f = id ? await sparaSvar(supabase, id, fraga, { ok: true, foto_url: null, kommentar: null }) : 'x';
    setSparar(false);
    if (f) { if (f !== 'x') setFel(f); return; }
    setSvar(s => ({ ...s, [fraga.id]: { ok: true, bild: null, kommentar: null } }));
    nasta();
  };

  const sparaNej = async () => {
    if (!fraga || !data || !utkast.fil || sparar) return;
    setSparar(true); setFel(null);
    const id = await sakerKoll();
    if (!id) { setSparar(false); return; }
    const sokvag = fotoSokvag(data.medarbetareId, id, fraga.id, Date.now());
    try { await laggMaskinkollFoto(id, fraga.id, sokvag, utkast.fil); }
    catch { setSparar(false); setFel('Bilden kunde inte sparas. Ta den igen.'); return; }
    const f = await sparaSvar(supabase, id, fraga, { ok: false, foto_url: sokvag, kommentar: utkast.kommentar });
    setSparar(false);
    if (f) { setFel(f); return; }
    setSvar(s => ({ ...s, [fraga.id]: { ok: false, bild: utkast.bild, kommentar: utkast.kommentar.trim() || null } }));
    nasta();
  };

  const avslutaKoll = async () => {
    if (!data || !kontroll.fil || sparar) return;
    setSparar(true); setFel(null);
    const id = await sakerKoll();
    if (!id) { setSparar(false); return; }
    const vad = kontrollfotoFor();
    const sokvag = fotoSokvag(data.medarbetareId, id, 'kontroll', Date.now());
    try { await laggMaskinkollFoto(id, 'kontroll', sokvag, kontroll.fil); }
    catch { setSparar(false); setFel('Bilden kunde inte sparas. Ta den igen.'); return; }
    const r = await avsluta(supabase, id, vad, sokvag);
    setSparar(false);
    if (!r.ok) { setFel(r.fel); return; }
    setKlarTid(r.data);
    setSteg('klar');
  };

  const valjBild = (fil: File | undefined) => {
    if (!fil) return;
    const bild = URL.createObjectURL(fil);
    if (steg === 'kontroll') setKontroll({ fil, bild });
    else setUtkast(u => ({ ...u, fil, bild }));
  };

  const godkannUppgift = async () => {
    if (!data || sparar) return;
    setSparar(true); setFel(null);
    const f = await godkann(supabase, data.medarbetareId, data.maskin.id);
    setSparar(false);
    if (f) { setFel(f); return; }
    setData({ ...data, godkand: true });
    setSteg(!data.pagaende && !data.dags ? 'inteDags' : 'fraga');
  };

  const tillbaka = () => router.push('/');

  // ── Ritning ────────────────────────────────────────────────────────────

  const visaRaknare = steg === 'fraga' || steg === 'nej';

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD }}>
      <style>{designCss}</style>
      <input ref={kamera} type="file" accept="image/*" capture="environment" hidden aria-label="Ta en bild"
        onChange={e => { valjBild(e.target.files?.[0]); e.target.value = ''; }} />
      <div style={{ ...kolumnRot('smal'), minHeight: ROT_MIN_HOJD, display: 'flex', flexDirection: 'column', paddingBottom: `calc(${AVSTAND.xl}px + env(safe-area-inset-bottom))` }}>
        <Huvud
          vanster={steg === 'nej'
            ? <button type="button" onClick={() => { setSteg('fraga'); setFel(null); }} style={KNAPP.lank}>Tillbaka</button>
            : steg === 'klar' ? null : <button type="button" onClick={tillbaka} style={KNAPP.lank}>Avbryt</button>}
          mitt={visaRaknare ? `${index + 1} av ${antal}` : null}
        />
        {visaRaknare && <Framsteg antal={antal} index={index} />}

        <Tillstand nyckel={`${steg}-${index}`} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {steg === 'laddar' && <p style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xl }}>Läser maskinkollen …</p>}

          {steg === 'fel' && (
            <div style={{ marginTop: AVSTAND.xl }}>
              <Svarsrad rubrik={fel ?? 'Något gick fel.'} avvikelse />
              <button type="button" onClick={() => void ladda()} style={KNAPP.sekundar}>Försök igen</button>
            </div>
          )}

          {steg === 'ingenMaskin' && (
            <div style={{ marginTop: AVSTAND.xl }}>
              <Svarsrad stor rubrik="Ingen maskin kopplad" rad="Maskinkollen görs på din maskin. Be arbetsledningen koppla den under Admin → Medarbetare." fri />
            </div>
          )}

          {steg === 'inteDags' && data && (
            <Fyll>
              <div style={{ marginTop: AVSTAND.xl }}>
                <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>{data.maskin.namn}</p>
                <h1 style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.titel }}>Maskinkollen är gjord</h1>
                <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.text2 }}>
                  {data.senasteKlar ? `Nästa maskinkoll ${datumText(enManadSenare(new Date(data.senasteKlar)))}` : null}
                </p>
              </div>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={tillbaka} style={KNAPP.primar}>Klar</button>
              <button type="button" onClick={() => setSteg('fraga')} style={{ ...KNAPP.tertiar, alignSelf: 'center', marginTop: AVSTAND.s }}>Gör en koll ändå</button>
            </Fyll>
          )}

          {steg === 'godkann' && data && (
            <Fyll>
              <p style={{ margin: `${AVSTAND.xl}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{data.maskin.namn} · första gången</p>
              <h1 style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.titel }}>Du kollar din maskin en gång i månaden</h1>
              <h2 style={{ ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.xl}px 0 ${AVSTAND.xs}px` }}>Så går det till</h2>
              <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
                <PunktRad ikon="notifications" text="Appen säger till när det är dags." />
                <PunktRad ikon="checklist" text={`${antal} frågor. Svara Ja eller Nej. Ca 3 minuter.`} />
                <PunktRad ikon="photo_camera" text="Är något fel tar du en bild. Martin fixar resten." sista />
              </div>
              <p style={{ margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0`, ...TYP.meta, color: FARG.text2 }}>
                Ansvaret för arbetsmiljön ligger kvar på Kompersmåla Skog. Du hjälper till genom att titta och säga till.
              </p>
              <div style={{ flex: 1 }} />
              {fel && <Fel text={fel} />}
              <button type="button" onClick={() => void godkannUppgift()} style={{ ...KNAPP.primar, ...(sparar ? INAKTIV : {}) }}>
                Jag gör maskinkollen på {data.maskin.namn}
              </button>
            </Fyll>
          )}

          {steg === 'fraga' && fraga && (
            <Fyll>
              {fraga.foto_url && (
                <img src={fraga.foto_url} alt="" style={{ marginTop: AVSTAND.xl, width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: RADIE.kort, background: FARG.kort }} />
              )}
              <h1 style={{ margin: `${AVSTAND.xl}px 0 0`, ...TYP.titel }}>{fraga.text}</h1>
              {fraga.hjalptext && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.kommentar, color: FARG.text2 }}>{fraga.hjalptext}</p>}
              {svar[fraga.id] && (
                <p style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
                  <Ikon namn="history" storlek={IKON.text} />Du svarade {svar[fraga.id].ok ? 'Ja' : 'Nej'}
                </p>
              )}
              <div style={{ flex: 1, minHeight: AVSTAND.xl }} />
              {fel && <Fel text={fel} />}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: AVSTAND.s, ...(sparar ? INAKTIV : {}) }}>
                <button type="button" onClick={() => { setFel(null); setUtkast({ fil: null, bild: null, kommentar: '' }); setSteg('nej'); }} style={KNAPP_JANEJ}>Nej</button>
                <button type="button" onClick={() => void svaraJa()} style={KNAPP_JANEJ}>Ja</button>
              </div>
              <button type="button" disabled={index === 0} onClick={() => { setFel(null); setIndex(index - 1); }}
                style={{ ...KNAPP.tertiar, alignSelf: 'center', marginTop: AVSTAND.s, ...(index === 0 ? { visibility: 'hidden' } : {}) }}>
                Föregående fråga
              </button>
            </Fyll>
          )}

          {steg === 'nej' && fraga && (
            <Fyll>
              <p style={{ margin: `${AVSTAND.xl}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{fraga.text} · Nej</p>
              <h1 style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.titel }}>Ta en bild på felet</h1>
              <Kameraruta bild={utkast.bild} onTryck={() => kamera.current?.click()} />
              <label htmlFor="am-kommentar" style={{ display: 'block', ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.xl}px 0 ${AVSTAND.s}px` }}>Vad är fel? · valfritt</label>
              <input id="am-kommentar" value={utkast.kommentar} onChange={e => setUtkast(u => ({ ...u, kommentar: e.target.value }))}
                placeholder="T.ex. läcker vid tiltcylindern" enterKeyHint="done"
                style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, border: 'none', borderRadius: RADIE.rad, background: FARG.upphojt, color: FARG.text, padding: `0 ${AVSTAND.m}px`, fontFamily: 'inherit', ...TYP.text, outline: 'none' }} />
              <p style={{ display: 'flex', gap: AVSTAND.s, alignItems: 'flex-start', margin: `${AVSTAND.l}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
                <Ikon namn="send" storlek={IKON.text} />Martin och skyddsombudet får bilden. Du behöver inte göra något mer.
              </p>
              <div style={{ flex: 1, minHeight: AVSTAND.xl }} />
              {fel && <Fel text={fel} />}
              <button type="button" disabled={!utkast.fil || sparar} onClick={() => void sparaNej()}
                style={{ ...KNAPP.primar, ...(!utkast.fil || sparar ? INAKTIV : {}) }}>
                {index + 1 < antal ? 'Nästa fråga' : 'Vidare'}
              </button>
              {!utkast.fil && <p style={{ margin: `${AVSTAND.s}px 0 0`, textAlign: 'center', ...TYP.meta, color: FARG.text2 }}>Knappen blir aktiv när bilden är tagen</p>}
            </Fyll>
          )}

          {steg === 'kontroll' && (
            <Fyll>
              <p style={{ margin: `${AVSTAND.xl}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Sista steget</p>
              <h1 style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.titel }}>Fota {kontrollfotoFor()}</h1>
              <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.kommentar, color: FARG.text2 }}>En bild varje månad, så vi ser hur maskinen ser ut.</p>
              <Kameraruta bild={kontroll.bild} onTryck={() => kamera.current?.click()} />
              <div style={{ flex: 1, minHeight: AVSTAND.xl }} />
              {fel && <Fel text={fel} />}
              <button type="button" disabled={!kontroll.fil || sparar} onClick={() => void avslutaKoll()}
                style={{ ...KNAPP.primar, ...(!kontroll.fil || sparar ? INAKTIV : {}) }}>
                Avsluta maskinkollen
              </button>
            </Fyll>
          )}

          {steg === 'klar' && data && (
            <KlarSkarm data={data} svar={svar} klarTid={klarTid} onKlar={tillbaka} />
          )}
        </Tillstand>
      </div>
    </div>
  );
}

// ── Delar ────────────────────────────────────────────────────────────────

function Fyll({ children }: { children: ReactNode }) {
  return <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>;
}

function Huvud({ vanster, mitt }: { vanster: ReactNode; mitt: string | null }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'center', minHeight: TRAFFYTA.min, marginTop: AVSTAND.s }}>
      <div style={{ justifySelf: 'start' }}>{vanster}</div>
      <span style={{ justifySelf: 'center', ...TYP.meta, color: FARG.text2 }}>{mitt}</span>
      <span />
    </div>
  );
}

function Framsteg({ antal, index }: { antal: number; index: number }) {
  return (
    <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: `repeat(${antal}, minmax(0, 1fr))`, gap: AVSTAND.xs, marginTop: AVSTAND.s }}>
      {Array.from({ length: antal }, (_, i) => (
        <span key={i} style={{ height: AVSTAND.xs, borderRadius: RADIE.stapel, background: i < index ? FARG.text : i === index ? FARG.text2 : FARG.fyllning }} />
      ))}
    </div>
  );
}

function PunktRad({ ikon, text, sista }: { ikon: string; text: string; sista?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: AVSTAND.m, alignItems: 'flex-start', padding: `${AVSTAND.m}px 0`, borderBottom: sista ? 'none' : `1px solid ${FARG.linje}` }}>
      <Ikon namn={ikon} farg={FARG.text} />
      <span style={{ ...TYP.text }}>{text}</span>
    </div>
  );
}

function Kameraruta({ bild, onTryck }: { bild: string | null; onTryck: () => void }) {
  return (
    <button type="button" onClick={onTryck} aria-label={bild ? 'Ta om bilden' : 'Öppna kameran'}
      style={{ marginTop: AVSTAND.xl, width: '100%', aspectRatio: '4 / 3', border: 'none', borderRadius: RADIE.kort, background: FARG.kort, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.m, position: 'relative' }}>
      {bild ? (
        <>
          <img src={bild} alt="Bilden du tog" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <span style={{ position: 'absolute', bottom: AVSTAND.s, right: AVSTAND.s, ...KNAPP.sekundar, width: 'auto', background: FARG.kort }}>Ta om</span>
        </>
      ) : (
        <>
          <Ikon namn="photo_camera" storlek={IKON.stor / 2} farg={FARG.text} />
          <span style={{ ...TYP.listtitel }}>Öppna kameran</span>
        </>
      )}
    </button>
  );
}

function Fel({ text }: { text: string }) {
  return <p role="alert" style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text, color: FARG.orange }}>{text}</p>;
}

function KlarSkarm({ data, svar, klarTid, onKlar }: { data: MaskinkollLage; svar: Record<string, Lokalt>; klarTid: string | null; onKlar: () => void }) {
  const [visaOk, setVisaOk] = useState(false);
  const nej = data.fragor.filter(f => svar[f.id] && !svar[f.id].ok);
  const ok = data.fragor.filter(f => svar[f.id]?.ok);
  const nasta = datumText(enManadSenare(klarTid ? new Date(klarTid) : new Date()));
  return (
    <Fyll>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: AVSTAND.xxl * 2 }}>
        <Ikon namn="check_circle" storlek={IKON.stor} farg={FARG.gron} fylld />
        <h1 style={{ margin: `${AVSTAND.xl}px 0 0`, ...TYP.titel }}>Klart</h1>
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.text2 }}>Nästa maskinkoll {nasta}</p>
      </div>

      {nej.length > 0 && (
        <>
          <h2 style={{ ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.xxl}px 0 ${AVSTAND.xs}px` }}>Skickat för åtgärd</h2>
          <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
            {nej.map((f, i) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.s}px 0`, borderBottom: i === nej.length - 1 ? 'none' : `1px solid ${FARG.linje}` }}>
                <div style={{ width: TRAFFYTA.primar, height: TRAFFYTA.primar, borderRadius: RADIE.rad, background: FARG.upphojt, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {svar[f.id].bild ? <img src={svar[f.id].bild!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Ikon namn="image" />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.listtitel }}>
                    <Ikon namn="warning" storlek={IKON.text} farg={FARG.orange} />{f.text}
                  </span>
                  {svar[f.id].kommentar && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{svar[f.id].kommentar}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {ok.length > 0 && (
        <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0, marginTop: AVSTAND.xl }}>
          <button type="button" onClick={() => setVisaOk(v => !v)} aria-expanded={visaOk}
            style={{ ...KNAPP.tertiar, display: 'flex', width: '100%', justifyContent: 'space-between', color: FARG.text, ...TYP.text }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><Ikon namn="check" storlek={IKON.text} farg={FARG.gron} />{ok.length} {ok.length === 1 ? 'sak' : 'saker'} ok</span>
            <Ikon namn="chevron_right" storlek={IKON.text} vrid={visaOk} />
          </button>
          {visaOk && ok.map(f => (
            <p key={f.id} style={{ margin: 0, padding: `${AVSTAND.s}px 0`, borderTop: `1px solid ${FARG.linje}`, ...TYP.meta, color: FARG.text2 }}>{f.text}</p>
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: AVSTAND.xl }} />
      <button type="button" onClick={onKlar} style={KNAPP.primar}>Klar</button>
    </Fyll>
  );
}
