// Complete VideoProcessor with Phase 1 + Phase 2 functionality
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

// ===============================================
// PHASE 2: NEW INTERFACES
// ===============================================
interface TrimmedVideo {
  publicId: string;
  duration: number;
  originalDuration: number;
  order?: number;
  url?: string;
}

interface ConcatenationOptions {
  width?: number;
  height?: number;
  quality?: string;
  format?: string;
  background?: string;
}

interface ConcatenationResult {
  success: boolean;
  concatenatedUrl?: string;
  publicId?: string;
  duration?: number;
  error?: string;
}

export class VideoProcessor {
  constructor() {
    console.log('🎬 VideoProcessor initialized with Phase 1 + Phase 2 support');
  }

  // ===============================================
  // PHASE 1: VIDEO TRIMMING (EXISTING FUNCTIONALITY - UNCHANGED)
  // ===============================================
  
  /**
   * PHASE 1: Process videos with exact duration detection and proportional trimming
   * This is your existing working method - preserved exactly as is!
   */
  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    console.log('🎬 PHASE 1: Starting video processing with exact duration detection:', options);
    onProgress?.(5);

    try {
      // Step 1: Validate sequences
      const validSequences = this.validateSequences(options.sequences);
      onProgress?.(10);

      // Step 2: Detect exact durations for all videos
      console.log('🔍 PHASE 1 Step 2: Detecting exact durations for all videos...');
      const videosWithExactDurations = await this.detectAllExactDurations(validSequences, onProgress);
      onProgress?.(35);

      // Step 3: Prepare request with exact durations
      const requestBody = {
        action: 'trim', // Explicit Phase 1 action
        videos: videosWithExactDurations.map(video => ({
          publicId: video.publicId,
          duration: video.duration,
          source: video.detectionSource
        })),
        targetDuration: options.duration,
        exactDurations: true
      };

      console.log('📊 PHASE 1 Duration Summary:', {
        totalVideos: videosWithExactDurations.length,
        exactDetections: videosWithExactDurations.filter(v => v.detectionSource === 'exact').length,
        fallbacks: videosWithExactDurations.filter(v => v.detectionSource === 'fallback').length,
        totalOriginalDuration: videosWithExactDurations.reduce((sum, v) => sum + v.duration, 0).toFixed(3),
        targetDuration: options.duration
      });

      console.log('📡 PHASE 1: Calling edge function with exact durations:', requestBody);
      onProgress?.(40);
      
      // Step 4: Process videos with exact durations
      const { data, error } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: requestBody
      });

      if (error) throw new Error(`PHASE 1 Edge function failed: ${error.message}`);
      if (!data?.success || !data?.url) throw new Error(data?.error || 'PHASE 1 Backend failed to return a valid URL.');
      
      const finalUrl = data.url;
      console.log(`✅ PHASE 1 Success! Final URL received: ${finalUrl}`);
      console.log('📈 PHASE 1 Processing Stats:', data.stats);
      onProgress?.(75);

      // Step 5: Download final video
      console.log('📥 PHASE 1: Downloading final video...');
      const videoBlob = await this.downloadFromUrl(finalUrl);
      onProgress?.(100);
      
      console.log('🎉 PHASE 1: Video processing complete with exact durations!');
      return videoBlob;

    } catch (error) {
      console.error('❌ PHASE 1: Video processing failed:', error);
      throw error;
    }
  }

  // ===============================================
  // PHASE 2: VIDEO CONCATENATION (NEW FUNCTIONALITY)
  // ===============================================

  /**
   * PHASE 2: Concatenate trimmed videos using Cloudinary fl_splice
   */
  async concatenateVideos(
    trimmedVideos: TrimmedVideo[],
    outputSettings?: ConcatenationOptions,
    onProgress?: (progress: number) => void
  ): Promise<ConcatenationResult> {
    console.log('🎬 PHASE 2: Starting video concatenation with fl_splice:', {
      videoCount: trimmedVideos.length,
      totalDuration: trimmedVideos.reduce((sum, v) => sum + v.duration, 0)
    });

    try {
      if (onProgress) onProgress(10);

      // Validate inputs
      if (!trimmedVideos || trimmedVideos.length < 2) {
        throw new Error('PHASE 2: At least 2 trimmed videos are required for concatenation');
      }

      console.log('📊 PHASE 2: Videos to concatenate:', trimmedVideos.map(v => ({
        publicId: v.publicId,
        duration: v.duration.toFixed(6)
      })));

      if (onProgress) onProgress(20);

      // Prepare concatenation request
      const requestBody = {
        action: 'concatenate', // Explicit Phase 2 action
        trimmedVideos: trimmedVideos,
        outputSettings: {
          width: 1280,
          height: 720,
          quality: 'auto:best',
          format: 'mp4',
          background: 'black',
          ...outputSettings
        }
      };

      console.log('📡 PHASE 2: Calling edge function for concatenation:', requestBody);
      
      if (onProgress) onProgress(30);

      // Make concatenation request to backend
      const { data, error } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: requestBody
      });

      if (onProgress) onProgress(60);

      if (error) {
        throw new Error(`PHASE 2: Edge function failed: ${error.message}`);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'PHASE 2: Concatenation failed');
      }

      if (onProgress) onProgress(90);

      console.log('✅ PHASE 2: Concatenation successful!', {
        concatenatedUrl: data.concatenatedUrl,
        duration: data.stats?.totalDuration,
        videosUsed: data.stats?.totalVideos
      });

      if (onProgress) onProgress(100);

      return {
        success: true,
        concatenatedUrl: data.concatenatedUrl || data.url,
        publicId: data.concatenatedVideo?.publicId,
        duration: data.stats?.totalDuration
      };

    } catch (error: any) {
      console.error('❌ PHASE 2: Concatenation error:', error);
      return {
        success: false,
        error: error.message || 'PHASE 2: Failed to concatenate videos'
      };
    }
  }

  /**
   * PHASE 1 + PHASE 2: Complete workflow - trim then concatenate
   */
  async processAndConcatenateVideos(
    videoFiles: Array<{
      id: string;
      name: string;
      duration: number;
      file_url: string;
    }>,
    targetDuration: number,
    outputSettings?: ConcatenationOptions,
    onProgress?: (phase: string, progress: number) => void
  ): Promise<{
    success: boolean;
    concatenatedUrl?: string;
    publicId?: string;
    totalDuration?: number;
    trimmedVideos?: TrimmedVideo[];
    phase1Result?: any;
    phase2Result?: ConcatenationResult;
    error?: string;
  }> {
    console.log('🚀 COMPLETE WORKFLOW: Starting Phase 1 + Phase 2 processing...');

    try {
      // ============= PHASE 1: TRIM VIDEOS =============
      console.log('🎬 Starting PHASE 1: Video trimming...');
      if (onProgress) onProgress('Phase 1: Trimming', 0);
      
      // Step 1: Validate and detect exact durations
      const validSequences = this.validateSequences(videoFiles);
      if (onProgress) onProgress('Phase 1: Detecting durations', 10);

      const videosWithExactDurations = await this.detectAllExactDurations(validSequences, (progress) => {
        if (onProgress) onProgress('Phase 1: Detecting durations', 10 + (progress - 10) * 0.3);
      });

      // Step 2: Call Phase 1 trimming
      if (onProgress) onProgress('Phase 1: Trimming videos', 40);

      const phase1RequestBody = {
        action: 'trim',
        videos: videosWithExactDurations.map(video => ({
          publicId: video.publicId,
          duration: video.duration,
          source: video.detectionSource
        })),
        targetDuration: targetDuration,
        exactDurations: true
      };

      const { data: phase1Data, error: phase1Error } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: phase1RequestBody
      });

      if (phase1Error || !phase1Data?.success) {
        throw new Error(`Phase 1 failed: ${phase1Error?.message || phase1Data?.error || 'Unknown error'}`);
      }

      console.log('✅ PHASE 1 COMPLETE:', {
        videosCreated: phase1Data.createdAssets?.length,
        totalDuration: phase1Data.stats?.actualTotalDuration
      });

      if (onProgress) onProgress('Phase 1: Complete', 100);

      // ============= PHASE 2: CONCATENATE VIDEOS =============
      console.log('🎬 Starting PHASE 2: Video concatenation...');
      if (onProgress) onProgress('Phase 2: Concatenating', 0);

      // Prepare trimmed videos for Phase 2
      const trimmedVideos: TrimmedVideo[] = phase1Data.createdAssets.map((asset: any) => ({
        publicId: asset.publicId,
        duration: asset.duration,
        originalDuration: asset.originalDuration,
        order: asset.order,
        url: asset.url
      }));

      // Call Phase 2 concatenation
      const phase2Result = await this.concatenateVideos(
        trimmedVideos,
        outputSettings,
        (progress) => {
          if (onProgress) onProgress('Phase 2: Concatenating', progress);
        }
      );

      if (!phase2Result.success) {
        throw new Error(phase2Result.error || 'Phase 2 concatenation failed');
      }

      console.log('✅ PHASE 2 COMPLETE:', {
        concatenatedUrl: phase2Result.concatenatedUrl,
        finalDuration: phase2Result.duration
      });

      // ============= WORKFLOW COMPLETE =============
      console.log('🎉 COMPLETE WORKFLOW SUCCESS!');

      return {
        success: true,
        concatenatedUrl: phase2Result.concatenatedUrl,
        publicId: phase2Result.publicId,
        totalDuration: phase2Result.duration,
        trimmedVideos: trimmedVideos,
        phase1Result: phase1Data,
        phase2Result: phase2Result
      };

    } catch (error: any) {
      console.error('❌ COMPLETE WORKFLOW ERROR:', error);
      return {
        success: false,
        error: error.message || 'Complete workflow failed'
      };
    }
  }

  // ===============================================
  // HELPER METHODS (KEEP ALL EXISTING - UNCHANGED)
  // ===============================================

  /**
   * Detect exact durations for all videos (PHASE 1 method - unchanged)
   */
  private async detectAllExactDurations(
    sequences: VideoProcessingOptions['sequences'], 
    onProgress?: (progress: number) => void
  ): Promise<VideoWithExactDuration[]> {
    console.log('🎯 PHASE 1: Starting exact duration detection for all videos...');
    
    const videosWithExactDurations: VideoWithExactDuration[] = [];
    const errors: string[] = [];

    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      
      try {
        console.log(`📊 PHASE 1: Detecting duration ${i + 1}/${sequences.length}: ${seq.name}`);
        
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
        console.log(`✅ PHASE 1: ${seq.name}:`, {
          originalDuration: seq.duration.toFixed(3),
          exactDuration: exactDuration.toFixed(6),
          difference: durationDiff.toFixed(6)
        });

      } catch (error: any) {
        console.error(`❌ PHASE 1: Duration detection failed for ${seq.name}:`, error);
        
        // Fallback to original duration
        console.warn(`⚠️ PHASE 1: Using fallback duration for ${seq.name}`);
        
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
        } catch (fallbackError: any) {
          console.error(`❌ PHASE 1: Complete failure for ${seq.name}:`, fallbackError);
          throw new Error(`Failed to process video "${seq.name}": ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
        }
      }
    }

    // Summary of detection results
    const exactCount = videosWithExactDurations.filter(v => v.detectionSource === 'exact').length;
    const fallbackCount = videosWithExactDurations.filter(v => v.detectionSource === 'fallback').length;

    console.log('📊 PHASE 1: Duration Detection Summary:', {
      total: videosWithExactDurations.length,
      exactDetections: exactCount,
      fallbackUsed: fallbackCount,
      successRate: `${((exactCount / videosWithExactDurations.length) * 100).toFixed(1)}%`
    });

    if (videosWithExactDurations.length === 0) {
      throw new Error('PHASE 1: Failed to process any videos. Check video URLs and network connection.');
    }

    return videosWithExactDurations;
  }

  /**
   * Detect exact duration for a single video using HTML5 video element (unchanged)
   */
  private async detectExactDuration(fileUrl: string): Promise<number> {
    return new Promise((resolve, reject) => {
      console.log(`🔍 PHASE 1: Detecting exact duration for: ${fileUrl}`);
      
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
          console.log(`✅ PHASE 1: Exact duration detected: ${duration.toFixed(6)}s`);
          cleanup();
          resolve(duration);
        } else {
          cleanup();
          reject(new Error('Invalid duration detected (0 or undefined)'));
        }
      };
      
      const onError = (error: Event) => {
        console.error(`❌ PHASE 1: Error loading video for duration detection:`, error);
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

  // Keep all your existing helper methods unchanged
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
    } catch (error: any) {
      throw new Error(`Video download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ===============================================
  // CONVENIENCE METHODS FOR TESTING
  // ===============================================

  /**
   * Test Phase 1 only with your current test videos
   */
  async testPhase1() {
    const testOptions: VideoProcessingOptions = {
      sequences: [
        {
          id: '1',
          name: 'Test Video 1',
          duration: 3.013,
          file_url: 'https://res.cloudinary.com/dsxrmo3kt/video/upload/video_library/sigsig8mltjbmucxg7h3.mp4'
        },
        {
          id: '2',
          name: 'Test Video 2',
          duration: 0.700,
          file_url: 'https://res.cloudinary.com/dsxrmo3kt/video/upload/video_library/gquadddvckk1eqnyk2bz.mp4'
        },
        {
          id: '3',
          name: 'Test Video 3',
          duration: 15.017,
          file_url: 'https://res.cloudinary.com/dsxrmo3kt/video/upload/video_library/ki4y9fuhwu9z3b1tzi9n.mp4'
        }
      ],
      customization: {},
      platform: 'web',
      duration: 10.0
    };

    console.log('🧪 Testing Phase 1 only...');
    return await this.processVideo(testOptions, (progress) => {
      console.log(`Phase 1 Test Progress: ${progress}%`);
    });
  }

  /**
   * Test complete workflow with your current test videos
   */
  async testCompleteWorkflow() {
    const testVideos = [
      {
        id: '1',
        name: 'Test Video 1',
        duration: 3.013,
        file_url: 'https://res.cloudinary.com/dsxrmo3kt/video/upload/video_library/sigsig8mltjbmucxg7h3.mp4'
      },
      {
        id: '2',
        name: 'Test Video 2',
        duration: 0.700,
        file_url: 'https://res.cloudinary.com/dsxrmo3kt/video/upload/video_library/gquadddvckk1eqnyk2bz.mp4'
      },
      {
        id: '3',
        name: 'Test Video 3',
        duration: 15.017,
        file_url: 'https://res.cloudinary.com/dsxrmo3kt/video/upload/video_library/ki4y9fuhwu9z3b1tzi9n.mp4'
      }
    ];

    console.log('🧪 Testing Complete Workflow (Phase 1 + Phase 2)...');
    return await this.processAndConcatenateVideos(
      testVideos,
      10.0,
      {
        width: 1280,
        height: 720,
        quality: 'auto:best',
        format: 'mp4'
      },
      (phase, progress) => {
        console.log(`${phase}: ${progress}%`);
      }
    );
  }
}