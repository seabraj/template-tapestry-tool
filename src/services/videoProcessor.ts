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
    console.log('🎬 Initializing VideoProcessor for Cloudinary processing...');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    console.log('🚀 Starting processVideo with options:', {
      sequenceCount: options.sequences.length,
      platform: options.platform,
      targetDuration: options.duration,
    });

    try {
      if (!options.sequences || options.sequences.length === 0) {
        throw new Error('No video sequences provided');
      }
      if (!options.duration || options.duration <= 0) {
        throw new Error('Invalid target duration provided');
      }
      // This now calls the new async-aware method
      return await this.processVideoWithCloudinary(options, onProgress);
    } catch (error) {
      console.error('❌ processVideo failed:', error);
      throw error;
    }
  }

  // --- THIS METHOD IS REWRITTEN FOR THE ASYNC FLOW ---
  private async processVideoWithCloudinary(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🔧 Starting Cloudinary video processing...');
      onProgress?.(10);

      const validSequences = this.validateSequences(options.sequences);
      if (validSequences.length === 0) {
        throw new Error('No valid video sequences found after validation');
      }

      // --- STAGE 1: START THE JOB ---
      console.log('📡 [Stage 1] Calling edge function to START the job...');
      const startRequestBody = {
        action: 'start_job', // New action parameter
        videos: validSequences.map(seq => ({
          publicId: this.extractPublicIdFromUrl(seq.file_url),
          duration: seq.duration
        })),
        targetDuration: options.duration
      };

      const { data: startData, error: startError } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: startRequestBody
      });

      if (startError) throw new Error(`[Stage 1] Failed to start job: ${startError.message}`);
      const { jobId } = startData;
      if (!jobId) throw new Error('[Stage 1] Did not receive a job ID from the server.');
      
      console.log(`✅ [Stage 1] Job started successfully with ID: ${jobId}`);
      onProgress?.(25);

      // --- STAGE 2: POLL FOR COMPLETION ---
      console.log('⏳ [Stage 2] Polling for job completion...');
      await this._pollForJobCompletion(jobId, onProgress);
      console.log('✅ [Stage 2] Polling complete. Trimming finished.');
      onProgress?.(75);

      // --- STAGE 3: FINALIZE THE VIDEO ---
      console.log('🔗 [Stage 3] Calling edge function to FINALIZE the video...');
      const { data: finalData, error: finalError } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: {
          action: 'concatenate', // New action parameter
          jobId: jobId
        }
      });

      if (finalError) throw new Error(`[Stage 3] Concatenation failed: ${finalError.message}`);
      if (!finalData?.success || !finalData?.url) {
        throw new Error(finalData?.error || '[Stage 3] Finalizing video failed.');
      }
      
      const finalUrl = finalData.url;
      console.log(`✅ [Stage 3] Final URL received: ${finalUrl}`);
      onProgress?.(90);

      // --- STAGE 4: DOWNLOAD THE FINAL VIDEO ---
      console.log('📥 [Stage 4] Downloading processed video...');
      const videoBlob = await this.downloadFromUrl(finalUrl);
      onProgress?.(100);
      console.log('✅ Video processing completed successfully');
      
      return videoBlob;

    } catch (error) {
      console.error('❌ Cloudinary processing failed:', error);
      throw new Error(`Video processing failed: ${error.message}`);
    }
  }

  // --- NEW HELPER METHOD FOR POLLING ---
  private _pollForJobCompletion(jobId: string, onProgress?: (progress: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      let currentProgress = 25;
      const intervalId = setInterval(async () => {
        try {
          const { data, error } = await supabase.functions.invoke('check-job-status', {
            body: { jobId }
          });

          if (error) {
            clearInterval(intervalId);
            return reject(new Error(`Polling failed: ${error.message}`));
          }
          
          console.log(`Polling... current status: ${data.status}`);
          
          if (data.status === 'ready_to_concatenate') {
            clearInterval(intervalId);
            return resolve();
          }

          // Optional: Increment progress slightly during polling to show activity
          if (currentProgress < 75) {
            currentProgress += 5;
            onProgress?.(currentProgress);
          }

        } catch (e) {
          clearInterval(intervalId);
          return reject(e);
        }
      }, 5000); // Poll every 5 seconds
    });
  }

  // --- UNCHANGED HELPER METHODS ---
  private validateSequences(sequences: any[]) {
    // This method remains the same as your original.
    console.log('🔍 Validating sequences...');
    const validSequences = sequences.filter((seq, index) => {
      console.log(`Validating sequence ${index + 1}:`, { id: seq.id, name: seq.name, duration: seq.duration, file_url: seq.file_url ? 'present' : 'missing' });
      if (!seq.file_url || !seq.file_url.startsWith('http') || !seq.duration || seq.duration <= 0 || !seq.file_url.includes('cloudinary.com')) {
        console.warn(`❌ Sequence ${seq.id} is invalid`);
        return false;
      }
      console.log(`✅ Sequence ${seq.id} is valid`);
      return true;
    });
    console.log(`✅ Validation complete: ${validSequences.length}/${sequences.length} sequences are valid`);
    return validSequences;
  }

  private extractPublicIdFromUrl(cloudinaryUrl: string): string {
    // This method remains the same as your original.
    try {
      const urlParts = cloudinaryUrl.split('/');
      const uploadIndex = urlParts.findIndex(part => part === 'upload');
      if (uploadIndex === -1) throw new Error('Invalid Cloudinary URL format');
      const pathAfterUpload = urlParts.slice(uploadIndex + 1).join('/');
      const pathWithoutVersion = pathAfterUpload.replace(/^v\d+\//, '');
      const publicId = pathWithoutVersion.replace(/\.[^/.]+$/, '');
      console.log(`📋 Extracted public ID: ${publicId} from URL: ${cloudinaryUrl}`);
      return publicId;
    } catch (error) {
      console.error('❌ Failed to extract public ID from URL:', cloudinaryUrl, error);
      throw new Error(`Invalid Cloudinary URL: ${cloudinaryUrl}`);
    }
  }

  private async downloadFromUrl(url: string): Promise<Blob> {
    // This method remains the same as your original.
    try {
      console.log('📥 Starting download from URL:', url);
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`❌ Video download failed with status ${response.status}:`, errorText);
        throw new Error(`Failed to download video: HTTP ${response.status} - ${response.statusText}`);
      }
      const videoBlob = await response.blob();
      console.log('✅ Video downloaded successfully, size:', videoBlob.size, 'bytes');
      return videoBlob;
    } catch (error) {
      console.error('❌ Video download failed:', error);
      throw new Error(`Video download failed: ${error.message}`);
    }
  }

  getProcessingMode(): 'cloudinary' {
    return 'cloudinary';
  }
}