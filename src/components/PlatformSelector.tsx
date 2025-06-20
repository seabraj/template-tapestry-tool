// Enhanced videoProcessor.ts with platform-specific processing
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
  enableProgress?: boolean;
}

interface VideoWithExactDuration {
  publicId: string;
  duration: number;
  originalDuration: number;
  detectionSource: 'exact' | 'fallback';
  name: string;
}

// FIXED: Platform specifications with correct resolutions
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
    resolution: '1080×1920', // FIXED: Was 1980x1920
    width: 1080,
    height: 1920,
    description: 'Vertical format, full-screen mobile experience'
  }
} as const;

export class VideoProcessor {
  constructor() {
    console.log('🎬 VideoProcessor initialized with enhanced platform support');
  }

  async processVideo(
    options: VideoProcessingOptions, 
    onProgress?: (progress: number, details?: any) => void
  ): Promise<Blob> {
    const platformSpec = PLATFORM_SPECS[options.platform as keyof typeof PLATFORM_SPECS];
    
    console.log('🚀 Starting platform-specific video processing:', {
      platform: options.platform,
      sequences: options.sequences.length,
      targetDuration: options.duration,
      platformSpecs: platformSpec
    });
    
    // Enhanced progress tracking with platform info
    onProgress?.(5, {
      phase: 'initialization',
      platform: options.platform,
      platformSpecs: platformSpec
    });

    try {
      // Step 1: Validate sequences
      const validSequences = this.validateSequences(options.sequences);
      onProgress?.(10, { phase: 'validation', validSequences: validSequences.length });

      // Step 2: Detect exact durations for all videos
      console.log('🔍 Detecting exact durations for platform processing...');
      const videosWithExactDurations = await this.detectAllExactDurations(validSequences, onProgress);
      onProgress?.(35, { phase: 'duration_detection', detectedVideos: videosWithExactDurations.length });

      // Step 3: Prepare enhanced request with platform specifications
      const requestBody = {
        videos: videosWithExactDurations.map(video => ({
          publicId: video.publicId,
          duration: video.duration,
          source: video.detectionSource
        })),
        targetDuration: options.duration,
        platform: options.platform, // Critical for platform-specific processing
        exactDurations: true,
        enableProgress: false
      };

      console.log(`📡 Processing for ${options.platform} (${platformSpec?.ratio})...`, {
        ...requestBody,
        videos: requestBody.videos.length,
        targetResolution: platformSpec?.resolution
      });
      
      onProgress?.(40, { 
        phase: 'platform_processing', 
        platform: options.platform,
        targetResolution: platformSpec?.resolution
      });
      
      // Step 4: Process videos with platform transformations
      const { data, error } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: requestBody
      });

      if (error) throw new Error(`Platform processing failed: ${error.message}`);
      if (!data?.success || !data?.url) throw new Error(data?.error || 'Backend failed to return a valid URL.');
      
      const finalUrl = data.url;
      console.log(`✅ Platform processing complete for ${options.platform}!`, {
        url: finalUrl,
        platform: options.platform,
        specs: platformSpec,
        stats: data.stats
      });
      
      onProgress?.(75, { 
        phase: 'platform_complete', 
        platform: options.platform,
        finalUrl: finalUrl
      });

      // Step 5: Download final video
      console.log(`📥 Downloading final ${options.platform} video...`);
      const videoBlob = await this.downloadFromUrl(finalUrl);
      
      onProgress?.(100, { 
        phase: 'complete', 
        platform: options.platform,
        finalSize: `${(videoBlob.size / 1024 / 1024).toFixed(2)}MB`
      });
      
      console.log(`🎉 ${options.platform} video ready!`, {
        platform: options.platform,
        finalSize: `${(videoBlob.size / 1024 / 1024).toFixed(2)}MB`,
        targetSpecs: platformSpec,
        stats: data.stats
      });
      
      return videoBlob;

    } catch (error) {
      console.error(`❌ ${options.platform} processing failed:`, error);
      throw error;
    }
  }

  /**
   * Enhanced duration detection with platform context
   */
  private async detectAllExactDurations(
    sequences: VideoProcessingOptions['sequences'], 
    onProgress?: (progress: number, details?: any) => void
  ): Promise<VideoWithExactDuration[]> {
    console.log('🎯 Starting exact duration detection for platform processing...');
    
    const videosWithExactDurations: VideoWithExactDuration[] = [];
    const errors: string[] = [];

    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      
      try {
        console.log(`📊 Detecting duration ${i + 1}/${sequences.length}: ${seq.name}`);
        
        // Progress for duration detection phase (10% to 35%)
        const detectionProgress = 10 + ((i / sequences.length) * 25);
        onProgress?.(detectionProgress, {
          phase: 'duration_detection',
          current: i + 1,
          total: sequences.length,
          videoName: seq.name
        });

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
          difference: durationDiff.toFixed(6)
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

    // Enhanced summary with platform context
    const exactCount = videosWithExactDurations.filter(v => v.detectionSource === 'exact').length;
    const fallbackCount = videosWithExactDurations.filter(v => v.detectionSource === 'fallback').length;

    console.log('📊 Duration Detection Summary for Platform Processing:', {
      total: videosWithExactDurations.length,
      exactDetections: exactCount,
      fallbackUsed: fallbackCount,
      successRate: `${((exactCount / videosWithExactDurations.length) * 100).toFixed(1)}%`,
      readyForPlatformProcessing: true
    });

    if (videosWithExactDurations.length === 0) {
      throw new Error('Failed to process any videos for platform formatting. Check video URLs and network connection.');
    }

    return videosWithExactDurations;
  }

  /**
   * Enhanced duration detection with better error handling
   */
  private async detectExactDuration(fileUrl: string): Promise<number> {
    return new Promise((resolve, reject) => {
      console.log(`🔍 Detecting exact duration for platform processing: ${fileUrl}`);
      
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
        reject(new Error(`Failed to load video for platform processing: ${fileUrl}`));
      };
      
      video.addEventListener('loadedmetadata', onMetadata);
      video.addEventListener('error', onError);
      
      // Timeout after 15 seconds
      setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout: Could not detect duration within 15 seconds for platform processing`));
      }, 15000);
      
      video.src = fileUrl;
    });
  }

  // Utility method to get platform specifications
  static getPlatformSpecs(platform: string) {
    return PLATFORM_SPECS[platform as keyof typeof PLATFORM_SPECS] || PLATFORM_SPECS.youtube;
  }

  // Enhanced validation with platform context
  private validateSequences(sequences: any[]) {
    console.log('🔍 Validating sequences for platform processing...');
    const validSequences = sequences.filter(seq => seq.file_url && seq.duration > 0);
    console.log(`✅ Validation complete: ${validSequences.length}/${sequences.length} sequences ready for platform processing`);
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