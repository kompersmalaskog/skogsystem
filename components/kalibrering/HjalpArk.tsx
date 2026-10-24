'use client';
// "Vad betyder talen?" bakom frågetecknet i Läget — vardagsfrågan stor, facktermen dämpad, och kravet ur maskinens egen profil.
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import { fmtKrav } from '@/lib/kalibrering/format';
import { LANGD_MATT, MATT } from '@/lib/kalibrering/ordlista';
import type { BedomningResp } from '@/lib/kalibrering/typer';
import { Meta } from './delar';

export default function HjalpArk({ bedomning }: { bedomning: BedomningResp | null }) {
  const tr = bedomning?.trosklar ?? [];
  const g = (metrik: string) => tr.find(t => t.variabel === 'diameter' && t.metrik === metrik);
  const traff = g('traffprocent'), syst = g('systematisk'), std = g('standardavv');
  const langd = tr.find(t => t.variabel === 'langd' && t.metrik === 'traffprocent');
  const profil = bedomning?.profil ?? 'Profilen';
  const tol = traff?.tolerans != null ? Number(traff.tolerans) : 4;

  const avsnitt = [
    { m: MATT.traffprocent, text: `Av alla mätningar — hur många hamnar inom ${fmtKrav(tol)} mm från det du klavat? ${profil} vill att minst ${traff ? Math.round(Number(traff.golv)) : '–'} % ska träffa.` },
    { m: MATT.systematisk, text: `Mäter den för stort hela tiden? Då sitter kurvan snett — det går att justera. ${profil} vill att den drar mindre än ${syst ? fmtKrav(Number(syst.mal)) : '–'} mm.` },
    { m: MATT.standardavv, text: `Ger den samma svar varje gång, eller hoppar den? Hoppar den är det greppet. ${profil} vill att hoppen håller sig under ${std ? fmtKrav(Number(std.mal)) : '–'} mm.` },
    ...(langd ? [{ m: LANGD_MATT, text: `Av alla stockar — hur många hamnar inom ${langd.tolerans != null ? fmtKrav(Number(langd.tolerans)) : '–'} cm från det du klavat? ${profil} vill att minst ${Math.round(Number(langd.golv))} % ska träffa. Räknas för sig: diametern kan klara kravet medan längden inte gör det.` }] : []),
  ];

  return (
    <>
      {avsnitt.map(a => (
        <div key={a.m.term} style={{ marginBottom: AVSTAND.l }}>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>{a.m.fraga} <span style={{ ...TYP.meta, color: FARG.text2 }}>{a.m.term}</span></div>
          <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>{a.text}</p>
        </div>
      ))}
      <div style={{ ...TYP.listtitel, color: FARG.text }}>Alla måste stämma. Det räcker inte att träffa rätt om svaren hoppar, eller om längden inte håller.</div>
      {!bedomning?.profil && <Meta style={{ marginTop: AVSTAND.m }}>Välj en maskin för att se dess exakta krav (Biometria har egna tal).</Meta>}
    </>
  );
}
