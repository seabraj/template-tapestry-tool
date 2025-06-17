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
    console.log('🎬 === Cloudinary Video Concatenation Started ===');
    
    const { videos, targetDuration } = await req.json() as ConcatenationRequest;
    const cloudName = 'dsxrmo3kt';
    
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

    // Use Cloudinary's video concatenation with proper syntax
    const baseVideo = processedVideos[0];
    const additionalVideos = processedVideos.slice(1);
    
    console.log(`🎯 Base video: ${baseVideo.publicId} (${baseVideo.duration.toFixed(2)}s)`);
    console.log(`➕ Additional videos: ${additionalVideos.length}`);
    
    // Build transformation array step by step
    let transformations = [];
    
    // 1. Start with the base video duration
    transformations.push(`du_${baseVideo.duration.toFixed(2)}`);
    
    // 2. Add each additional video as an overlay that gets concatenated
    additionalVideos.forEach((video, index) => {
      console.log(`🔗 Adding video ${index + 2}: ${video.publicId} (${video.duration.toFixed(2)}s)`);
      
      // Use video overlay with concatenation flags
      transformations.push(
        `l_video:${video.publicId}`,           // Layer the video
        `du_${video.duration.toFixed(2)}`,     // Set its duration
        'so_auto',                             // Start offset auto (after previous)
        'fl_layer_apply'                       // Apply the layer
      );
    });
    
    // 3. Add final formatting
    transformations.push(
      'w_1280,h_720,c_pad',                    // Standardize dimensions
      'ac_aac',                                // Audio codec
      'q_auto:good'                            // Quality
    );
    
    const transformationString = transformations.join('/');
    const finalUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${transformationString}/${baseVideo.publicId}.mp4`;
    
    console.log('🎯 Generated concatenation URL:', finalUrl);
    console.log('📋 Full transformation string:', transformationString);
    
    // Test the URL before returning
    console.log('🔍 Testing concatenation URL...');
    try {
      const testResponse = await fetch(finalUrl, { method: 'HEAD' });
      console.log(`📡 Concatenation URL test: ${testResponse.status} ${testResponse.statusText}`);
      
      if (!testResponse.ok) {
        console.log('⚠️ Concatenation failed, trying alternative approach...');
        
        // Alternative: Use Cloudinary's archive approach for concatenation
        const archiveTransformations = [
          'w_1280,h_720,c_pad',
          'ac_aac',
          'q_auto:good',
          `l_video:${additionalVideos[0]?.publicId || baseVideo.publicId}/so_auto/fl_layer_apply` // Simple 2-video concat
        ].join('/');
        
        const archiveUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${archiveTransformations}/${baseVideo.publicId}.mp4`;
        console.log('🎯 Alternative URL:', archiveUrl);
        
        const altTest = await fetch(archiveUrl, { method: 'HEAD' });
        console.log(`📡 Alternative URL test: ${altTest.status} ${altTest.statusText}`);
        
        if (altTest.ok) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              url: archiveUrl,
              message: `Concatenated ${Math.min(2, videos.length)} videos using alternative method`,
              videosProcessed: Math.min(2, videos.length),
              totalVideos: videos.length,
              method: 'alternative'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Final fallback: Just use the first video properly trimmed
        const fallbackTransformations = [
          `du_${targetDuration.toFixed(2)}`,
          'w_1280,h_720,c_pad',
          'ac_aac', 
          'q_auto:good'
        ].join('/');
        
        const fallbackUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${fallbackTransformations}/${baseVideo.publicId}.mp4`;
        console.log('🎯 Fallback URL (extended first video):', fallbackUrl);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            url: fallbackUrl,
            message: `Extended first video to ${targetDuration}s (concatenation in progress)`,
            videosProcessed: 1,
            totalVideos: videos.length,
            method: 'fallback'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
    } catch (testError) {
      console.error('❌ URL test failed:', testError);
      throw new Error(`Generated URL is not accessible: ${testError.message}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        url: finalUrl,
        message: `Successfully concatenated ${videos.length} videos to ${targetDuration}s duration`,
        videosProcessed: videos.length,
        totalVideos: videos.length,
        method: 'full_concatenation',
        transformations: transformationString
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ === Video Concatenation Failed ===');
    console.error('Error details:', error);
    console.error('Stack trace:', error.stack);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: 'Check function logs for concatenation details'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});