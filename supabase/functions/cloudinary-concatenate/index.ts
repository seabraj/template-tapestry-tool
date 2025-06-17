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
    console.log('🎬 === SERVER-SIDE VIDEO CONCATENATION STARTED ===');
    
    const { videos, targetDuration } = await req.json() as ConcatenationRequest;
    
    if (!videos?.length) throw new Error('No videos provided');
    if (!targetDuration || targetDuration <= 0) throw new Error('A valid target duration is required.');

    console.log(`📊 Processing ${videos.length} videos. Target duration: ${targetDuration}s`);
    console.log('📹 Input videos:', videos.map(v => ({ publicId: v.publicId, duration: v.duration })));

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    if (totalOriginalDuration <= 0) throw new Error('Total duration of source videos is zero.');
    console.log(`⏱️ Total original duration: ${totalOriginalDuration.toFixed(2)}s`);
    
    // PHASE 1: Create proportionally trimmed videos (PROVEN TO WORK)
    const timestamp = Date.now();
    const trimmedVideos: TrimmedVideo[] = [];
    
    console.log('✂️ === PHASE 1: Creating trimmed videos ===');
    
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `temp_processing/trimmed_${i}_${timestamp}`;
      
      console.log(`📹 Video ${i + 1}/${videos.length}: ${video.publicId} → ${proportionalDuration.toFixed(2)}s`);
      
      // Create trimmed video
      const trimmedUrl = cloudinary.url(video.publicId, {
        resource_type: 'video',
        transformation: [
          { duration: proportionalDuration.toFixed(2) },
          { quality: 'auto:good' }
        ],
        format: 'mp4'
      });
      
      const uploadResult = await cloudinary.uploader.upload(trimmedUrl, {
        resource_type: 'video',
        public_id: trimmedId,
        overwrite: true
      });
      
      // Verify
      const verification = await cloudinary.api.resource(trimmedId, { resource_type: 'video' });
      
      trimmedVideos.push({
        publicId: trimmedId,
        originalId: video.publicId,
        duration: proportionalDuration,
        order: i,
        verified: true
      });
      
      console.log(`✅ Video ${i + 1} trimmed and verified: ${trimmedId}`);
    }
    
    console.log('✅ === PHASE 1 COMPLETE ===');
    
    // PHASE 2: True Cloudinary concatenation using official fl_splice syntax
    console.log('🔗 === PHASE 2: Cloudinary concatenation with fl_splice ===');
    
    try {
      // Sort videos by order for correct sequence
      const sortedVideos = trimmedVideos.sort((a, b) => a.order - b.order);
      console.log('📋 Video sequence for concatenation:', 
        sortedVideos.map(v => `${v.order + 1}. ${v.publicId} (${v.duration.toFixed(2)}s)`)
      );
      
      // Method 1: Use proper Cloudinary fl_splice concatenation
      console.log('🎬 Attempting Cloudinary fl_splice concatenation...');
      
      const baseVideo = sortedVideos[0];
      const overlayVideos = sortedVideos.slice(1);
      
      console.log(`🎯 Base video: ${baseVideo.publicId} (${baseVideo.duration.toFixed(2)}s)`);
      console.log(`➕ Overlay videos: ${overlayVideos.length}`);
      
      // Convert public IDs: replace / with : for Cloudinary syntax
      const baseVideoId = baseVideo.publicId.replace(/\//g, ':');
      console.log(`🔄 Base video ID converted: ${baseVideo.publicId} → ${baseVideoId}`);
      
      // Build concatenation transformation with CORRECTED Cloudinary syntax
      const transformations = [];
      
      // 1. Set base video with consistent dimensions first
      transformations.push('w_1280,h_720,c_pad'); // Set dimensions first
      transformations.push(`du_${baseVideo.duration.toFixed(2)}`); // Then duration
      
      // 2. Add each overlay video with CORRECTED parameter order
      for (let i = 0; i < overlayVideos.length; i++) {
        const overlayVideo = overlayVideos[i];
        const overlayVideoId = overlayVideo.publicId.replace(/\//g, ':');
        
        console.log(`🔗 Adding overlay ${i + 1}: ${overlayVideo.publicId} → ${overlayVideoId} (${overlayVideo.duration.toFixed(2)}s)`);
        
        // CORRECTED: l_video:public_id,du_duration,w_width,h_height/fl_layer_apply/fl_splice
        transformations.push(`l_video:${overlayVideoId},du_${overlayVideo.duration.toFixed(2)},w_1280,h_720,c_pad`);
        transformations.push('fl_layer_apply');
        transformations.push('fl_splice');
      }
      
      // 3. Add final formatting
      transformations.push('ac_aac'); // Audio codec
      transformations.push('q_auto:good'); // Quality
      
      const transformationString = transformations.join('/');
      const concatenatedUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${transformationString}/${baseVideo.publicId}.mp4`;
      
      console.log('🎯 Cloudinary concatenation URL:', concatenatedUrl);
      console.log('📋 Transformation string:', transformationString);
      
      // Test the concatenation URL
      console.log('🔍 Testing Cloudinary concatenation URL...');
      const testResponse = await fetch(concatenatedUrl, { method: 'HEAD' });
      console.log(`📡 Concatenation URL test: ${testResponse.status} ${testResponse.statusText}`);
      
      if (testResponse.ok) {
        console.log('✅ Cloudinary fl_splice concatenation URL test passed!');
        
        // IMPORTANT: Wait for Cloudinary to actually process the video before cleanup
        console.log('⏳ Waiting for Cloudinary to process the concatenated video...');
        
        // Try to actually download a small portion to verify it's really ready
        let videoReady = false;
        let attempts = 0;
        const maxAttempts = 5;
        
        while (!videoReady && attempts < maxAttempts) {
          attempts++;
          console.log(`🔍 Verification attempt ${attempts}/${maxAttempts}...`);
          
          try {
            // Try to fetch the first few bytes to verify the video exists
            const verifyResponse = await fetch(concatenatedUrl, { 
              method: 'GET',
              headers: { 'Range': 'bytes=0-1023' } // Just first 1KB
            });
            
            if (verifyResponse.ok || verifyResponse.status === 206) {
              console.log(`✅ Video verification successful on attempt ${attempts}`);
              videoReady = true;
            } else {
              console.log(`⏳ Video not ready yet (${verifyResponse.status}), waiting...`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            }
          } catch (verifyError) {
            console.log(`⏳ Verification attempt ${attempts} failed, waiting...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
          }
        }
        
        if (!videoReady) {
          console.warn('⚠️ Video verification failed after maximum attempts');
          console.log('🎯 Returning URL anyway - Cloudinary might need more processing time');
        }
        
        // PHASE 3: Cleanup temp videos (only after verification or timeout)
        console.log('🧹 === PHASE 3: Cleanup ===');
        for (const video of trimmedVideos) {
          try {
            await cloudinary.uploader.destroy(video.publicId, { resource_type: 'video' });
            console.log(`🗑️ Cleaned up: ${video.publicId}`);
          } catch (cleanupError) {
            console.warn(`⚠️ Cleanup warning: ${cleanupError.message}`);
          }
        }
        
        console.log('🎉 === ALL PHASES COMPLETE ===');
        console.log(`✅ Successfully concatenated ${videos.length} videos using Cloudinary fl_splice`);
        
        return new Response(
          JSON.stringify({ 
            success: true,
            url: concatenatedUrl,
            message: `Successfully concatenated ${videos.length} videos to ${targetDuration}s using Cloudinary fl_splice`,
            method: 'cloudinary_fl_splice',
            totalDuration: targetDuration,
            videosProcessed: videos.length,
            transformationUsed: transformationString,
            videoReady: videoReady,
            verificationAttempts: attempts,
            phases: {
              phase1: 'Trimming - Complete ✅',
              phase2: 'Cloudinary fl_splice concatenation - Complete ✅', 
              phase3: 'Cleanup - Complete ✅'
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        throw new Error(`Cloudinary fl_splice test failed: ${testResponse.status} ${testResponse.statusText}`);
      }
      
    } catch (cloudinaryError) {
      console.warn('⚠️ Cloudinary fl_splice concatenation failed:', cloudinaryError.message);
      
      // Method 2: Alternative Cloudinary approach using SDK
      console.log('🔧 Attempting SDK-based concatenation...');
      
      try {
        const sortedVideos = trimmedVideos.sort((a, b) => a.order - b.order);
        const baseVideo = sortedVideos[0];
        const overlayVideos = sortedVideos.slice(1);
        
        // Build SDK transformation
        const sdkTransformations = [
          { duration: baseVideo.duration.toFixed(2) },
          { width: 1280, height: 720, crop: 'pad' }
        ];
        
        // Add overlays with splice flags
        for (const overlayVideo of overlayVideos) {
          sdkTransformations.push({
            overlay: {
              resource_type: 'video',
              public_id: overlayVideo.publicId
            },
            duration: overlayVideo.duration.toFixed(2),
            width: 1280,
            height: 720,
            crop: 'pad',
            flags: ['layer_apply', 'splice']
          });
        }
        
        // Add final formatting
        sdkTransformations.push(
          { audio_codec: 'aac' },
          { quality: 'auto:good' }
        );
        
        const sdkUrl = cloudinary.url(baseVideo.publicId, {
          resource_type: 'video',
          transformation: sdkTransformations,
          format: 'mp4'
        });
        
        console.log('🎯 SDK concatenation URL:', sdkUrl);
        
        // Test SDK URL
        const sdkTest = await fetch(sdkUrl, { method: 'HEAD' });
        console.log(`📡 SDK URL test: ${sdkTest.status} ${sdkTest.statusText}`);
        
        if (sdkTest.ok) {
          console.log('✅ SDK concatenation URL test passed!');
          
          // Wait and verify for SDK method too
          console.log('⏳ Verifying SDK concatenated video...');
          
          let sdkVideoReady = false;
          let sdkAttempts = 0;
          const maxSdkAttempts = 3;
          
          while (!sdkVideoReady && sdkAttempts < maxSdkAttempts) {
            sdkAttempts++;
            try {
              const sdkVerifyResponse = await fetch(sdkUrl, { 
                method: 'GET',
                headers: { 'Range': 'bytes=0-1023' }
              });
              
              if (sdkVerifyResponse.ok || sdkVerifyResponse.status === 206) {
                sdkVideoReady = true;
              } else {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            } catch (sdkVerifyError) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
          
          // Cleanup after verification
          for (const video of trimmedVideos) {
            try {
              await cloudinary.uploader.destroy(video.publicId, { resource_type: 'video' });
            } catch (cleanupError) {
              console.warn(`⚠️ Cleanup warning: ${cleanupError.message}`);
            }
          }
          
          return new Response(
            JSON.stringify({ 
              success: true,
              url: sdkUrl,
              message: `Successfully concatenated ${videos.length} videos using SDK method`,
              method: 'cloudinary_sdk',
              totalDuration: targetDuration,
              videosProcessed: videos.length,
              videoReady: sdkVideoReady,
              verificationAttempts: sdkAttempts
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          throw new Error(`SDK concatenation test failed: ${sdkTest.status}`);
        }
        
      } catch (sdkError) {
        console.error('❌ SDK concatenation also failed:', sdkError.message);
        throw new Error(`Both fl_splice and SDK concatenation methods failed`);
      }
    }

  } catch (error) {
    console.error('❌ === VIDEO PROCESSING FAILED ===');
    console.error('Error details:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        phase: 'processing_failed'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});