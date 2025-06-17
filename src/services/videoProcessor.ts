
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

interface TrimData {
  originalDuration: number;
  trimmedDuration: number;
}

export class VideoProcessor {
  constructor() {
    console.log('🎬 VideoProcessor initialized for Cloudinary concatenation with proportional trimming');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    return this.processVideoWithCloudinaryConcatenation(options, onProgress);
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

  private calculateProportionalTrimming(videos: Array<{duration: number}>, targetDuration: number): TrimData[] {
    const totalDuration = videos.reduce((sum, video) => sum + video.duration, 0);
    
    console.log(`🎯 Proportional trimming calculation: ${totalDuration}s total → ${targetDuration}s target`);
    
    if (targetDuration >= totalDuration) {
      console.log('✅ No trimming needed - target duration is >= total duration');
      return videos.map(video => ({ 
        originalDuration: video.duration,
        trimmedDuration: video.duration
      }));
    }
    
    // Calculate proportional scaling factor
    const scaleFactor = targetDuration / totalDuration;
    console.log(`📐 Scale factor: ${scaleFactor.toFixed(3)} (${(scaleFactor * 100).toFixed(1)}%)`);
    
    const trimData = videos.map((video, index) => {
      const trimmedDuration = video.duration * scaleFactor;
      
      console.log(`✂️ Video ${index + 1}: ${video.duration}s → ${trimmedDuration.toFixed(2)}s`);
      
      return {
        originalDuration: video.duration,
        trimmedDuration: trimmedDuration
      };
    });
    
    const actualTotal = trimData.reduce((sum, trim) => sum + trim.trimmedDuration, 0);
    console.log(`🎯 Final calculated duration: ${actualTotal.toFixed(2)}s (target: ${targetDuration}s)`);
    
    return trimData;
  }

  private async processVideoWithCloudinaryConcatenation(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🚀 Starting Cloudinary video concatenation with proportional trimming...', {
        sequences: options.sequences.length,
        platform: options.platform,
        targetDuration: options.duration,
        totalSourceDuration: options.sequences.reduce((sum, seq) => sum + seq.duration, 0)
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

      // Calculate proportional trimming using CORRECTED calculation
      const trimData = this.calculateProportionalTrimming(validSequences, options.duration);
      
      // Extract Cloudinary public IDs
      const videoPublicIds = [];
      for (let i = 0; i < validSequences.length; i++) {
        const seq = validSequences[i];
        const trim = trimData[i];
        
        try {
          const publicId = this.extractCloudinaryPublicId(seq.file_url);
          videoPublicIds.push({
            public_id: publicId,
            name: seq.name,
            duration: seq.duration,
            trimData: trim
          });
          
          console.log(`📋 Video: ${seq.name} - ${publicId} (${trim.trimmedDuration.toFixed(2)}s from ${trim.originalDuration}s)`);
        } catch (error) {
          console.error(`❌ Failed to process sequence ${seq.name}:`, error);
          throw error;
        }
      }

      onProgress?.(50);

      if (videoPublicIds.length === 1) {
        // Single video - just optimize, format and trim if needed using CORRECT syntax
        const video = videoPublicIds[0];
        let transformations = ['q_auto:good', 'f_mp4'];
        
        // Apply trimming using SECONDS (more reliable than percentages)
        if (video.trimData.trimmedDuration < video.duration) {
          transformations.push(`so_0,eo_${video.trimData.trimmedDuration.toFixed(2)}`);
          console.log(`✂️ Single video trimming: 0 to ${video.trimData.trimmedDuration.toFixed(2)}s`);
        }
        
        const singleVideoUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${transformations.join(',')}/${video.public_id}.mp4`;
        console.log('🎬 Single video URL with trimming:', singleVideoUrl);
        onProgress?.(90);
        
        // Download the processed video
        const videoResponse = await fetch(singleVideoUrl);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download video: HTTP ${videoResponse.status}`);
        }
        
        const videoBlob = await videoResponse.blob();
        onProgress?.(100);
        console.log('✅ Successfully processed single video with proportional trimming');
        return videoBlob;
      }

      // Multiple videos - use concatenation with CORRECTED trimming syntax
      console.log('🔗 Creating concatenation URL with proportional trimming using SECONDS...');
      
      // Build the concatenation URL - start with the first video as base
      const baseVideo = videoPublicIds[0];
      let transformations = ['q_auto:good', 'f_mp4'];
      
      // Apply trimming to base video using SECONDS
      if (baseVideo.trimData.trimmedDuration < baseVideo.duration) {
        transformations.push(`so_0,eo_${baseVideo.trimData.trimmedDuration.toFixed(2)}`);
        console.log(`✂️ Base video trimming: 0 to ${baseVideo.trimData.trimmedDuration.toFixed(2)}s`);
      }
      
      // Add each subsequent video as a layer with CORRECT trimming syntax
      for (let i = 1; i < videoPublicIds.length; i++) {
        const video = videoPublicIds[i];
        
        // Create overlay transformation with CORRECTED trimming using seconds
        let overlayTransform = `l_video:${video.public_id.replace(/\//g, ':')}`;
        
        // Apply trimming using seconds (more reliable than percentages)
        if (video.trimData.trimmedDuration < video.duration) {
          overlayTransform += `/so_0,eo_${video.trimData.trimmedDuration.toFixed(2)}`;
          console.log(`✂️ Layer ${i} trimming: 0 to ${video.trimData.trimmedDuration.toFixed(2)}s`);
        }
        
        overlayTransform += '/fl_splice';
        transformations.push(overlayTransform);
        
        console.log(`📎 Layer ${i} added: ${video.name} with transform: ${overlayTransform}`);
      }
      
      // Build the final concatenation URL
      const transformationString = transformations.join('/');
      const concatenatedUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${transformationString}/${baseVideo.public_id}.mp4`;
      
      const finalDuration = trimData.reduce((sum, trim) => sum + trim.trimmedDuration, 0);
      console.log(`🎯 Generated concatenation URL with CORRECTED trimming (target: ${options.duration}s, calculated: ${finalDuration.toFixed(2)}s)`);
      console.log(`🔗 Final URL: ${concatenatedUrl}`);
      
      onProgress?.(75);

      // Download the concatenated video
      try {
        console.log('📥 Downloading concatenated and trimmed video...');
        const videoResponse = await fetch(concatenatedUrl);
        
        if (!videoResponse.ok) {
          console.error(`❌ Cloudinary concatenation failed: HTTP ${videoResponse.status}`);
          
          // Log response details for debugging
          const responseText = await videoResponse.text();
          console.error('Response details:', {
            status: videoResponse.status,
            statusText: videoResponse.statusText,
            headers: Object.fromEntries(videoResponse.headers.entries()),
            body: responseText
          });
          
          throw new Error(`Cloudinary concatenation failed: HTTP ${videoResponse.status} ${videoResponse.statusText}`);
        }

        const videoBlob = await videoResponse.blob();
        onProgress?.(100);
        
        console.log('✅ Successfully downloaded concatenated and trimmed video:', {
          size: videoBlob.size,
          type: videoBlob.type,
          targetDuration: options.duration,
          calculatedDuration: finalDuration.toFixed(2)
        });
        
        return videoBlob;
        
      } catch (downloadError) {
        console.error('❌ Failed to download concatenated video:', downloadError);
        throw new Error(`Video concatenation failed: ${downloadError.message}`);
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
