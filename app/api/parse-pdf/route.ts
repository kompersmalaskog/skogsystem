import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { base64, mediaType } = await req.json();

  if (!base64) {
    return NextResponse.json({ error: 'No PDF data' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

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
            text: 'Extrahera från detta utbildningsbevis: personens fullständiga namn, datum genomfört (YYYY-MM-DD), kursnamn. Svara ENDAST i JSON utan markdown: {"namn": "", "datum": "", "kurs": ""}',
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
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'Could not parse response', raw: text }, { status: 500 });
  }
}
