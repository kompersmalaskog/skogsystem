-- Hyttnotiser till MASKINEN, inte personen (uppföljning av #939).
-- push_subscriptions har en rad per enhet och medarbetare_id = den som var inloggad när enheten anmälde sig. Maskindatorn anmäldes därför under förarens namn
-- (Elefantens dator = "Daniel"), och en notis till "den som kör" hamnade fel när någon annan satt i maskinen. En enhet som är markerad som maskin
-- (enhet_maskin_id: serial-GPS eller "Den här enheten är maskin") anmäler nu också VILKEN maskin den är. Besök skickas till prenumerationer med maskin_id = maskinen,
-- oavsett vem som är inloggad; förarens telefon har maskin_id = null och får dem aldrig.
-- Additiv och ofarlig att köra före koden: kolumnen är null överallt tills en maskindator öppnat appen. Utan den här migrationen anmäler sig enheterna som förut (utan maskin)
-- och ingen besökspush går till någon maskin — den lokala notisen från appen fungerar som förut.

alter table push_subscriptions add column if not exists maskin_id text;

create index if not exists push_subscriptions_maskin_idx on push_subscriptions (maskin_id) where maskin_id is not null;

comment on column push_subscriptions.maskin_id is 'dim_maskin.maskin_id när enheten är en maskindator (enhet_maskin_id). null = personens egen enhet. Hyttnotiser (besök) skickas bara hit.';
