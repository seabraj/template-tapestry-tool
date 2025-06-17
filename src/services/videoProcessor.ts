
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
    console.log('🎬 Initializing VideoProcessor for edge function processing...');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    console.log('🚀 Starting processVideo with options:', {
      sequenceCount: options.sequences.length,
      platform: options.platform,
      targetDuration: options.duration,
      sequences: options.sequences.map(s => ({ id: s.id, name: s.name, duration: s.duration, hasUrl: !!s.file_url }))
    });

    try {
      // Validate input
      if (!options.sequences || options.sequences.length === 0) {
        throw new Error('No video sequences provided');
      }

      if (!options.duration || options.duration <= 0) {
        throw new Error('Invalid target duration provided');
      }

      return await this.processVideoWithEdgeFunction(options, onProgress);
    } catch (error) {
      console.error('❌ processVideo failed:', error);
      throw error;
    }
  }

  private async processVideoWithEdgeFunction(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🔧 Starting Edge Function video processing...');
      onProgress?.(10);

      // Validate and filter sequences
      const validSequences = this.validateSequences(options.sequences);
      if (validSequences.length === 0) {
        throw new Error('No valid video sequences found after validation');
      }

      console.log(`✅ Validated ${validSequences.length} sequence(s)`);
      onProgress?.(25);

      // Calculate total duration for progress tracking
      const totalDuration = validSequences.reduce((sum, seq) => sum + seq.duration, 0);
      const needsTrimming = options.duration < totalDuration;

      console.log(`📊 Total duration: ${totalDuration}s, Target: ${options.duration}s, Needs trimming: ${needsTrimming}`);
      onProgress?.(40);

      // Prepare sequences with order information
      const sequencesWithOrder = validSequences.map((seq, index) => ({
        id: seq.id,
        name: seq.name,
        duration: seq.duration,
        file_url: seq.file_url,
        originalOrder: index
      }));

      // Call the edge function
      console.log('📡 Calling process-video edge function...');
      onProgress?.(50);

      const { data, error } = await supabase.functions.invoke('process-video', {
        body: {
          sequences: sequencesWithOrder,
          customization: options.customization,
          platform: options.platform,
          duration: options.duration
        }
      });

      if (error) {
        console.error('❌ Edge function error:', error);
        throw new Error(`Edge function failed: ${error.message}`);
      }

      if (!data?.success) {
        console.error('❌ Edge function returned unsuccessful result:', data);
        throw new Error(data?.error || 'Video processing failed');
      }

      console.log('✅ Edge function completed successfully:', {
        useStorage: data.useStorage,
        filename: data.filename,
        message: data.message
      });
      onProgress?.(75);

      // Download the processed video
      let videoBlob: Blob;
      
      if (data.useStorage && data.downloadUrl) {
        console.log('📥 Downloading video from Supabase Storage:', data.downloadUrl);
        videoBlob = await this.downloadFromStorage(data.downloadUrl);
      } else {
        throw new Error('No valid download method available from edge function response');
      }

      onProgress?.(100);
      console.log('✅ Video processing completed successfully');
      
      return videoBlob;

    } catch (error) {
      console.error('❌ Edge function processing failed:', error);
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

      // Test if it's a Cloudinary URL
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

  private async downloadFromStorage(url: string): Promise<Blob> {
    try {
      console.log('📥 Starting download from storage:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`❌ Storage download failed with status ${response.status}:`, errorText);
        throw new Error(`Failed to download video: HTTP ${response.status} - ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      console.log('📄 Response content type:', contentType);

      if (!contentType || !contentType.includes('video')) {
        console.warn('⚠️ Unexpected content type:', contentType);
      }

      const videoBlob = await response.blob();
      console.log('✅ Video downloaded successfully from storage, size:', videoBlob.size, 'bytes');
      
      return videoBlob;
      
    } catch (error) {
      console.error('❌ Storage download failed:', error);
      throw new Error(`Storage download failed: ${error.message}`);
    }
  }

  getProcessingMode(): 'edge_function' {
    return 'edge_function';
  }
}
