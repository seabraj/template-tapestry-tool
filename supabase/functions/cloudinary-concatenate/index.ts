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
    
    // PHASE 2: Step-by-step concatenation using simple fl_splice
    console.log('🔗 === PHASE 2: Step-by-step Cloudinary concatenation ===');
    
    try {
      // Sort videos by order for correct sequence
      const sortedVideos = trimmedVideos.sort((a, b) => a.order - b.order);
      console.log('📋 Video sequence for concatenation:', 
        sortedVideos.map(v => `${v.order + 1}. ${v.publicId} (${v.duration.toFixed(2)}s)`)
      );
      
      if (sortedVideos.length === 1) {
        // Single video - just return it with formatting
        console.log('🎯 Single video - applying formatting only');
        
        const singleVideoUrl = cloudinary.url(sortedVideos[0].publicId, {
          resource_type: 'video',
          transformation: [
            { width: 1280, height: 720, crop: 'pad' },
            { audio_codec: 'aac' },
            { quality: 'auto:good' }
          ],
          format: 'mp4'
        });
        
        return new Response(
          JSON.stringify({ 
            success: true,
            url: singleVideoUrl,
            message: `Single video processed (${sortedVideos[0].duration.toFixed(2)}s duration)`,
            method: 'single_video',
            tempVideosKept: trimmedVideos.map(v => v.publicId),
            note: "Temp videos kept for testing - cleanup disabled"
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Multi-video concatenation using step-by-step approach
      console.log(`🔧 Starting step-by-step concatenation for ${sortedVideos.length} videos`);
      
      let currentVideoId = sortedVideos[0].publicId;
      let currentVideoName = `step1_${timestamp}`;
      
      // Step 1: Concatenate first two videos
      if (sortedVideos.length >= 2) {
        const video1 = sortedVideos[0];
        const video2 = sortedVideos[1];
        
        console.log(`🔗 Step 1: Concatenating ${video1.publicId} + ${video2.publicId}`);
        
        // Use exact Cloudinary documentation syntax
        const video2Id = video2.publicId.replace(/\//g, ':');
        
        const step1Transformations = [
          'w_1280,h_720,c_pad',                    // Set dimensions for base video
          `l_video:${video2Id},w_1280,h_720,c_pad`, // Add second video with same dimensions
          'fl_splice'                              // Splice flag to concatenate
        ].join('/');
        
        const step1Url = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${step1Transformations}/${video1.publicId}.mp4`;
        
        console.log('🎯 Step 1 URL:', step1Url);
        
        // Test step 1
        const step1Test = await fetch(step1Url, { method: 'HEAD' });
        console.log(`📡 Step 1 test: ${step1Test.status} ${step1Test.statusText}`);
        
        if (step1Test.ok) {
          console.log('✅ Step 1 concatenation successful');
          
          // If only 2 videos, we're done
          if (sortedVideos.length === 2) {
            console.log('🎉 Two-video concatenation complete');
            
            // TEMPORARILY DISABLE CLEANUP to test if temp videos are needed
            console.log('⚠️ TEMP: Skipping cleanup to test if temp videos are needed for processing');
            
            /*
            // Cleanup and return - DISABLED FOR TESTING
            for (const video of trimmedVideos) {
              try {
                await cloudinary.uploader.destroy(video.publicId, { resource_type: 'video' });
              } catch (cleanupError) {
                console.warn(`⚠️ Cleanup warning: ${cleanupError.message}`);
              }
            }
            */
            
            return new Response(
              JSON.stringify({ 
                success: true,
                url: step1Url,
                message: `Successfully concatenated 2 videos to ${targetDuration}s using step-by-step method`,
                method: 'step_by_step_2_videos',
                totalDuration: targetDuration,
                videosProcessed: 2,
                tempVideosKept: trimmedVideos.map(v => v.publicId),
                note: "Temp videos kept for testing - cleanup disabled"
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // For 3+ videos, continue with step 2
          if (sortedVideos.length >= 3) {
            const video3 = sortedVideos[2];
            
            console.log(`🔗 Step 2: Adding ${video3.publicId} to result`);
            
            const video3Id = video3.publicId.replace(/\//g, ':');
            
            // Create step 2 by adding third video to step 1 result
            const step2Transformations = [
              'w_1280,h_720,c_pad',
              `l_video:${video3Id},w_1280,h_720,c_pad`,
              'fl_splice',
              'ac_aac',
              'q_auto:good'
            ].join('/');
            
            // Use step1Url as base but we need to reference it properly
            // For now, let's try a simpler approach - direct 3-video concatenation with corrected syntax
            
            console.log('🔄 Attempting direct 3-video concatenation with simplified syntax...');
            
            const video1Id = video1.publicId.replace(/\//g, ':');
            
            const directTransformations = [
              'w_1280,h_720,c_pad',
              `l_video:${video2Id},w_1280,h_720,c_pad`,
              'fl_splice',
              `l_video:${video3Id},w_1280,h_720,c_pad`, 
              'fl_splice',
              'ac_aac',
              'q_auto:good'
            ].join('/');
            
            const finalUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${directTransformations}/${video1.publicId}.mp4`;
            
            console.log('🎯 Final 3-video URL:', finalUrl);
            
            const finalTest = await fetch(finalUrl, { method: 'HEAD' });
            console.log(`📡 Final URL test: ${finalTest.status} ${finalTest.statusText}`);
            
            if (finalTest.ok) {
              console.log('✅ Direct 3-video concatenation successful');
              
              // TEMPORARILY DISABLE CLEANUP to test if temp videos are needed
              console.log('⚠️ TEMP: Skipping cleanup to test if temp videos are needed for processing');
              console.log('🔧 Temp videos will remain in temp_processing folder for testing');
              
              /*
              // Cleanup - DISABLED FOR TESTING
              for (const video of trimmedVideos) {
                try {
                  await cloudinary.uploader.destroy(video.publicId, { resource_type: 'video' });
                } catch (cleanupError) {
                  console.warn(`⚠️ Cleanup warning: ${cleanupError.message}`);
                }
              }
              */
              
              return new Response(
                JSON.stringify({ 
                  success: true,
                  url: finalUrl,
                  message: `Successfully concatenated 3 videos to ${targetDuration}s using direct method`,
                  method: 'direct_3_video_concatenation',
                  totalDuration: targetDuration,
                  videosProcessed: 3,
                  transformations: directTransformations,
                  tempVideosKept: trimmedVideos.map(v => v.publicId),
                  note: "Temp videos kept for testing - cleanup disabled"
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            } else {
              throw new Error(`Direct 3-video concatenation test failed: ${finalTest.status}`);
            }
          }
        } else {
          throw new Error(`Step 1 concatenation test failed: ${step1Test.status}`);
        }
      }
      
      throw new Error('Insufficient videos for concatenation');
      
    } catch (concatenationError) {
      console.error('❌ Step-by-step concatenation failed:', concatenationError.message);
      
      // TEMPORARILY DISABLE ERROR CLEANUP to preserve temp videos for debugging
      console.log('⚠️ TEMP: Preserving temp videos after concatenation error for debugging');
      console.log('🔧 Temp videos available for manual inspection:', trimmedVideos.map(v => v.publicId));
      
      throw new Error(`Concatenation failed: ${concatenationError.message}`);
    }

  } catch (error) {
    console.error('❌ === VIDEO PROCESSING FAILED ===');
    console.error('Error details:', error);
    
    // TEMPORARILY DISABLE ERROR CLEANUP to preserve temp videos for debugging
    console.log('⚠️ TEMP: Skipping error cleanup to preserve temp videos for debugging');
    console.log('🔧 Any created temp videos will remain in temp_processing folder');
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        phase: 'processing_failed',
        note: "Temp videos preserved for debugging - cleanup disabled"
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});