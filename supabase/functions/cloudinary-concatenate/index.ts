import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configure Cloudinary
try {
  cloudinary.config({
    cloud_name: 'dsxrmo3kt',
    api_key: Deno.env.get('CLOUDINARY_API_KEY'),
    api_secret: Deno.env.get('CLOUDINARY_API_SECRET'),
    secure: true,
  });
  console.log('✅ Cloudinary SDK configured successfully.');
} catch (e) {
  console.error('❌ Failed to configure Cloudinary SDK.', e);
}

interface VideoInfo {
  publicId: string;
  duration: number;
}

interface ConcatenationRequest {
  videos: VideoInfo[];
  targetDuration: number;
}

interface TrimmedVideo {
  publicId: string;
  originalId: string;
  duration: number;
  order: number;
  verified: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 === PHASE 1: Video Trimming Started ===');
    
    const { videos, targetDuration } = await req.json() as ConcatenationRequest;
    
    if (!videos?.length) throw new Error('No videos provided');
    if (!targetDuration || targetDuration <= 0) throw new Error('A valid target duration is required.');

    console.log(`📊 Processing ${videos.length} videos. Target duration: ${targetDuration}s`);
    console.log('📹 Input videos:', videos.map(v => ({ publicId: v.publicId, duration: v.duration })));

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    if (totalOriginalDuration <= 0) throw new Error('Total duration of source videos is zero.');
    console.log(`⏱️ Total original duration: ${totalOriginalDuration.toFixed(2)}s`);
    
    // PHASE 1: Create proportionally trimmed videos
    const timestamp = Date.now();
    const trimmedVideos: TrimmedVideo[] = [];
    
    console.log('✂️ Creating proportionally trimmed videos...');
    
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `temp_processing/trimmed_${i}_${timestamp}`;
      
      console.log(`📹 Video ${i + 1}/${videos.length}: ${video.publicId}`);
      console.log(`   Original duration: ${video.duration}s`);
      console.log(`   Proportional duration: ${proportionalDuration.toFixed(2)}s`);
      console.log(`   Temp ID: ${trimmedId}`);
      
      try {
        // Create the trimmed video URL
        const trimmedUrl = cloudinary.url(video.publicId, {
          resource_type: 'video',
          transformation: [
            { duration: proportionalDuration.toFixed(2) },
            { quality: 'auto:good' }
          ],
          format: 'mp4'
        });
        
        console.log(`🔗 Trimmed URL for video ${i + 1}: ${trimmedUrl}`);
        
        // Upload the trimmed video to temp folder
        console.log(`⬆️ Uploading trimmed video ${i + 1} to Cloudinary...`);
        const uploadResult = await cloudinary.uploader.upload(trimmedUrl, {
          resource_type: 'video',
          public_id: trimmedId,
          overwrite: true,
          use_filename: false,
          unique_filename: false
        });
        
        console.log(`✅ Upload successful for video ${i + 1}:`, {
          public_id: uploadResult.public_id,
          secure_url: uploadResult.secure_url,
          duration: uploadResult.duration,
          format: uploadResult.format
        });
        
        // Verify the trimmed video exists and get its details
        console.log(`🔍 Verifying trimmed video ${i + 1}...`);
        
        const verification = await cloudinary.api.resource(trimmedId, { 
          resource_type: 'video'
        });
        
        if (!verification) {
          throw new Error(`Verification failed for trimmed video: ${trimmedId}`);
        }
        
        console.log(`✅ Verification successful for video ${i + 1}:`, {
          public_id: verification.public_id,
          duration: verification.duration,
          format: verification.format,
          bytes: verification.bytes
        });
        
        // Store the verified trimmed video info
        trimmedVideos.push({
          publicId: trimmedId,
          originalId: video.publicId,
          duration: proportionalDuration,
          order: i,
          verified: true
        });
        
        console.log(`🎯 Video ${i + 1} successfully processed and verified`);
        
      } catch (videoError) {
        console.error(`❌ Failed to process video ${i + 1} (${video.publicId}):`, videoError);
        
        // Clean up any successfully created videos if one fails
        console.log('🧹 Cleaning up due to error...');
        for (const cleanupVideo of trimmedVideos) {
          try {
            await cloudinary.uploader.destroy(cleanupVideo.publicId, { resource_type: 'video' });
            console.log(`🗑️ Cleaned up: ${cleanupVideo.publicId}`);
          } catch (cleanupError) {
            console.warn(`⚠️ Cleanup warning for ${cleanupVideo.publicId}:`, cleanupError.message);
          }
        }
        
        throw new Error(`Video processing failed at video ${i + 1}: ${videoError.message}`);
      }
    }
    
    // PHASE 1 COMPLETE - All videos trimmed and verified
    console.log('🎉 === PHASE 1 COMPLETE ===');
    console.log(`✅ Successfully created ${trimmedVideos.length} trimmed videos:`);
    
    trimmedVideos.forEach((video, index) => {
      console.log(`   ${index + 1}. ${video.publicId} (${video.duration.toFixed(2)}s) ✓`);
    });
    
    const totalTrimmedDuration = trimmedVideos.reduce((sum, v) => sum + v.duration, 0);
    console.log(`⏱️ Total trimmed duration: ${totalTrimmedDuration.toFixed(2)}s (target: ${targetDuration}s)`);
    
    // PHASE 2: Concatenate the verified trimmed videos
    console.log('🔗 === PHASE 2: Concatenation Started ===');
    
    try {
      const finalVideoId = `final_concatenated_${timestamp}`;
      let concatenatedUrl: string;
      
      // Sort trimmed videos by order to ensure correct sequence
      const sortedVideos = trimmedVideos.sort((a, b) => a.order - b.order);
      console.log('📋 Video sequence for concatenation:', 
        sortedVideos.map(v => `${v.order + 1}. ${v.publicId} (${v.duration.toFixed(2)}s)`)
      );
      
      // Method 1: Try Cloudinary's create_slideshow API
      console.log('🎬 Attempting slideshow concatenation...');
      
      try {
        const slideshowParams = {
          manifest_transformation: {
            width: 1280,
            height: 720,
            crop: 'pad'
          },
          transformation: [
            { audio_codec: 'aac' },
            { quality: 'auto:good' }
          ],
          public_id: finalVideoId,
          notification_url: null, // Synchronous processing
          resource_type: 'video'
        };
        
        console.log('📝 Slideshow parameters:', JSON.stringify(slideshowParams, null, 2));
        console.log('📹 Video sequence:', sortedVideos.map(v => v.publicId));
        
        const slideshowResult = await cloudinary.uploader.create_slideshow(
          slideshowParams,
          sortedVideos.map(v => v.publicId)
        );
        
        if (slideshowResult?.secure_url) {
          concatenatedUrl = slideshowResult.secure_url;
          console.log('✅ Slideshow concatenation successful!');
          console.log('🎯 Final video URL:', concatenatedUrl);
        } else {
          throw new Error('Slideshow result did not contain secure_url');
        }
        
      } catch (slideshowError) {
        console.warn('⚠️ Slideshow method failed:', slideshowError.message);
        
        // Method 2: Try direct transformation concatenation
        console.log('🔧 Attempting direct transformation concatenation...');
        
        const baseVideo = sortedVideos[0];
        const overlayVideos = sortedVideos.slice(1);
        
        // Build sequential overlay transformations
        const transformations = [
          { duration: baseVideo.duration.toFixed(2) }
        ];
        
        let currentOffset = baseVideo.duration;
        for (const overlayVideo of overlayVideos) {
          transformations.push({
            overlay: {
              resource_type: 'video',
              public_id: overlayVideo.publicId
            },
            start_offset: currentOffset.toFixed(2),
            duration: overlayVideo.duration.toFixed(2)
          });
          currentOffset += overlayVideo.duration;
        }
        
        // Add final formatting
        transformations.push(
          { width: 1280, height: 720, crop: 'pad' },
          { audio_codec: 'aac' },
          { quality: 'auto:good' }
        );
        
        concatenatedUrl = cloudinary.url(baseVideo.publicId, {
          resource_type: 'video',
          transformation: transformations,
          format: 'mp4'
        });
        
        console.log('🎯 Direct transformation URL:', concatenatedUrl);
        
        // Test the transformation URL
        const testResponse = await fetch(concatenatedUrl, { method: 'HEAD' });
        console.log(`📡 Transformation URL test: ${testResponse.status} ${testResponse.statusText}`);
        
        if (!testResponse.ok) {
          throw new Error(`Transformation URL test failed: ${testResponse.status}`);
        }
        
        console.log('✅ Direct transformation concatenation successful!');
      }
      
      // PHASE 3: Cleanup temp videos
      console.log('🧹 === PHASE 3: Cleanup Started ===');
      
      for (const trimmedVideo of trimmedVideos) {
        try {
          await cloudinary.uploader.destroy(trimmedVideo.publicId, { resource_type: 'video' });
          console.log(`🗑️ Cleaned up: ${trimmedVideo.publicId}`);
        } catch (cleanupError) {
          console.warn(`⚠️ Cleanup warning for ${trimmedVideo.publicId}:`, cleanupError.message);
        }
      }
      
      console.log('✅ === ALL PHASES COMPLETE ===');
      console.log(`🎉 Successfully created concatenated video: ${finalVideoId}`);
      console.log(`⏱️ Final duration: ${targetDuration}s`);
      console.log(`📹 Videos concatenated: ${videos.length}`);
      
      return new Response(
        JSON.stringify({ 
          success: true,
          url: concatenatedUrl,
          message: `Successfully concatenated ${videos.length} videos to ${targetDuration}s duration`,
          method: 'two_phase_concatenation',
          finalVideoId: finalVideoId,
          totalDuration: targetDuration,
          videosProcessed: videos.length,
          phases: {
            phase1: 'Trimming - Complete ✅',
            phase2: 'Concatenation - Complete ✅', 
            phase3: 'Cleanup - Complete ✅'
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
      
    } catch (concatenationError) {
      console.error('❌ Phase 2 concatenation failed:', concatenationError.message);
      
      // If concatenation fails, at least clean up the temp videos
      console.log('🧹 Cleaning up temp videos after concatenation failure...');
      for (const trimmedVideo of trimmedVideos) {
        try {
          await cloudinary.uploader.destroy(trimmedVideo.publicId, { resource_type: 'video' });
        } catch (cleanupError) {
          console.warn(`⚠️ Cleanup error: ${cleanupError.message}`);
        }
      }
      
      throw new Error(`Phase 2 failed: ${concatenationError.message}`);
    }

  } catch (error) {
    console.error('❌ === PHASE 1 FAILED ===');
    console.error('Error details:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        phase: 'phase_1_failed',
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});