/**
 * FortnoxAdapter — OAuth2 + REST API mot Fortnox.
 *
 * För att integrationen ska fungera live krävs att man har:
 * 1. Registrerat en app på https://developer.fortnox.se/
 * 2. Lagt in client_id + client_secret i lonesystem_koppling-raden
 * 3. Konfigurerat redirect URI:n: <ditt-domännamn>/api/lonesystem/fortnox/callback
 *
 * Fortnox API-dokumentation: https://www.fortnox.se/api
 * OAuth-dokumentation: https://www.fortnox.se/developer/authentication-oauth2/
 */

import type { LonesystemAdapter, Koppling, ExternEmployee, LonespecRad } from "./types";

const FORTNOX_AUTH_URL  = "https://apps.fortnox.se/oauth-v1/auth";
const FORTNOX_TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";
const FORTNOX_API_BASE  = "https://api.fortnox.se/3";

// Scopes för lönehantering
const SCOPES = ["salary", "companyinformation"].join(" ");

export class FortnoxAdapter implements LonesystemAdapter {
  systemTyp = "fortnox" as const;

  constructor(private koppling: Koppling) {}

  buildAuthUrl(state: string, redirectUri: string): string {
    if (!this.koppling.api_client_id) {
      throw new Error("Fortnox: api_client_id saknas. Spara dina credentials först.");
    }
    const params = new URLSearchParams({
      client_id: this.koppling.api_client_id,
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      response_type: "code",
      access_type: "offline",
    });
    return `${FORTNOX_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string) {
    if (!this.koppling.api_client_id || !this.koppling.api_client_secret) {
      throw new Error("Fortnox: client_id/secret saknas.");
    }
    const basic = Buffer.from(`${this.koppling.api_client_id}:${this.koppling.api_client_secret}`).toString("base64");
    const res = await fetch(FORTNOX_TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fortnox token-utbyte misslyckades (${res.status}): ${text}`);
    }
    const data = await res.json();
    return {
      access_token: data.access_token as string,
      refresh_token: data.refresh_token as string,
      expires_in: data.expires_in as number,
    };
  }

  async refreshToken() {
    if (!this.koppling.refresh_token) throw new Error("Fortnox: refresh_token saknas.");
    if (!this.koppling.api_client_id || !this.koppling.api_client_secret) {
      throw new Error("Fortnox: client_id/secret saknas.");
    }
    const basic = Buffer.from(`${this.koppling.api_client_id}:${this.koppling.api_client_secret}`).toString("base64");
    const res = await fetch(FORTNOX_TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.koppling.refresh_token,
      }),
    });
    if (!res.ok) {
      throw new Error(`Fortnox refresh misslyckades (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    return {
      access_token: data.access_token as string,
      refresh_token: data.refresh_token as string,
      expires_in: data.expires_in as number,
    };
  }

  private async fetchAuthed<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.koppling.access_token) throw new Error("Fortnox: ingen access_token. Anslut först.");
    const res = await fetch(`${FORTNOX_API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        "Authorization": `Bearer ${this.koppling.access_token}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Fortnox API ${path} misslyckades (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async testConnection() {
    try {
      await this.fetchAuthed("/companyinformation");
      return { ok: true, meddelande: "Anslutning OK." };
    } catch (e: any) {
      return { ok: false, meddelande: e.message || String(e) };
    }
  }

  async getEmployees(): Promise<ExternEmployee[]> {
    const data = await this.fetchAuthed<{ Employees: { Employee: any[] } }>("/employees?limit=500");
    return (data.Employees?.Employee || []).map((e: any) => ({
      externt_id: e.EmployeeId,
      namn: [e.FirstName, e.LastName].filter(Boolean).join(" ") || e.EmployeeId,
      anstallningsnummer: e.EmploymentDate ? e.EmployeeId : undefined,
    }));
  }

  async sendPayrollData(period: string, rader: LonespecRad[]) {
    // Fortnox SalaryTransactions API används för att skicka lönerader.
    // Varje rad blir en SalaryTransaction. Detaljerad mappning beror på
    // intern_typ → SalaryCode (löneartkod) som hanteras i artikelmappningen.
    let skickade = 0;
    for (const rad of rader) {
      for (const post of rad.poster) {
        const body = {
          SalaryTransaction: {
            EmployeeId: rad.anstallningsnummer,
            Date: `${period}-01`,
            SalaryCode: post.intern_typ, // mappas till extern_kod innan anrop
            Number: post.antal,
            Amount: post.belopp_kr,
            TextRow: post.beskrivning || "",
          },
        };
        await this.fetchAuthed("/salarytransactions", {
          method: "POST",
          body: JSON.stringify(body),
        });
        skickade++;
      }
    }
    return { ok: true, meddelande: `Skickade ${skickade} lönerad${skickade === 1 ? "" : "er"} till Fortnox.`, skickade };
  }
}
