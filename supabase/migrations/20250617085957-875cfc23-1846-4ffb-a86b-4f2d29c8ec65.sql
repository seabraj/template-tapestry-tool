
-- Add cloudinary_public_id column to video_assets table
ALTER TABLE public.video_assets 
ADD COLUMN cloudinary_public_id TEXT;
