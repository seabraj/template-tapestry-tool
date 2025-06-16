
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

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    if (this.isLoaded) return;

    if (onProgress) {
      this.ffmpeg.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    // Load FFmpeg with CDN URLs
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    this.isLoaded = true;
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    await this.initialize(onProgress);

    try {
      // Download all video files
      onProgress?.(10);
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
        onProgress?.(10 + (i + 1) * 20 / options.sequences.length);
      }

      onProgress?.(30);

      // Create concat list file
      const concatList = videoFiles
        .map(file => `file '${file.name}'`)
        .join('\n');
      
      await this.ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(concatList));

      onProgress?.(40);

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
      onProgress?.(50);

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
