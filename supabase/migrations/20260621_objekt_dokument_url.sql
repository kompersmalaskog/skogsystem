-- 2026-06-21  objekt: dokument-URL:er för trakt-PDF:er
--
-- Två nya text-kolumner för publika storage-URL:er till de PDF:er som följer med
-- traktdirektiv-zippen. Filerna laddas upp i den befintliga publika 'kartbilder'-
-- bucketen (samma mönster som kartbild_url), så ingen ny bucket/policy behövs.
--   traktdirektiv_url   = <traktnr>_traktdirektiv.pdf   (zippens _TD.pdf)
--   stamplingslangd_url = <traktnr>_stamplingslangd.pdf (övrig pdf, om den finns)
-- Innehållet tolkas INTE — formatet varierar mellan leverantörer, filen sparas bara.

ALTER TABLE objekt
  ADD COLUMN IF NOT EXISTS traktdirektiv_url   text,
  ADD COLUMN IF NOT EXISTS stamplingslangd_url text;
