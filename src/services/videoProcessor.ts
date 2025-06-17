
import { supabase } from '@/integrations/supabase/client';

export interface VideoProcessingOptions {
  sequences: Array<{
    id: string;
    name: string;
    duration: number;
    file_url: string;
  }>;
  customization: {
    supers: {
      text: string;
      position: 'top' | 'center' | 'bottom';
      style: 'bold' | 'light' | 'outline';
    };
    endFrame: {
      enabled: boolean;
      text: string;
      logoPosition: 'center' | 'corner';
    };
    cta: {
      enabled: boolean;
      text: string;
      style: 'button' | 'text' | 'animated';
    };
  };
  platform: string;
  duration: number;
}

export class VideoProcessor {
  constructor() {
    console.log('🎬 VideoProcessor initialized for Cloudinary processing');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    return this.processVideoWithCloudinary(options, onProgress);
  }

  private async processVideoWithCloudinary(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🚀 Starting Cloudinary video processing...', {
        sequences: options.sequences.length,
        platform: options.platform,
        duration: options.duration
      });
      onProgress?.(10);

      // Validate sequences before sending and preserve order
      const validSequences = options.sequences.filter((seq, index) => {
        if (!seq.file_url || !seq.file_url.startsWith('http')) {
          console.warn(`❌ Invalid sequence URL: ${seq.id} - ${seq.file_url}`);
          return false;
        }
        // Preserve original order
        (seq as any).originalOrder = index;
        return true;
      });

      if (validSequences.length === 0) {
        throw new Error('No valid video sequences found');
      }

      console.log(`✅ Processing ${validSequences.length} sequence(s):`, 
        validSequences.map((seq, idx) => `${(seq as any).originalOrder + 1}. ${seq.name}`).join(', '));
      onProgress?.(25);

      // Extract Cloudinary public IDs from the URLs
      const publicIds = validSequences.map(seq => {
        const url = seq.file_url;
        // Extract public ID from Cloudinary URL
        // Format: https://res.cloudinary.com/CLOUD_NAME/video/upload/v123456/folder/public_id.mp4
        const match = url.match(/\/upload\/v\d+\/(.+)\.(mp4|mov|avi|webm)$/i);
        if (match) {
          return match[1]; // This is the public_id with folder
        }
        
        // Fallback: try to extract from simpler format
        const simpleMatch = url.match(/\/upload\/(.+)\.(mp4|mov|avi|webm)$/i);
        if (simpleMatch) {
          return simpleMatch[1];
        }
        
        throw new Error(`Could not extract public ID from URL: ${url}`);
      });

      console.log('📋 Extracted public IDs:', publicIds);
      onProgress?.(50);

      // Call the Cloudinary concatenation edge function
      const { data, error } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: {
          publicIds,
          platform: options.platform,
          customization: options.customization
        }
      });

      if (error) {
        console.error('❌ Cloudinary concatenation error:', error);
        throw new Error(`Video processing failed: ${error.message}`);
      }

      onProgress?.(75);

      if (!data || !data.success) {
        const errorMsg = data?.error || 'Unknown processing error';
        console.error('❌ Cloudinary processing failed:', errorMsg);
        throw new Error(`Video processing failed: ${errorMsg}`);
      }

      onProgress?.(90);

      // Download the processed video from Cloudinary
      const cloudinaryUrl = data.url;
      console.log('📥 Downloading processed video from Cloudinary:', cloudinaryUrl);

      try {
        const videoResponse = await fetch(cloudinaryUrl);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download processed video: HTTP ${videoResponse.status} ${videoResponse.statusText}`);
        }

        const videoBlob = await videoResponse.blob();
        onProgress?.(100);
        console.log('✅ Successfully downloaded processed video:', {
          size: videoBlob.size,
          type: videoBlob.type
        });
        
        return videoBlob;
        
      } catch (downloadError) {
        console.error('❌ Failed to download processed video:', downloadError);
        throw new Error(`Failed to download processed video: ${downloadError.message}`);
      }

    } catch (error) {
      console.error('❌ Cloudinary video processing failed:', error);
      throw new Error(`Video processing failed: ${error.message}`);
    }
  }

  getProcessingMode(): 'cloudinary' {
    return 'cloudinary';
  }
}
