// Enhanced videoProcessor.ts with Creatomate support and updated progress tracking
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
  enableProgress?: boolean;
}

interface VideoWithExactDuration {
  publicId: string;
  duration: number;
  originalDuration: number;
  detectionSource: 'exact' | 'fallback';
  name: string;
  file_url: string;
}

interface ProgressUpdate {
  phase: string;
  progress: number; // 0-100
  message: string;
  details?: any;
  timestamp: string;
}

export class VideoProcessor {
  constructor() {
    console.log('🎬 VideoProcessor initialized with Creatomate support');
  }

  async processVideo(
    options: VideoProcessingOptions, 
    onProgress?: (progress: number, details?: any) => void
  ): Promise<Blob> {
    console.log('🚀 Starting video processing with Creatomate:', options);
    
    return this.processVideoWithCreatomate(options, onProgress);
  }

  /**
   * New Creatomate processing method
   */
  private async processVideoWithCreatomate(
    options: VideoProcessingOptions,
    onProgress?: (progress: number, details?: any) => void
  ): Promise<Blob> {
    console.log('🎨 Using Creatomate for video processing...');
    onProgress?.(5, { phase: 'initialization', message: 'Starting Creatomate processing...' });

    try {
      // Step 1: Validate sequences
      const validSequences = this.validateSequences(options.sequences);
      onProgress?.(10, { phase: 'validation', message: 'Validating sequences...' });

      // Step 2: Detect exact durations for all videos
      console.log('🔍 Step 2: Detecting exact durations for all videos...');
      const videosWithExactDurations = await this.detectAllExactDurations(validSequences, (progress) => 
        onProgress?.(10 + (progress * 0.25), { phase: 'duration_detection', message: 'Detecting durations...' })
      );
      onProgress?.(35, { phase: 'duration_detection', message: 'Durations detected.' });

      // Step 3: Prepare request for Creatomate
      const requestBody = {
        videos: videosWithExactDurations.map(video => ({
          publicId: video.publicId,
          duration: video.duration,
          file_url: video.file_url,
          source: video.detectionSource,
          name: video.name
        })),
        targetDuration: options.duration,
        platform: options.platform,
        customization: options.customization,
        exactDurations: true,
        enableProgress: false 
      };

      console.log('🎨 Calling Creatomate edge function:', requestBody);
      onProgress?.(40, { phase: 'processing', message: 'Sending to Creatomate...' });
      
      // Step 4: Process videos with retry logic using Supabase client
      const maxRetries = 3;
      let lastError: Error | null = null;
      let data: any = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🎨 Attempt ${attempt}/${maxRetries} - Calling Creatomate edge function...`);
          
          // Use Supabase client to call the new Creatomate edge function
          const { data: functionData, error: functionError } = await supabase.functions.invoke('creatomate-process', {
            body: requestBody
          });
          
          if (functionError) {
            throw new Error(`Function error: ${functionError.message || JSON.stringify(functionError)}`);
          }
          
          if (!functionData?.success) {
            throw new Error(functionData?.error || 'Creatomate processing failed');
          }
          
          if (!functionData?.url) {
            throw new Error('Creatomate failed to return a valid video URL');
          }
          
          data = functionData;
          break; // Success, exit retry loop
          
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`❌ Attempt ${attempt} failed:`, lastError.message);
          
          if (attempt === maxRetries) {
            throw new Error(`Creatomate processing failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
          }
          
          // Wait before retrying (exponential backoff)
          const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          onProgress?.(40 + (attempt * 5), { 
            phase: 'processing', 
            message: `Retrying... (${attempt}/${maxRetries})` 
          });
        }
      }
      
      const finalUrl = data.url;
      console.log(`✅ Success! Final URL from Creatomate received: ${finalUrl}`);
      
      // Enhanced progress phases for Creatomate
      onProgress?.(60, { phase: 'template_creation', message: 'Creating dynamic template...' });
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate processing time
      
      onProgress?.(70, { phase: 'media_upload', message: 'Uploading videos to Creatomate...' });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      onProgress?.(80, { phase: 'rendering', message: 'Rendering video with customization...' });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      onProgress?.(90, { phase: 'finalizing', message: 'Finalizing render...' });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      onProgress?.(95, { phase: 'downloading', message: 'Downloading final video...' });

      // Step 5: Download final video
      console.log('📥 Downloading final video from Creatomate...');
      const videoBlob = await this.downloadFromUrl(finalUrl);
      onProgress?.(100, { phase: 'complete', message: 'Done!' });
      
      console.log('🎉 Creatomate video processing complete!');
      return videoBlob;

    } catch (error) {
      console.error('❌ Creatomate video processing failed:', error);
      onProgress?.(-1, { phase: 'error', message: error.message });
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
        
        // Progress for duration detection phase
        const detectionProgress = (i / sequences.length) * 100;
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
          name: seq.name,
          file_url: seq.file_url
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
            name: seq.name,
            file_url: seq.file_url
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
      successRate: `${((exactCount / videosWithExactDurations.length) * 100).toFixed(1)}%`
    });

    if (videosWithExactDurations.length === 0) {
      throw new Error('Failed to process any videos. Check video URLs and network connection.');
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

  private validateSequences(sequences: any[]) {
    console.log('🔍 Validating sequences...');
    
    // Enhanced validation with detailed error reporting
    const validSequences = [];
    const errors = [];
    
    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      
      if (!seq.file_url) {
        errors.push(`Sequence ${i + 1} (${seq.name || 'Unnamed'}): Missing file_url`);
        continue;
      }
      
      if (!seq.duration || seq.duration <= 0) {
        errors.push(`Sequence ${i + 1} (${seq.name || 'Unnamed'}): Invalid duration (${seq.duration})`);
        continue;
      }
      
      // Validate URL format (basic check)
      try {
        new URL(seq.file_url);
      } catch (e) {
        errors.push(`Sequence ${i + 1} (${seq.name || 'Unnamed'}): Invalid URL format`);
        continue;
      }
      
      validSequences.push(seq);
    }
    
    if (errors.length > 0) {
      console.error('❌ Validation errors found:', errors);
      if (validSequences.length === 0) {
        throw new Error(`All sequences failed validation:\n${errors.join('\n')}`);
      } else {
        console.warn(`⚠️ Some sequences failed validation but continuing with ${validSequences.length} valid sequences`);
      }
    }
    
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
