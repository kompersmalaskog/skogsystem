-- Cache för Fortnox-verifikat. Vi hämtar en gång per natt via sync-endpoint
-- och servar resultat-rapporten från cachen i stället för att kalla Fortnox
-- varje gång. /3/reports/result finns inte i Fortnox REST API → vi måste
-- aggregera från voucher-rader själva.

-- pg_cron + pg_net behövs för nightly-sync via HTTP-anrop till vår endpoint.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS fortnox_voucher_rows (
  id                 bigserial PRIMARY KEY,
  financial_year     int NOT NULL,
  voucher_series     text NOT NULL,
  voucher_number     int NOT NULL,
  transaction_date   date NOT NULL,
  row_num            int NOT NULL,
  account            text NOT NULL,
  debit              numeric NOT NULL DEFAULT 0,
  credit             numeric NOT NULL DEFAULT 0,
  costcenter         text,
  project            text,
  description        text,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (financial_year, voucher_series, voucher_number, row_num)
);

CREATE INDEX IF NOT EXISTS idx_voucher_rows_costcenter
  ON fortnox_voucher_rows(costcenter, financial_year)
  WHERE costcenter IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voucher_rows_date
  ON fortnox_voucher_rows(transaction_date);
CREATE INDEX IF NOT EXISTS idx_voucher_rows_account
  ON fortnox_voucher_rows(account);

-- Sync-state: en rad, uppdateras av sync-jobbet.
CREATE TABLE IF NOT EXISTS fortnox_sync_state (
  id                int PRIMARY KEY DEFAULT 1,
  last_sync_at      timestamptz,
  last_success_at   timestamptz,
  voucher_count     int,
  rows_count        int,
  duration_sek      int,
  last_error        text,
  last_status       text, -- 'ok' | 'fel' | 'pågår'
  CONSTRAINT singleton CHECK (id = 1)
);

INSERT INTO fortnox_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
