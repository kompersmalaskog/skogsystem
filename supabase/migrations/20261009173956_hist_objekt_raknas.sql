-- Historikimport (steg 9): markera vilken rapport som räknas per objekt och maskin, så att summor inte dubbelräknar.
-- Bara ALTER TABLE hist_objekt ADD COLUMN och CREATE INDEX på hist_objekt. Ingen annan tabell, vy eller funktion rörs.
-- raknas = true för exakt en rapport per objekt och maskin (ej exkluderad, typ objekt, senaste/största; Ponsse: Skift med G15 före Mätbevis).
-- dubblett_av = sha256 för den rapport som räknas, satt på övriga rapporter i samma grupp.

alter table hist_objekt add column raknas boolean not null default false;
alter table hist_objekt add column dubblett_av text;

create index hist_objekt_raknas_idx on hist_objekt (raknas);
