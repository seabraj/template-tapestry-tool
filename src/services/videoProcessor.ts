import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
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
  private ffmpeg: FFmpeg;
  private isLoaded = false;
  private processingMode: 'client' | 'server' = 'server';

  constructor() {
    this.ffmpeg = new FFmpeg();
    this.detectProcessingCapability();
  }

  private detectProcessingCapability(): void {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    const isCrossOriginIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
    const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;

    console.log('Browser capability check:', {
      hasSharedArrayBuffer,
      isCrossOriginIsolated,
      isSecureContext
    });

    if (hasSharedArrayBuffer && isCrossOriginIsolated && isSecureContext) {
      this.processingMode = 'client';
      console.log('Client-side processing available');
    } else {
      this.processingMode = 'server';
      console.log('Using server-side processing fallback');
    }
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    // FORCE client-side processing for multiple videos to ensure proper concatenation
    if (options.sequences.length > 1) {
      console.log('🎬 Multiple videos detected - forcing client-side concatenation for proper ordering');
      return this.processVideoClientSide(options, onProgress);
    }
    
    // Use server-side for single videos (no concatenation needed)
    if (this.processingMode === 'server') {
      return this.processVideoServerSide(options, onProgress);
    } else {
      return this.processVideoClientSide(options, onProgress);
    }
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
        validSequences.map((seq, idx) => `${idx + 1}. ${seq.name}`).join(', '));
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

  private async processVideoClientSide(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🎬 Starting client-side video concatenation for proper ordering...');
      await this.initializeFFmpeg(onProgress);

      // Download all video files in exact order
      onProgress?.(15);
      const videoFiles: { name: string; data: Uint8Array; order: number }[] = [];
      
      for (let i = 0; i < options.sequences.length; i++) {
        const sequence = options.sequences[i];
        console.log(`📥 Downloading video ${i + 1}/${options.sequences.length}: ${sequence.name} (position: ${i + 1})`);
        
        const response = await fetch(sequence.file_url);
        if (!response.ok) throw new Error(`Failed to download ${sequence.name}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const fileName = `input_${i.toString().padStart(3, '0')}.mp4`; // Zero-padded for proper ordering
        
        videoFiles.push({
          name: fileName,
          data: new Uint8Array(arrayBuffer),
          order: i
        });

        await this.ffmpeg.writeFile(fileName, new Uint8Array(arrayBuffer));
        onProgress?.(15 + (i + 1) * 25 / options.sequences.length);
      }

      onProgress?.(40);

      // Create concat list file with exact ordering
      const sortedFiles = videoFiles.sort((a, b) => a.order - b.order);
      const concatList = sortedFiles
        .map(file => `file '${file.name}'`)
        .join('\n');
      
      await this.ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(concatList));
      console.log('📋 FFmpeg concatenation order:', sortedFiles.map(f => f.name).join(' -> '));

      onProgress?.(50);

      // Build FFmpeg command for proper video concatenation
      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat_list.txt',
        '-c', 'copy', // Copy streams without re-encoding for faster processing
        'output.mp4'
      ];

      console.log('⚡ Running FFmpeg concatenation with args:', ffmpegArgs);
      onProgress?.(60);

      // Execute FFmpeg command
      await this.ffmpeg.exec(ffmpegArgs);

      onProgress?.(90);

      // Read the concatenated output file
      const outputData = await this.ffmpeg.readFile('output.mp4');
      onProgress?.(100);

      // Clean up all input files
      for (const file of sortedFiles) {
        try {
          await this.ffmpeg.deleteFile(file.name);
        } catch (e) {
          console.warn(`Failed to delete ${file.name}:`, e);
        }
      }

      try {
        await this.ffmpeg.deleteFile('concat_list.txt');
        await this.ffmpeg.deleteFile('output.mp4');
      } catch (e) {
        console.warn('Failed to clean up temporary files:', e);
      }

      console.log('✅ Client-side video concatenation completed successfully');
      return new Blob([outputData], { type: 'video/mp4' });
    } catch (error) {
      console.error('❌ Client-side video concatenation failed:', error);
      throw new Error(`Client-side concatenation failed: ${error.message}`);
    }
  }

  private async initializeFFmpeg(onProgress?: (progress: number) => void): Promise<void> {
    if (this.isLoaded) return;

    try {
      console.log('Starting FFmpeg initialization...');
      onProgress?.(1);

      if (onProgress) {
        this.ffmpeg.on('progress', ({ progress }) => {
          const mappedProgress = Math.round(1 + (progress * 9));
          onProgress(mappedProgress);
        });
      }

      const cdnSources = [
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
        'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd',
        'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd'
      ];

      let lastError: Error | null = null;

      for (let i = 0; i < cdnSources.length; i++) {
        const baseURL = cdnSources[i];
        
        try {
          console.log(`Attempting to load FFmpeg from CDN ${i + 1}/${cdnSources.length}: ${baseURL}`);
          onProgress?.(2 + i);

          const coreURL = await this.loadWithTimeout(
            toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            30000,
            'Timeout loading FFmpeg core JavaScript'
          );
          
          const wasmURL = await this.loadWithTimeout(
            toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            60000,
            'Timeout loading FFmpeg WASM binary'
          );
          
          console.log('Core files loaded successfully, initializing FFmpeg...');
          onProgress?.(5);
          
          await this.loadWithTimeout(
            this.ffmpeg.load({
              coreURL,
              wasmURL,
            }),
            90000,
            'Timeout during FFmpeg initialization'
          );
          
          this.isLoaded = true;
          console.log('FFmpeg loaded successfully');
          onProgress?.(10);
          return;
          
        } catch (error) {
          lastError = error as Error;
          console.warn(`Failed to load from CDN ${i + 1}: ${error.message}`);
          
          if (i < cdnSources.length - 1) {
            console.log('Trying next CDN source...');
            continue;
          }
        }
      }

      throw lastError || new Error('Failed to load FFmpeg from all CDN sources');
      
    } catch (error) {
      this.isLoaded = false;
      console.error('FFmpeg initialization failed:', error);
      throw new Error(`FFmpeg initialization failed: ${error.message}`);
    }
  }

  private async loadWithTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      )
    ]);
  }

  private getTextPosition(position: string): string {
    switch (position) {
      case 'top': return 'x=(w-text_w)/2:y=50';
      case 'center': return 'x=(w-text_w)/2:y=(h-text_h)/2';
      case 'bottom': return 'x=(w-text_w)/2:y=h-text_h-50';
      default: return 'x=(w-text_w)/2:y=(h-text_h)/2';
    }
  }

  private getTextStyle(style: string): string {
    const baseStyle = 'fontsize=32:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=5';
    
    switch (style) {
      case 'bold': return `${baseStyle}:fontfile=/System/Library/Fonts/Arial Bold.ttf`;
      case 'light': return `${baseStyle}:fontsize=28`;
      case 'outline': return `${baseStyle}:bordercolor=black:borderw=2`;
      default: return baseStyle;
    }
  }

  getProcessingMode(): 'client' | 'server' {
    // Force client mode for multiple videos to ensure proper concatenation
    if (this.processingMode === 'client') {
      return 'client';
    }
    return 'server';
  }
}
