/**
 * FortnoxAdapter — OAuth2 + REST API mot Fortnox.
 *
 * Credentials läses från env-vars (FORTNOX_CLIENT_ID, FORTNOX_CLIENT_SECRET).
 * Tokens krypteras med AES-256-GCM (FORTNOX_ENCRYPTION_KEY) innan DB-sparande.
 * Redirect URI: /api/fortnox/callback (matchar Fortnox-portalens konfiguration).
 *
 * Dokumentation: https://www.fortnox.se/developer/authentication-oauth2/
 */

import type { ExternEmployee } from "./types";

const FORTNOX_AUTH_URL  = "https://apps.fortnox.se/oauth-v1/auth";
const FORTNOX_TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";
const FORTNOX_API_BASE  = "https://api.fortnox.se/3";
// Space-separerad lista. Utökades från "salary" till även covering
// companyinformation/customer/invoice/payment/bookkeeping/costcenter/project.
// Användare måste re-auktorisera (starta /api/fortnox/auth) efter deploy
// så att Fortnox ger ut en ny access_token med samtliga scopes.
const SCOPE = "salary companyinformation customer invoice payment bookkeeping costcenter project";

function getCredentials() {
  const clientId = process.env.FORTNOX_CLIENT_ID;
  const clientSecret = process.env.FORTNOX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("FORTNOX_CLIENT_ID och/eller FORTNOX_CLIENT_SECRET saknas i env-vars.");
  }
  return { clientId, clientSecret };
}

function basicAuth(): string {
  const { clientId, clientSecret } = getCredentials();
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

/* ─── OAuth-flöde (statiska funktioner — anropas av routes, inte adapter-instans) ─── */

export function buildFortnoxAuthUrl(state: string, redirectUri: string): string {
  const { clientId } = getCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
    response_type: "code",
    access_type: "offline",
  });
  return `${FORTNOX_AUTH_URL}?${params.toString()}`;
}

export async function exchangeFortnoxCode(code: string, redirectUri: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(FORTNOX_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth()}`,
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
  return res.json();
}

export async function refreshFortnoxToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(FORTNOX_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Fortnox refresh misslyckades (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/* ─── API-klient (instans med access_token) ─── */

export class FortnoxClient {
  constructor(private accessToken: string) {}

  private async fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${FORTNOX_API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        "Authorization": `Bearer ${this.accessToken}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Fortnox API ${path} (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async testConnection(): Promise<{ ok: boolean; meddelande: string; employees?: ExternEmployee[] }> {
    try {
      const data = await this.fetchApi<any>("/employees?limit=3");
      const anställda = (data.Employees || []).map((e: any) => ({
        externt_id: e.EmployeeId,
        namn: [e.FirstName, e.LastName].filter(Boolean).join(" ") || e.EmployeeId,
        anstallningsnummer: e.EmployeeId,
      }));
      return { ok: true, meddelande: `Ansluten — ${anställda.length} anställda hämtade.`, employees: anställda };
    } catch (e: any) {
      return { ok: false, meddelande: e.message || String(e) };
    }
  }

  async getEmployees(): Promise<ExternEmployee[]> {
    const data = await this.fetchApi<any>("/employees?limit=500");
    return (data.Employees || []).map((e: any) => ({
      externt_id: e.EmployeeId,
      namn: [e.FirstName, e.LastName].filter(Boolean).join(" ") || e.EmployeeId,
      anstallningsnummer: e.EmployeeId,
    }));
  }

  async sendSalaryTransaction(transaction: {
    EmployeeId: string;
    SalaryCode: string;
    Date: string;
    Number: number;
    Amount: number;
    TextRow?: string;
  }): Promise<any> {
    return this.fetchApi("/salarytransactions", {
      method: "POST",
      body: JSON.stringify({ SalaryTransaction: transaction }),
    });
  }
}
