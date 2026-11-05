'use client';

// "Besök på trakten" i objektets ⓘ-kort (planeringsläget): SMS med besökslänken, besökslänken (på/av, visa som markägaren) och loggen över alla anmälningar och kvittenser.
// TESTFAS (Martin 2026-11-05, `INKOPARE_SMS_PA`/`MARKAGARE_SMS_PA`): SMS:et går först bara till oss (Martin, Joacim), sedan också till inköparen, sist till markägaren.
// SMS:et skickas ALDRIG av appen — knappen öppnar telefonens Meddelanden med mottagare och text ifyllda; planeringen läser, ändrar och trycker själv på skicka.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TYP } from '@/lib/design/tokens';
import { Gruppkort, RadKnapp, Rubrik } from '@/components/planering/infoDelar';
import { useBesokPlanerare } from '@/lib/hooks/useBesokPlanerare';
import { besokSmsText, arIos, arMobil, narOrd, smsNummer } from '@/lib/besok/sms';
import { besoksUrl } from '@/lib/besok/offentlig';
import { loggRader, smsLage } from '@/lib/besok/planerare';
import { markagareFornamn } from '@/lib/besok/sms';
import { telNummer } from '@/app/oversikt/objekt-info';
import { INKOPARE_SMS_PA, MARKAGARE_SMS_PA } from '@/lib/besok/konstanter';

/** En mottagare av besöks-SMS:et. */
export interface SmsMottagare { id: string; etikett: string; namn: string | null; tel: string | null }

/** Vem SMS:et kan gå till: markägaren (bara när `markagareSms`), inköparen (bara när `inkopareSms` och numret finns) och oss (aktiva admin med telefon). */
export function smsMottagare(o: { markagareSms: boolean; inkopareSms: boolean; markagare: string | null; markagareTel: string | null; inkopare: string | null; inkopareTel: string | null; oss: { id: string; namn: string; telefon: string }[] }): SmsMottagare[] {
  const ut: SmsMottagare[] = [];
  if (o.markagareSms) ut.push({ id: 'markagare', etikett: o.markagare?.trim() ? `Markägaren · ${o.markagare.trim()}` : 'Markägaren', namn: markagareFornamn(o.markagare) ?? (o.markagare?.trim() || null), tel: o.markagareTel?.trim() || null });
  if (o.inkopareSms && o.inkopareTel?.trim()) ut.push({ id: 'inkopare', etikett: o.inkopare?.trim() ? `Inköparen · ${o.inkopare.trim()}` : 'Inköparen', namn: o.inkopare?.trim() || 'Inköparen', tel: o.inkopareTel.trim() });
  for (const m of o.oss) { const f = m.namn.trim().split(/\s+/)[0] || m.namn; ut.push({ id: `med-${m.id}`, etikett: f, namn: f, tel: m.telefon }); }
  return ut;
}

export interface BesokPlanerareProps {
  objektId: string;
  status: string | null;
  markagare: string | null;
  markagareTel: string | null;
  fastighet: string | null;
  planeradStart: string | null;
  faktiskStart: string | null;
  pagaendeStartad: string | null;
  /** inköparen ur traktdirektivet (objekt.inkopare / inkopare_tel) — mottagare i testfasen */
  inkopare?: string | null;
  inkopareTel?: string | null;
  /** Bara för test: får markägaren väljas? Standard: MARKAGARE_SMS_PA. */
  markagareSms?: boolean;
  /** Bara för test: får inköparen väljas? Standard: INKOPARE_SMS_PA. */
  inkopareSms?: boolean;
  /** påminnelsen öppnade kortet: SMS-raden rullas fram och markeras */
  fokusSms?: boolean;
  /** Bara för test: hur sms:-länken öppnas och vilken adress länken till markägaren byggs på. Standard: Meddelanden via window.location och den adress appen körs på. */
  navigera?: (href: string) => void;
  oppnaSida?: (url: string) => void;
  origin?: string;
  /** Bara för test: tvinga mobil/dator. Standard: avgörs ur webbläsaren (`arMobil`). På dator öppnas ingen sms:-länk – texten kopieras. */
  mobil?: boolean;
  /** Bara för test: hur texten kopieras. Standard: urklipp (navigator.clipboard, annars en dold textruta). */
  kopiera?: (text: string) => Promise<void>;
  /** Bara för test: företagets nummer när avsändaren saknar eget. Standard: FORETAG_TELEFON. */
  foretagTelefon?: string;
}

/** Kopierar till urklipp. Faller tillbaka på en dold textruta (äldre webbläsare, http). Kastar om inget fungerade. */
export async function kopieraText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  } catch { /* faller tillbaka */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('kopiering misslyckades');
}

/** sms:-länk — med nummer om det finns, annars utan mottagare (planeraren skriver numret själv i Meddelanden). */
export function smsLank(tel: string | null | undefined, text: string, ios: boolean): string {
  const nummer = telNummer(tel);
  return `sms:${nummer ?? ''}${ios ? '&' : '?'}body=${encodeURIComponent(text)}`;
}

export default function BesokPlanerare(p: BesokPlanerareProps) {
  const avslutat = p.status === 'avslutat' || p.status === 'klar';
  const d = useBesokPlanerare({ objektId: p.objektId, aktiv: true, skapaLank: !avslutat });
  const [loggOppen, setLoggOppen] = useState(false);
  const [meddelande, setMeddelande] = useState<string | null>(null);
  const [valjer, setValjer] = useState(false);
  const smsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (p.fokusSms) smsRef.current?.scrollIntoView({ block: 'center' }); }, [p.fokusSms, d.laddat]);

  const person = (id: string | null) => (id ? d.personNamn[id] ?? null : null);
  const rader = useMemo(() => loggRader(d.besok, d.kvittenser, { maskin: (id) => d.maskinNamn[id] ?? id, person: (id) => { const n = person(id); return n ? n.split(' ')[0] : null; } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.besok, d.kvittenser, d.maskinNamn, d.personNamn]);
  const lage = smsLage(d.sms, person);
  const smsStatus = lage.text;
  const mobil = p.mobil ?? (typeof navigator === 'undefined' ? true : arMobil(navigator.userAgent, navigator.maxTouchPoints));

  if (!d.migrering) {
    return (
      <div data-testid="kort-besok-migrering" style={{ marginBottom: AVSTAND.l }}>
        <Rubrik>Besök på trakten</Rubrik>
        <div style={{ background: FARG.upphojt, borderRadius: RADIE.kort, padding: AVSTAND.l, ...TYP.text, color: FARG.orange }}>Besöksfunktionen är inte aktiverad i databasen än.</div>
      </div>
    );
  }

  const lankKlar = !!d.lank && d.lank.aktiv && !avslutat;
  const markagareSms = p.markagareSms ?? MARKAGARE_SMS_PA;
  const inkopareSms = p.inkopareSms ?? INKOPARE_SMS_PA;
  const mottagare = smsMottagare({ markagareSms, inkopareSms, markagare: p.markagare, markagareTel: p.markagareTel, inkopare: p.inkopare ?? null, inkopareTel: p.inkopareTel ?? null, oss: d.testMottagare ?? [] });

  /** Texten som skickas/kopieras – samma för båda vägarna. */
  function byggText(lank: string): string {
    return besokSmsText({
      markagare: p.markagare, fastighet: p.fastighet,
      nar: narOrd({ planeradStart: p.planeradStart, faktiskStart: p.faktiskStart, pagaendeStartad: p.pagaendeStartad, status: p.status }),
      lank, avsandareNamn: d.avsandare?.namn, avsandareTelefon: d.avsandare?.telefon, foretagTelefon: p.foretagTelefon,
    });
  }
  const loggInfo = (m: { namn: string | null; tel: string | null }) => ({ avsandareId: d.avsandare?.id ?? null, mottagareNamn: m.namn, mottagareNummer: telNummer(m.tel) });
  /** Svaret på "Skickade du SMS:et?" gäller den mottagare som senast öppnades/kopierades (ur loggen, så det håller efter en omladdning). */
  const senaste = d.sms[0] ? { namn: d.sms[0].mottagare_namn ?? null, tel: d.sms[0].mottagare_nummer ?? null } : { namn: null, tel: null };

  function skicka(m: SmsMottagare) {
    if (!d.lank) return;   // knappen anropar bara skicka() när lankKlar (länk på, trakten ej avslutad) — ENDA stället som avgör det
    setMeddelande(null); setValjer(false);
    const text = byggText(besoksUrl(p.origin ?? window.location.origin, d.lank.token));
    if (mobil) {
      // Loggen först (fire-and-forget: ett fel där får aldrig stoppa SMS:et), sedan Meddelanden — i samma tryck. "Öppnat" är INTE "skickat": kortet frågar efteråt.
      void d.loggaSms({ ...loggInfo(m), handelse: 'oppnad' });
      (p.navigera ?? ((h: string) => { window.location.href = h; }))(smsLank(m.tel, text, arIos(navigator.userAgent, navigator.maxTouchPoints)));
      return;
    }
    // Dator: ingen sms:-länk (den öppnar inget användbart) — texten med länken kopieras, planeraren klistrar in den där hen skickar.
    (p.kopiera ?? kopieraText)(text).then(
      () => { void d.loggaSms({ ...loggInfo(m), handelse: 'kopierad' }); setMeddelande(m.tel ? `Kopierat — klistra in i ett SMS till ${m.tel}.` : 'Kopierat — klistra in i ett SMS.'); },
      () => setMeddelande('Kunde inte kopiera — försök igen.'),
    );
  }

  function svara(skickat: boolean) {
    void d.loggaSms({ ...loggInfo(senaste), handelse: skickat ? 'skickad' : 'ej_skickad' });
  }

  // Inget nummer i SMS:et? Då står raden "Ring mig på …" bort — planeraren ska veta det innan hen skickar.
  const saknarNummer = smsNummer({ avsandareTelefon: d.avsandare?.telefon, foretagTelefon: p.foretagTelefon }) === '';

  async function vaxlaLank() {
    if (!d.lank) return;
    setMeddelande(null);
    const fel = await d.sattAktiv(!d.lank.aktiv);
    if (fel) setMeddelande('Kunde inte ändra länken just nu.');
  }

  return (
    <div data-testid="kort-besok" style={{ marginBottom: AVSTAND.l }}>
      <Rubrik>Besök på trakten</Rubrik>
      <Gruppkort>
        <div ref={smsRef} style={p.fokusSms ? { outline: `2px solid ${FARG.text}`, outlineOffset: -2, borderRadius: RADIE.kort } : undefined}>
          <RadKnapp forstaRad testid="kort-besok-sms" ikon={mobil ? 'sms' : 'content_copy'} etikett={mobil ? 'Skicka besökslänken' : 'Kopiera SMS-text och länk'}
            under={avslutat ? 'Trakten är avslutad' : !d.lank ? 'Förbereder länken …' : !d.lank.aktiv ? 'Länken är avstängd — slå på den först' : [markagareSms ? null : inkopareSms ? 'Test – bara till inköparen och oss' : 'Test – bara till oss', smsStatus].filter(Boolean).join(' · ')}
            onTryck={() => (lankKlar ? setValjer((v) => !v) : setMeddelande(avslutat ? 'Trakten är avslutad.' : 'Länken är inte klar än.'))} />
        </div>
        {valjer && lankKlar && (
          <div data-testid="kort-besok-mottagare">
            {mottagare.length === 0 && <div style={{ padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.m}px`, ...TYP.meta, color: FARG.orange, borderTop: `1px solid ${FARG.linje}` }}>Ingen att skicka till — inköparens nummer saknas och ingen av oss har telefon i Admin › Medarbetare.</div>}
            {mottagare.map((m) => (
              <RadKnapp key={m.id} testid={`kort-besok-till-${m.id}`} ikon="person" etikett={m.etikett} under={m.tel || 'nummer saknas — du skriver det själv'} onTryck={() => skicka(m)} />
            ))}
          </div>
        )}
        {lage.typ === 'obekraftad' && !avslutat && (
          <div data-testid="kort-besok-sms-fraga" style={{ padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.m}px`, borderTop: `1px solid ${FARG.linje}` }}>
            <div style={{ ...TYP.listtitel }}>Skickade du SMS:et?</div>
            <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.s }}>
              <button type="button" data-testid="kort-besok-sms-ja" style={{ ...KNAPP.sekundar, flex: 1 }} onClick={() => svara(true)}>Ja, skickat</button>
              <button type="button" data-testid="kort-besok-sms-nej" style={{ ...KNAPP.sekundar, flex: 1 }} onClick={() => svara(false)}>Nej</button>
            </div>
          </div>
        )}
        {saknarNummer && lankKlar && (
          <div data-testid="kort-besok-nummer-saknas" style={{ padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.m}px`, ...TYP.meta, color: FARG.orange, borderTop: `1px solid ${FARG.linje}` }}>
            Inget nummer att ringa står i SMS:et — lägg in ditt nummer i Admin › Medarbetare.
          </div>
        )}
        <RadKnapp testid="kort-besok-sida" ikon="open_in_new" etikett="Visa som markägaren" under="Öppnar besökssidan"
          onTryck={() => { if (d.lank && !avslutat) { const url = besoksUrl(p.origin ?? window.location.origin, d.lank.token); (p.oppnaSida ?? ((u: string) => { window.open(u, '_blank', 'noopener'); }))(url); } }} />
        <RadKnapp testid="kort-besok-lank" ikon="link" etikett="Länk till markägaren" pil={false}
          hoger={<span data-testid="kort-besok-lank-lage" style={{ ...TYP.listtitel, color: d.lank?.aktiv ? FARG.gron : FARG.text2 }}>{d.lank ? (d.lank.aktiv ? 'På' : 'Av') : '…'}</span>}
          onTryck={vaxlaLank} />
        <RadKnapp testid="kort-besok-logg" ikon="history" etikett={`Besök (${rader.length})`} under={rader.length ? undefined : 'Ingen har anmält sig än'}
          onTryck={() => setLoggOppen((v) => !v)} />
        {loggOppen && (
          <div data-testid="kort-besok-logg-lista" style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.m}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
            {rader.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2 }}>Inga anmälningar.</div>}
            {rader.map((r) => (
              <div key={r.id} data-testid="kort-besok-logg-rad" style={{ borderTop: `1px solid ${FARG.linje}`, paddingTop: AVSTAND.m }}>
                <div style={{ ...TYP.listtitel }}>{r.rubrik} · <a href={`tel:${r.telefon.replace(/[^\d+]/g, '')}`} style={{ color: FARG.text, textDecoration: 'none' }}>{r.telefon}</a></div>
                <div style={{ ...TYP.meta, color: FARG.text2 }}>{r.under}</div>
                {r.vantar
                  ? <div style={{ ...TYP.meta, color: FARG.orange }}>Ingen maskin har kvitterat än</div>
                  : r.kvittenser.map((k) => <div key={k} style={{ ...TYP.meta, color: FARG.gron }}>✓ {k}</div>)}
              </div>
            ))}
          </div>
        )}
      </Gruppkort>
      {meddelande && <div role="status" style={{ ...TYP.meta, color: FARG.orange, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0` }}>{meddelande}</div>}
      {d.fel && <div role="alert" style={{ ...TYP.meta, color: FARG.orange, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0` }}>Kunde inte läsa besöken just nu.</div>}
    </div>
  );
}
