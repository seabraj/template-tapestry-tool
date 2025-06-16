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
    if (this.processingMode === 'server') {
      return this.processVideoServerSide(options, onProgress);
    } else {
      return this.processVideoClientSide(options, onProgress);
    }
  }

  private async processVideoServerSide(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🚀 Starting enhanced server-side video processing...', {
        sequences: options.sequences.length,
        platform: options.platform,
        duration: options.duration
      });
      onProgress?.(10);

      // Validate sequences before sending
      const validSequences = options.sequences.filter(seq => {
        if (!seq.file_url || !seq.file_url.startsWith('http')) {
          console.warn(`❌ Invalid sequence URL: ${seq.id} - ${seq.file_url}`);
          return false;
        }
        return true;
      });

      if (validSequences.length === 0) {
        throw new Error('No valid video sequences found');
      }

      console.log(`✅ Validated ${validSequences.length} sequences for processing`);
      onProgress?.(25);

      // Call the enhanced edge function
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
        throw new Error(`Enhanced processing failed: ${error.message}`);
      }

      onProgress?.(75);

      if (!data || !data.success) {
        const errorMsg = data?.error || 'Unknown processing error';
        console.error('❌ Enhanced processing failed:', errorMsg);
        throw new Error(`Enhanced processing failed: ${errorMsg}`);
      }

      onProgress?.(90);

      // Handle storage-based response
      if (data.useStorage && data.downloadUrl) {
        console.log('📥 Processing storage-based response:', {
          downloadUrl: data.downloadUrl,
          filename: data.filename,
          metadata: data.metadata
        });

        const videoResponse = await fetch(data.downloadUrl);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download enhanced video: ${videoResponse.status}`);
        }

        const videoBlob = await videoResponse.blob();
        onProgress?.(100);
        console.log('✅ Enhanced storage-based processing completed, blob size:', videoBlob.size);
        return videoBlob;
      }

      // Handle base64 response
      if (!data.videoData) {
        throw new Error('No video data received from enhanced processing');
      }

      console.log('🔄 Converting enhanced base64 response to blob...', {
        base64Length: data.videoData.length,
        metadata: data.metadata
      });
      
      try {
        if (typeof data.videoData !== 'string') {
          throw new Error('Enhanced video data is not a string');
        }

        const cleanBase64 = data.videoData.replace(/\s/g, '');
        
        if (cleanBase64.length === 0) {
          throw new Error('Empty enhanced base64 data received');
        }

        console.log('✅ Enhanced base64 validation passed, converting to blob...');
        
        const binaryString = atob(cleanBase64);
        const bytes = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        onProgress?.(100);
        const blob = new Blob([bytes], { type: 'video/mp4' });
        console.log('✅ Enhanced video processing completed successfully, blob size:', blob.size);
        return blob;
        
      } catch (conversionError) {
        console.error('❌ Error converting enhanced base64 to blob:', conversionError);
        throw new Error(`Failed to process enhanced video data: ${conversionError.message}`);
      }

    } catch (error) {
      console.error('❌ Enhanced server-side video processing failed:', error);
      
      // Enhanced error messages
      if (error.message.includes('timeout')) {
        throw new Error('Enhanced video processing timed out. The new system should handle this better.');
      } else if (error.message.includes('too large')) {
        throw new Error('Video files too large for enhanced processing. Try smaller files.');
      } else if (error.message.includes('Invalid')) {
        throw new Error('Invalid video files for enhanced processing. Check file formats.');
      }
      
      throw new Error(`Enhanced processing failed: ${error.message}`);
    }
  }

  private async processVideoClientSide(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('Starting client-side video processing...');
      await this.initializeFFmpeg(onProgress);

      // Download all video files
      onProgress?.(15);
      const videoFiles: { name: string; data: Uint8Array }[] = [];
      
      for (let i = 0; i < options.sequences.length; i++) {
        const sequence = options.sequences[i];
        console.log(`Downloading video ${i + 1}/${options.sequences.length}: ${sequence.name}`);
        
        const response = await fetch(sequence.file_url);
        if (!response.ok) throw new Error(`Failed to download ${sequence.name}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const fileName = `input_${i}.mp4`;
        
        videoFiles.push({
          name: fileName,
          data: new Uint8Array(arrayBuffer)
        });

        await this.ffmpeg.writeFile(fileName, new Uint8Array(arrayBuffer));
        onProgress?.(15 + (i + 1) * 25 / options.sequences.length);
      }

      onProgress?.(40);

      // Create concat list file
      const concatList = videoFiles
        .map(file => `file '${file.name}'`)
        .join('\n');
      
      await this.ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(concatList));

      onProgress?.(50);

      // Build FFmpeg command for concatenation
      let ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat_list.txt',
        '-c', 'copy'
      ];

      // Add text overlay if specified
      if (options.customization.supers.text) {
        const textPosition = this.getTextPosition(options.customization.supers.position);
        const textStyle = this.getTextStyle(options.customization.supers.style);
        
        ffmpegArgs = [
          '-f', 'concat',
          '-safe', '0',
          '-i', 'concat_list.txt',
          '-vf', `drawtext=text='${options.customization.supers.text}':${textPosition}:${textStyle}`,
          '-c:a', 'copy'
        ];
      }

      ffmpegArgs.push('output.mp4');

      console.log('Running FFmpeg with args:', ffmpegArgs);
      onProgress?.(60);

      // Execute FFmpeg command
      await this.ffmpeg.exec(ffmpegArgs);

      onProgress?.(90);

      // Read the output file
      const outputData = await this.ffmpeg.readFile('output.mp4');
      onProgress?.(100);

      // Clean up input files
      for (const file of videoFiles) {
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

      return new Blob([outputData], { type: 'video/mp4' });
    } catch (error) {
      console.error('Client-side video processing failed:', error);
      throw new Error(`Client-side processing failed: ${error.message}`);
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
    return this.processingMode;
  }
}
