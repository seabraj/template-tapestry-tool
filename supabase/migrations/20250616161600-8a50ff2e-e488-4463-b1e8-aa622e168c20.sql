
-- Create the storage bucket for processed videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'processed-videos',
  'processed-videos', 
  true,
  52428800, -- 50MB limit
  ARRAY['video/mp4', 'video/quicktime', 'video/x-msvideo']
);

-- Create policy to allow public access to processed videos
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'processed-videos');

-- Create policy to allow uploads to processed videos bucket  
CREATE POLICY "Allow uploads" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'processed-videos');
