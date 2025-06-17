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
      sequences: options.sequences.map(s => ({ 
        id: s.id, 
        name: s.name, 
        duration: s.duration, 
        hasUrl: !!s.file_url 
      }))
    });

    try {
      if (!options.sequences || options.sequences.length === 0) {
        throw new Error('No video sequences provided');
      }

      if (!options.duration || options.duration <= 0) {
        throw new Error('Invalid target duration provided');
      }

      return await this.processVideoWithCloudinary(options, onProgress);
    } catch (error) {
      console.error('❌ processVideo failed:', error);
      throw error;
    }
  }

  private async processVideoWithCloudinary(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🔧 Starting Cloudinary video processing...');
      onProgress?.(10);

      const validSequences = this.validateSequences(options.sequences);
      if (validSequences.length === 0) {
        throw new Error('No valid video sequences found after validation');
      }

      console.log(`✅ Validated ${validSequences.length} sequence(s)`);
      onProgress?.(25);
      onProgress?.(40);

      console.log('📡 Calling cloudinary-concatenate edge function...');
      onProgress?.(50);
      
      // --- DEBUGGING STEP IS HERE ---
      const requestBody = {
        videos: validSequences.map(seq => ({
          publicId: this.extractPublicIdFromUrl(seq.file_url),
          duration: seq.duration
        })),
        targetDuration: options.duration
      };

      // This new log will show us exactly what is being sent to the backend.
      console.log('--- PAYLOAD TO BACKEND ---', JSON.stringify(requestBody, null, 2));

      const { data, error } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: requestBody
      });
      // --- END OF DEBUGGING STEP ---

      if (error) {
        console.error('❌ Cloudinary concatenation error:', error);
        throw new Error(`Cloudinary concatenation failed: ${error.message}`);
      }

      if (!data?.success) {
        console.error('❌ Cloudinary concatenation returned unsuccessful result:', data);
        throw new Error(data?.error || 'Video concatenation failed');
      }

      console.log('✅ Cloudinary concatenation completed successfully:', {
        url: data.url,
        message: data.message,
      });
      onProgress?.(75);

      console.log('📥 Downloading processed video from:', data.url);
      const videoBlob = await this.downloadFromUrl(data.url);

      onProgress?.(100);
      console.log('✅ Video processing completed successfully');
      
      return videoBlob;

    } catch (error) {
      console.error('❌ Cloudinary processing failed:', error);
      throw new Error(`Video processing failed: ${error.message}`);
    }
  }

  private validateSequences(sequences: any[]) {
    console.log('🔍 Validating sequences...');
    
    const validSequences = sequences.filter((seq, index) => {
      console.log(`Validating sequence ${index + 1}:`, {
        id: seq.id,
        name: seq.name,
        duration: seq.duration,
        file_url: seq.file_url ? 'present' : 'missing'
      });

      if (!seq.file_url) {
        console.warn(`❌ Sequence ${seq.id} has no file_url`);
        return false;
      }

      if (!seq.file_url.startsWith('http')) {
        console.warn(`❌ Sequence ${seq.id} has invalid URL: ${seq.file_url}`);
        return false;
      }

      if (!seq.duration || seq.duration <= 0) {
        console.warn(`❌ Sequence ${seq.id} has invalid duration: ${seq.duration}`);
        return false;
      }

      if (!seq.file_url.includes('cloudinary.com')) {
        console.warn(`❌ Sequence ${seq.id} is not a Cloudinary URL: ${seq.file_url}`);
        return false;
      }

      console.log(`✅ Sequence ${seq.id} is valid`);
      return true;
    });

    console.log(`✅ Validation complete: ${validSequences.length}/${sequences.length} sequences are valid`);
    return validSequences;
  }

  private extractPublicIdFromUrl(cloudinaryUrl: string): string {
    try {
      const urlParts = cloudinaryUrl.split('/');
      const uploadIndex = urlParts.findIndex(part => part === 'upload');
      
      if (uploadIndex === -1) {
        throw new Error('Invalid Cloudinary URL format');
      }

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
    try {
      console.log('📥 Starting download from URL:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`❌ Video download failed with status ${response.status}:`, errorText);
        throw new Error(`Failed to download video: HTTP ${response.status} - ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      console.log('📄 Response content type:', contentType);

      if (!contentType || !contentType.includes('video')) {
        console.warn('⚠️ Unexpected content type:', contentType);
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