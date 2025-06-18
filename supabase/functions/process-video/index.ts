// FINAL code for: src/services/videoProcessor.ts

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

export class VideoProcessor {
  constructor() {
    console.log('🎬 Initializing VideoProcessor...');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    console.log('🚀 Starting video processing with new single-call method:', options);
    onProgress?.(10);

    try {
      const validSequences = this.validateSequences(options.sequences);
      onProgress?.(25);

      const requestBody = {
        videos: validSequences.map(seq => ({
          publicId: this.extractPublicIdFromUrl(seq.file_url),
          duration: seq.duration
        })),
        targetDuration: options.duration
      };

      console.log('📡 Calling edge function with payload:', requestBody);
      onProgress?.(50);
      
      const { data, error } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: requestBody
      });

      if (error) throw new Error(`Edge function failed: ${error.message}`);
      if (!data?.success || !data?.url) throw new Error(data?.error || 'Backend failed to return a valid URL.');
      
      const finalUrl = data.url;
      console.log(`✅ Success! Final URL received: ${finalUrl}`);
      onProgress?.(75);

      console.log('📥 Downloading final video...');
      const videoBlob = await this.downloadFromUrl(finalUrl);
      onProgress?.(100);
      
      console.log('🎉 Video processing complete!');
      return videoBlob;

    } catch (error) {
      console.error('❌ Video processing failed:', error);
      throw error;
    }
  }

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
    } catch (error) {
      throw new Error(`Video download failed: ${error.message}`);
    }
  }
}