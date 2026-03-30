-- Add approval workflow and PDF storage to utbildningar
ALTER TABLE utbildningar
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS inskickad_av text,
  ADD COLUMN IF NOT EXISTS godkand_av text;

-- Create storage bucket for PDF uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('utbildningsbevis', 'utbildningsbevis', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "allow_all_utbildningsbevis" ON storage.objects
  FOR ALL USING (bucket_id = 'utbildningsbevis') WITH CHECK (bucket_id = 'utbildningsbevis');
