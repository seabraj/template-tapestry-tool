
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
    console.log('🎬 VideoProcessor initialized for Cloudinary concatenation with trimming');
  }

  async processVideo(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    return this.processVideoWithCloudinaryConcatenation(options, onProgress);
  }

  private extractCloudinaryPublicId(url: string): string {
    console.log('🔍 Extracting public ID from URL:', url);
    
    // Remove any query parameters first
    const cleanUrl = url.split('?')[0];
    
    // Pattern 1: Standard Cloudinary URL with version
    // https://res.cloudinary.com/CLOUD_NAME/video/upload/v123456/folder/public_id.ext
    let match = cleanUrl.match(/\/upload\/v\d+\/(.+)\.(mp4|mov|avi|webm|mkv)$/i);
    if (match) {
      const publicId = match[1];
      console.log('✅ Extracted public ID (with version):', publicId);
      return publicId;
    }
    
    // Pattern 2: Cloudinary URL without version
    // https://res.cloudinary.com/CLOUD_NAME/video/upload/folder/public_id.ext
    match = cleanUrl.match(/\/upload\/(.+)\.(mp4|mov|avi|webm|mkv)$/i);
    if (match) {
      const publicId = match[1];
      console.log('✅ Extracted public ID (no version):', publicId);
      return publicId;
    }
    
    // Pattern 3: Direct public ID format
    // https://res.cloudinary.com/CLOUD_NAME/video/upload/public_id.ext
    match = cleanUrl.match(/\/upload\/([^\/]+)\.(mp4|mov|avi|webm|mkv)$/i);
    if (match) {
      const publicId = match[1];
      console.log('✅ Extracted public ID (direct):', publicId);
      return publicId;
    }
    
    console.error('❌ Could not extract public ID from URL:', url);
    throw new Error(`Could not extract public ID from URL: ${url}`);
  }

  private calculateTrimmingStrategy(sequences: Array<{duration: number}>, targetDuration: number) {
    const totalDuration = sequences.reduce((sum, seq) => sum + seq.duration, 0);
    
    console.log(`🎯 Trimming calculation: ${totalDuration}s total → ${targetDuration}s target`);
    
    if (totalDuration <= targetDuration) {
      console.log('✅ No trimming needed - total duration fits within target');
      return sequences.map(() => ({ startOffset: 0, duration: null })); // Use full clips
    }
    
    // Calculate proportional trimming for each video
    const scaleFactor = targetDuration / totalDuration;
    console.log(`📐 Scale factor: ${scaleFactor.toFixed(3)}`);
    
    const trimmingPlan = sequences.map((seq, index) => {
      const trimmedDuration = seq.duration * scaleFactor;
      const startOffset = 0; // Start from beginning of each clip
      
      console.log(`✂️ Video ${index + 1}: ${seq.duration}s → ${trimmedDuration.toFixed(2)}s`);
      
      return {
        startOffset,
        duration: Math.max(1, Math.floor(trimmedDuration)) // Ensure at least 1 second
      };
    });
    
    // Verify total matches target (adjust last video if needed)
    const calculatedTotal = trimmingPlan.reduce((sum, plan) => sum + (plan.duration || 0), 0);
    const difference = targetDuration - calculatedTotal;
    
    if (Math.abs(difference) > 0 && trimmingPlan.length > 0) {
      const lastPlan = trimmingPlan[trimmingPlan.length - 1];
      if (lastPlan.duration) {
        lastPlan.duration = Math.max(1, lastPlan.duration + difference);
        console.log(`🔧 Adjusted last video duration by ${difference}s to match target exactly`);
      }
    }
    
    return trimmingPlan;
  }

  private async processVideoWithCloudinaryConcatenation(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🚀 Starting Cloudinary video concatenation with trimming...', {
        sequences: options.sequences.length,
        platform: options.platform,
        targetDuration: options.duration,
        totalSourceDuration: options.sequences.reduce((sum, seq) => sum + seq.duration, 0)
      });
      onProgress?.(10);

      // Validate sequences and preserve order
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

      // Calculate trimming strategy
      const trimmingPlan = this.calculateTrimmingStrategy(validSequences, options.duration);
      
      // Extract Cloudinary public IDs
      const videoPublicIds = [];
      for (let i = 0; i < validSequences.length; i++) {
        const seq = validSequences[i];
        const trimming = trimmingPlan[i];
        
        try {
          const publicId = this.extractCloudinaryPublicId(seq.file_url);
          videoPublicIds.push({
            public_id: publicId,
            name: seq.name,
            trimming
          });
          
          console.log(`📋 Video: ${seq.name} - ${publicId} (${trimming.duration ? `${trimming.duration}s` : 'full'})`);
        } catch (error) {
          console.error(`❌ Failed to process sequence ${seq.name}:`, error);
          throw error;
        }
      }

      onProgress?.(50);

      if (videoPublicIds.length === 1) {
        // Single video - just optimize, format and trim if needed
        const video = videoPublicIds[0];
        let transformations = ['q_auto:good', 'f_mp4'];
        
        // Add trimming if needed - FIXED: Apply trimming to single video
        if (video.trimming.duration) {
          transformations.push(`so_${video.trimming.startOffset}`, `du_${video.trimming.duration}`);
          console.log(`✂️ Single video trimming: start ${video.trimming.startOffset}s, duration ${video.trimming.duration}s`);
        }
        
        const singleVideoUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${transformations.join(',')}/${video.public_id}.mp4`;
        console.log('🎬 Single video optimization URL generated with trimming:', singleVideoUrl);
        onProgress?.(90);
        
        // Download the processed video
        const videoResponse = await fetch(singleVideoUrl);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download video: HTTP ${videoResponse.status}`);
        }
        
        const videoBlob = await videoResponse.blob();
        onProgress?.(100);
        console.log('✅ Successfully processed single video with trimming');
        return videoBlob;
      }

      // Multiple videos - use proper concatenation with trimming
      console.log('🔗 Creating proper concatenation URL with trimming for multiple videos...');
      
      // Build the concatenation URL using Cloudinary's video concatenation feature
      const baseVideo = videoPublicIds[0];
      const transformations = ['q_auto:good', 'f_mp4'];
      
      // FIXED: Add trimming to base video - apply at the start of transformations
      if (baseVideo.trimming.duration) {
        transformations.push(`so_${baseVideo.trimming.startOffset}`, `du_${baseVideo.trimming.duration}`);
        console.log(`✂️ Base video trimming: start ${baseVideo.trimming.startOffset}s, duration ${baseVideo.trimming.duration}s`);
      }
      
      // Add each subsequent video using proper concatenation syntax with trimming
      for (let i = 1; i < videoPublicIds.length; i++) {
        const video = videoPublicIds[i];
        
        // FIXED: Build layer transformation with trimming applied to the layer itself
        let layerTransform = `l_video:${video.public_id.replace(/\//g, ':')}`;
        
        // Apply trimming parameters directly to the layer
        if (video.trimming.duration) {
          layerTransform += `,so_${video.trimming.startOffset},du_${video.trimming.duration}`;
          console.log(`✂️ Layer ${i} trimming: start ${video.trimming.startOffset}s, duration ${video.trimming.duration}s`);
        }
        
        // Complete the layer with splice and apply
        layerTransform += ',fl_splice,fl_layer_apply';
        transformations.push(layerTransform);
        
        console.log(`📎 Adding video ${video.name} for concatenation with trimming: ${layerTransform}`);
      }
      
      // Build the final concatenation URL
      const transformationString = transformations.join('/');
      const concatenatedUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${transformationString}/${baseVideo.public_id}.mp4`;
      
      const finalDuration = trimmingPlan.reduce((sum, plan) => sum + (plan.duration || validSequences[trimmingPlan.indexOf(plan)].duration), 0);
      console.log(`🎯 Generated concatenation URL with ${videoPublicIds.length} videos (target: ${options.duration}s, estimated: ${finalDuration}s)`);
      console.log(`🔗 Concatenation URL: ${concatenatedUrl}`);
      
      onProgress?.(75);

      // Download the concatenated video
      try {
        console.log('📥 Downloading concatenated and trimmed video...');
        const videoResponse = await fetch(concatenatedUrl);
        
        if (!videoResponse.ok) {
          console.error(`❌ Cloudinary concatenation with trimming failed: HTTP ${videoResponse.status}`);
          
          // Log response details for debugging
          const responseText = await videoResponse.text();
          console.error('Response details:', {
            status: videoResponse.status,
            statusText: videoResponse.statusText,
            headers: Object.fromEntries(videoResponse.headers.entries()),
            body: responseText
          });
          
          throw new Error(`Cloudinary concatenation with trimming failed: HTTP ${videoResponse.status} ${videoResponse.statusText}`);
        }

        const videoBlob = await videoResponse.blob();
        onProgress?.(100);
        
        console.log('✅ Successfully downloaded concatenated and trimmed video:', {
          size: videoBlob.size,
          type: videoBlob.type,
          targetDuration: options.duration
        });
        
        return videoBlob;
        
      } catch (downloadError) {
        console.error('❌ Failed to download concatenated and trimmed video:', downloadError);
        throw new Error(`Video concatenation with trimming failed: ${downloadError.message}`);
      }

    } catch (error) {
      console.error('❌ Cloudinary video processing with trimming failed:', error);
      throw new Error(`Video processing failed: ${error.message}`);
    }
  }

  getProcessingMode(): 'cloudinary' {
    return 'cloudinary';
  }
}
