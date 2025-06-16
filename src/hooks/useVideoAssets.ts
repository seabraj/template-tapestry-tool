
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { VideoSequence } from '@/pages/Index';

interface VideoAsset {
  id: string;
  name: string;
  description: string;
  duration: number;
  file_url: string;
  thumbnail_url: string;
  category_id: string;
  tags: string[];
  is_active: boolean;
  video_categories?: {
    id: string;
    name: string;
    aspect_ratio: string;
  };
}

export const useVideoAssets = (platformFilter?: string) => {
  const [assets, setAssets] = useState<VideoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAssets();
  }, [platformFilter]);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let query = supabase
        .from('video_assets')
        .select(`
          *,
          video_categories (
            id,
            name,
            aspect_ratio
          )
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      // Filter by platform if specified
      if (platformFilter) {
        const { data: categories } = await supabase
          .from('video_categories')
          .select('id')
          .ilike('name', `%${platformFilter}%`);
        
        if (categories && categories.length > 0) {
          query = query.in('category_id', categories.map(c => c.id));
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error('Supabase query error:', error);
        throw error;
      }
      
      console.log('Fetched video assets:', data?.length || 0, 'assets');
      setAssets(data || []);
    } catch (err: any) {
      console.error('Error fetching video assets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const convertToSequences = (assets: VideoAsset[]): VideoSequence[] => {
    return assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      duration: asset.duration,
      thumbnail: asset.file_url, // Use the video URL for preview
      file_url: asset.file_url, // Add file_url for processing
      selected: false
    }));
  };

  const getAssetById = (id: string): VideoAsset | undefined => {
    return assets.find(asset => asset.id === id);
  };

  const getVideoUrlById = (id: string): string | null => {
    const asset = getAssetById(id);
    if (!asset || !asset.file_url) {
      console.warn(`No video URL found for asset ID: ${id}`);
      return null;
    }
    return asset.file_url;
  };

  return {
    assets,
    loading,
    error,
    refetch: fetchAssets,
    convertToSequences: () => convertToSequences(assets),
    getAssetById,
    getVideoUrlById
  };
};
