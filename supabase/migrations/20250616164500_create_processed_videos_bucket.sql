
-- Create the processed-videos storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('processed-videos', 'processed-videos', true);

-- Create policy to allow public read access
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT USING (bucket_id = 'processed-videos');

-- Create policy to allow service role to upload
CREATE POLICY "Service Role Upload" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'processed-videos');
