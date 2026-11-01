'use client';
// Personal › en person. Uppifrån: vem och var, hur man når personen, vem man ringer om något händer,
// och två rader som ÄGS av andra vyer (Utbildning, Ledighet). Ingenting här räknas ut — texten kommer ur lib/personal.
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens';
import { fornamn, ledighetText, saknarAnhorig, saknarAnstallningsdatum, saknarTelefon, utbildningStatus, type Person } from '@/lib/personal';

const ROLL_NAMN: Record<string, string> = { forare: 'Förare', admin: 'Admin' };

export default function PersonSida({ person, arAdmin, arJag, onAndra, onAndraMat, onTillbaka }: {
  person: Person;
  arAdmin: boolean;
  /** Den inloggades egen sida: ingen Ring/SMS, rubriken "Mina uppgifter", texterna i du-form. */
  arJag: boolean;
  onAndra: () => void;
  /** Öppnar Mat-arket. */
  onAndraMat: () => void;
  /** Bara admin på telefon: tillbaka till listan. Döljs på stor skärm där listan står bredvid. */
  onTillbaka?: () => void;
}) {
  const nu = new Date();
  const tel = person.telefon;
  const utb = utbildningStatus(person.utbildning);
  const roll = person.roll ? (ROLL_NAMN[person.roll] ?? person.roll) : null;
  const under = [roll, person.maskin_namn].filter(Boolean).join(' · ');
  const anhorigSaknas = saknarAnhorig(person);
  const telSaknas = saknarTelefon(person);
  const kanAndra = arAdmin || arJag;
  // Skärmens ENDA primära knapp: när den egna anhörigen saknas är det det enda föraren ska göra här.
  const andraArPrimar = arJag && (anhorigSaknas || telSaknas);

  return (
    <div data-personal-person={person.id}>
      {onTillbaka && (
        <div className="ps-tillbaka">
          <button type="button" onClick={onTillbaka} style={KNAPP.lank}>‹ Personal</button>
        </div>
      )}

      <header style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
        {arJag && <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.xs }}>Mina uppgifter</div>}
        <h1 style={{ margin: 0, ...TYP.titel, color: FARG.text }}>{person.namn}</h1>
        {under && <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>{under}</div>}
      </header>

      {!arJag && tel && (
        <div style={{ display: 'flex', gap: AVSTAND.s, marginBottom: AVSTAND.xl }}>
          <a href={`tel:${tel}`} style={{ ...KNAPP.sekundar, textDecoration: 'none' }} data-ring>Ring</a>
          <a href={`sms:${tel}`} style={{ ...KNAPP.sekundar, textDecoration: 'none' }} data-sms>SMS</a>
        </div>
      )}

      <Sektion rubrik="Telefon">
        <Rad
          titel={tel ?? 'Saknas'}
          under={telSaknas ? <span style={{ color: FARG.orange }}>{arJag ? 'Fyll i ditt nummer så att vi når dig' : `${fornamn(person.namn)} går inte att ringa`}</span> : undefined}
          sista
          attr={{ 'data-telefon': '' }}
        />
      </Sektion>

      <Sektion rubrik="Anhörig">
        {anhorigSaknas ? (
          <Rad
            titel={person.anhorig_namn || 'Saknas'}
            under={<span style={{ color: FARG.orange }}>{arJag ? 'Fyll i vem vi ringer om något händer dig' : 'Vi vet inte vem vi ringer vid en olycka'}</span>}
            sista
            attr={{ 'data-anhorig': 'saknas' }}
          />
        ) : (
          <Rad
            titel={person.anhorig_namn || 'Namn saknas'}
            under={[person.anhorig_relation, person.anhorig_telefon].filter(Boolean).join(' · ')}
            href={`tel:${person.anhorig_telefon}`}
            pil={false}
            hoger={<span style={{ ...TYP.text, color: FARG.bla }}>Ring</span>}
            sista
            attr={{ 'data-anhorig': '' }}
          />
        )}
      </Sektion>

      {kanAndra && (
        <div style={{ marginBottom: AVSTAND.xl }}>
          <button type="button" onClick={onAndra} style={andraArPrimar ? KNAPP.primar : KNAPP.sekundar} data-andra>
            {arJag && anhorigSaknas ? 'Fyll i anhörig' : 'Ändra telefon och anhörig'}
          </button>
        </div>
      )}

      <Sektion rubrik="Utbildning">
        {utb ? (
          <Rad
            titel={<span style={{ color: utb.atgard ? FARG.orange : FARG.text }}>{utb.text}</span>}
            href={`/utbildning/person/${person.id}`}
            attr={{ 'data-utbildning': utb.atgard ? 'atgard' : 'ok' }}
            sista
          />
        ) : (
          <Rad titel="Inga utbildningskrav" dampad sista attr={{ 'data-utbildning': 'inga' }} />
        )}
      </Sektion>

      <Sektion rubrik="Ledighet">
        <Rad titel={ledighetText(person.ledighet, nu)} dampad={!person.ledighet} sista attr={{ 'data-ledighet': '' }} />
      </Sektion>

      {/* Mat: bara när svaret bär fältet (ett läsfel ger ingen rad, aldrig ett påhittat "Inget särskilt"). */}
      {person.mat !== undefined && (
        <Sektion rubrik="Mat" not={arJag ? 'Bara du och admin ser det.' : undefined}>
          <Rad
            titel={person.mat || 'Inget särskilt'}
            dampad={!person.mat}
            under={arJag && !person.mat ? 'Om vi beställer mat, till exempel på en utbildning' : undefined}
            onTryck={kanAndra ? onAndraMat : undefined}
            sista
            attr={{ 'data-mat': person.mat ? 'ifylld' : 'tom' }}
          />
        </Sektion>
      )}

      {arAdmin && (
        <Sektion rubrik="Mer">
          <Rad
            titel="Fler uppgifter i Admin"
            under={saknarAnstallningsdatum(person)
              ? <span style={{ color: FARG.orange }}>Anställningsdatum saknas · behövs för lönen</span>
              : 'Roll, maskin, adress, lön'}
            href={`/admin?flik=medarbetare&person=${person.id}`}
            sista
            attr={{ 'data-admin-lank': '' }}
          />
        </Sektion>
      )}
    </div>
  );
}
