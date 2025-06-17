
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
    console.log('🎬 VideoProcessor initialized for Cloudinary fl_splice concatenation');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    return this.processVideoWithCloudinarySplice(options, onProgress);
  }

  private extractCloudinaryPublicId(url: string): string {
    console.log('🔍 Extracting public ID from URL:', url);
    
    // Remove any query parameters first
    const cleanUrl = url.split('?')[0];
    
    // Pattern 1: Standard Cloudinary URL with version
    // https://res.cloudinary.com/CLOUD_NAME/video/upload/v123456/folder/public_id.ext
    let match = cleanUrl.match(/\/upload\/v\d+\/(.+)\.(mp4|mov|avi|webm|mkv)$/i);
    if (match) {
      const publicId = match[1];
      console.log('✅ Extracted public ID (with version):', publicId);
      return publicId;
    }
    
    // Pattern 2: Cloudinary URL without version
    // https://res.cloudinary.com/CLOUD_NAME/video/upload/folder/public_id.ext
    match = cleanUrl.match(/\/upload\/(.+)\.(mp4|mov|avi|webm|mkv)$/i);
    if (match) {
      const publicId = match[1];
      console.log('✅ Extracted public ID (no version):', publicId);
      return publicId;
    }
    
    // Pattern 3: Direct public ID format
    // https://res.cloudinary.com/CLOUD_NAME/video/upload/public_id.ext
    match = cleanUrl.match(/\/upload\/([^\/]+)\.(mp4|mov|avi|webm|mkv)$/i);
    if (match) {
      const publicId = match[1];
      console.log('✅ Extracted public ID (direct):', publicId);
      return publicId;
    }
    
    console.error('❌ Could not extract public ID from URL:', url);
    throw new Error(`Could not extract public ID from URL: ${url}`);
  }

  private async processVideoWithCloudinarySplice(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🚀 Starting Cloudinary fl_splice video concatenation...', {
        sequences: options.sequences.length,
        platform: options.platform,
        duration: options.duration
      });
      onProgress?.(10);

      // Validate sequences and preserve order
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

      // Extract Cloudinary public IDs
      const videoPublicIds = [];
      for (const seq of validSequences) {
        try {
          const publicId = this.extractCloudinaryPublicId(seq.file_url);
          videoPublicIds.push({
            public_id: publicId,
            name: seq.name
          });
          
          console.log(`📋 Video: ${seq.name} - ${publicId}`);
        } catch (error) {
          console.error(`❌ Failed to process sequence ${seq.name}:`, error);
          throw error;
        }
      }

      onProgress?.(50);

      if (videoPublicIds.length === 1) {
        // Single video - just optimize and format
        const singleVideoUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/q_auto:good,f_mp4/${videoPublicIds[0].public_id}.mp4`;
        console.log('🎬 Single video optimization URL generated');
        onProgress?.(90);
        
        // Download the processed video
        const videoResponse = await fetch(singleVideoUrl);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download video: HTTP ${videoResponse.status}`);
        }
        
        const videoBlob = await videoResponse.blob();
        onProgress?.(100);
        console.log('✅ Successfully processed single video');
        return videoBlob;
      }

      // Multiple videos - concatenate using fl_splice
      console.log('🔗 Creating fl_splice concatenation URL for multiple videos...');
      
      const baseVideo = videoPublicIds[0];
      const transformations = ['q_auto:good', 'f_mp4'];
      
      // Add each subsequent video using fl_splice for proper concatenation
      for (let i = 1; i < videoPublicIds.length; i++) {
        const video = videoPublicIds[i];
        const escapedPublicId = video.public_id.replace(/\//g, ':');
        
        // Use fl_splice for true sequential concatenation
        transformations.push(`l_video:${escapedPublicId}`);
        transformations.push('fl_splice');
        transformations.push('fl_layer_apply');
        
        console.log(`📎 Splicing ${video.name} using fl_splice`);
      }
      
      // Build the final concatenation URL with fl_splice
      const transformationString = transformations.join('/');
      const concatenatedUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${transformationString}/${baseVideo.public_id}.mp4`;
      
      console.log(`🎯 Generated fl_splice concatenation URL with ${videoPublicIds.length} videos`);
      console.log(`🔗 Concatenation URL: ${concatenatedUrl}`);
      
      onProgress?.(75);

      // Download the concatenated video
      try {
        console.log('📥 Downloading concatenated video...');
        const videoResponse = await fetch(concatenatedUrl);
        
        if (!videoResponse.ok) {
          console.error(`❌ Cloudinary fl_splice failed: HTTP ${videoResponse.status}`);
          throw new Error(`Cloudinary concatenation failed: HTTP ${videoResponse.status} ${videoResponse.statusText}`);
        }

        const videoBlob = await videoResponse.blob();
        onProgress?.(100);
        
        console.log('✅ Successfully downloaded fl_splice concatenated video:', {
          size: videoBlob.size,
          type: videoBlob.type,
          method: 'fl_splice'
        });
        
        return videoBlob;
        
      } catch (downloadError) {
        console.error('❌ Failed to download fl_splice concatenated video:', downloadError);
        throw new Error(`Video concatenation failed: ${downloadError.message}`);
      }

    } catch (error) {
      console.error('❌ Cloudinary fl_splice video processing failed:', error);
      throw new Error(`Video processing failed: ${error.message}`);
    }
  }

  getProcessingMode(): 'cloudinary' {
    return 'cloudinary';
  }
}
