
-- Create a table for video categories/platforms
CREATE TABLE public.video_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  aspect_ratio TEXT NOT NULL, -- e.g., '16:9', '1:1', '9:16'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create a table for video assets
CREATE TABLE public.video_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL, -- duration in seconds
  file_url TEXT NOT NULL, -- Supabase storage URL
  file_size BIGINT, -- file size in bytes
  thumbnail_url TEXT, -- optional thumbnail
  category_id UUID REFERENCES public.video_categories(id) ON DELETE CASCADE,
  tags TEXT[], -- array of tags for filtering
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default categories for the platforms
INSERT INTO public.video_categories (name, description, aspect_ratio) VALUES
  ('YouTube', 'Landscape format videos for YouTube', '16:9'),
  ('Facebook', 'Square format videos for Facebook', '1:1'),
  ('Instagram Stories', 'Vertical format videos for Instagram Stories', '9:16');

-- Create storage bucket for video assets
INSERT INTO storage.buckets (id, name, public) VALUES ('video-assets', 'video-assets', true);

-- Create storage bucket for thumbnails
INSERT INTO storage.buckets (id, name, public) VALUES ('video-thumbnails', 'video-thumbnails', true);

-- Enable RLS on video tables
ALTER TABLE public.video_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_assets ENABLE ROW LEVEL SECURITY;

-- Create policies for video categories (readable by everyone, manageable by admins)
CREATE POLICY "Anyone can view video categories" 
  ON public.video_categories 
  FOR SELECT 
  USING (true);

CREATE POLICY "Admins can manage video categories" 
  ON public.video_categories 
  FOR ALL 
  USING (true); -- For now, allow all operations. You can restrict this later with user roles

-- Create policies for video assets (readable by everyone, manageable by admins)
CREATE POLICY "Anyone can view active video assets" 
  ON public.video_assets 
  FOR SELECT 
  USING (is_active = true);

CREATE POLICY "Admins can manage video assets" 
  ON public.video_assets 
  FOR ALL 
  USING (true); -- For now, allow all operations. You can restrict this later with user roles

-- Create storage policies for video assets (allow public read, admin upload)
CREATE POLICY "Anyone can view video assets" 
  ON storage.objects 
  FOR SELECT 
  USING (bucket_id = 'video-assets');

CREATE POLICY "Anyone can upload video assets" 
  ON storage.objects 
  FOR INSERT 
  WITH CHECK (bucket_id = 'video-assets');

CREATE POLICY "Anyone can update video assets" 
  ON storage.objects 
  FOR UPDATE 
  USING (bucket_id = 'video-assets');

CREATE POLICY "Anyone can delete video assets" 
  ON storage.objects 
  FOR DELETE 
  USING (bucket_id = 'video-assets');

-- Create storage policies for thumbnails
CREATE POLICY "Anyone can view thumbnails" 
  ON storage.objects 
  FOR SELECT 
  USING (bucket_id = 'video-thumbnails');

CREATE POLICY "Anyone can upload thumbnails" 
  ON storage.objects 
  FOR INSERT 
  WITH CHECK (bucket_id = 'video-thumbnails');

CREATE POLICY "Anyone can update thumbnails" 
  ON storage.objects 
  FOR UPDATE 
  USING (bucket_id = 'video-thumbnails');

CREATE POLICY "Anyone can delete thumbnails" 
  ON storage.objects 
  FOR DELETE 
  USING (bucket_id = 'video-thumbnails');
