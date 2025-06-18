// Clean production videoProcessor.ts
import { supabase } from '@/integrations/supabase/client';

export interface VideoProcessingOptions {
  sequences: Array<{
    id: string;
    name: string;
    duration: number;
    file_url: string;
  }>;
  customization: { /* ... your customization options ... */ };
  platform: string;
  duration: number;
}

export class VideoProcessor {
  constructor() {
    console.log('🎬 VideoProcessor initialized');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    console.log('🚀 Starting video processing with exact durations');
    onProgress?.(5);

    try {
      // Step 1: Validate sequences
      const validSequences = this.validateSequences(options.sequences);
      onProgress?.(10);

      // Step 2: Detect exact durations
      console.log('🔍 Detecting exact durations...');
      const videosWithExactDurations = await this.detectExactDurations(validSequences, onProgress);
      
      console.log('🎯 DURATION DETECTION RESULTS:', videosWithExactDurations);
      console.log('🎯 Each video check:', videosWithExactDurations.map(v => ({
        publicId: v.publicId,
        duration: v.duration,
        durationType: typeof v.duration,
        isValid: !!(v.duration && v.duration > 0)
      })));
      
      onProgress?.(35);

      // Step 3: Process videos
      const requestBody = {
        videos: videosWithExactDurations,
        targetDuration: options.duration
      };

      console.log('📡 FINAL REQUEST BODY:', JSON.stringify(requestBody, null, 2));
      console.log('📡 REQUEST VIDEOS CHECK:', requestBody.videos.map(v => ({
        publicId: v.publicId, 
        duration: v.duration,
        type: typeof v.duration
      })));
      
      onProgress?.(40);
      
      const { data, error } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: requestBody
      });

      if (error) throw new Error(`Processing failed: ${error.message}`);
      if (!data?.success || !data?.url) throw new Error(data?.error || 'Processing failed');
      
      console.log(`✅ Processing complete: ${data.url}`);
      onProgress?.(75);

      // Step 4: Download result
      const videoBlob = await this.downloadFromUrl(data.url);
      onProgress?.(100);
      
      console.log('🎉 Video generation successful!');
      return videoBlob;

    } catch (error) {
      console.error('❌ Video processing failed:', error);
      throw error;
    }
  }

  /**
   * Detect exact durations for all videos
   */
  private async detectExactDurations(
    sequences: VideoProcessingOptions['sequences'], 
    onProgress?: (progress: number) => void
  ) {
    const videosWithExactDurations = [];

    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      
      // Progress: 10% to 35%
      const progress = 10 + ((i / sequences.length) * 25);
      onProgress?.(progress);

      try {
        const publicId = this.extractPublicIdFromUrl(seq.file_url);
        console.log(`🔍 Detecting duration for: ${seq.name} (${publicId})`);
        
        const exactDuration = await this.detectSingleVideoDuration(seq.file_url);
        console.log(`📊 Detected: ${exactDuration} for ${seq.name}`);
        
        const videoData = {
          publicId: publicId,
          duration: exactDuration
        };
        
        videosWithExactDurations.push(videoData);
        console.log(`✅ ${seq.name}: ${exactDuration.toFixed(3)}s - Added to array`);
        console.log(`📋 Video data structure:`, videoData);
        
      } catch (error) {
        console.error(`❌ Duration detection failed for ${seq.name}:`, error);
        throw new Error(`Failed to detect exact duration for "${seq.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`✅ Exact durations detected for all ${videosWithExactDurations.length} videos`);
    console.log('🎯 FINAL ARRAY:', videosWithExactDurations);
    console.log('🎯 FINAL ARRAY CHECK:', videosWithExactDurations.map(v => ({
      publicId: v.publicId,
      duration: v.duration,
      valid: !!(v.duration && v.duration > 0)
    })));
    
    return videosWithExactDurations;
  }

  /**
   * Detect exact duration for a single video
   */
  private async detectSingleVideoDuration(fileUrl: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onMetadata);
        video.removeEventListener('error', onError);
        video.src = '';
      };
      
      const onMetadata = () => {
        if (video.duration && video.duration > 0) {
          cleanup();
          resolve(video.duration);
        } else {
          cleanup();
          reject(new Error('Invalid video duration'));
        }
      };
      
      const onError = () => {
        cleanup();
        reject(new Error('Failed to load video'));
      };
      
      video.addEventListener('loadedmetadata', onMetadata);
      video.addEventListener('error', onError);
      
      // 15 second timeout
      setTimeout(() => {
        cleanup();
        reject(new Error('Video loading timeout'));
      }, 15000);
      
      video.src = fileUrl;
    });
  }

  // Existing helper methods (unchanged)
  private validateSequences(sequences: any[]) {
    const validSequences = sequences.filter(seq => seq.file_url && seq.duration > 0);
    console.log(`✅ ${validSequences.length}/${sequences.length} sequences validated`);
    return validSequences;
  }

  private extractPublicIdFromUrl(cloudinaryUrl: string): string {
    try {
      const urlParts = cloudinaryUrl.split('/');
      const uploadIndex = urlParts.findIndex(part => part === 'upload');
      if (uploadIndex === -1) throw new Error('Invalid Cloudinary URL format');
      
      const pathAfterUpload = urlParts.slice(uploadIndex + 1).join('/');
      const pathWithoutVersion = pathAfterUpload.replace(/^v\d+\//, '');
      return pathWithoutVersion.replace(/\.[^/.]+$/, '');
    } catch (error) {
      throw new Error(`Invalid Cloudinary URL: ${cloudinaryUrl}`);
    }
  }

  private async downloadFromUrl(url: string): Promise<Blob> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
      return await response.blob();
    } catch (error) {
      throw new Error(`Video download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}