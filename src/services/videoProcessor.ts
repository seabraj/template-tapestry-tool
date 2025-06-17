
import { supabase } from '@/integrations/supabase/client';
import { Cloudinary } from '@cloudinary/url-gen';
import { VideoTransformation } from '@cloudinary/url-gen/actions/videoEdit';
import { trim } from '@cloudinary/url-gen/actions/videoEdit';
import { concatenate } from '@cloudinary/url-gen/actions/videoEdit';
import { auto } from '@cloudinary/url-gen/qualifiers/quality';
import { mp4 } from '@cloudinary/url-gen/qualifiers/format';

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
  private cloudinary: Cloudinary;

  constructor() {
    this.cloudinary = new Cloudinary({
      cloud: {
        cloudName: 'dsxrmo3kt'
      }
    });
    console.log('🎬 VideoProcessor initialized with Cloudinary SDK');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    return this.processVideoWithCloudinarySDK(options, onProgress);
  }

  private extractCloudinaryPublicId(url: string): string {
    console.log('🔍 Extracting public ID from URL:', url);
    
    // Remove any query parameters first
    const cleanUrl = url.split('?')[0];
    
    // Pattern 1: Standard Cloudinary URL with version
    let match = cleanUrl.match(/\/upload\/v\d+\/(.+)\.(mp4|mov|avi|webm|mkv)$/i);
    if (match) {
      const publicId = match[1];
      console.log('✅ Extracted public ID (with version):', publicId);
      return publicId;
    }
    
    // Pattern 2: Cloudinary URL without version
    match = cleanUrl.match(/\/upload\/(.+)\.(mp4|mov|avi|webm|mkv)$/i);
    if (match) {
      const publicId = match[1];
      console.log('✅ Extracted public ID (no version):', publicId);
      return publicId;
    }
    
    // Pattern 3: Direct public ID format
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

  private async processVideoWithCloudinarySDK(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🚀 Starting Cloudinary SDK video processing...', {
        sequences: options.sequences.length,
        platform: options.platform,
        targetDuration: options.duration
      });
      onProgress?.(10);

      // Validate and process sequences
      const validSequences = options.sequences.filter((seq, index) => {
        if (!seq.file_url || !seq.file_url.startsWith('http')) {
          console.warn(`❌ Invalid sequence URL: ${seq.id} - ${seq.file_url}`);
          return false;
        }
        return true;
      });

      if (validSequences.length === 0) {
        throw new Error('No valid video sequences found');
      }

      console.log(`✅ Processing ${validSequences.length} sequence(s)`);
      onProgress?.(25);

      // Calculate trimming data
      const trimData = this.calculateProportionalTrimming(validSequences, options.duration);
      
      // Extract public IDs and build video objects
      const videoData = [];
      for (let i = 0; i < validSequences.length; i++) {
        const seq = validSequences[i];
        const trim = trimData[i];
        
        try {
          const publicId = this.extractCloudinaryPublicId(seq.file_url);
          videoData.push({
            publicId,
            name: seq.name,
            duration: seq.duration,
            trimData: trim
          });
        } catch (error) {
          console.error(`❌ Failed to process sequence ${seq.name}:`, error);
          throw error;
        }
      }

      onProgress?.(50);

      if (videoData.length === 1) {
        // Single video processing
        const video = videoData[0];
        const videoUrl = this.cloudinary.video(video.publicId)
          .quality(auto())
          .format(mp4())
          .videoEdit(trim().startOffset(0).endOffset(video.trimData.trimmedDuration))
          .toURL();

        console.log('🎬 Single video URL:', videoUrl);
        onProgress?.(90);
        
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download video: HTTP ${videoResponse.status}`);
        }
        
        const videoBlob = await videoResponse.blob();
        onProgress?.(100);
        console.log('✅ Successfully processed single video');
        return videoBlob;
      }

      // Multiple videos - concatenation (fallback to manual URL construction for now)
      console.log('🔗 Processing multiple videos with manual concatenation...');
      
      const baseVideo = videoData[0];
      let transformations = ['q_auto:good', 'f_mp4'];
      
      // Apply trimming to base video
      if (baseVideo.trimData.trimmedDuration < baseVideo.duration) {
        transformations.push(`so_0,eo_${baseVideo.trimData.trimmedDuration.toFixed(2)}`);
      }
      
      // Add overlay videos with trimming
      for (let i = 1; i < videoData.length; i++) {
        const video = videoData[i];
        let overlayTransform = `l_video:${video.publicId.replace(/\//g, ':')}`;
        
        if (video.trimData.trimmedDuration < video.duration) {
          overlayTransform += `/so_0,eo_${video.trimData.trimmedDuration.toFixed(2)}`;
        }
        
        overlayTransform += '/fl_splice';
        transformations.push(overlayTransform);
      }
      
      const concatenatedUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${transformations.join(',')}/${baseVideo.publicId}.mp4`;
      
      console.log('🔗 Final concatenation URL:', concatenatedUrl);
      onProgress?.(75);

      const videoResponse = await fetch(concatenatedUrl);
      if (!videoResponse.ok) {
        throw new Error(`Cloudinary concatenation failed: HTTP ${videoResponse.status}`);
      }

      const videoBlob = await videoResponse.blob();
      onProgress?.(100);
      
      console.log('✅ Successfully processed concatenated video');
      return videoBlob;

    } catch (error) {
      console.error('❌ Cloudinary SDK video processing failed:', error);
      throw new Error(`Video processing failed: ${error.message}`);
    }
  }

  getProcessingMode(): 'cloudinary' {
    return 'cloudinary';
  }
}
