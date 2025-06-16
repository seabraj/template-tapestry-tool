
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

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

  constructor() {
    this.ffmpeg = new FFmpeg();
  }

  private checkBrowserCompatibility(): void {
    // Check for SharedArrayBuffer support
    if (typeof SharedArrayBuffer === 'undefined') {
      throw new Error('SharedArrayBuffer is not available. Please use a modern browser with proper security headers.');
    }

    // Check for Cross-Origin Isolation
    if (!crossOriginIsolated) {
      console.warn('Cross-Origin Isolation is not enabled. FFmpeg may not work properly.');
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

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    if (this.isLoaded) return;

    try {
      console.log('Checking browser compatibility...');
      this.checkBrowserCompatibility();
      
      console.log('Starting FFmpeg initialization...');
      onProgress?.(1);

      // Set up progress monitoring
      if (onProgress) {
        this.ffmpeg.on('progress', ({ progress }) => {
          // Map FFmpeg internal progress to our 0-100 scale during initialization
          const mappedProgress = Math.round(1 + (progress * 9)); // 1-10% for initialization
          onProgress(mappedProgress);
        });
      }

      // Try multiple CDN sources with fallback
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

          // Load core files with timeout
          console.log('Loading FFmpeg core files...');
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
          
          // Initialize FFmpeg with timeout
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
          return; // Success, exit the retry loop
          
        } catch (error) {
          lastError = error as Error;
          console.warn(`Failed to load from CDN ${i + 1}: ${error.message}`);
          
          if (i < cdnSources.length - 1) {
            console.log('Trying next CDN source...');
            continue;
          }
        }
      }

      // If we get here, all CDN sources failed
      throw lastError || new Error('Failed to load FFmpeg from all CDN sources');
      
    } catch (error) {
      this.isLoaded = false;
      console.error('FFmpeg initialization failed:', error);
      
      let errorMessage = 'FFmpeg initialization failed';
      if (error.message.includes('SharedArrayBuffer')) {
        errorMessage += ': Browser does not support required features. Please use Chrome, Firefox, or Safari with proper security headers.';
      } else if (error.message.includes('Timeout')) {
        errorMessage += ': Loading took too long. Please check your internet connection and try again.';
      } else if (error.message.includes('CDN')) {
        errorMessage += ': Unable to download required files. Please check your internet connection.';
      } else {
        errorMessage += `: ${error.message}`;
      }
      
      throw new Error(errorMessage);
    }
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('Starting video processing...');
      await this.initialize(onProgress);

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
      console.error('Video processing failed:', error);
      throw new Error(`Video processing failed: ${error.message}`);
    }
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
}
