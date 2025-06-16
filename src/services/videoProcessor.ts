
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
    console.log('🎬 VideoProcessor initialized for server-side processing');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    return this.processVideoServerSide(options, onProgress);
  }

  private async processVideoServerSide(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🚀 Starting server-side video processing...', {
        sequences: options.sequences.length,
        platform: options.platform,
        duration: options.duration
      });
      onProgress?.(10);

      // Validate sequences before sending and preserve order
      const validSequences = options.sequences.filter((seq, index) => {
        if (!seq.file_url || !seq.file_url.startsWith('http')) {
          console.warn(`❌ Invalid sequence URL: ${seq.id} - ${seq.file_url}`);
          return false;
        }
        // Preserve original order
        (seq as any).originalOrder = index;
        return true;
      });

      if (validSequences.length === 0) {
        throw new Error('No valid video sequences found');
      }

      console.log(`✅ Processing ${validSequences.length} sequence(s):`, 
        validSequences.map((seq, idx) => `${(seq as any).originalOrder + 1}. ${seq.name}`).join(', '));
      onProgress?.(25);

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('process-video', {
        body: {
          sequences: validSequences,
          customization: options.customization,
          platform: options.platform,
          duration: options.duration
        }
      });

      if (error) {
        console.error('❌ Supabase function invocation error:', error);
        throw new Error(`Video processing failed: ${error.message}`);
      }

      onProgress?.(75);

      if (!data || !data.success) {
        const errorMsg = data?.error || 'Unknown processing error';
        console.error('❌ Video processing failed:', errorMsg);
        throw new Error(`Video processing failed: ${errorMsg}`);
      }

      onProgress?.(90);

      // Handle storage-based response
      if (data.useStorage && data.downloadUrl) {
        console.log('📥 Downloading processed video from storage:', {
          downloadUrl: data.downloadUrl,
          filename: data.filename,
          metadata: data.metadata
        });

        try {
          const videoResponse = await fetch(data.downloadUrl);
          if (!videoResponse.ok) {
            throw new Error(`Failed to download processed video: HTTP ${videoResponse.status} ${videoResponse.statusText}`);
          }

          const videoBlob = await videoResponse.blob();
          onProgress?.(100);
          console.log('✅ Successfully downloaded processed video:', {
            size: videoBlob.size,
            type: videoBlob.type
          });
          
          return videoBlob;
          
        } catch (downloadError) {
          console.error('❌ Failed to download processed video:', downloadError);
          throw new Error(`Failed to download processed video: ${downloadError.message}`);
        }
      }

      // Fallback to base64 handling
      if (data.videoData) {
        console.log('🔄 Handling base64 video fallback...');
        
        try {
          const cleanBase64 = data.videoData.replace(/\s/g, '');
          const binaryString = atob(cleanBase64);
          const bytes = new Uint8Array(binaryString.length);
          
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          onProgress?.(100);
          const blob = new Blob([bytes], { type: 'video/mp4' });
          console.log('✅ Base64 video processed:', blob.size);
          return blob;
          
        } catch (conversionError) {
          console.error('❌ Error converting base64 video:', conversionError);
          throw new Error(`Failed to process video data: ${conversionError.message}`);
        }
      }

      throw new Error('No valid video data received from server');

    } catch (error) {
      console.error('❌ Server-side video processing failed:', error);
      throw new Error(`Video processing failed: ${error.message}`);
    }
  }

  getProcessingMode(): 'server' {
    return 'server';
  }
}
