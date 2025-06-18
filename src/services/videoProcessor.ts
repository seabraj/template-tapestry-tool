// UPDATED videoProcessor.ts with exact duration detection
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

interface VideoWithExactDuration {
  publicId: string;
  duration: number;
  originalDuration: number;
  detectionSource: 'exact' | 'fallback';
  name: string;
}

export class VideoProcessor {
  constructor() {
    console.log('🎬 Initializing VideoProcessor with exact duration detection...');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    console.log('🚀 Starting video processing with exact duration detection:', options);
    onProgress?.(5);

    try {
      // Step 1: Validate sequences
      const validSequences = this.validateSequences(options.sequences);
      onProgress?.(10);

      // Step 2: Detect exact durations for all videos
      console.log('🔍 Step 2: Detecting exact durations for all videos...');
      const videosWithExactDurations = await this.detectAllExactDurations(validSequences, onProgress);
      onProgress?.(35);

      // Step 3: Prepare request with exact durations
      const requestBody = {
        videos: videosWithExactDurations.map(video => ({
          publicId: video.publicId,
          duration: video.duration,
          source: video.detectionSource
        })),
        targetDuration: options.duration,
        exactDurations: true
      };

      console.log('📊 Duration Summary:', {
        totalVideos: videosWithExactDurations.length,
        exactDetections: videosWithExactDurations.filter(v => v.detectionSource === 'exact').length,
        fallbacks: videosWithExactDurations.filter(v => v.detectionSource === 'fallback').length,
        totalOriginalDuration: videosWithExactDurations.reduce((sum, v) => sum + v.duration, 0).toFixed(3),
        targetDuration: options.duration
      });

      console.log('📡 Calling edge function with exact durations:', requestBody);
      onProgress?.(40);
      
      // Step 4: Process videos with exact durations
      const { data, error } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: requestBody
      });

      if (error) throw new Error(`Edge function failed: ${error.message}`);
      if (!data?.success || !data?.url) throw new Error(data?.error || 'Backend failed to return a valid URL.');
      
      const finalUrl = data.url;
      console.log(`✅ Success! Final URL received: ${finalUrl}`);
      console.log('📈 Processing Stats:', data.stats);
      onProgress?.(75);

      // Step 5: Download final video
      console.log('📥 Downloading final video...');
      const videoBlob = await this.downloadFromUrl(finalUrl);
      onProgress?.(100);
      
      console.log('🎉 Video processing complete with exact durations!');
      return videoBlob;

    } catch (error) {
      console.error('❌ Video processing failed:', error);
      throw error;
    }
  }

  /**
   * Detect exact durations for all videos
   */
  private async detectAllExactDurations(
    sequences: VideoProcessingOptions['sequences'], 
    onProgress?: (progress: number) => void
  ): Promise<VideoWithExactDuration[]> {
    console.log('🎯 Starting exact duration detection for all videos...');
    
    const videosWithExactDurations: VideoWithExactDuration[] = [];
    const errors: string[] = [];

    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      
      try {
        console.log(`📊 Detecting duration ${i + 1}/${sequences.length}: ${seq.name}`);
        
        // Progress for duration detection phase (10% to 35%)
        const detectionProgress = 10 + ((i / sequences.length) * 25);
        onProgress?.(detectionProgress);

        // Extract public ID
        const publicId = this.extractPublicIdFromUrl(seq.file_url);
        
        // Detect exact duration
        const exactDuration = await this.detectExactDuration(seq.file_url);
        
        videosWithExactDurations.push({
          publicId: publicId,
          duration: exactDuration,
          originalDuration: seq.duration,
          detectionSource: 'exact',
          name: seq.name
        });

        const durationDiff = Math.abs(exactDuration - seq.duration);
        console.log(`✅ ${seq.name}:`, {
          originalDuration: seq.duration.toFixed(3),
          exactDuration: exactDuration.toFixed(6),
          difference: durationDiff.toFixed(6),
          accuracyImprovement: durationDiff > 0.01 ? 'significant' : 'minor'
        });

      } catch (error) {
        console.error(`❌ Duration detection failed for ${seq.name}:`, error);
        
        // Fallback to original duration
        console.warn(`⚠️ Using fallback duration for ${seq.name}`);
        
        try {
          const publicId = this.extractPublicIdFromUrl(seq.file_url);
          videosWithExactDurations.push({
            publicId: publicId,
            duration: seq.duration,
            originalDuration: seq.duration,
            detectionSource: 'fallback',
            name: seq.name
          });
          
          errors.push(`${seq.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } catch (fallbackError) {
          console.error(`❌ Complete failure for ${seq.name}:`, fallbackError);
          throw new Error(`Failed to process video "${seq.name}": ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
        }
      }
    }

    // Summary of detection results
    const exactCount = videosWithExactDurations.filter(v => v.detectionSource === 'exact').length;
    const fallbackCount = videosWithExactDurations.filter(v => v.detectionSource === 'fallback').length;

    console.log('📊 Duration Detection Summary:', {
      total: videosWithExactDurations.length,
      exactDetections: exactCount,
      fallbackUsed: fallbackCount,
      successRate: `${((exactCount / videosWithExactDurations.length) * 100).toFixed(1)}%`,
      errors: errors.length > 0 ? errors : 'None'
    });

    if (videosWithExactDurations.length === 0) {
      throw new Error('Failed to process any videos. Check video URLs and network connection.');
    }

    if (errors.length > 0) {
      console.warn('⚠️ Some videos used fallback durations. For maximum precision, ensure all video URLs are accessible.');
    }

    return videosWithExactDurations;
  }

  /**
   * Detect exact duration for a single video using HTML5 video element
   */
  private async detectExactDuration(fileUrl: string): Promise<number> {
    return new Promise((resolve, reject) => {
      console.log(`🔍 Detecting exact duration for: ${fileUrl}`);
      
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onMetadata);
        video.removeEventListener('error', onError);
        video.src = '';
      };
      
      const onMetadata = () => {
        const duration = video.duration;
        if (duration && duration > 0) {
          console.log(`✅ Exact duration detected: ${duration.toFixed(6)}s`);
          cleanup();
          resolve(duration);
        } else {
          cleanup();
          reject(new Error('Invalid duration detected (0 or undefined)'));
        }
      };
      
      const onError = (error: Event) => {
        console.error(`❌ Error loading video for duration detection:`, error);
        cleanup();
        reject(new Error(`Failed to load video: ${fileUrl}`));
      };
      
      video.addEventListener('loadedmetadata', onMetadata);
      video.addEventListener('error', onError);
      
      // Timeout after 15 seconds
      setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout: Could not detect duration within 15 seconds`));
      }, 15000);
      
      video.src = fileUrl;
    });
  }

  // Keep all your existing methods unchanged
  private validateSequences(sequences: any[]) {
    console.log('🔍 Validating sequences...');
    const validSequences = sequences.filter(seq => seq.file_url && seq.duration > 0);
    console.log(`✅ Validation complete: ${validSequences.length}/${sequences.length} sequences are valid`);
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
      if (!response.ok) throw new Error(`Failed to download video: HTTP ${response.status}`);
      return await response.blob();
    } catch (error) {
      throw new Error(`Video download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}