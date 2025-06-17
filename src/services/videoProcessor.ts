
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
    try {
      console.log('🎬 Initializing VideoProcessor...');
      this.cloudinary = new Cloudinary({
        cloud: {
          cloudName: 'dsxrmo3kt'
        }
      });
      console.log('✅ VideoProcessor initialized successfully with Cloudinary cloud: dsxrmo3kt');
    } catch (error) {
      console.error('❌ Failed to initialize VideoProcessor:', error);
      throw new Error(`VideoProcessor initialization failed: ${error.message}`);
    }
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

      // Validate and filter sequences
      const validSequences = this.validateSequences(options.sequences);
      if (validSequences.length === 0) {
        throw new Error('No valid video sequences found after validation');
      }

      console.log(`✅ Validated ${validSequences.length} sequence(s)`);
      onProgress?.(25);

      // Calculate trimming
      const trimData = this.calculateProportionalTrimming(
        validSequences.map(seq => ({ duration: seq.duration })), 
        options.duration
      );

      onProgress?.(50);

      // Process video(s)
      let processedVideoUrl: string;
      
      if (validSequences.length === 1) {
        console.log('📹 Processing single video');
        processedVideoUrl = this.processSingleVideo(validSequences[0], trimData[0]);
      } else {
        console.log('🔗 Processing multiple videos for concatenation');
        processedVideoUrl = this.buildConcatenationUrl(validSequences, trimData);
      }

      onProgress?.(75);

      // Download processed video
      console.log('📥 Downloading processed video from:', processedVideoUrl);
      const videoBlob = await this.downloadVideo(processedVideoUrl);
      
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

  private processSingleVideo(sequence: any, trimData: TrimData): string {
    try {
      console.log('🎯 Processing single video:', {
        name: sequence.name,
        originalDuration: trimData.originalDuration,
        trimmedDuration: trimData.trimmedDuration
      });
      
      const publicId = this.extractCloudinaryPublicId(sequence.file_url);
      console.log('📝 Extracted public ID:', publicId);
      
      const video = this.cloudinary.video(publicId);
      
      // Apply trimming if needed
      if (trimData.trimmedDuration < trimData.originalDuration) {
        console.log(`✂️ Applying trim: ${trimData.originalDuration}s → ${trimData.trimmedDuration.toFixed(2)}s`);
        video.videoEdit(trim().duration(trimData.trimmedDuration));
      }
      
      // Apply quality and format
      video.quality(auto()).delivery(format('mp4'));
      
      const url = video.toURL();
      console.log(`✅ Single video URL generated:`, url);
      return url;
    } catch (error) {
      console.error('❌ Failed to process single video:', error);
      throw new Error(`Single video processing failed: ${error.message}`);
    }
  }

  private buildConcatenationUrl(sequences: any[], trimData: TrimData[]): string {
    try {
      console.log('🔧 Building concatenation URL for', sequences.length, 'videos...');
      
      // For Cloudinary concatenation, we need to use a more manual approach with URL transformations
      // First, let's gather all the video public IDs and their trim values
      const videoDetails = sequences.map((seq, index) => {
        const publicId = this.extractCloudinaryPublicId(seq.file_url);
        console.log(`📝 Video ${index + 1} public ID:`, publicId);
        
        return {
          publicId,
          trimDuration: trimData[index].trimmedDuration
        };
      });
      
      // We'll use the base URL from Cloudinary but construct the transformation manually
      const baseUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/`;
      
      // Create the concatenation transformation string using fl_splice
      let transformationUrl = '';
      
      // Start with the first video as base
      const firstVideo = videoDetails[0];
      transformationUrl = `${baseUrl}`;
      
      // Add trim for first video if needed
      if (trimData[0].trimmedDuration < trimData[0].originalDuration) {
        console.log(`✂️ Trimming first video: ${trimData[0].originalDuration}s → ${trimData[0].trimmedDuration.toFixed(2)}s`);
        transformationUrl += `du_${firstVideo.trimDuration.toFixed(2)},`;
      }
      
      // Add quality and format settings
      transformationUrl += `q_auto/`;
      
      // Add the first video public ID
      transformationUrl += `${firstVideo.publicId}`;
      
      // Only add concatenation logic if there are multiple videos
      if (videoDetails.length > 1) {
        // Add videos after the first one using layer (l_) directives with trimming if needed
        const additionalVideos = videoDetails.slice(1).map((video, idx) => {
          const realIdx = idx + 1; // actual index in the sequences array
          
          console.log(`🎬 Adding video ${realIdx + 1} to concatenation chain:`, {
            publicId: video.publicId,
            trimmedDuration: video.trimDuration
          });
          
          let layerParam = `l_video:${video.publicId}`;
          
          // Add trim duration if needed
          if (trimData[realIdx].trimmedDuration < trimData[realIdx].originalDuration) {
            console.log(`✂️ Trimming video ${realIdx + 1}: ${trimData[realIdx].originalDuration}s → ${trimData[realIdx].trimmedDuration.toFixed(2)}s`);
            layerParam += `:du_${video.trimDuration.toFixed(2)}`;
          }
          
          // The fl_splice parameter tells Cloudinary to concatenate videos
          layerParam += `/fl_splice`;
          
          return layerParam;
        });
        
        // Add all layer parameters to the URL
        if (additionalVideos.length > 0) {
          transformationUrl += `/${additionalVideos.join('/')}`;
        }
      }
      
      // Add format transformation if not already included
      if (!transformationUrl.includes('/f_')) {
        transformationUrl += `/f_mp4`;
      }
      
      console.log('✅ Final concatenation URL generated:', transformationUrl);
      return transformationUrl;
      
    } catch (error) {
      console.error('❌ Failed to build concatenation URL:', error);
      throw new Error(`Concatenation URL building failed: ${error.message}`);
    }
  }

  private async downloadVideo(url: string): Promise<Blob> {
    try {
      console.log('📥 Starting video download from:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`❌ Download failed with status ${response.status}:`, errorText);
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

  private extractCloudinaryPublicId(url: string): string {
    try {
      console.log('🔍 Extracting public ID from URL:', url);
      
      // Remove query parameters
      const cleanUrl = url.split('?')[0];
      
      // Try different patterns
      const patterns = [
        /\/upload\/v\d+\/(.+)\.(mp4|mov|avi|webm|mkv)$/i,
        /\/upload\/(.+)\.(mp4|mov|avi|webm|mkv)$/i,
        /\/([^\/]+)\.(mp4|mov|avi|webm|mkv)$/i
      ];
      
      for (const pattern of patterns) {
        const match = cleanUrl.match(pattern);
        if (match) {
          const publicId = match[1];
          console.log('✅ Extracted public ID:', publicId);
          return publicId;
        }
      }
      
      throw new Error(`Could not extract public ID from URL: ${url}`);
      
    } catch (error) {
      console.error('❌ Public ID extraction failed:', error);
      throw error;
    }
  }

  private calculateProportionalTrimming(videos: Array<{duration: number}>, targetDuration: number): TrimData[] {
    try {
      console.log('📐 Calculating proportional trimming...');
      
      const totalDuration = videos.reduce((sum, video) => sum + video.duration, 0);
      
      console.log(`🎯 Target: ${targetDuration}s, Total: ${totalDuration}s`);
      
      if (targetDuration >= totalDuration) {
        console.log('✅ No trimming needed');
        return videos.map(video => ({ 
          originalDuration: video.duration,
          trimmedDuration: video.duration
        }));
      }
      
      const scaleFactor = targetDuration / totalDuration;
      console.log(`📏 Scale factor: ${scaleFactor.toFixed(3)}`);
      
      const trimData = videos.map((video, index) => {
        const trimmedDuration = video.duration * scaleFactor;
        console.log(`✂️ Video ${index + 1}: ${video.duration}s → ${trimmedDuration.toFixed(2)}s`);
        
        return {
          originalDuration: video.duration,
          trimmedDuration: trimmedDuration
        };
      });
      
      return trimData;
      
    } catch (error) {
      console.error('❌ Trimming calculation failed:', error);
      throw new Error(`Trimming calculation failed: ${error.message}`);
    }
  }

  getProcessingMode(): 'edge_function' {
    return 'edge_function';
  }
}
