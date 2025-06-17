

import { supabase } from '@/integrations/supabase/client';
import { Cloudinary } from '@cloudinary/url-gen';
import { trim } from '@cloudinary/url-gen/actions/videoEdit';
import { auto } from '@cloudinary/url-gen/qualifiers/quality';
import { format } from '@cloudinary/url-gen/actions/delivery';

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

interface TrimData {
  originalDuration: number;
  trimmedDuration: number;
}

export class VideoProcessor {
  private cloudinary: Cloudinary;

  constructor() {
    this.cloudinary = new Cloudinary({
      cloud: {
        cloudName: 'dsxrmo3kt'
      }
    });
    console.log('🎬 VideoProcessor initialized');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    // Use Edge Function for reliable processing
    return this.processVideoWithEdgeFunction(options, onProgress);
  }

  private async processVideoWithEdgeFunction(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🚀 Starting Edge Function video processing...', {
        sequences: options.sequences.length,
        platform: options.platform,
        targetDuration: options.duration
      });
      onProgress?.(10);

      // Validate sequences
      const validSequences = options.sequences.filter((seq, index) => {
        if (!seq.file_url || !seq.file_url.startsWith('http')) {
          console.warn(`❌ Invalid sequence URL: ${seq.id} - ${seq.file_url}`);
          return false;
        }
        return true;
      });

      if (validSequences.length === 0) {
        throw new Error('No valid video sequences found');
      }

      // Add original order to preserve sequence
      const sequencesWithOrder = validSequences.map((seq, index) => ({
        ...seq,
        originalOrder: index
      }));

      console.log(`✅ Processing ${validSequences.length} sequence(s) in order:`, 
        sequencesWithOrder.map((s, i) => `${i + 1}. ${s.name}`));
      onProgress?.(25);

      // Call Edge Function
      const response = await fetch('/api/process-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sequences: sequencesWithOrder,
          customization: options.customization,
          platform: options.platform,
          duration: options.duration
        }),
      });

      onProgress?.(50);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('❌ Edge Function failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        throw new Error(`Video processing failed: ${response.status} - ${errorData?.error || response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Edge Function response:', result);
      onProgress?.(75);

      if (!result.success) {
        throw new Error(result.error || 'Video processing failed');
      }

      // Download the processed video
      console.log('📥 Downloading processed video from:', result.downloadUrl);
      const videoResponse = await fetch(result.downloadUrl);
      
      if (!videoResponse.ok) {
        throw new Error(`Failed to download processed video: HTTP ${videoResponse.status}`);
      }

      const videoBlob = await videoResponse.blob();
      onProgress?.(100);

      console.log('✅ Successfully downloaded processed video');
      console.log(`🎯 Target duration: ${options.duration}s`);
      console.log(`📹 Video count: ${validSequences.length} sequences`);
      console.log(`🎬 Final video size: ${(videoBlob.size / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`📋 Processing method: ${result.metadata?.processingMethod || 'edge_function'}`);

      return videoBlob;

    } catch (error) {
      console.error('❌ Edge Function video processing failed:', error);
      throw new Error(`Video processing failed: ${error.message}`);
    }
  }

  private extractCloudinaryPublicId(url: string): string {
    console.log('🔍 Extracting public ID from URL:', url);
    
    // Remove any query parameters first
    const cleanUrl = url.split('?')[0];
    
    // Pattern 1: Standard Cloudinary URL with version
    let match = cleanUrl.match(/\/upload\/v\d+\/(.+)\.(mp4|mov|avi|webm|mkv)$/i);
    if (match) {
      const publicId = match[1];
      console.log('✅ Extracted public ID (with version):', publicId);
      return publicId;
    }
    
    // Pattern 2: Cloudinary URL without version
    match = cleanUrl.match(/\/upload\/(.+)\.(mp4|mov|avi|webm|mkv)$/i);
    if (match) {
      const publicId = match[1];
      console.log('✅ Extracted public ID (no version):', publicId);
      return publicId;
    }
    
    // Pattern 3: Direct public ID format
    match = cleanUrl.match(/\/upload\/([^\/]+)\.(mp4|mov|avi|webm|mkv)$/i);
    if (match) {
      const publicId = match[1];
      console.log('✅ Extracted public ID (direct):', publicId);
      return publicId;
    }
    
    console.error('❌ Could not extract public ID from URL:', url);
    throw new Error(`Could not extract public ID from URL: ${url}`);
  }

  private calculateProportionalTrimming(videos: Array<{duration: number}>, targetDuration: number): TrimData[] {
    const totalDuration = videos.reduce((sum, video) => sum + video.duration, 0);
    
    console.log(`🎯 Proportional trimming calculation: ${totalDuration}s total → ${targetDuration}s target`);
    
    if (targetDuration >= totalDuration) {
      console.log('✅ No trimming needed - target duration is >= total duration');
      return videos.map(video => ({ 
        originalDuration: video.duration,
        trimmedDuration: video.duration
      }));
    }
    
    const scaleFactor = targetDuration / totalDuration;
    console.log(`📐 Scale factor: ${scaleFactor.toFixed(3)} (${(scaleFactor * 100).toFixed(1)}%)`);
    
    const trimData = videos.map((video, index) => {
      const trimmedDuration = video.duration * scaleFactor;
      
      console.log(`✂️ Video ${index + 1}: ${video.duration}s → ${trimmedDuration.toFixed(2)}s`);
      
      return {
        originalDuration: video.duration,
        trimmedDuration: trimmedDuration
      };
    });
    
    const actualTotal = trimData.reduce((sum, trim) => sum + trim.trimmedDuration, 0);
    console.log(`🎯 Final calculated duration: ${actualTotal.toFixed(2)}s (target: ${targetDuration}s)`);
    
    return trimData;
  }

  getProcessingMode(): 'edge_function' {
    return 'edge_function';
  }
}

