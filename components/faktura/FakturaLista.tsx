'use client';
// Faktureringsvyns lista. ALL text och alla tal kommer ur byggListVy
// (lib/faktura/listaVy.ts) — den här filen ritar bara.
//
// ETT TAL PER SKÄRM: det stora talet hör till listan när listan ÄR skärmen
// (telefon, iPad stående). Från 1100 px är listan en sidokolumn bredvid en
// öppen trakt, och då är traktens summa skärmens tal — sidokolumnen får en
// tyst rad i stället. Annars står två TYP.tal under samma fråga, vilket är
// precis det skillen förbjuder. Växlingen sker i CSS (fa-bara-smal/-bred i
// FakturaRam), aldrig med en mätning i JS.
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import KontraktsGenomgang from './KontraktsGenomgang';
import { AVSTAND, FARG, KNAPP, RADIE, TAL_FONT, TYP } from '@/lib/design/tokens';
import type { ListVy } from '@/lib/faktura/listaVy';

const BAS = '/ekonomi/fakturaunderlag';

function Prick({ farg = FARG.orange }: { farg?: string }) {
  return (
    <span aria-hidden="true" style={{
      width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel,
      background: farg, flexShrink: 0,
    }} />
  );
}

export default function FakturaLista({ vy }: { vy: ListVy }) {
  const router = useRouter();
  const sokvag = usePathname() ?? BAS;
  const [genomgang, setGenomgang] = useState(false);
  // Layouten känner inte [vo] (en layout får inte sina barns parametrar), så
  // listan läser adressen själv. Den valda raden får FARG.upphojt via CSS i
  // FakturaRam — de andra raderna dämpas INTE: en lista där allt utom en rad
  // är grått är svårare att läsa, inte lättare.
  const valtVo = sokvag.startsWith(`${BAS}/`)
    ? decodeURIComponent(sokvag.slice(BAS.length + 1).split('/')[0] ?? '')
    : null;

  return (
    <div>
      {/* Svaret — stort när listan är skärmen */}
      <div className="fa-bara-smal">
        <h2 style={{ margin: `0 0 ${AVSTAND.s}px`, ...TYP.rubrik, color: FARG.text }}>
          Vad ska faktureras?
        </h2>
        <p style={{ margin: 0, ...TYP.tal, ...TAL_FONT, color: FARG.text }}>{vy.svar.tal}</p>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.text, color: FARG.text }}>{vy.svar.text}</p>
        {vy.svar.under && (
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, marginTop: AVSTAND.xs }}>
            <Prick />
            <span style={{ ...TYP.meta, color: FARG.text2 }}>{vy.svar.under}</span>
          </div>
        )}
        <div style={{ height: AVSTAND.xl }} />
      </div>

      {/* Svaret — en tyst rad när listan står bredvid en trakt */}
      <div className="fa-bara-bred" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: AVSTAND.xxl, marginBottom: AVSTAND.m }}>
        <Prick farg={vy.svar.under ? FARG.orange : FARG.gron} />
        <span style={{ ...TYP.meta, color: FARG.text2 }}>
          {vy.svar.tal} {vy.svar.text}
          {vy.svar.under ? ` · ${vy.svar.under}` : ''}
        </span>
      </div>

      {vy.attGora.length > 0 && (
        <>
          <Sektion rubrik="Vad ska du göra?">
            {vy.attGora.map((r, i) => (
              <Rad
                key={r.nyckel}
                titel={<span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><Prick />{r.titel}</span>}
                under={r.under}
                href={r.vo ? `${BAS}/${encodeURIComponent(r.vo)}` : undefined}
                pil={!!r.vo}
                sista={i === vy.attGora.length - 1}
                attr={{ 'data-att-gora': r.nyckel }}
              />
            ))}
          </Sektion>
          {vy.kontraktsKo.length > 0 && (
            <button type="button" onClick={() => setGenomgang(true)}
              style={{ ...KNAPP.primar, marginTop: `-${AVSTAND.m}px`, marginBottom: AVSTAND.xl }}>
              Gå igenom dem
            </button>
          )}
        </>
      )}

      {vy.klara.length > 0 && (
        <h2 style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.rubrik, color: FARG.text }}>
          Vad är klart att fakturera?
        </h2>
      )}
      {vy.klara.map(grupp => (
        <Sektion key={grupp.rubrik} rubrik={grupp.rubrik}>
          {grupp.rader.map((r, i) => (
            <Rad
              key={r.vo}
              titel={r.titel}
              under={r.under}
              hoger={<span style={TAL_FONT}>{r.hoger}</span>}
              hogerUnder={r.hogerUnder}
              href={`${BAS}/${encodeURIComponent(r.vo)}`}
              sista={i === grupp.rader.length - 1}
              attr={valtVo === r.vo ? { 'data-vald': '' } : undefined}
            />
          ))}
        </Sektion>
      ))}

      {vy.arbeteVantar.length > 0 && (
        <Sektion
          rubrik="Manuellt arbete som inte kan faktureras än"
          not="Arbetet är gjort och debiterbart, men trakten är inte klar. Det ligger här i stället för i en dämpad hög."
        >
          {vy.arbeteVantar.map((r, i) => (
            <Rad
              key={r.vo}
              titel={<span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><Prick />{r.titel}</span>}
              under={r.under}
              hoger={<span style={TAL_FONT}>{r.hoger}</span>}
              hogerUnder={r.hogerUnder}
              href={`${BAS}/${encodeURIComponent(r.vo)}`}
              sista={i === vy.arbeteVantar.length - 1}
              attr={{ 'data-arbete-vantar': r.vo }}
            />
          ))}
        </Sektion>
      )}

      {vy.vantar && (
        <Sektion rubrik="Vad väntar?">
          <Rad titel={vy.vantar.titel} under={vy.vantar.under} sista dampad />
        </Sektion>
      )}

      <p style={{ margin: `0 0 0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text3 }}>{vy.fot}</p>

      {genomgang && (
        <KontraktsGenomgang
          ko={vy.kontraktsKo}
          onSparad={() => { /* listan läses om när arket stängs */ }}
          onStang={() => { setGenomgang(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
