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
    console.log('🎬 VideoProcessor initialized with Cloudinary');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    // Use Cloudinary for reliable processing
    return this.processVideoWithCloudinary(options, onProgress);
  }

  private async processVideoWithCloudinary(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🚀 Starting Cloudinary video processing...', {
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

      console.log(`✅ Processing ${validSequences.length} sequence(s) in user-defined order`);
      onProgress?.(25);

      // Calculate proportional trimming if needed
      const totalDuration = validSequences.reduce((sum, seq) => sum + seq.duration, 0);
      const trimData = this.calculateProportionalTrimming(
        validSequences.map(seq => ({ duration: seq.duration })), 
        options.duration
      );

      console.log(`🎯 Target duration: ${options.duration}s, Original total: ${totalDuration}s`);
      console.log('✂️ Trim calculations:', trimData.map((trim, i) => 
        `${i + 1}. ${validSequences[i].name}: ${trim.originalDuration}s → ${trim.trimmedDuration.toFixed(2)}s`
      ));

      // Process based on number of videos
      let processedVideoUrl: string;
      
      if (validSequences.length === 1) {
        // Single video - just trim if needed
        processedVideoUrl = this.processSingleVideo(validSequences[0], trimData[0]);
      } else {
        // Multiple videos - concatenate in order with proper trimming
        processedVideoUrl = this.concatenateVideosWithCloudinary(validSequences, trimData, options.platform);
      }

      onProgress?.(75);

      // Download the processed video
      console.log('📥 Downloading processed video from Cloudinary:', processedVideoUrl);
      const response = await fetch(processedVideoUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download processed video: HTTP ${response.status}`);
      }

      const videoBlob = await response.blob();
      onProgress?.(100);

      console.log('✅ Successfully processed video with Cloudinary');
      console.log(`🎯 Target duration: ${options.duration}s`);
      console.log(`📹 Video count: ${validSequences.length} sequences`);
      console.log(`🎬 Final video size: ${(videoBlob.size / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`📋 Processing method: cloudinary_${validSequences.length === 1 ? 'single' : 'concatenation'}`);

      return videoBlob;

    } catch (error) {
      console.error('❌ Cloudinary video processing failed:', error);
      throw new Error(`Video processing failed: ${error.message}`);
    }
  }

  private processSingleVideo(sequence: any, trimData: TrimData): string {
    console.log('🎯 Processing single video:', sequence.name);
    
    const publicId = this.extractCloudinaryPublicId(sequence.file_url);
    const video = this.cloudinary.video(publicId);
    
    // Apply trimming if needed
    if (trimData.trimmedDuration < trimData.originalDuration) {
      console.log(`✂️ Trimming ${sequence.name}: ${trimData.originalDuration}s → ${trimData.trimmedDuration.toFixed(2)}s`);
      video.videoEdit(trim().duration(trimData.trimmedDuration));
    }
    
    // Apply quality and format
    video.quality(auto()).delivery(format('mp4'));
    
    const url = video.toURL();
    console.log(`✅ Single video URL generated: ${url}`);
    return url;
  }

  private concatenateVideosWithCloudinary(sequences: any[], trimData: TrimData[], platform: string): string {
    console.log('🔧 Concatenating multiple videos with Cloudinary...');
    console.log(`📋 Processing ${sequences.length} videos in user order`);
    
    // Start with the first video (base video)
    const firstSequence = sequences[0];
    const firstPublicId = this.extractCloudinaryPublicId(firstSequence.file_url);
    const firstTrimData = trimData[0];
    
    console.log(`🎬 Base video: ${firstSequence.name} (${firstTrimData.originalDuration}s → ${firstTrimData.trimmedDuration.toFixed(2)}s)`);
    
    // Build the base video with trimming FIRST
    const video = this.cloudinary.video(firstPublicId);
    
    // Apply trimming to base video if needed
    if (firstTrimData.trimmedDuration < firstTrimData.originalDuration) {
      console.log(`✂️ Trimming base video: ${firstTrimData.originalDuration}s → ${firstTrimData.trimmedDuration.toFixed(2)}s`);
      video.videoEdit(trim().duration(firstTrimData.trimmedDuration));
    }
    
    // Now add subsequent videos as overlays in sequence
    let currentOffset = firstTrimData.trimmedDuration;
    
    for (let i = 1; i < sequences.length; i++) {
      const sequence = sequences[i];
      const trimDataItem = trimData[i];
      const publicId = this.extractCloudinaryPublicId(sequence.file_url);
      
      console.log(`➕ Adding video ${i + 1}: ${sequence.name} at offset ${currentOffset.toFixed(2)}s (duration: ${trimDataItem.trimmedDuration.toFixed(2)}s)`);
      
      // Build overlay transformation for this video
      let overlayTransform = `l_video:${publicId}`;
      
      // Add trimming to overlay if needed
      if (trimDataItem.trimmedDuration < trimDataItem.originalDuration) {
        overlayTransform += `/du_${trimDataItem.trimmedDuration.toFixed(2)}`;
      }
      
      // Add timing offset
      overlayTransform += `/so_${currentOffset.toFixed(2)}/fl_splice`;
      
      console.log(`🔧 Overlay transform: ${overlayTransform}`);
      
      // Apply the overlay transformation
      video.addTransformation(overlayTransform);
      
      // Update offset for next video
      currentOffset += trimDataItem.trimmedDuration;
    }
    
    // Apply final quality and format
    video.quality(auto()).delivery(format('mp4'));
    
    const url = video.toURL();
    console.log(`✅ Concatenated video URL: ${url}`);
    console.log(`🎯 Total expected duration: ${currentOffset.toFixed(2)}s`);
    
    return url;
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
