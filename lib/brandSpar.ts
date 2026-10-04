// Brand (samråd/kontakter/efterkontroll/utrustning/larm) → brand_samrad, brand_kontakter, brand_efterkontroll.
//
// Före: en effekt på fyra state-värden upsertade ALLA TRE tabellerna efter 2 s — vid varje ändring och direkt efter laddningen
// när något av raderna fanns. `fwi_value: brandRisk?.currentFwi || null` skrevs alltid, men brandRisk finns bara när brandpanelen
// är monterad → fwi_value skrevs som NULL i stort sett varje gång (prod: 0 av 2 brand_samrad-rader har ett fwi_value). Läsfel
// ignorerades och räknades som laddat → tomma kontakter och default-checklistor kunde skrivas över sparade. Kontakter från
// föregående objekt låg kvar när nästa saknade rad (sattes bara `if (rad)`) och kunde skrivas till nästa objekts rad.
//
// Nu: baslinje per tabell direkt efter en LYCKAD laddning (alla fält sätts ALLTID, med defaults). Bara tabeller vars kolumner
// ändrats skrivs, och bara de ändrade kolumnerna. fwi_value utlöser aldrig en sparning och skrivs aldrig som NULL — det följer
// bara med när brand_samrad ändå skrivs och ett riktigt värde finns.
//
// Rena funktioner → enhetstestbara.
import { andradeKolumner, type Kolumner } from './autosparBaslinje';

export interface BrandKontakter {
  uppdragsgivareNamn: string; uppdragsgivareTel: string;
  forsakringsbolag: string; forsakringsnummer: string;
  raddningstjanstNamn: string; raddningstjanstTel: string;
}
export interface BrandEfterkontroll { datum: string; noteringar: string; kvitterad: boolean }
export interface BrandVarden {
  kontakter: BrandKontakter;
  efterkontroll: BrandEfterkontroll;
  utrustning: boolean[];
  larmChecklista: boolean[];
}

export const BRAND_STD_UTRUSTNING: boolean[] = [false, false, false, false];
export const BRAND_STD_LARM: boolean[] = [false, false, false, false, false];
export const BRAND_STD_KONTAKTER: BrandKontakter = {
  uppdragsgivareNamn: '', uppdragsgivareTel: '', forsakringsbolag: '', forsakringsnummer: '', raddningstjanstNamn: '', raddningstjanstTel: '',
};

/** Sparade rader → formulärvärden. ALLT sätts (saknad rad = defaults) så inget ligger kvar från föregående objekt.
 *  `nuDatum` = 'YYYY-MM-DDTHH:mm' (efterkontrollens förval när raden saknar datum). */
export function brandVardenFranRader(sam: any, kont: any, ek: any, nuDatum: string): BrandVarden {
  return {
    kontakter: kont ? {
      uppdragsgivareNamn: kont.uppdragsgivare_namn || '',
      uppdragsgivareTel: kont.uppdragsgivare_tel || '',
      forsakringsbolag: kont.forsakringsbolag || '',
      forsakringsnummer: kont.forsakringsnummer || '',
      raddningstjanstNamn: kont.raddningstjanst_namn || '',
      raddningstjanstTel: kont.raddningstjanst_tel || '',
    } : { ...BRAND_STD_KONTAKTER },
    efterkontroll: ek ? {
      datum: ek.datum ? new Date(ek.datum).toISOString().slice(0, 16) : nuDatum,
      noteringar: ek.noteringar || '',
      kvitterad: ek.kvitterad || false,
    } : { datum: nuDatum, noteringar: '', kvitterad: false },
    utrustning: sam && Array.isArray(sam.utrustning) ? sam.utrustning : [...BRAND_STD_UTRUSTNING],
    larmChecklista: sam && Array.isArray(sam.larm_checklista) ? sam.larm_checklista : [...BRAND_STD_LARM],
  };
}

export type BrandTabell = 'brand_samrad' | 'brand_kontakter' | 'brand_efterkontroll';
export type BrandBaslinje = Record<BrandTabell, Kolumner>;

/** Formulärvärden → kolumner per tabell (det som en sparning skulle skriva; utan objekt_id, updated_at och fwi_value). */
export function brandKolumnerFranVarden(v: BrandVarden): BrandBaslinje {
  return {
    brand_samrad: { utrustning: v.utrustning, larm_checklista: v.larmChecklista },
    brand_kontakter: {
      uppdragsgivare_namn: v.kontakter.uppdragsgivareNamn || null,
      uppdragsgivare_tel: v.kontakter.uppdragsgivareTel || null,
      forsakringsbolag: v.kontakter.forsakringsbolag || null,
      forsakringsnummer: v.kontakter.forsakringsnummer || null,
      raddningstjanst_namn: v.kontakter.raddningstjanstNamn || null,
      raddningstjanst_tel: v.kontakter.raddningstjanstTel || null,
    },
    brand_efterkontroll: { datum: v.efterkontroll.datum, noteringar: v.efterkontroll.noteringar || null, kvitterad: v.efterkontroll.kvitterad },
  };
}

export interface BrandSkrivning { tabell: BrandTabell; kolumner: Kolumner }

/** Vilka tabeller ska skrivas nu, med vilka kolumner? `fwi` = brandpanelens aktuella värde (null när panelen inte är klar):
 *  följer bara med brand_samrad när den ändå skrivs, och aldrig som null. */
export function brandAttSkriva(bas: BrandBaslinje, nu: BrandVarden, fwi: number | null): BrandSkrivning[] {
  const kol = brandKolumnerFranVarden(nu);
  const ut: BrandSkrivning[] = [];
  for (const tabell of ['brand_samrad', 'brand_kontakter', 'brand_efterkontroll'] as BrandTabell[]) {
    const andrat = andradeKolumner(bas[tabell], kol[tabell]);
    if (Object.keys(andrat).length === 0) continue;
    if (tabell === 'brand_samrad' && typeof fwi === 'number' && Number.isFinite(fwi)) andrat.fwi_value = fwi;   // 0 är ett riktigt värde; anroparen skickar null tills panelen är klar
    ut.push({ tabell, kolumner: andrat });
  }
  return ut;
}
