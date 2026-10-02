// Objektlistan för tidsregistrering — EN byggare, delad av arbetsrapporten och
// Planera-vyn. Två vyer som listar "trakter att lägga tid på" ska aldrig kunna
// visa olika trakter (Trestensdal 2026-10-02: planerad trakt utan dim_objekt-rad
// fanns inte i väljaren, #657).
//
// Källa: dim_objekt (skapas av importen när maskinen kört första filen) PLUS
// planerade/pågående objekt som ännu saknar dim-rad, med VO-numret som id. Det
// är samma nummer importen sätter som dim_objekt.objekt_id när första filen
// kommer (Betet 11218909, Jätsbygd 11217392, Rävemåla 11241031), så ett sparat
// objekt_id på extra_tid/segment förblir giltigt när dim-raden dyker upp.
// Avslutade utan dim-rad (gamla specialjobb) och objekt utan VO lämnas utanför.
import { formatObjektNamn } from "@/utils/formatObjektNamn";

export type ArbetsObjekt = {
  id: string;
  namn: string;
  ägare: string;
  lat: number | null;
  lng: number | null;
  vo: string | null;
  atgard: string | null;
  status: string | null;
};

type DimRad = {
  objekt_id: string; object_name?: string | null; vo_nummer?: string | number | null;
  skogsagare?: string | null; huvudtyp?: string | null; atgard?: string | null;
  latitude?: number | null; longitude?: number | null;
};
type ObjektRad = {
  vo_nummer?: string | number | null; status?: string | null; namn?: string | null;
  markagare?: string | null; lat?: number | null; lng?: number | null;
  atgard?: string | null; dim_objekt_id?: string | null;
};

export function byggArbetsObjektLista(dim: DimRad[] | null | undefined, objekt: ObjektRad[] | null | undefined): ArbetsObjekt[] {
  const dimRader = dim ?? [];
  const objektRader = objekt ?? [];
  const statusPerVo = new Map<string, string>(
    objektRader.filter(r => r.vo_nummer != null && r.status).map(r => [String(r.vo_nummer), r.status as string]),
  );
  const urDim: ArbetsObjekt[] = dimRader.map(o => {
    // object_name är ibland en autogenererad timestamp-sträng (yymmddHHMMSS).
    // Faller då tillbaka till "Skogsägare · Huvudtyp" så föraren ser ett vettigt namn.
    const n = (o.object_name || "").trim();
    const raw = n && !/^\d{10,}$/.test(n)
      ? n
      : ([o.skogsagare, o.huvudtyp].filter(Boolean).join(" · ") || o.objekt_id);
    return {
      id: o.objekt_id, namn: formatObjektNamn(raw), ägare: o.skogsagare || "",
      lat: o.latitude ?? null, lng: o.longitude ?? null,
      vo: o.vo_nummer != null ? String(o.vo_nummer) : null, atgard: o.atgard || o.huvudtyp || null,
      status: o.vo_nummer != null ? statusPerVo.get(String(o.vo_nummer)) ?? null : null,
    };
  });
  const dimNycklar = new Set<string>();
  for (const o of dimRader) {
    dimNycklar.add(String(o.objekt_id));
    if (o.vo_nummer != null) dimNycklar.add(String(o.vo_nummer));
  }
  const utanDim: ArbetsObjekt[] = objektRader
    .filter(r => r.vo_nummer != null && (r.status === "planerad" || r.status === "pagaende")
      && !dimNycklar.has(String(r.vo_nummer)) && !(r.dim_objekt_id && dimNycklar.has(String(r.dim_objekt_id))))
    .map(r => ({
      id: String(r.vo_nummer), namn: formatObjektNamn((r.namn || "").trim() || String(r.vo_nummer)), ägare: r.markagare || "",
      lat: r.lat ?? null, lng: r.lng ?? null, vo: String(r.vo_nummer), atgard: r.atgard || null, status: r.status ?? null,
    }));
  return [...urDim, ...utanDim].sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
}
