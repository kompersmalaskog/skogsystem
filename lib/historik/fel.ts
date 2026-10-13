// Historikvyn (admin): vad som gick fel, i ord en förare/admin förstår. Den tekniska raden (felkod, databasens text) visas aldrig för
// användaren; den loggas i konsolen. Behörighetstexten visas bara vid riktigt behörighetsfel.

export type HistorikFelSlag = "tid" | "behorighet" | "annat";

/** Fel ur databasen med PostgREST/Postgres-felkoden kvar, så att klienten kan välja text efter orsak. */
export class HistorikFel extends Error {
  slag: HistorikFelSlag;
  kod: string | null;
  constructor(slag: HistorikFelSlag, message: string, kod: string | null = null) {
    super(message);
    this.name = "HistorikFel";
    this.slag = slag;
    this.kod = kod;
  }
}

/** 57014 = statement timeout (inloggade har 8 s). 42501 = saknad behörighet. Allt annat är "annat". */
export function slagForKod(kod: string | null | undefined): HistorikFelSlag {
  if (kod === "57014") return "tid";
  if (kod === "42501") return "behorighet";
  return "annat";
}

export function tillHistorikFel(error: { code?: string | null; message: string }): HistorikFel {
  const kod = error.code ?? null;
  return new HistorikFel(slagForKod(kod), error.message, kod);
}

/** Slaget på ett fångat fel. Ett fel som inte kom från databaslagret är "annat". */
export function felSlag(e: unknown): HistorikFelSlag {
  return e instanceof HistorikFel ? e.slag : "annat";
}

/** `vad` = det som skulle hämtas, med bestämd form ("historiken", "objekten"). */
export function felText(slag: HistorikFelSlag, vad = "historiken"): string {
  if (slag === "tid") return `Det tog för lång tid att hämta ${vad}. Försök igen om en stund.`;
  if (slag === "behorighet") return "Du saknar behörighet. Bara roll admin får läsa historiken.";
  return `Något gick fel när ${vad} skulle hämtas. Ladda om sidan.`;
}
