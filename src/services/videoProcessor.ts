// Simplified videoProcessor.ts based on working edge function structure
import { supabase } from '@/integrations/supabase/client';

export interface VideoProcessingOptions {
  sequences: Array<{
    id: string;
    name: string;
    duration: number;
    file_url: string;
  }>;
  customization: any;
  platform: string;
  duration: number;
  enableProgress?: boolean;
}

// Platform specifications
const PLATFORM_SPECS = {
  youtube: { 
    ratio: '16:9', 
    resolution: '1920×1080',
    width: 1920,
    height: 1080,
    description: 'Landscape format, perfect for desktop viewing'
  },
  facebook: { 
    ratio: '1:1', 
    resolution: '1080×1080',
    width: 1080,
    height: 1080,
    description: 'Square format, optimized for feed posts'
  },
  instagram: { 
    ratio: '9:16', 
    resolution: '1080×1920',
    width: 1080,
    height: 1920,
    description: 'Vertical format, full-screen mobile experience'
  }
} as const;

export class VideoProcessor {
  constructor() {
    console.log('🎬 VideoProcessor initialized with simplified, proven approach');
  }

  async processVideo(
    options: VideoProcessingOptions, 
    onProgress?: (progress: number, details?: any) => void
  ): Promise<Blob> {
    const platformSpec = PLATFORM_SPECS[options.platform as keyof typeof PLATFORM_SPECS];
    
    console.log('🚀 Starting simplified platform processing:', {
      platform: options.platform,
      sequences: options.sequences.length,
      targetDuration: options.duration,
      platformSpecs: platformSpec
    });
    
    onProgress?.(5, {
      phase: 'initialization',
      platform: options.platform,
      platformSpecs: platformSpec
    });

    try {
      // Step 1: Validate and prepare data in the format the working edge function expects
      const validSequences = this.validateSequences(options.sequences);
      onProgress?.(15, { phase: 'validation', validSequences: validSequences.length });

      // Step 2: Extract public IDs from Cloudinary URLs (like the working version expects)
      console.log('📋 Preparing video data for edge function...');
      const videosForEdgeFunction = validSequences.map(seq => ({
        publicId: this.extractPublicIdFromUrl(seq.file_url),
        duration: seq.duration,
        name: seq.name
      }));

      onProgress?.(25, { 
        phase: 'data_preparation', 
        videosReady: videosForEdgeFunction.length 
      });

      // Step 3: Call the working edge function with the correct data format
      const requestBody = {
        videos: videosForEdgeFunction,
        targetDuration: options.duration,
        platform: options.platform
      };

      console.log(`📡 Calling proven edge function for ${options.platform}:`, {
        videoCount: requestBody.videos.length,
        platform: options.platform,
        targetResolution: platformSpec?.resolution,
        videosData: requestBody.videos.map(v => ({
          publicId: v.publicId,
          duration: v.duration
        }))
      });
      
      onProgress?.(35, { 
        phase: 'edge_function_call', 
        platform: options.platform 
      });
      
      // Step 4: Process with the working edge function
      const { data, error } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: requestBody
      });

      if (error) {
        console.error('❌ Edge function error:', error);
        throw new Error(`Platform processing failed: ${error.message}`);
      }
      
      if (!data?.success) {
        console.error('❌ Edge function returned failure:', data);
        throw new Error(data?.error || 'Edge function processing failed');
      }
      
      if (!data?.url) {
        console.error('❌ No URL returned from edge function:', data);
        throw new Error('Edge function failed to return a valid video URL');
      }
      
      const finalUrl = data.url;
      console.log(`✅ Platform processing complete for ${options.platform}!`, {
        url: finalUrl,
        platform: options.platform,
        method: data.method,
        stats: data.stats
      });
      
      onProgress?.(75, { 
        phase: 'platform_complete', 
        platform: options.platform,
        method: data.method,
        finalUrl: finalUrl
      });

      // Step 5: Download final video
      console.log(`📥 Downloading final ${options.platform} video...`);
      const videoBlob = await this.downloadFromUrl(finalUrl);
      
      onProgress?.(100, { 
        phase: 'complete', 
        platform: options.platform,
        finalSize: `${(videoBlob.size / 1024 / 1024).toFixed(2)}MB`,
        method: data.method
      });
      
      console.log(`🎉 ${options.platform} video ready!`, {
        platform: options.platform,
        finalSize: `${(videoBlob.size / 1024 / 1024).toFixed(2)}MB`,
        targetSpecs: platformSpec,
        method: data.method,
        stats: data.stats
      });
      
      return videoBlob;

    } catch (error) {
      console.error(`❌ ${options.platform} processing failed:`, error);
      throw error;
    }
  }

  /**
   * Extract public ID from Cloudinary URL (like the working version does)
   */
  private extractPublicIdFromUrl(cloudinaryUrl: string): string {
    try {
      console.log(`🔍 Extracting public ID from: ${cloudinaryUrl.substring(0, 80)}...`);
      
      if (!cloudinaryUrl.includes('cloudinary.com')) {
        throw new Error('Not a Cloudinary URL');
      }
      
      const urlParts = cloudinaryUrl.split('/');
      const uploadIndex = urlParts.findIndex(part => part === 'upload');
      
      if (uploadIndex === -1) {
        throw new Error('No "upload" segment found in URL');
      }
      
      // Get path after upload
      const pathAfterUpload = urlParts.slice(uploadIndex + 1).join('/');
      
      // Remove version if present (v123456/)
      const pathWithoutVersion = pathAfterUpload.replace(/^v\d+\//, '');
      
      // Remove file extension
      const publicId = pathWithoutVersion.replace(/\.[^/.]+$/, '');
      
      console.log(`✅ Extracted public ID: ${publicId}`);
      
      if (!publicId) {
        throw new Error('Extracted public ID is empty');
      }
      
      return publicId;
      
    } catch (error) {
      console.error(`❌ Public ID extraction failed:`, error);
      throw new Error(`Failed to extract public ID from URL: ${cloudinaryUrl}`);
    }
  }

  // Utility method to get platform specifications
  static getPlatformSpecs(platform: string) {
    return PLATFORM_SPECS[platform as keyof typeof PLATFORM_SPECS] || PLATFORM_SPECS.youtube;
  }

  private validateSequences(sequences: any[]) {
    console.log('🔍 Validating sequences for proven processing...');
    const validSequences = sequences.filter(seq => seq.file_url && seq.duration > 0);
    
    console.log(`✅ Validation complete: ${validSequences.length}/${sequences.length} sequences ready`, {
      allHaveFileUrls: validSequences.every(s => !!s.file_url),
      allHaveDurations: validSequences.every(s => s.duration > 0),
      allHaveNames: validSequences.every(s => !!s.name)
    });
    
    if (validSequences.length === 0) {
      throw new Error('No valid sequences found - check that all sequences have file_url and duration > 0');
    }
    
    return validSequences;
  }

  private async downloadFromUrl(url: string): Promise<Blob> {
    try {
      console.log(`📥 Downloading video from: ${url.substring(0, 80)}...`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download video: HTTP ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      console.log(`✅ Download complete: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
      return blob;
    } catch (error) {
      console.error('❌ Download failed:', error);
      throw new Error(`Video download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}