'use client';

// Åtgärdslistan — svarar på EN fråga: "Vad ska åtgärdas?". Admin och skyddsombud läser; bara admin stänger.
// Stopp (Nej på en stoppfråga, eller "går inte att köra säkert") står alltid först. Ett tryck på en rad öppnar ett ark med
// bilden, vem som rapporterade och — för admin — "Vad gjordes?" + Markera som åtgärdad. `?id=<åtgärd>` öppnar arket direkt
// (länken pushen kommer att bära). Regler och läsning: lib/arbetsmiljo/atgarder.ts.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Ark from '@/components/design/Ark';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Ikon from '@/components/design/Ikon';
import Tillstand from '@/components/design/Tillstand';
import MaskinBild from '@/components/arbetsmiljo/MaskinBild';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, ROT_MIN_HOJD, TNUM, TRAFFYTA, TYP, VY_ROT, designCss, kolumnRot } from '@/lib/design/tokens';
import { ANMAL_LANK, ejAnmald, hamtaTillbudInfo, markeraAnmald, type TillbudInfo } from '@/lib/arbetsmiljo/tillbud';
import {
  atgardTitel, datumKort, deadlineText, deadlineVal, farStanga, felText, fornamn, fotoLank, gruppera, hamtaAtgarder, hamtaPersoner, kallaText, narText,
  sattAnsvar, stangAtgard, svar, svenskDag, underText,
  type Ansvarig, type Atgard, type Las,
} from '@/lib/arbetsmiljo/atgarder';

function lasId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id');
}

function sattId(id: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
  window.history.replaceState(window.history.state, '', url.toString());
}

export default function Atgarder() {
  const [lista, setLista] = useState<Las<Atgard[]> | null>(null);
  const [far, setFar] = useState<boolean | null>(null);
  /** Tillbuden bakom åtgärderna (typ och anmälan). null = kunde inte läsas → raderna heter "Tillbud", arket visar ingen anmälan. */
  const [tillbud, setTillbud] = useState<Map<string, TillbudInfo> | null>(null);
  const [valdId, setValdId] = useState<string | null>(null);
  const [visaKlara, setVisaKlara] = useState(false);

  const [kvitto, setKvitto] = useState<string | null>(null);

  // `tyst`: listan står kvar medan den läses om (efter en sparning). Bara första läsningen och Försök igen visar "Läser".
  // Ett läsfel vid en tyst omläsning tar inte bort listan som syns — den är redan rätt utom raden som just stängdes.
  const hamta = useCallback(async (tyst = false) => {
    if (!tyst) setLista(null);
    const [l, f, t] = await Promise.all([hamtaAtgarder(supabase), farStanga(supabase), hamtaTillbudInfo(supabase)]);
    if (tyst && !l.ok) return;
    setLista(l);
    setFar(f);
    setTillbud(t);
  }, []);

  useEffect(() => {
    if (!kvitto) return;
    const t = setTimeout(() => setKvitto(null), 4000);
    return () => clearTimeout(t);
  }, [kvitto]);

  // Efter "Markera som åtgärdad": raden flyttas till Åtgärdade direkt (samma sak som databasen nu säger), sedan läses listan om tyst.
  const stangd = (id: string, vadGjordes: string) => {
    setLista(l => l?.ok ? { ok: true, data: l.data.map(a => a.id === id ? { ...a, status: 'klar', vadGjordes, stangdTid: new Date().toISOString() } : a) } : l);
    setKvitto('Markerad som åtgärdad');
    setValdId(null); sattId(null);
    void hamta(true);
  };

  // Efter ett nytt "Vem" eller "Senast": raden visar det direkt, sedan läses listan om tyst.
  const andrad = (id: string, patch: Partial<Pick<Atgard, 'ansvarig' | 'deadline'>>) => {
    setLista(l => l?.ok ? { ok: true, data: l.data.map(a => a.id === id ? { ...a, ...patch } : a) } : l);
    void hamta(true);
  };

  useEffect(() => { setValdId(lasId()); void hamta(); }, [hamta]);

  const oppna = (id: string) => { setValdId(id); sattId(id); };
  const stang = () => { setValdId(null); sattId(null); };

  const idag = svenskDag();
  const g = lista?.ok ? gruppera(lista.data) : null;
  const vald = lista?.ok ? lista.data.find(a => a.id === valdId) ?? null : null;

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD }}>
      <style>{designCss}</style>
      <div style={{ ...kolumnRot('smal'), paddingTop: AVSTAND.l, paddingBottom: `calc(${AVSTAND.xxl}px + env(safe-area-inset-bottom))` }}>
        <Tillstand nyckel={!lista ? 'laddar' : lista.ok ? 'lista' : 'fel'}>
          {!lista && <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Läser åtgärderna …</p>}

          {lista && !lista.ok && (
            <div>
              <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: `0 0 ${AVSTAND.m}px` }}>{lista.fel}</p>
              <button type="button" onClick={() => void hamta()} style={KNAPP.sekundar}>Försök igen</button>
            </div>
          )}

          {g && <Lista g={g} idag={idag} tillbud={tillbud} visaKlara={visaKlara} onVisaKlara={() => setVisaKlara(v => !v)} onOppna={oppna} />}
        </Tillstand>
      </div>

      {kvitto && (
        <div role="status" className="tona-opacity" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: `calc(${AVSTAND.xl}px + env(safe-area-inset-bottom))`, background: FARG.upphojt, color: FARG.text, borderRadius: RADIE.kort, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, ...TYP.text, zIndex: 1500, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
          <Ikon namn="check_circle" farg={FARG.gron} />{kvitto}
        </div>
      )}

      {vald && <AtgardArk a={vald} idag={idag} far={far === true} tillbud={tillbud?.get(vald.id) ?? null} onStang={stang} onStangd={(text) => stangd(vald.id, text)} onAndrad={(patch) => andrad(vald.id, patch)}
        onAnmald={(tid) => setTillbud(m => { if (!m) return m; const ny = new Map(m); const i = ny.get(vald.id); if (i) ny.set(vald.id, { ...i, anmaldTid: tid }); return ny; })} />}
      {lista?.ok && valdId && !vald && (
        <Ark rubrik="Åtgärden finns inte" onStang={stang} stang="Klar">
          <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Den kan ha tagits bort. Listan visar det som finns kvar.</p>
        </Ark>
      )}
    </div>
  );
}

function Lista({ g, idag, tillbud, visaKlara, onVisaKlara, onOppna }: {
  g: ReturnType<typeof gruppera>; idag: string; tillbud: Map<string, TillbudInfo> | null; visaKlara: boolean; onVisaKlara: () => void; onOppna: (id: string) => void;
}) {
  const s = svar(g);
  const stoppText = g.stopp.length > 0;
  return (
    <div>
      <h1 style={{ ...TYP.rubrik, color: FARG.text, margin: 0 }}>Vad ska åtgärdas?</h1>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s, marginTop: AVSTAND.s }}>
        <span style={{ ...TYP.tal, ...TNUM, color: s.tal === 0 ? FARG.text2 : FARG.text }}>{s.tal}</span>
        <span data-svar style={{ ...TYP.text, color: stoppText ? FARG.rod : FARG.text2, fontWeight: stoppText ? 600 : 400 }}>{s.rad}</span>
      </div>
      {s.tal === 0 && (
        <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>
          Svarar en förare Nej i maskinkollen, trycker Något är fel eller rapporterar vad som hände, hamnar det här.
        </p>
      )}

      {g.stopp.length > 0 && (
        <div style={{ marginTop: AVSTAND.xl }} data-grupp="stopp">
          <Sektion rubrik="Ska stå tills det är lagat">
            {g.stopp.map((a, i) => (
              <Rad key={a.id} titel={<><Prick farg={FARG.rod} />{atgardTitel(a, tillbud?.get(a.id)?.typ)}</>}
                under={<>{felText(a)}<br />{underText(a)}</>}
                hogerUnder={fornamn(a.ansvarig?.namn ?? null) ?? undefined}
                onTryck={() => onOppna(a.id)} sista={i === g.stopp.length - 1} attr={{ 'data-atgard': a.id }} />
            ))}
          </Sektion>
        </div>
      )}

      {g.oppna.length > 0 && (
        <div style={{ marginTop: AVSTAND.xl }} data-grupp="oppna">
          <Sektion rubrik="Att åtgärda">
            {g.oppna.map((a, i) => {
              const d = deadlineText(a.deadline, idag);
              return (
                <Rad key={a.id} titel={atgardTitel(a, tillbud?.get(a.id)?.typ)}
                  under={<>{felText(a)}<br />{underText(a)}{ejAnmald(tillbud?.get(a.id)) && <span data-ej-anmald style={{ color: FARG.orange }}> · Inte anmäld</span>}</>}
                  hoger={d ? <span style={{ color: d.sen ? FARG.orange : FARG.text }}>{d.text}</span> : undefined}
                  hogerUnder={fornamn(a.ansvarig?.namn ?? null) ?? undefined}
                  onTryck={() => onOppna(a.id)} sista={i === g.oppna.length - 1} attr={{ 'data-atgard': a.id }} />
              );
            })}
          </Sektion>
        </div>
      )}

      {g.klara.length > 0 && (
        <div style={{ marginTop: AVSTAND.xl }} data-grupp="klara">
          <Sektion rubrik="Åtgärdade">
            <Rad titel={visaKlara ? 'Dölj åtgärdade' : `Visa ${g.klara.length} åtgärdade`} onTryck={onVisaKlara} pil={false}
              sista={!visaKlara} attr={{ 'data-visa-klara': '' }} />
            {visaKlara && g.klara.map((a, i) => (
              <Rad key={a.id} dampad titel={atgardTitel(a, tillbud?.get(a.id)?.typ)}
                under={<>{felText(a)}<br />{a.vadGjordes ? `Gjort: ${a.vadGjordes}` : ''}</>}
                hogerUnder={a.stangdTid ? narText(a.stangdTid) : undefined}
                onTryck={() => onOppna(a.id)} sista={i === g.klara.length - 1} attr={{ 'data-atgard': a.id }} />
            ))}
          </Sektion>
        </div>
      )}
    </div>
  );
}

function Prick({ farg }: { farg: string }) {
  return <span aria-hidden style={{ display: 'inline-block', width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: farg, marginRight: AVSTAND.s, verticalAlign: 'middle' }} />;
}

function AtgardArk({ a, idag, far, tillbud, onStang, onStangd, onAnmald, onAndrad }: {
  a: Atgard; idag: string; far: boolean; tillbud: TillbudInfo | null; onStang: () => void; onStangd: (vadGjordes: string) => void; onAnmald: (tid: string) => void;
  onAndrad: (patch: Partial<Pick<Atgard, 'ansvarig' | 'deadline'>>) => void;
}) {
  // "Vem" och "Senast" väljs i samma ark (en egen vy), aldrig ett ark ovanpå ett ark.
  const [vy, setVy] = useState<'atgard' | 'vem' | 'nar'>('atgard');
  if (vy !== 'atgard') {
    return <VemNarVy a={a} idag={idag} vy={vy} onTillbaka={() => setVy('atgard')} onSparad={(patch) => { onAndrad(patch); setVy('atgard'); }} />;
  }
  return <AtgardInnehall a={a} idag={idag} far={far} tillbud={tillbud} onStang={onStang} onStangd={onStangd} onAnmald={onAnmald} onVem={() => setVy('vem')} onNar={() => setVy('nar')} />;
}

function AtgardInnehall({ a, idag, far, tillbud, onStang, onStangd, onAnmald, onVem, onNar }: {
  a: Atgard; idag: string; far: boolean; tillbud: TillbudInfo | null; onStang: () => void; onStangd: (vadGjordes: string) => void; onAnmald: (tid: string) => void;
  onVem: () => void; onNar: () => void;
}) {
  const [bild, setBild] = useState<'laddar' | 'fel' | string>(a.fotoUrl ? 'laddar' : 'fel');
  const [text, setText] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const oppen = a.status === 'oppen';
  const kanStanga = oppen && far;

  useEffect(() => {
    let vid = true;
    if (!a.fotoUrl) return;
    fotoLank(supabase, a.fotoUrl).then(u => { if (vid) setBild(u ?? 'fel'); });
    return () => { vid = false; };
  }, [a.fotoUrl]);

  const spara = async () => {
    setSparar(true); setFel(null);
    const f = await stangAtgard(supabase, a.id, text);
    setSparar(false);
    if (f) { setFel(f); return; }
    onStangd(text.trim());
  };

  const d = deadlineText(a.deadline, idag);
  const tom = text.trim() === '';

  return (
    <Ark rubrik={atgardTitel(a, tillbud?.typ)} onStang={onStang} stang={kanStanga ? 'Avbryt' : 'Klar'}
      fot={kanStanga ? (
        <>
          {fel && <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: 0 }}>{fel}</p>}
          <button type="button" onClick={() => void spara()} disabled={tom || sparar}
            style={{ ...KNAPP.primar, ...(tom || sparar ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : 'Markera som åtgärdad'}</button>
        </>
      ) : undefined}>
      {oppen && a.stopp && (
        <p data-stopp style={{ ...TYP.text, fontWeight: 600, color: FARG.rod, margin: `0 0 ${AVSTAND.m}px` }}>Maskinen ska stå tills det är lagat.</p>
      )}

      {a.plats && (
        <div style={{ marginBottom: AVSTAND.l }} data-maskinbild>
          <MaskinBild typ={a.plats.typ} val={a.plats.val} etikett={a.maskinNamn ?? undefined} />
        </div>
      )}

      {a.fotoUrl && (
        <div style={{ marginBottom: AVSTAND.l }}>
          {bild === 'laddar' && <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>Hämtar bilden …</p>}
          {bild === 'fel' && <p style={{ ...TYP.meta, color: FARG.orange, margin: 0 }}>Bilden kunde inte hämtas.</p>}
          {bild !== 'laddar' && bild !== 'fel' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bild} alt="Bilden föraren tog" style={{ width: '100%', borderRadius: RADIE.kort, display: 'block', background: FARG.upphojt }} />
          )}
        </div>
      )}

      <Sektion rubrik={a.kalla === 'tillbud' ? 'Vad hände?' : 'Vad är fel?'} kort={false}>
        <p style={{ ...TYP.text, color: FARG.text, margin: 0 }}>{felText(a)}</p>
      </Sektion>

      <div style={{ marginTop: AVSTAND.l }}>
        <Sektion rubrik="Rapporterat" kort={false}>
          <Rad titel={kallaText(a.kalla)} under={underText(a)} pil={false} sista />
        </Sektion>
      </div>

      {oppen && (
        <div style={{ marginTop: AVSTAND.l }} data-vem-nar>
          <Sektion rubrik="Vem gör det och när?" kort={false}>
            {a.ansvarig !== undefined && (
              <Rad titel="Vem" attr={{ 'data-vem': '' }}
                hoger={a.ansvarig ? fornamn(a.ansvarig.namn) : <span style={{ color: far ? FARG.orange : FARG.text2 }}>Ingen vald</span>}
                onTryck={far ? onVem : undefined} sista={false} />
            )}
            <Rad titel="Senast" attr={{ 'data-nar': '' }}
              hoger={d ? <span style={{ color: d.sen ? FARG.orange : FARG.text }}>{d.text}</span> : <span style={{ color: far ? FARG.orange : FARG.text2 }}>Inget datum</span>}
              onTryck={far ? onNar : undefined} sista />
          </Sektion>
        </div>
      )}

      {a.kalla === 'tillbud' && tillbud && <Anmalan info={tillbud} far={far} onAnmald={onAnmald} />}

      {!oppen && (
        <div style={{ marginTop: AVSTAND.l }} data-gjort>
          <Sektion rubrik="Vad gjordes?" kort={false}>
            <p style={{ ...TYP.text, color: FARG.text, margin: 0 }}>{a.vadGjordes}</p>
            <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>
              {[fornamn(a.stangdAvNamn), a.stangdTid ? narText(a.stangdTid) : null].filter(Boolean).join(' · ')}
            </p>
          </Sektion>
        </div>
      )}

      {kanStanga && (
        <div style={{ marginTop: AVSTAND.l }}>
          <Sektion rubrik="Vad gjordes?" kort={false}>
            <textarea value={text} onChange={e => setText(e.target.value)} aria-label="Vad gjordes?" rows={3}
              placeholder={a.kalla === 'tillbud' ? 'T.ex. pratade igenom fällningen med alla förare' : 'T.ex. bytte nödstoppsknappen'}
              style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min * 2, border: 'none', borderRadius: RADIE.rad, background: FARG.upphojt, color: FARG.text, padding: AVSTAND.m, fontFamily: 'inherit', ...TYP.text, outline: 'none', resize: 'vertical' }} />
          </Sektion>
          {a.kalla !== 'manuell' && (
            <p data-far-veta style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>Den som rapporterade får det du skriver i telefonen.</p>
          )}
        </div>
      )}

      {oppen && !far && (
        <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.l}px 0 0` }}>Arbetsledningen markerar åtgärden som klar.</p>
      )}
    </Ark>
  );
}

/** Väljer vem som gör åtgärden, eller senast när. Ett tryck sparar och går tillbaka; Avbryt går tillbaka utan att spara. */
function VemNarVy({ a, idag, vy, onTillbaka, onSparad }: {
  a: Atgard; idag: string; vy: 'vem' | 'nar'; onTillbaka: () => void; onSparad: (patch: Partial<Pick<Atgard, 'ansvarig' | 'deadline'>>) => void;
}) {
  const [personer, setPersoner] = useState<Ansvarig[] | null | 'laddar'>('laddar');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  useEffect(() => {
    if (vy !== 'vem') return;
    let vid = true;
    hamtaPersoner(supabase).then(p => { if (vid) setPersoner(p); });
    return () => { vid = false; };
  }, [vy]);

  const spara = async (andring: { ansvarigId?: string | null; deadline?: string }, patch: Partial<Pick<Atgard, 'ansvarig' | 'deadline'>>) => {
    if (sparar) return;
    setSparar(true); setFel(null);
    const f = await sattAnsvar(supabase, a.id, andring);
    setSparar(false);
    if (f) { setFel(f); return; }
    onSparad(patch);
  };

  // Det som redan är valt får en bock (vit — blått betyder navigera).
  const vald = (on: boolean) => on ? <Ikon namn="check" farg={FARG.text} /> : undefined;

  return (
    <Ark rubrik={vy === 'vem' ? 'Vem gör det?' : 'Senast när?'} onStang={onTillbaka}>
      {fel && <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: `0 0 ${AVSTAND.m}px` }}>{fel}</p>}
      {vy === 'vem' && personer === 'laddar' && <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>Läser …</p>}
      {vy === 'vem' && personer === null && <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: 0 }}>Kunde inte läsa vilka som finns.</p>}
      {vy === 'vem' && Array.isArray(personer) && (
        <Sektion rubrik="Medarbetare" kort={false}>
          {personer.map((p, i) => (
            <Rad key={p.id} titel={p.namn} hoger={vald(a.ansvarig?.id === p.id)} pil={false} attr={{ 'data-person': p.id }}
              onTryck={() => void spara({ ansvarigId: p.id }, { ansvarig: p })} sista={i === personer.length - 1 && !a.ansvarig} />
          ))}
          {a.ansvarig && (
            <Rad titel={<span style={{ color: FARG.text2 }}>Ingen</span>} pil={false} attr={{ 'data-person-ingen': '' }}
              onTryck={() => void spara({ ansvarigId: null }, { ansvarig: null })} sista />
          )}
        </Sektion>
      )}
      {vy === 'nar' && (
        <Sektion rubrik="Senast" kort={false}>
          {deadlineVal(idag).map((v, i, l) => (
            <Rad key={v.text} titel={v.text} hoger={<>{datumKort(v.dag)}{a.deadline === v.dag && <> {vald(true)}</>}</>} pil={false}
              attr={{ 'data-nar-val': v.dag }} onTryck={() => void spara({ deadline: v.dag }, { deadline: v.dag })} sista={i === l.length - 1} />
          ))}
        </Sektion>
      )}
    </Ark>
  );
}

/**
 * Arbetsmiljöverket. Allvarliga olyckor och allvarliga tillbud ska anmälas direkt (arbetsmiljölagen 3 kap. 3 a §); en
 * arbetsskada anmäls också till Försäkringskassan. Båda görs på anmalarbetsskada.se. Appen avgör inte om det var allvarligt —
 * det gör arbetsledningen — men den påminner och kommer ihåg att det är gjort (tid och vem sätts av databasen).
 */
function Anmalan({ info, far, onAnmald }: { info: TillbudInfo; far: boolean; onAnmald: (tid: string) => void }) {
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const anmal = async () => {
    setSparar(true); setFel(null);
    const r = await markeraAnmald(supabase, info.tillbudId);
    setSparar(false);
    if (!r.ok) { setFel(r.fel); return; }
    onAnmald(r.tid);
  };
  return (
    <div style={{ marginTop: AVSTAND.l }} data-anmalan>
      <Sektion rubrik="Arbetsmiljöverket" kort={false}>
        {info.anmaldTid ? (
          <p data-anmald style={{ ...TYP.text, color: FARG.text, margin: 0, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
            <Ikon namn="check_circle" farg={FARG.gron} />Anmäld {narText(info.anmaldTid)}
          </p>
        ) : (
          <>
            <p style={{ ...TYP.text, color: FARG.text, margin: 0 }}>
              {info.typ === 'olycka'
                ? 'Skadades någon allvarligt ska det anmälas till Arbetsmiljöverket direkt. En arbetsskada anmäls också till Försäkringskassan.'
                : 'Kunde det ha gått riktigt illa är det ett allvarligt tillbud. Då ska det anmälas till Arbetsmiljöverket direkt.'}
            </p>
            <a href={ANMAL_LANK} target="_blank" rel="noopener noreferrer" style={{ ...KNAPP.lank, textDecoration: 'none' }}>Anmäl på anmalarbetsskada.se</a>
            {far && (
              <>
                {fel && <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: `${AVSTAND.s}px 0` }}>{fel}</p>}
                <button type="button" onClick={() => void anmal()} disabled={sparar} data-markera-anmald
                  style={{ ...KNAPP.sekundar, marginTop: AVSTAND.s, ...(sparar ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : 'Markera som anmäld'}</button>
              </>
            )}
          </>
        )}
      </Sektion>
    </div>
  );
}
