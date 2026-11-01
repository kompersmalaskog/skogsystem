'use client';
// Personal › listan (admin). Svaret först: hur många som behöver åtgärd, ETT tal. Sedan skyddsombudet och
// personerna grupperade på roll. Varje rad säger EN sak i ord — orange när något ska göras, grått när det bara
// är information. Ingen prick: texten bär betydelsen (skillen: färg är aldrig ensam).
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import { antalAttGora, grupperaPaRoll, personStatus, type Person, type Skyddsombud } from '@/lib/personal';

export default function PersonLista({ personal, skyddsombud, valdId, onValj }: {
  personal: Person[];
  skyddsombud: Skyddsombud | null;
  /** Personen som visas bredvid på stor skärm (markeras bara där, se `.ps-vald` i PersonalClient). */
  valdId: string | null;
  onValj: (id: string) => void;
}) {
  const nu = new Date();
  const antal = antalAttGora(personal, nu);
  const grupper = grupperaPaRoll(personal);

  return (
    <div data-personal-lista>
      {antal > 0 ? (
        <section style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }} data-personal-tal>
          <div style={{ ...TYP.tal, color: FARG.text }}>{antal}</div>
          <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>
            {antal === 1 ? 'person behöver åtgärd' : 'personer behöver åtgärd'}
          </div>
        </section>
      ) : (
        <div data-personal-tal>
          <Svarsrad rubrik="Alla nåbara och behöriga" rad={`${personal.length} medarbetare`} />
        </div>
      )}

      {skyddsombud && (
        <Sektion rubrik="Skyddsombud">
          <Rad
            titel={skyddsombud.namn}
            under={skyddsombud.telefon ?? 'Telefon saknas'}
            href={skyddsombud.telefon ? `tel:${skyddsombud.telefon}` : undefined}
            pil={false}
            hoger={skyddsombud.telefon ? <span style={{ ...TYP.text, color: FARG.bla }}>Ring</span> : undefined}
            sista
            attr={{ 'data-skyddsombud': '' }}
          />
        </Sektion>
      )}

      {grupper.map((g) => (
        <Sektion key={g.rubrik} rubrik={`${g.rubrik} (${g.personer.length})`}>
          {g.personer.map((p, i) => {
            const st = personStatus(p, nu);
            const vald = p.id === valdId;
            return (
              <div key={p.id} className={vald ? 'ps-rad ps-vald' : 'ps-rad'} aria-current={vald ? 'true' : undefined}>
                <Rad
                  titel={p.namn}
                  under={<RadUnder maskin={p.maskin_namn} status={st?.text ?? null} atgard={!!st?.atgard} />}
                  onTryck={() => onValj(p.id)}
                  sista={i === g.personer.length - 1}
                  attr={{ 'data-person-rad': p.id, ...(st?.atgard ? { 'data-atgard': '' } : {}) }}
                />
              </div>
            );
          })}
        </Sektion>
      ))}
    </div>
  );
}

function RadUnder({ maskin, status, atgard }: { maskin: string | null; status: string | null; atgard: boolean }) {
  if (!maskin && !status) return null;
  return (
    <>
      {maskin}
      {maskin && status && ' · '}
      {status && <span style={{ color: atgard ? FARG.orange : FARG.text2 }}>{status}</span>}
    </>
  );
}
