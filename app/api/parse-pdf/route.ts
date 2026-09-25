import { NextRequest, NextResponse } from 'next/server';

// Läser av ett utbildningsbevis (PDF) och returnerar personens namn, datum och
// – när en katalog skickas med – den utbildning_typ.namn som bäst matchar kursen.
// Frontend skickar `typer` (katalogens namn) så att resultatet mappas mot
// befintliga utbildningstyper i stället för fri text.
export async function POST(req: NextRequest) {
  const { base64, mediaType, typer } = await req.json();

  if (!base64) {
    return NextResponse.json({ error: 'No PDF data' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const katalog: string[] = Array.isArray(typer)
    ? typer.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : [];

  const katalogInstruktion = katalog.length
    ? `\n\nMatcha kursen mot EXAKT en av dessa befintliga utbildningstyper (kopiera namnet ordagrant). Hittar du ingen rimlig matchning, sätt typ_namn till null.\nUtbildningstyper:\n${katalog.map((n) => `- ${n}`).join('\n')}`
    : '';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: mediaType || 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text:
              'Extrahera från detta utbildningsbevis: personens fullständiga namn (namn), ' +
              'datum genomfört i formatet YYYY-MM-DD (datum), och kursens namn (kurs).' +
              katalogInstruktion +
              '\n\nSvara ENDAST med JSON utan markdown: {"namn": "", "datum": "", "kurs": "", "typ_namn": null}',
          },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return NextResponse.json({ error: `Claude API error: ${err}` }, { status: 500 });
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  try {
    const parsed = JSON.parse(text);
    // Säkerställ att typ_namn (om satt) faktiskt finns i katalogen — annars null.
    if (parsed.typ_namn && katalog.length && !katalog.includes(parsed.typ_namn)) {
      parsed.typ_namn = null;
    }
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'Could not parse response', raw: text }, { status: 500 });
  }
}
