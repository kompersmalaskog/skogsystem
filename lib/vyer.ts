// Vyregistret — EN lista över appens vyer. Startsidan (components/startsida) läser härifrån:
// favoriterna, "Alla vyer", sökningen och kontomenyn. En ny vy = en rad här, så hamnar den i rätt grupp
// av sig själv och startsidan växer aldrig.
//
// Reglerna (beslut Martin 2026-10-15/17, canvasen "Skogsystem startsida", sidan Slutlig):
//  - INGET tas bort. Alla rutor som fanns på gamla startsidan finns här, också tvillingarna
//    (Maskinvy/Maskinvy 2, Helikopter/Helikopter v2, Planera/Planering). Vakt: lib/vyer.test.ts
//    jämför mot gamla app/HomeClient.tsx.
//  - `bara: 'admin'` = samma spärr som gamla startsidan hade (Markägarrapport, Ekonomi, Admin). Inget annat
//    döljs för förare i det här steget. De tre står samlade i gruppen Admin (Martin 2026-10-17: "admin och
//    ekonomi är bara för admin-ansvariga") — en förare ser aldrig gruppen.
//  - Gruppen `ovrigt` (Inställningar, Feedback, Om appen, Datahälsa) visas i kontomenyn, inte bland
//    arbetsvyerna — men går att söka fram.

export type Roll = 'admin' | 'forare'

export type GruppId = 'produktion' | 'maskiner' | 'objekt' | 'personal' | 'ekonomi' | 'admin' | 'ovrigt'

/** Vilken räknare som sitter på vyn (källan läses av startsidan, aldrig gissad). */
export type MarkeKalla = 'egenkontroll' | 'ledighet' | 'lass'

export type Vy = {
  /** Stabil nyckel — används av favoriterna (sparas senare per person). Byt aldrig. */
  id: string
  namn: string
  href: string
  /** Material Symbols-namn. */
  ikon: string
  grupp: GruppId
  /** Synlig bara för admin. Utan = alla inloggade. */
  bara?: 'admin'
  marke?: MarkeKalla
  /** Extra ord som sökningen ska hitta vyn på ("semester" → Ledighet). */
  sokord?: string[]
}

export const GRUPPER: { id: GruppId; namn: string }[] = [
  { id: 'produktion', namn: 'Produktion' },
  { id: 'maskiner', namn: 'Maskiner' },
  { id: 'objekt', namn: 'Objekt' },
  { id: 'personal', namn: 'Personal och tid' },
  { id: 'ekonomi', namn: 'Ekonomi' },
  { id: 'admin', namn: 'Admin' },
  { id: 'ovrigt', namn: 'Övrigt' },
]

export const VYER: Vy[] = [
  // Produktion
  { id: 'uppfoljning', namn: 'Uppföljning', href: '/uppfoljning', ikon: 'monitoring', grupp: 'produktion', sokord: ['kpi', 'g15', 'produktion'] },
  { id: 'aptering', namn: 'Aptering', href: '/uppfoljning/fordelning', ikon: 'content_cut', grupp: 'produktion', sokord: ['fördelning', 'sortiment'] },
  { id: 'oversikt', namn: 'Översikt', href: '/oversikt', ikon: 'dashboard', grupp: 'produktion', sokord: ['karta', 'grot'] },
  { id: 'gallring', namn: 'Gallring', href: '/gallring', ikon: 'forest', grupp: 'produktion' },
  { id: 'helikopter', namn: 'Helikopter', href: '/helikopter', ikon: 'flight', grupp: 'produktion', sokord: ['beställt', 'prognos'] },
  { id: 'helikopter-v2', namn: 'Helikopter v2', href: '/helikopter-v2', ikon: 'helicopter', grupp: 'produktion' },
  { id: 'bestallningar', namn: 'Beställningar', href: '/bestallningar', ikon: 'shopping_cart', grupp: 'produktion', sokord: ['order'] },
  { id: 'affarsuppfoljning', namn: 'Affärsuppföljning', href: '/affarsuppfoljning', ikon: 'business_center', grupp: 'produktion', sokord: ['affär'] },

  // Maskiner
  { id: 'maskinvy', namn: 'Maskinvy', href: '/maskinvy', ikon: 'visibility', grupp: 'maskiner' },
  { id: 'maskinvy-2', namn: 'Maskinvy 2', href: '/maskinvy?ny=1', ikon: 'new_releases', grupp: 'maskiner' },
  { id: 'kalibrering', namn: 'Kalibrering', href: '/kalibrering', ikon: 'straighten', grupp: 'maskiner', sokord: ['kontrollmätning', 'hqc'] },
  { id: 'servicelogg', namn: 'Servicelogg', href: '/maskin-service', ikon: 'build', grupp: 'maskiner', sokord: ['service'] },
  { id: 'lastbilen', namn: 'Lastbilen', href: '/lastbil', ikon: 'pin_drop', grupp: 'maskiner', marke: 'lass', sokord: ['flytt', 'maskinflytt', 'hämta maskin', 'körningar', 'fakturering', 'flyttlogg'] },
  { id: 'kontroller', namn: 'Kontroller', href: '/kontroller', ikon: 'fact_check', grupp: 'maskiner', sokord: ['besiktning', 'försäkring'] },

  // Objekt
  { id: 'planering', namn: 'Planering', href: '/planering', ikon: 'event_note', grupp: 'objekt', sokord: ['karta', 'trakt'] },
  { id: 'objekt', namn: 'Objekt', href: '/objekt', ikon: 'layers', grupp: 'objekt', sokord: ['trakt', 'vo'] },
  { id: 'objektdetaljer', namn: 'Objektdetaljer', href: '/redigering', ikon: 'edit', grupp: 'objekt', sokord: ['redigering'] },
  { id: 'starta-jobb', namn: 'Starta jobb', href: '/starta-jobb', ikon: 'power_settings_new', grupp: 'objekt' },
  { id: 'egenkontroll', namn: 'Egenkontroll', href: '/egenkontroll', ikon: 'fact_check', grupp: 'objekt', marke: 'egenkontroll' },

  // Personal och tid
  { id: 'planera', namn: 'Planera', href: '/planera', ikon: 'edit_calendar', grupp: 'personal', sokord: ['tid', 'min tid', 'stämpla'] },
  { id: 'arbetsrapport', namn: 'Arbetsrapport', href: '/arbetsrapport', ikon: 'description', grupp: 'personal', sokord: ['tid', 'lön', 'rapport'] },
  { id: 'ledighet', namn: 'Ledighet', href: '/ledighet', ikon: 'beach_access', grupp: 'personal', marke: 'ledighet', sokord: ['semester', 'atk', 'ledig'] },
  { id: 'personal', namn: 'Personal', href: '/personal', ikon: 'badge', grupp: 'personal' },
  { id: 'utbildning', namn: 'Utbildning', href: '/utbildning', ikon: 'school', grupp: 'personal', sokord: ['intyg', 'certifikat'] },

  // Ekonomi
  { id: 'avtal', namn: 'Avtal', href: '/avtal', ikon: 'receipt_long', grupp: 'ekonomi', sokord: ['abonnemang'] },

  // Admin — bara för admin
  { id: 'ekonomi', namn: 'Ekonomi', href: '/ekonomi', ikon: 'payments', grupp: 'admin', bara: 'admin', sokord: ['faktura', 'resultat'] },
  { id: 'markagarrapport', namn: 'Markägarrapport', href: '/admin/markagarrapport', ikon: 'summarize', grupp: 'admin', bara: 'admin' },
  { id: 'admin', namn: 'Admin', href: '/admin', ikon: 'shield', grupp: 'admin', bara: 'admin', sokord: ['lön', 'medarbetare'] },

  // Övrigt — kontomenyn
  { id: 'installningar', namn: 'Inställningar', href: '/planering?installningar=1', ikon: 'settings', grupp: 'ovrigt', sokord: ['gps', 'kompass'] },
  { id: 'datahalsa', namn: 'Datahälsa', href: '/datahalsa', ikon: 'monitor_heart', grupp: 'ovrigt', sokord: ['import', 'filer'] },
  { id: 'feedback', namn: 'Feedback', href: '/forbattringsforslag', ikon: 'feedback', grupp: 'ovrigt', sokord: ['förslag'] },
  { id: 'om', namn: 'Om appen', href: '/om', ikon: 'info', grupp: 'ovrigt', sokord: ['version'] },
]

/** Förinställda favoriter per roll (tills var och en kan ändra sina — nästa PR). Max 8. */
export const STANDARD_FAVORITER: Record<Roll, string[]> = {
  admin: ['oversikt', 'uppfoljning', 'planering', 'objekt', 'helikopter', 'maskinvy-2', 'bestallningar', 'ekonomi'],
  forare: ['planera', 'planering', 'ledighet', 'lastbilen', 'kalibrering', 'servicelogg', 'uppfoljning', 'utbildning'],
}

export const MAX_FAVORITER = 8

/** Vyerna en roll får se, i registrets ordning. */
export function vyerFor(roll: Roll): Vy[] {
  return VYER.filter(v => !v.bara || v.bara === roll)
}

/** Favoriterna för en roll: bara vyer rollen får se, i given ordning, max 8. Okända id hoppas över. */
export function favoriterFor(roll: Roll, ids: string[] = STANDARD_FAVORITER[roll]): Vy[] {
  const synliga = new Map(vyerFor(roll).map(v => [v.id, v]))
  const ut: Vy[] = []
  for (const id of ids) {
    const v = synliga.get(id)
    if (v && !ut.includes(v)) ut.push(v)
    if (ut.length === MAX_FAVORITER) break
  }
  return ut
}

/** Arbetsvyerna grupperade (utan Övrigt, som ligger i kontomenyn). Tomma grupper tas bort. */
export function grupperFor(roll: Roll): { id: GruppId; namn: string; vyer: Vy[] }[] {
  const vyer = vyerFor(roll)
  return GRUPPER.filter(g => g.id !== 'ovrigt')
    .map(g => ({ ...g, vyer: vyer.filter(v => v.grupp === g.id) }))
    .filter(g => g.vyer.length > 0)
}

export function ovrigtFor(roll: Roll): Vy[] {
  return vyerFor(roll).filter(v => v.grupp === 'ovrigt')
}

const norm = (s: string) => s.toLocaleLowerCase('sv-SE').trim()

/** Sök bland vyerna rollen får se: namn först (början av namnet före mitt i), sedan sökord. */
export function sokVyer(roll: Roll, fraga: string): Vy[] {
  const q = norm(fraga)
  if (!q) return []
  const traff = (v: Vy): number => {
    const n = norm(v.namn)
    if (n.startsWith(q)) return 0
    if (n.split(/\s+/).some(o => o.startsWith(q))) return 1
    if (n.includes(q)) return 2
    if ((v.sokord ?? []).some(o => norm(o).startsWith(q) || norm(o).includes(q))) return 3
    return -1
  }
  return vyerFor(roll)
    .map((v, i) => ({ v, t: traff(v), i }))
    .filter(x => x.t >= 0)
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map(x => x.v)
}
