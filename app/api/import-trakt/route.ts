import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import JSZip from 'jszip';
import proj4 from 'proj4';
import { packaUppEnvz } from '@/lib/trakt/envz';
import { parseObjektInfo } from '@/lib/trakt/objektinfo';
import { parseTraktdirektivText } from '@/lib/trakt/td-parser';
import { mergeFalt, executorGodkand, forvantadExecutorOrgnr } from '@/lib/trakt/merge';
import { packaGeometri, bboxCentrum } from '@/lib/trakt/geometri';
import { klassificeraDokument } from '@/lib/trakt/dokument';

export const runtime = 'nodejs'; // JSZip + unpdf + fast-xml-parser behöver Node-runtime, inte edge

// Klient med ANVÄNDARENS session (cookies). Uppladdningar till kartbilder-bucketen går då
// genom storage-policyerna (privat bucket, bara admin skriver) istället för anonymt.
async function skapaInloggadKlient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* svar från API-route sätter inga cookies */ },
      },
    }
  );
}

// Service-role-klient för att LÄSA den privata trakt-inbox-bucketen och SKRIVA objekt_geometri
// (vars RLS bara tillåter authenticated SELECT). Går förbi RLS.
function skapaServiceKlient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Läs JPEG-dimensioner från binärdata
function getJpegDimensions(data: Uint8Array): { width: number; height: number } | null {
  let i = 0;
  if (data[i] !== 0xFF || data[i + 1] !== 0xD8) return null; // Inte JPEG
  i += 2;
  while (i < data.length) {
    if (data[i] !== 0xFF) return null;
    const marker = data[i + 1];
    if (marker === 0xC0 || marker === 0xC2) { // SOF0 eller SOF2
      const height = (data[i + 5] << 8) | data[i + 6];
      const width = (data[i + 7] << 8) | data[i + 8];
      return { width, height };
    }
    const length = (data[i + 2] << 8) | data[i + 3];
    i += 2 + length;
  }
  return null;
}

// SWEREF99 TM (EPSG:3006) — används av kartbilds-bounds (zip-vägen). RÖR EJ.
const SWEREF99TM = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
function sweref99ToWgs84(n: number, e: number): { lat: number; lng: number } {
  const [lng, lat] = proj4(SWEREF99TM, 'WGS84', [e, n]);
  return { lat, lng };
}

export async function POST(request: NextRequest) {
  try {
    // Auth-gate: trakt-importen skriver markägardata — bara inloggad admin får köra den.
    const supabase = await skapaInloggadKlient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 });
    }
    const { data: medarbetare } = await supabase
      .from('medarbetare')
      .select('roll')
      .eq('epost', user.email)
      .single();
    if (medarbetare?.roll !== 'admin') {
      return NextResponse.json({ error: 'Kräver admin' }, { status: 403 });
    }

    // Filen ligger i trakt-inbox (klienten laddade upp via signerad URL). Vi får bara sökväg +
    // period som JSON, så requesten slår aldrig i Vercels ~4,5 MB body-gräns.
    const { sokvag, ar: arRaw, manad: manadRaw } = await request.json();
    const ar = parseInt(arRaw);
    const manad = parseInt(manadRaw);
    if (!sokvag || typeof sokvag !== 'string') {
      return NextResponse.json({ error: 'sokvag saknas' }, { status: 400 });
    }

    const service = skapaServiceKlient();
    const { data: blob, error: dlErr } = await service.storage.from('trakt-inbox').download(sokvag);
    if (dlErr || !blob) {
      return NextResponse.json(
        { error: `Kunde inte hämta filen ur trakt-inbox: ${dlErr?.message ?? 'saknas'}` },
        { status: 404 }
      );
    }
    const arrayBuffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const varningar: string[] = [];

    // Envz (StanForD Envelope) eller vanlig zip? packaUppEnvz -> null om ingen .env (= zip).
    const envz = await packaUppEnvz(arrayBuffer);

    // Samla PDF:er + (zip) kartbild-filer + (envz) object-info.
    const pdfer: { namn: string; bytes: Uint8Array }[] = [];
    let jpgEntry: JSZip.JSZipObject | null = null;
    let jpgFilename = '';
    let jgwEntry: JSZip.JSZipObject | null = null;
    let bilagor: Map<string, Buffer> | null = null;
    let objektinfoXml: string | null = null;
    let ogiXml: string | null = null;

    if (envz) {
      varningar.push(...envz.varningar);
      bilagor = envz.bilagor;
      ogiXml = envz.ogiXml;
      for (const [namn, buf] of Array.from(bilagor)) {
        if (/\.pdf$/i.test(namn)) pdfer.push({ namn, bytes: new Uint8Array(buf) });
        else if (/object-info\.xml$/i.test(namn)) objektinfoXml = buf.toString('utf-8');
      }
    } else {
      for (const [filename, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const l = filename.toLowerCase();
        if (l.endsWith('.pdf')) pdfer.push({ namn: filename, bytes: new Uint8Array(await entry.async('arraybuffer')) });
        else if (l.endsWith('.jpg')) { jpgEntry = entry; jpgFilename = filename; }
        else if (l.endsWith('.jgw')) { jgwEntry = entry; }
      }
    }

    // Envz-fält + Executor-gate.
    let envzUttag: ReturnType<typeof parseObjektInfo> | null = null;
    if (envz && objektinfoXml) {
      envzUttag = parseObjektInfo(objektinfoXml, ogiXml);
      varningar.push(...envzUttag.varningar);
      if (!executorGodkand(envzUttag.executor)) {
        return NextResponse.json(
          { error: `Executor "${envzUttag.executor ?? 'saknas'}" matchar inte ${forvantadExecutorOrgnr()} — annan entreprenörs leverans, inget objekt skapat.` },
          { status: 403 }
        );
      }
    } else if (envz && !objektinfoXml) {
      varningar.push('envz saknar object-info.xml — bara TD-fält används.');
    }

    // Klassificera dokument (suffix-regler, arrayer, ingen fallback).
    const klass = klassificeraDokument(pdfer, envzUttag?.info);
    varningar.push(...klass.varningar);
    if (!klass.traktdirektiv) {
      return NextResponse.json({ error: 'Inget traktdirektiv (_TD.pdf) i filen — importen gissar inte.' }, { status: 400 });
    }

    // Traktnr ur TD-filnamnet (t.ex. "886465_TD.pdf" -> "886465").
    const tdNamn = klass.traktdirektiv.namn.split('/').pop() || klass.traktdirektiv.namn;
    const tdFilMatch = tdNamn.match(/(\d{6})_TD\.pdf/i);
    const traktnrFromFilename = tdFilMatch ? tdFilMatch[1] : '';

    // TD-text -> fält (samma parser för envz och zip).
    let text = '';
    try {
      const { extractText } = await import('unpdf');
      text = (await extractText(klass.traktdirektiv.bytes.slice(), { mergePages: true })).text || '';
    } catch (e) {
      console.error('PDF extraction failed:', e);
      return NextResponse.json({ error: 'Kunde inte läsa PDF' }, { status: 500 });
    }
    const td = parseTraktdirektivText(text, traktnrFromFilename);

    // Merge: TD som bas, envz vinner ENDAST där envz har ett värde.
    const tdRecord: Record<string, any> = {
      namn: td.namn, traktnr: td.traktnr, vo_nummer: td.vo_nummer,
      markagare: td.markagare, markagare_epost: td.markagare_epost, markagare_tel: td.markagare_tel,
      inkopare: td.inkopare, inkopare_tel: td.inkopare_tel,
      cert: td.cert, typ: td.typ, volym: td.volym, areal: td.areal,
      grot: td.grot, anteckningar: td.anteckningar, sortiment: td.sortiment,
      larmkoordinat_lat: td.larmkoordinat?.lat, larmkoordinat_lng: td.larmkoordinat?.lng,
    };
    const falt = envzUttag ? mergeFalt(tdRecord, envzUttag.falt) : tdRecord;

    // Geometri (envz) + kartpin. Pin = bbox-centrum för traktgränsen; nödlösning = larmkoordinat.
    let geoFeatures: any[] = [];
    let lat: number | null = null;
    let lng: number | null = null;
    if (envz && bilagor) {
      const geo = await packaGeometri(bilagor);
      varningar.push(...geo.varningar);
      geoFeatures = geo.features;
      const c = bboxCentrum(geo.features, 'traktgräns');
      if (c) { lat = c.lat; lng = c.lng; }
      else if (falt.larmkoordinat_lat != null) { lat = falt.larmkoordinat_lat; lng = falt.larmkoordinat_lng; }
    } else {
      // Zip: generisk koordinat ur TD-texten (oförändrat beteende).
      lat = td.lat; lng = td.lng;
    }

    const traktnr = String(falt.traktnr || td.traktnr || Date.now());

    // === KARTBILD (BARA zip — envz har TK-PDF, inte georef JPG). Bounds-blocket oförändrat. ===
    let kartbild_url: string | null = null;
    let kartbild_bounds: number[][] | null = null;
    if (!envz && jpgEntry) {
      try {
        const jpgData = new Uint8Array(await jpgEntry.async('arraybuffer'));
        const storagePath = `${traktnr}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('kartbilder')
          .upload(storagePath, jpgData, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) {
          console.error('Kartbild upload error:', uploadError);
        } else {
          // Bucketen är PRIVAT — lagra PATH, aldrig URL. Läsning signerar via lib/kartfiler.ts.
          kartbild_url = storagePath;
        }
        if (jgwEntry) {
          const dimensions = getJpegDimensions(jpgData);
          const jgwText = await jgwEntry.async('string');
          const jgwLines = jgwText.trim().split(/\r?\n/);
          const parseJgwValue = (s: string) => parseFloat(s.replace(',', '.'));
          if (dimensions && jgwLines.length >= 6) {
            const pixelSizeX = parseJgwValue(jgwLines[0]);
            const pixelSizeY = parseJgwValue(jgwLines[3]);
            const pixelCenterX = parseJgwValue(jgwLines[4]);
            const pixelCenterY = parseJgwValue(jgwLines[5]);
            // JGW anger pixel-center, justera till pixel-kant (övre vänstra hörnet)
            const upperLeftX = pixelCenterX - pixelSizeX / 2;
            const upperLeftY = pixelCenterY - pixelSizeY / 2;
            const lowerRightX = upperLeftX + (dimensions.width * pixelSizeX);
            const lowerRightY = upperLeftY + (dimensions.height * pixelSizeY);
            const upperLeft = sweref99ToWgs84(upperLeftY, upperLeftX);
            const lowerRight = sweref99ToWgs84(lowerRightY, lowerRightX);
            kartbild_bounds = [
              [lowerRight.lat, upperLeft.lng], // Southwest corner
              [upperLeft.lat, lowerRight.lng]  // Northeast corner
            ];
          }
        }
      } catch (e) {
        console.error('Kartbild error:', e);
      }
    }

    // === DOKUMENT — spara paths i privata kartbilder-bucketen. Kända typer -> egna kolumner,
    // okända -> ovriga_dokument med originalnamnet bevarat. ===
    const laddaUppPdf = async (bytes: Uint8Array | null, path: string): Promise<string | null> => {
      if (!bytes) return null;
      const { error: pdfErr } = await supabase.storage.from('kartbilder')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
      if (pdfErr) { console.error(`PDF-uppladdning (${path}) misslyckades:`, pdfErr); return null; }
      return path;
    };
    const traktdirektiv_url = await laddaUppPdf(klass.traktdirektiv.bytes, `${traktnr}_traktdirektiv.pdf`);
    const traktkarta_url = await laddaUppPdf(klass.traktkarta?.bytes ?? null, `${traktnr}_traktkarta.pdf`);
    const stamplingslangd_url = await laddaUppPdf(klass.stamplingslangd?.bytes ?? null, `${traktnr}_stamplingslangd.pdf`);
    const valtlapp_url = await laddaUppPdf(klass.valtlapp?.bytes ?? null, `${traktnr}_valtlapp.pdf`);
    const ovriga_dokument: { namn: string; path: string }[] = [];
    for (let i = 0; i < klass.ovriga.length; i++) {
      const o = klass.ovriga[i];
      const path = await laddaUppPdf(o.bytes, `${traktnr}_ovrigt_${i}.pdf`);
      if (path) ovriga_dokument.push({ namn: o.namn, path }); // originalnamn bevarat + synligt
    }

    const harLarm = falt.larmkoordinat_lat != null && falt.larmkoordinat_lng != null;

    const data: Record<string, any> = {
      vo_nummer: falt.vo_nummer || null,
      traktnr: falt.traktnr || null,
      namn: falt.namn || 'Okänt objekt',
      bolag: falt.bolag || 'Vida',
      inkopare: falt.inkopare || null,
      inkopare_tel: falt.inkopare_tel || null,
      markagare: falt.markagare || null,
      markagare_tel: falt.markagare_tel || null,
      markagare_epost: falt.markagare_epost || null,
      cert: falt.cert || null,
      typ: falt.typ,
      atgard: falt.typ === 'slutavverkning' ? 'Au' : 'Gallring',
      volym: falt.volym,
      areal: falt.areal ?? null,
      avverkningsform: falt.avverkningsform || null,
      region: falt.region || null,
      grot: falt.grot,
      lat,
      lng,
      larmkoordinat_lat: harLarm ? falt.larmkoordinat_lat : null,
      larmkoordinat_lng: harLarm ? falt.larmkoordinat_lng : null,
      larmkoordinat_kalla: harLarm ? (envz ? 'envz' : 'td') : null,
      larmkoordinat_bekraftad: harLarm ? false : null,
      sortiment: (falt.sortiment && falt.sortiment.length > 0) ? falt.sortiment : null,
      anteckningar: falt.anteckningar || null,
      // Checklist rått (frågor + svarsalternativ + alarm-flagga). Larm-tolkning: egen uppgift.
      checklist_items: (envzUttag && envzUttag.checklist.length > 0) ? envzUttag.checklist : null,
      kartbild_url,
      kartbild_bounds,
      traktdirektiv_url,
      stamplingslangd_url,
      traktkarta_url,
      valtlapp_url,
      ovriga_dokument: ovriga_dokument.length > 0 ? ovriga_dokument : null,
      import_varningar: varningar.length > 0 ? varningar : null,
      ar,
      manad,
      ordning: 1,
      // status utelämnas → DB-default 'planerad' vid INSERT. Vid omimport (UPDATE) skrivs
      // varken status, lat/lng, anteckningar eller planeringsfälten över — se SKYDDADE nedan.
      kalla: envz ? 'envz' : 'traktdirektiv',
    };

    // === Omimport-med-merge: matcha på vo_nummer (enda unika constraint, objekt_vo_nummer_key).
    // Ingen fallback på traktnr (ej unikt, tomt på hälften av raderna). Saknar envz vo_nummer
    // eller finns ingen rad med det -> INSERT. vo_nummer kan vara icke-numeriskt ("P-1012") ->
    // jämför som sträng. ===
    let befintlig: { id: string; larmkoordinat_kalla: string | null } | null = null;
    if (falt.vo_nummer) {
      const { data: rader } = await supabase
        .from('objekt')
        .select('id, larmkoordinat_kalla')
        .eq('vo_nummer', String(falt.vo_nummer))
        .limit(1);
      befintlig = rader && rader[0] ? (rader[0] as any) : null;
    }

    let saved: any = null;

    if (befintlig) {
      // === UPDATE (omimport) — bevara det användaren äger ===
      // SKYDDADE: kolumner som ALDRIG skrivs vid omimport. envz äger dem inte. Listan kommer
      // växa — lägg nya manuella fält HÄR, inte som spridda specialfall.
      //   lat, lng            manuellt flyttade kartpinnar
      //   anteckningar        användartext (redigeras i /objekt)
      //   ar, manad, ordning  planering (envz har dem inte ändå — skydda ändå explicit)
      //   status              planeringsstatus (sätts av planeringsvyn)
      //   larmkoordinat_*     villkorat nedan (bevaras helt om kalla='egen')
      const SKYDDADE = ['lat', 'lng', 'anteckningar', 'ar', 'manad', 'ordning', 'status'];

      // Larmkoordinat satt på plats ('egen') slår alltid en kontorsräknad koordinat -> rör
      // varken lat/lng/kalla/bekraftad. Logga att envz hade ett värde som inte skrevs.
      const bevaraLarm = befintlig.larmkoordinat_kalla === 'egen';
      if (bevaraLarm && harLarm) {
        varningar.push('Larmkoordinat bevarad (satt på plats, kalla=egen) — envz hade ett värde som inte skrevs över.');
      }

      const patch: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        if (SKYDDADE.includes(k)) continue;                                  // aldrig vid omimport
        if (k.startsWith('larmkoordinat_') && bevaraLarm) continue;          // 'egen' -> orört
        if (v === null || v === undefined) continue;                         // nollar aldrig befintligt värde
        if (typeof v === 'string' && v.trim() === '') continue;
        patch[k] = v;
      }
      patch.import_varningar = varningar.length > 0 ? varningar : null;       // varningar refreshas alltid

      const { data: upd, error: updErr } = await supabase
        .from('objekt').update(patch).eq('id', befintlig.id).select().single();
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
      saved = upd;

      // Geometrin är importerad (inga manuella ändringar) -> ersätt helt: radera + skriv ny.
      await service.from('objekt_geometri').delete().eq('objekt_id', befintlig.id);
      if (geoFeatures.length > 0) {
        const { error: geoErr } = await service.from('objekt_geometri').insert({
          objekt_id: befintlig.id,
          geometri: { type: 'FeatureCollection', features: geoFeatures },
          kalla: 'envz',
        });
        if (geoErr) console.error('objekt_geometri insert (omimport) misslyckades:', geoErr);
      }
    } else {
      // === INSERT (nytt objekt) — hela data, inkl. lat/lng/anteckningar ===
      const { data: ins, error } = await supabase.from('objekt').insert(data).select().single();
      if (error) {
        console.error('Supabase error:', error);
        if (error.code === '23505') {
          return NextResponse.json({ error: 'Objektet finns redan' }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      saved = ins;
      if (geoFeatures.length > 0 && saved?.id) {
        const { error: geoErr } = await service.from('objekt_geometri').insert({
          objekt_id: saved.id,
          geometri: { type: 'FeatureCollection', features: geoFeatures },
          kalla: 'envz',
        });
        if (geoErr) console.error('objekt_geometri insert misslyckades:', geoErr);
      }
    }

    return NextResponse.json({ success: true, objekt: saved, uppdaterad: !!befintlig, varningar });

  } catch (err: any) {
    console.error('Import error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
