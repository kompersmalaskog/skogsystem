-- Påminnelse- och push-inställningar per förare. Visas och ändras i
-- Inställningar → Påminnelser. Defaults motsvarar user-specen.

ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS pamin_obekraftad_min integer DEFAULT 30;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS pamin_pagaende_min  integer DEFAULT 180;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS daglig_pamin_aktiv  boolean DEFAULT true;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS daglig_pamin_tid    time    DEFAULT '18:00';
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS push_aktiv          boolean DEFAULT true;
