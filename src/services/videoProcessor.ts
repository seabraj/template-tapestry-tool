// Enhanced videoProcessor.ts with real-time progress tracking
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
  enableProgress?: boolean; // New option for progress tracking
}

interface VideoWithExactDuration {
  publicId: string;
  duration: number;
  originalDuration: number;
  detectionSource: 'exact' | 'fallback';
  name: string;
  file_url: string; // Ensure file_url is carried through
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
    console.log('🎬 VideoProcessor initialized with progress tracking');
  }

  async processVideo(
    options: VideoProcessingOptions, 
    onProgress?: (progress: number, details?: any) => void
  ): Promise<Blob> {
    console.log('🚀 Starting video processing with progress tracking:', options);
    
    // For now, use traditional method to avoid build issues
    return this.processVideoTraditional(options, onProgress);
  }

  /**
   * Traditional processing method (fallback)
   */
  private async processVideoTraditional(
    options: VideoProcessingOptions,
    onProgress?: (progress: number, details?: any) => void
  ): Promise<Blob> {
    console.log('📡 Using traditional processing...');
    onProgress?.(5, { phase: 'initialization', message: 'Starting...' });

    try {
      // Step 1: Validate sequences
      const validSequences = this.validateSequences(options.sequences);
      onProgress?.(10, { phase: 'validation', message: 'Validating sequences...' });

      // Step 2: Detect exact durations for all videos
      console.log('🔍 Step 2: Detecting exact durations for all videos...');
      const videosWithExactDurations = await this.detectAllExactDurations(validSequences, (progress) => onProgress?.(progress, { phase: 'duration_detection', message: 'Detecting durations...' }));
      onProgress?.(35, { phase: 'duration_detection', message: 'Durations detected.' });

      // Step 3: Prepare request with all necessary data
      const requestBody = {
        videos: videosWithExactDurations.map(video => ({
          publicId: video.publicId,
          duration: video.duration,
          file_url: video.file_url, // Include the file_url for processing
          source: video.detectionSource,
          name: video.name // Add name for better debugging
        })),
        targetDuration: options.duration,
        platform: options.platform,
        exactDurations: true,
        enableProgress: false 
      };

      console.log('📡 Calling edge function with Supabase client:', requestBody);
      onProgress?.(40, { phase: 'processing', message: 'Sending to backend...' });
      
      // Step 4: Process videos with retry logic using Supabase client
      const maxRetries = 3;
      let lastError: Error | null = null;
      let data: any = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`📡 Attempt ${attempt}/${maxRetries} - Calling edge function with supabase.functions.invoke...`);
          
          // Use Supabase client to call the edge function
          const { data: functionData, error: functionError } = await supabase.functions.invoke('cloudinary-concatenate', {
            body: requestBody
          });
          
          if (functionError) {
            throw new Error(`Function error: ${functionError.message || JSON.stringify(functionError)}`);
          }
          
          if (!functionData?.success) {
            throw new Error(functionData?.error || 'Backend processing failed');
          }
          
          if (!functionData?.url) {
            throw new Error('Backend failed to return a valid video URL');
          }
          
          data = functionData;
          break; // Success, exit retry loop
          
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`❌ Attempt ${attempt} failed:`, lastError.message);
          
          if (attempt === maxRetries) {
            throw new Error(`Video processing failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
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
      console.log(`✅ Success! Final URL received: ${finalUrl}`);
      onProgress?.(75, { phase: 'downloading', message: 'Downloading final video...' });

      // Step 5: Download final video
      console.log('📥 Downloading final video...');
      const videoBlob = await this.downloadFromUrl(finalUrl);
      onProgress?.(100, { phase: 'complete', message: 'Done!' });
      
      console.log('🎉 Video processing complete!');
      return videoBlob;

    } catch (error) {
      console.error('❌ Video processing failed:', error);
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
          name: seq.name,
          file_url: seq.file_url // Carry file_url forward
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
            file_url: seq.file_url // Carry file_url forward
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

  // Keep all your existing methods unchanged
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
      
      // Check if it's a Cloudinary URL
      if (!seq.file_url.includes('cloudinary.com')) {
        console.warn(`⚠️ Sequence ${i + 1} is not a Cloudinary URL: ${seq.file_url}`);
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
