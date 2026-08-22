'use client';

// Gallring — nivå 1. En rad per gallrad trakt, senaste överst.
//
// ETT TAL ÖVERST är huvudsaken: hur mycket som gallrats ut, i m³fub. Allt annat
// på raden är stöd för att svara på "vilken trakt är det, och stämmer uttaget?".
//
// Listan laddas i två steg och det är avsiktligt. Steg 1 (fakt_produktion) är
// några få anrop och ritar hela listan direkt. Steg 2 (detalj_stam) är en rad
// per stam — tiotusentals — och behövs bara för Dgv. Att vänta in steg 2 innan
// något visas skulle göra vyn långsam att läsa av precis den anledning som gör
// alla andra beslut i den här appen: blicken hör hemma i skogen, inte i en
// spinner. Under tiden står det vad som saknas, aldrig ett platshållartal.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import ListGroup from '@/components/ListGroup';
import PageContainer from '@/components/PageContainer';
import { T } from '@/lib/utbildning';
import {
  hamtaGallringar,
  fyllDiametrar,
  datumspann,
  fmtAntal,
  fmtVolym,
  tradslagFarg,
  type GallringRad,
} from '@/lib/gallring';

/** Tillstånd för Dgv-passet. Skiljs åt så raden aldrig påstår något den inte vet. */
type DgvLage = 'laddar' | 'klar' | 'fel';

/** Andelsstapel per trädslag. Texten under bär informationen — stapeln är bara
 *  en snabbare väg till samma sak för ögat. */
function Tradslagsstapel({ rad }: { rad: GallringRad }) {
  const total = rad.tradslag.reduce((s, t) => s + t.volym, 0);
  if (total <= 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          display: 'flex',
          height: 6,
          borderRadius: 3,
          overflow: 'hidden',
          background: T.groupHi,
        }}
      >
        {rad.tradslag.map((t, i) => (
          <div
            key={t.namn}
            style={{
              width: `${(t.volym / total) * 100}%`,
              background: tradslagFarg(t.namn, i),
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 13, color: T.t2, marginTop: 6 }}>
        {rad.tradslag
          .map((t) => `${t.namn} ${Math.round((t.volym / total) * 100)}%`)
          .join(' · ')}
      </div>
    </div>
  );
}

/** Dgv-raden. Fyra olika tillstånd, fyra olika texter — ett tomt Dgv får aldrig
 *  betyda både "hämtas" och "finns inte". */
function dgvText(rad: GallringRad, lage: DgvLage): string {
  if (rad.diameter) return `Dgv ${Math.round(rad.diameter.dgvMm)} mm`;
  if (lage === 'laddar') return 'Dgv beräknas…';
  if (lage === 'fel') return 'Dgv kunde inte läsas';
  return 'Dgv saknas — ingen stamdata';
}

function Rad({ rad, dgvLage }: { rad: GallringRad; dgvLage: DgvLage }) {
  return (
    <Link
      href={`/gallring/${encodeURIComponent(rad.vo)}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div style={{ padding: '12px 16px', minHeight: 44 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 16,
                color: T.t1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {rad.namn}
            </div>
            <div style={{ fontSize: 13, color: T.t2, marginTop: 2 }}>
              VO {rad.vo} · {rad.maskiner.join(', ') || 'Maskin okänd'}
            </div>
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: T.t1, lineHeight: 1.1 }}>
              {fmtVolym(rad.volymM3fub)}
            </div>
            <div style={{ fontSize: 12, color: T.t2 }}>m³fub</div>
          </div>

          <span
            className="material-symbols-outlined"
            aria-hidden="true"
            style={{ fontSize: 20, color: 'rgba(235,235,245,0.3)', marginRight: -4, marginTop: 2 }}
          >
            chevron_right
          </span>
        </div>

        <div style={{ fontSize: 13, color: T.t2, marginTop: 6 }}>
          {datumspann(rad)}
          {rad.antalDagar > 1 && ` · ${rad.antalDagar} dagar`}
          {' · '}
          {rad.forare.join(', ') || 'Förare okänd'}
        </div>
        <div style={{ fontSize: 13, color: T.t2, marginTop: 2 }}>
          {fmtAntal(rad.stammar)} stammar · {dgvText(rad, dgvLage)}
        </div>

        <Tradslagsstapel rad={rad} />
      </div>
    </Link>
  );
}

export default function GallringListPage() {
  const [rader, setRader] = useState<GallringRad[] | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [dgvLage, setDgvLage] = useState<DgvLage>('laddar');

  const ladda = useCallback(async () => {
    setLaddar(true);
    setFel(null);
    setDgvLage('laddar');
    let grund: GallringRad[];
    try {
      grund = await hamtaGallringar();
      setRader(grund);
    } catch (e) {
      // Laddar / fel / tomt hålls isär. Ett läsfel får aldrig se ut som "inga
      // gallringar" — då tror man att uppföljningen är gjord och tom.
      setRader(null);
      setFel(e instanceof Error ? e.message : 'Kunde inte hämta gallringarna.');
      return;
    } finally {
      setLaddar(false);
    }

    try {
      setRader(await fyllDiametrar(grund));
      setDgvLage('klar');
    } catch {
      // Dgv är ett stödtal. Att det inte gick att läsa fäller inte listan —
      // det skrivs ut på de rader som saknar det.
      setDgvLage('fel');
    }
  }, []);

  useEffect(() => {
    ladda();
  }, [ladda]);

  const total = (rader ?? []).reduce((s, r) => s + r.volymM3fub, 0);

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff }}>
      <PageContainer width="smal" style={{ paddingBottom: 120, paddingTop: 8 }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.6, margin: '8px 0 2px' }}>
          {laddar ? 'Laddar…' : fel ? 'Kunde inte läsa' : `${fmtVolym(total)} m³fub`}
        </h1>
        <p style={{ fontSize: 15, color: T.t2, margin: '0 0 20px' }}>
          {laddar || fel
            ? 'Uttag ur gallringar'
            : `Uttag ur ${fmtAntal(rader?.length ?? 0)} ${
                (rader?.length ?? 0) === 1 ? 'gallring' : 'gallringar'
              }`}
        </p>

        {laddar && (
          <div style={{ padding: '32px 16px', color: T.t2, fontSize: 15 }}>
            Hämtar gallringsuttag…
          </div>
        )}

        {!laddar && fel && (
          <div
            style={{
              background: T.group,
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 15, color: T.t1 }}>{fel}</div>
            <button
              onClick={ladda}
              style={{
                minHeight: 44,
                borderRadius: 10,
                border: 'none',
                background: T.blue,
                color: '#fff',
                fontSize: 16,
                fontFamily: T.ff,
                cursor: 'pointer',
              }}
            >
              Försök igen
            </button>
          </div>
        )}

        {!laddar && !fel && (rader?.length ?? 0) === 0 && (
          <div
            style={{
              background: T.group,
              borderRadius: 12,
              padding: 16,
              fontSize: 15,
              color: T.t2,
              lineHeight: 1.5,
            }}
          >
            Inga gallringar med uttag hittades. Listan fylls av objekt som har
            huvudtyp <span style={{ color: T.t1 }}>Gallring</span> i objektdetaljerna
            och minst en dags produktion importerad. Saknas en trakt du kört: kontrollera
            huvudtypen på objektet, eller att maskinens filer kommit in.
          </div>
        )}

        {!laddar && !fel && (rader?.length ?? 0) > 0 && (
          <>
            <ListGroup>
              {rader!.map((r) => (
                <Rad key={r.vo} rad={r} dgvLage={dgvLage} />
              ))}
            </ListGroup>
            <p style={{ fontSize: 13, color: T.t2, margin: '16px 4px 0', lineHeight: 1.5 }}>
              Volym och stammar kommer från maskinens produktionsfiler. Dgv är den
              grundytevägda medeldiametern, räknad på de stammar som har mätt diameter.
            </p>
          </>
        )}
      </PageContainer>
      <BottomNav />
    </div>
  );
}
