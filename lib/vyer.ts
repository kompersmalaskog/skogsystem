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
export type MarkeKalla = 'egenkontroll' | 'ledighet' | 'lass' | 'maskinkoll' | 'atgarder' | 'personal' | 'arbetsmiljo'

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
  /** Undantag från `bara`: synlig ÄVEN för skyddsombudet (medarbetare.skyddsombud), oavsett roll. Arbetsmiljölagen:
   *  skyddsombudet ska se det som är fel på maskinerna — förut nådde hen Åtgärder bara via en länk (Martin 2026-11-02). */
  aven?: 'skyddsombud'
  marke?: MarkeKalla
  /** Delen bor på en samlad sida (Arbetsmiljö, 2026-11-03): syns inte som eget kort i grupperna, men sökningen,
   *  favoriterna och länkar (pushar, Behöver dig) når den som förut. */
  del?: 'arbetsmiljo'
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
  { id: 'massaved', namn: 'Massaved', href: '/massaved', ikon: 'straighten', grupp: 'produktion', bara: 'admin', sokord: ['massa', 'längd', 'medellängd', 'gallring'] },
  { id: 'helikopter', namn: 'Helikopter', href: '/helikopter', ikon: 'flight', grupp: 'produktion', sokord: ['beställt', 'prognos'] },
  { id: 'helikopter-v2', namn: 'Helikopter v2', href: '/helikopter-v2', ikon: 'helicopter', grupp: 'produktion' },
  { id: 'affarsuppfoljning', namn: 'Affärsuppföljning', href: '/affarsuppfoljning/rakna', ikon: 'business_center', grupp: 'produktion', sokord: ['affär'] },

  // Maskiner
  { id: 'maskinvy', namn: 'Maskinvy', href: '/maskinvy', ikon: 'visibility', grupp: 'maskiner' },
  { id: 'maskinvy-2', namn: 'Maskinvy 2', href: '/maskinvy?ny=1', ikon: 'new_releases', grupp: 'maskiner' },
  { id: 'kalibrering', namn: 'Kalibrering', href: '/kalibrering', ikon: 'straighten', grupp: 'maskiner', sokord: ['kontrollmätning', 'hqc'] },
  { id: 'inventarier', namn: 'Inventarier', href: '/inventarier', ikon: 'inventory_2', grupp: 'maskiner', sokord: ['lager', 'sågkedja', 'beställa', 'verktyg', 'bil', 'depåskåp', 'slang'] },
  { id: 'servicelogg', namn: 'Servicelogg', href: '/maskin-service', ikon: 'build', grupp: 'maskiner', sokord: ['service'] },
  { id: 'lastbilen', namn: 'Lastbilen', href: '/lastbil', ikon: 'pin_drop', grupp: 'maskiner', marke: 'lass', sokord: ['flytt', 'maskinflytt', 'hämta maskin', 'körningar', 'fakturering', 'flyttlogg'] },
  // Maskinkollen = förarens skyddsrond en gång i månaden (arbetsmiljö, 2026-10-31). Märket = dags eller påbörjad.
  { id: 'maskinkoll', namn: 'Maskinkoll', href: '/maskinkoll', ikon: 'checklist', grupp: 'maskiner', marke: 'maskinkoll', del: 'arbetsmiljo', sokord: ['skyddsrond', 'arbetsmiljö', 'säkerhet', 'brandsläckare'] },
  // "Rapportera": EN väg för allt (taget från industrins IA-system) — första frågan är vad det är: något trasigt (→ Något är fel, med bild,
  // blir en åtgärd direkt), nära ögat (tillbud) eller en skada (olycka).
  { id: 'atgarder', namn: 'Åtgärder', href: '/atgarder', ikon: 'build', grupp: 'maskiner', bara: 'admin', aven: 'skyddsombud', marke: 'atgarder', del: 'arbetsmiljo', sokord: ['arbetsmiljö', 'skyddsrond', 'fel', 'stopp', 'maskinkoll'] },
  // Om något händer: 112, larmplatsen, tre steg per situation, rapportera tillbud. Står också fast under sökfältet på startsidan.
  { id: 'om-nagot-hander', namn: 'Om något händer', href: '/om-nagot-hander', ikon: 'emergency', grupp: 'maskiner', del: 'arbetsmiljo', sokord: ['112', 'olycka', 'tillbud', 'brand', 'skada', 'nödnummer', 'larm', 'första hjälpen', 'kraftledning'] },
  // Riskbedömning per maskintyp (AFS 2023:1): admin godkänner varje år, föraren läser riskerna för sin maskin.
  { id: 'riskbedomning', namn: 'Riskbedömning', href: '/riskbedomning', ikon: 'health_and_safety', grupp: 'maskiner', del: 'arbetsmiljo', sokord: ['risk', 'risker', 'arbetsmiljö', 'säkerhet', 'motorsåg'] },
  // Skyddsronden: arbetsledningen och skyddsombudet en gång om året (AFS 2023:1). Brister blir åtgärder.
  { id: 'skyddsrond', namn: 'Skyddsrond', href: '/skyddsrond', ikon: 'verified_user', grupp: 'maskiner', bara: 'admin', aven: 'skyddsombud', del: 'arbetsmiljo', sokord: ['arbetsmiljö', 'säkerhet', 'brandskydd', 'skyddsombud', 'rond'] },
  // Kemikalieförteckningen: varje produkt, var den finns och säkerhetsdatabladet (AFS 2023:10). Förarna öppnar bladet.
  { id: 'kemikalier', namn: 'Kemikalier', href: '/kemikalier', ikon: 'science', grupp: 'maskiner', del: 'arbetsmiljo', sokord: ['säkerhetsdatablad', 'säkerhetsblad', 'sdb', 'olja', 'kemikalie', 'arbetsmiljö', 'spray', 'bränsle'] },
  { id: 'farligt-avfall', namn: 'Farligt avfall', href: '/farligt-avfall', ikon: 'recycling', grupp: 'maskiner', del: 'arbetsmiljo', sokord: ['avfall', 'slang', 'hydraulslang', 'spillolja', 'trasor', 'dunk', 'kvitto', 'liggare', 'miljö', 'arbetsmiljö'] },
  { id: 'sa-gor-vi', namn: 'Så gör vi', href: '/sa-gor-vi', ikon: 'menu_book', grupp: 'maskiner', del: 'arbetsmiljo', sokord: ['instruktion', 'rutin', 'hydraulslang', 'trailer', 'lasta', 'kraftledning', 'motorsåg', 'svetsa', 'ensam', 'arbetsmiljö'] },
  { id: 'rapportera', namn: 'Rapportera', href: '/om-nagot-hander?rapport=1', ikon: 'report', grupp: 'maskiner', del: 'arbetsmiljo', sokord: ['fel', 'trasig', 'läcker', 'något är fel', 'tillbud', 'nära ögat', 'olycka', 'skada', 'arbetsmiljö'] },
  { id: 'kontroller', namn: 'Fordon', href: '/kontroller', ikon: 'local_shipping', grupp: 'maskiner', sokord: ['kontroller', 'besiktning', 'försäkring', 'brandskydd', 'släp', 'tank', 'bil'] },

  // Objekt
  { id: 'planering', namn: 'Planering', href: '/planering', ikon: 'event_note', grupp: 'objekt', sokord: ['karta', 'trakt'] },
  { id: 'objekt', namn: 'Objekt', href: '/objekt', ikon: 'layers', grupp: 'objekt', sokord: ['trakt', 'vo', 'beställning', 'order'] },
  { id: 'objektdetaljer', namn: 'Objektdetaljer', href: '/redigering', ikon: 'edit', grupp: 'objekt', sokord: ['redigering'] },
  { id: 'starta-jobb', namn: 'Starta jobb', href: '/starta-jobb', ikon: 'power_settings_new', grupp: 'objekt' },
  { id: 'egenkontroll', namn: 'Egenkontroll', href: '/egenkontroll', ikon: 'fact_check', grupp: 'objekt', marke: 'egenkontroll' },

  // Personal och tid
  { id: 'planera', namn: 'Planera', href: '/planera', ikon: 'edit_calendar', grupp: 'personal', sokord: ['tid', 'min tid', 'stämpla'] },
  { id: 'arbetsrapport', namn: 'Arbetsrapport', href: '/arbetsrapport', ikon: 'description', grupp: 'personal', sokord: ['tid', 'lön', 'rapport'] },
  { id: 'ledighet', namn: 'Ledighet', href: '/ledighet', ikon: 'beach_access', grupp: 'personal', marke: 'ledighet', sokord: ['semester', 'atk', 'ledig'] },
  { id: 'introduktion', namn: 'Introduktion', href: '/introduktion', ikon: 'school', grupp: 'personal', del: 'arbetsmiljo', sokord: ['ny', 'välkommen', 'arbetsmiljö', 'skyddsombud'] },
  // Arbetsmiljö: EN sida med svaret ("Allt är i ordning" / "2 saker behöver dig") och en rad per del (Martin 2026-11-03).
  { id: 'arbetsmiljo', namn: 'Arbetsmiljö', href: '/arbetsmiljo', ikon: 'health_and_safety', grupp: 'personal', marke: 'arbetsmiljo', sokord: ['säkerhet', 'skyddsrond', 'risk', 'skyddsombud', 'maskinkoll', 'åtgärder', 'olycka', 'tillbud'] },
  { id: 'personal', namn: 'Personal', href: '/personal', ikon: 'badge', grupp: 'personal', marke: 'personal', sokord: ['telefon', 'anhörig', 'skyddsombud', 'mat'] },
  { id: 'utbildning', namn: 'Utbildning', href: '/utbildning', ikon: 'school', grupp: 'personal', sokord: ['intyg', 'certifikat'] },

  // Ekonomi
  { id: 'avtal', namn: 'Avtal', href: '/avtal', ikon: 'receipt_long', grupp: 'ekonomi', sokord: ['abonnemang'] },

  // Admin — bara för admin
  { id: 'ekonomi', namn: 'Ekonomi', href: '/ekonomi', ikon: 'payments', grupp: 'admin', bara: 'admin', sokord: ['faktura', 'resultat'] },
  { id: 'objektoversikt', namn: 'Objektöversikt', href: '/admin/objektoversikt', ikon: 'timer', grupp: 'admin', bara: 'admin', sokord: ['tid', 'objekt', 'prognos'] },
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
  admin: ['oversikt', 'uppfoljning', 'planering', 'objekt', 'helikopter', 'maskinvy-2', 'ekonomi'],
  forare: ['planera', 'planering', 'ledighet', 'lastbilen', 'kalibrering', 'servicelogg', 'uppfoljning', 'utbildning'],
}

export const MAX_FAVORITER = 8

/** Det som utöver rollen avgör vad man ser. */
export type Behorighet = { skyddsombud?: boolean }

/** Vyerna en roll får se, i registrets ordning. Skyddsombudet ser dessutom vyer märkta `aven: 'skyddsombud'`. */
export function vyerFor(roll: Roll, b: Behorighet = {}): Vy[] {
  return VYER.filter(v => !v.bara || v.bara === roll || (v.aven === 'skyddsombud' && b.skyddsombud === true))
}

/** Favoriterna för en roll: bara vyer rollen får se, i given ordning, max 8. Okända id hoppas över. */
export function favoriterFor(roll: Roll, ids: string[] = STANDARD_FAVORITER[roll], b: Behorighet = {}): Vy[] {
  const synliga = new Map(vyerFor(roll, b).map(v => [v.id, v]))
  const ut: Vy[] = []
  for (const id of ids) {
    const v = synliga.get(id)
    if (v && !ut.includes(v)) ut.push(v)
    if (ut.length === MAX_FAVORITER) break
  }
  return ut
}

/** Arbetsvyerna grupperade (utan Övrigt, som ligger i kontomenyn). Tomma grupper tas bort. */
export function grupperFor(roll: Roll, b: Behorighet = {}): { id: GruppId; namn: string; vyer: Vy[] }[] {
  const vyer = vyerFor(roll, b)
  return GRUPPER.filter(g => g.id !== 'ovrigt')
    .map(g => ({ ...g, vyer: vyer.filter(v => v.grupp === g.id && !v.del) }))
    .filter(g => g.vyer.length > 0)
}

export function ovrigtFor(roll: Roll): Vy[] {
  return vyerFor(roll).filter(v => v.grupp === 'ovrigt')
}

const norm = (s: string) => s.toLocaleLowerCase('sv-SE').trim()

/** Sök bland vyerna rollen får se: namn först (början av namnet före mitt i), sedan sökord. */
export function sokVyer(roll: Roll, fraga: string, b: Behorighet = {}): Vy[] {
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
  return vyerFor(roll, b)
    .map((v, i) => ({ v, t: traff(v), i }))
    .filter(x => x.t >= 0)
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map(x => x.v)
}
