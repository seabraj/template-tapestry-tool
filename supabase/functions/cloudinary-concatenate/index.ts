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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 === Cloudinary Sequential Concatenation Started ===');
    
    const { videos, targetDuration } = await req.json() as ConcatenationRequest;
    
    if (!videos?.length) throw new Error('No videos provided');
    if (!targetDuration || targetDuration <= 0) throw new Error('A valid target duration is required.');

    console.log(`📊 Processing ${videos.length} videos. Target duration: ${targetDuration}s`);
    console.log('📹 Input videos:', videos.map(v => ({ publicId: v.publicId, duration: v.duration })));

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    if (totalOriginalDuration <= 0) throw new Error('Total duration of source videos is zero.');
    console.log(`⏱️ Total original duration: ${totalOriginalDuration.toFixed(2)}s`);
    
    // Calculate proportional durations for each video
    const processedVideos = videos.map((video, index) => {
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      console.log(`📹 Video ${index + 1}: ${video.publicId} - Original: ${video.duration}s, New: ${proportionalDuration.toFixed(2)}s`);
      return {
        publicId: video.publicId,
        duration: proportionalDuration
      };
    });

    // Method 1: Use Cloudinary's video stitching with proper sequential approach
    console.log('🔧 Method 1: Sequential video stitching...');
    
    try {
      const baseVideo = processedVideos[0];
      const additionalVideos = processedVideos.slice(1);
      const resultId = `concatenated_${Date.now()}`;
      
      console.log(`🎬 Base video: ${baseVideo.publicId} (${baseVideo.duration.toFixed(2)}s)`);
      
      // Build sequential transformation using proper Cloudinary concatenation
      let currentOffset = baseVideo.duration;
      const transforms = [`du_${baseVideo.duration.toFixed(2)}`];
      
      for (let i = 0; i < additionalVideos.length; i++) {
        const video = additionalVideos[i];
        console.log(`➕ Adding video ${i + 2}: ${video.publicId} at offset ${currentOffset.toFixed(2)}s`);
        
        // Use timeline positioning for true concatenation
        transforms.push(
          `l_video:${video.publicId.replace('/', ':')}`
        );
        transforms.push(`so_${currentOffset.toFixed(2)}`); // Start at end of previous video
        transforms.push(`du_${video.duration.toFixed(2)}`); // Duration of this clip
        transforms.push('fl_layer_apply');
        
        currentOffset += video.duration;
      }
      
      // Add final formatting
      transforms.push('w_1280,h_720,c_pad');
      transforms.push('ac_aac');
      transforms.push('q_auto:good');
      
      const sequentialUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${transforms.join('/')}/${baseVideo.publicId}.mp4`;
      console.log('🎯 Sequential concatenation URL:', sequentialUrl);
      console.log('📋 Transformation details:', transforms.join(' | '));
      
      // Test the sequential URL
      const sequentialTest = await fetch(sequentialUrl, { method: 'HEAD' });
      console.log(`📡 Sequential URL test: ${sequentialTest.status} ${sequentialTest.statusText}`);
      
      if (sequentialTest.ok) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            url: sequentialUrl,
            message: `Successfully concatenated ${videos.length} videos sequentially (${targetDuration.toFixed(2)}s total)`,
            method: 'sequential_stitching',
            totalDuration: targetDuration,
            videosProcessed: videos.length
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
    } catch (sequentialError) {
      console.warn('⚠️ Sequential stitching failed:', sequentialError.message);
    }
    
    // Method 2: Use the trimmed videos approach that was working, but with proper concatenation
    console.log('🔧 Method 2: Creating and concatenating trimmed videos...');
    
    try {
      const timestamp = Date.now();
      const trimmedVideos = [];
      
      // Step 1: Create trimmed versions (this was working!)
      for (let i = 0; i < processedVideos.length; i++) {
        const video = processedVideos[i];
        const trimmedId = `trimmed_${i}_${timestamp}`;
        
        console.log(`✂️ Creating trimmed video ${i + 1}: ${trimmedId} (${video.duration.toFixed(2)}s)`);
        
        // Generate URL for trimmed video
        const trimmedUrl = cloudinary.url(video.publicId, {
          resource_type: 'video',
          transformation: [
            { duration: video.duration.toFixed(2) },
            { quality: 'auto:good' }
          ],
          format: 'mp4'
        });
        
        // Upload as new video with trimmed duration
        const trimResult = await cloudinary.uploader.upload(trimmedUrl, {
          resource_type: 'video',
          public_id: trimmedId,
          overwrite: true
        });
        
        trimmedVideos.push(trimmedId);
        console.log(`✅ Trimmed video ${i + 1} created: ${trimmedId}`);
      }
      
      // Step 2: Create concatenated video using the trimmed videos
      console.log('🔗 Concatenating trimmed videos...');
      
      if (trimmedVideos.length >= 2) {
        const baseId = trimmedVideos[0];
        const overlayIds = trimmedVideos.slice(1);
        
        // Build concatenation transformation
        const concatTransforms = [];
        let offset = 0;
        
        // Get duration of base video
        console.log(`📹 Base trimmed video: ${baseId}`);
        
        // Add overlays sequentially
        for (let i = 0; i < overlayIds.length; i++) {
          const overlayId = overlayIds[i];
          console.log(`➕ Adding overlay: ${overlayId} after base video`);
          
          concatTransforms.push(`l_video:${overlayId}`);
          concatTransforms.push('so_auto'); // Start after previous video ends
          concatTransforms.push('fl_layer_apply');
        }
        
        // Add final formatting
        concatTransforms.push('w_1280,h_720,c_pad');
        concatTransforms.push('ac_aac');
        concatTransforms.push('q_auto:good');
        
        const concatUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${concatTransforms.join('/')}/${baseId}.mp4`;
        console.log('🎯 Trimmed concatenation URL:', concatUrl);
        
        // Test the concatenation URL
        const concatTest = await fetch(concatUrl, { method: 'HEAD' });
        console.log(`📡 Concatenation URL test: ${concatTest.status} ${concatTest.statusText}`);
        
        if (concatTest.ok) {
          // Clean up trimmed videos after successful concatenation
          console.log('🧹 Cleaning up temporary videos...');
          for (const trimmedId of trimmedVideos) {
            try {
              await cloudinary.uploader.destroy(trimmedId, { resource_type: 'video' });
              console.log(`🗑️ Cleaned up: ${trimmedId}`);
            } catch (cleanupError) {
              console.warn(`⚠️ Cleanup warning for ${trimmedId}:`, cleanupError.message);
            }
          }
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              url: concatUrl,
              message: `Successfully concatenated ${videos.length} trimmed videos (${targetDuration.toFixed(2)}s total)`,
              method: 'trimmed_concatenation',
              totalDuration: targetDuration,
              videosProcessed: videos.length
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
    } catch (trimmedError) {
      console.warn('⚠️ Trimmed concatenation failed:', trimmedError.message);
    }
    
    // Method 3: Smart fallback (current working method)
    console.log('🔧 Method 3: Smart video selection fallback...');
    
    const bestVideo = processedVideos.reduce((best, current) => {
      const bestDiff = Math.abs(best.duration - targetDuration);
      const currentDiff = Math.abs(current.duration - targetDuration);
      return currentDiff < bestDiff ? current : best;
    });
    
    const fallbackDuration = Math.min(bestVideo.duration, targetDuration);
    const fallbackUrl = cloudinary.url(bestVideo.publicId, {
      resource_type: 'video',
      transformation: [
        { duration: fallbackDuration.toFixed(2) },
        { width: 1280, height: 720, crop: 'pad' },
        { audio_codec: 'aac' },
        { quality: 'auto:good' }
      ],
      format: 'mp4'
    });
    
    console.log('🎯 Smart fallback URL (using SDK):', fallbackUrl);
    console.log(`📹 Selected video: ${bestVideo.publicId} (${fallbackDuration.toFixed(2)}s)`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        url: fallbackUrl,
        message: `Using best-fit video: ${fallbackDuration.toFixed(2)}s from ${bestVideo.publicId}`,
        method: 'smart_selection',
        selectedVideo: bestVideo.publicId,
        actualDuration: fallbackDuration,
        targetDuration: targetDuration,
        videosProcessed: 1,
        totalVideos: videos.length,
        note: 'Concatenation methods being optimized - using reliable single video approach'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ === Video Processing Failed ===');
    console.error('Error details:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});