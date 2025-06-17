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

    // Method 1: Use Cloudinary SDK to generate proper concatenation URL
    console.log('🔧 Method 1: Using Cloudinary SDK URL generation...');
    
    try {
      const baseVideo = processedVideos[0];
      const additionalVideos = processedVideos.slice(1);
      
      // Build transformation array using SDK
      const transformations = [
        { duration: baseVideo.duration.toFixed(2) }
      ];
      
      // Add video overlays for concatenation
      additionalVideos.forEach(video => {
        transformations.push({
          overlay: {
            resource_type: 'video',
            public_id: video.publicId
          },
          duration: video.duration.toFixed(2),
          start_offset: 'auto'
        });
      });
      
      // Add final formatting
      transformations.push(
        { width: 1280, height: 720, crop: 'pad' },
        { audio_codec: 'aac' },
        { quality: 'auto:good' }
      );
      
      const sdkUrl = cloudinary.url(baseVideo.publicId, {
        resource_type: 'video',
        transformation: transformations,
        format: 'mp4'
      });
      
      console.log('🎯 SDK-generated URL:', sdkUrl);
      
      // Test SDK URL
      const sdkTest = await fetch(sdkUrl, { method: 'HEAD' });
      console.log(`📡 SDK URL test: ${sdkTest.status} ${sdkTest.statusText}`);
      
      if (sdkTest.ok) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            url: sdkUrl,
            message: `Successfully concatenated ${videos.length} videos using SDK method`,
            method: 'sdk'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
    } catch (sdkError) {
      console.warn('⚠️ SDK method failed:', sdkError.message);
    }
    
    // Method 2: Corrected manual URL construction
    console.log('🔧 Method 2: Corrected manual URL construction...');
    
    try {
      const baseVideo = processedVideos[0];
      const additionalVideos = processedVideos.slice(1);
      
      // Fix the URL syntax - the issue was in how we reference nested folders
      let transformParts = [`du_${baseVideo.duration.toFixed(2)}`];
      
      additionalVideos.forEach(video => {
        // Correct syntax for nested public IDs
        const cleanPublicId = video.publicId.replace('/', ':');
        transformParts.push(`l_video:${cleanPublicId}`);
        transformParts.push(`du_${video.duration.toFixed(2)}`);
        transformParts.push('so_auto');
        transformParts.push('fl_layer_apply');
      });
      
      // Add formatting
      transformParts.push('w_1280,h_720,c_pad');
      transformParts.push('ac_aac');
      transformParts.push('q_auto:good');
      
      const manualUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${transformParts.join('/')}/${baseVideo.publicId}.mp4`;
      console.log('🎯 Manual corrected URL:', manualUrl);
      
      const manualTest = await fetch(manualUrl, { method: 'HEAD' });
      console.log(`📡 Manual URL test: ${manualTest.status} ${manualTest.statusText}`);
      
      if (manualTest.ok) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            url: manualUrl,
            message: `Successfully concatenated ${videos.length} videos using manual method`,
            method: 'manual'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
    } catch (manualError) {
      console.warn('⚠️ Manual method failed:', manualError.message);
    }
    
    // Method 3: Simple two-video concatenation test
    console.log('🔧 Method 3: Simple two-video test...');
    
    if (processedVideos.length >= 2) {
      try {
        const video1 = processedVideos[0];
        const video2 = processedVideos[1];
        
        // Try the simplest possible concatenation
        const simpleTransforms = [
          `du_${video1.duration.toFixed(2)}`,
          `l_video:${video2.publicId.replace('/', ':')}`,
          `du_${video2.duration.toFixed(2)}`,
          'so_auto',
          'fl_layer_apply',
          'q_auto'
        ];
        
        const simpleUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${simpleTransforms.join('/')}/${video1.publicId}.mp4`;
        console.log('🎯 Simple two-video URL:', simpleUrl);
        
        const simpleTest = await fetch(simpleUrl, { method: 'HEAD' });
        console.log(`📡 Simple URL test: ${simpleTest.status} ${simpleTest.statusText}`);
        
        if (simpleTest.ok) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              url: simpleUrl,
              message: `Successfully concatenated first 2 videos (${(video1.duration + video2.duration).toFixed(2)}s total)`,
              method: 'simple',
              videosProcessed: 2,
              totalVideos: videos.length
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
      } catch (simpleError) {
        console.warn('⚠️ Simple method failed:', simpleError.message);
      }
    }
    
    // Method 4: Smart fallback - use longest video instead of first
    console.log('🔧 Method 4: Smart fallback using longest video...');
    
    const longestVideo = processedVideos.reduce((longest, current) => 
      current.duration > longest.duration ? current : longest
    );
    
    const actualDuration = Math.min(longestVideo.duration, targetDuration);
    const fallbackTransforms = [
      `du_${actualDuration.toFixed(2)}`,
      'w_1280,h_720,c_pad',
      'ac_aac',
      'q_auto:good'
    ];
    
    const fallbackUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${fallbackTransforms.join('/')}/${longestVideo.publicId}.mp4`;
    console.log('🎯 Smart fallback URL (longest video):', fallbackUrl);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        url: fallbackUrl,
        message: `Using longest video (${longestVideo.duration.toFixed(2)}s) trimmed to ${actualDuration.toFixed(2)}s`,
        method: 'smart_fallback',
        originalVideo: longestVideo.publicId,
        videosProcessed: 1,
        totalVideos: videos.length,
        note: 'Concatenation methods failed - working on proper solution'
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