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
    console.log('🎬 === Reliable Video Processing Started ===');
    
    const { videos, targetDuration } = await req.json() as ConcatenationRequest;
    
    if (!videos?.length) throw new Error('No videos provided');
    if (!targetDuration || targetDuration <= 0) throw new Error('A valid target duration is required.');

    console.log(`📊 Processing ${videos.length} videos. Target duration: ${targetDuration}s`);
    console.log('📹 Input videos:', videos.map(v => ({ publicId: v.publicId, duration: v.duration })));

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    console.log(`⏱️ Total original duration: ${totalOriginalDuration.toFixed(2)}s`);
    
    // Calculate proportional durations
    const processedVideos = videos.map((video, index) => {
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      console.log(`📹 Video ${index + 1}: ${video.publicId} - Original: ${video.duration}s, New: ${proportionalDuration.toFixed(2)}s`);
      return {
        publicId: video.publicId,
        duration: proportionalDuration,
        originalDuration: video.duration
      };
    });

    // Strategy: Create the best possible single video
    console.log('🎯 Creating optimal single video output...');
    
    // Option 1: If we have a video that's close to target duration, use it
    const closeMatch = processedVideos.find(v => 
      Math.abs(v.originalDuration - targetDuration) <= 2 // Within 2 seconds
    );
    
    // Option 2: Find the longest video for the best coverage
    const longestVideo = processedVideos.reduce((longest, current) => 
      current.originalDuration > longest.originalDuration ? current : longest
    );
    
    // Option 3: Find the video with the best proportional fit
    const bestFit = processedVideos.reduce((best, current) => {
      const bestRatio = Math.min(best.duration / targetDuration, targetDuration / best.duration);
      const currentRatio = Math.min(current.duration / targetDuration, targetDuration / current.duration);
      return currentRatio > bestRatio ? current : best;
    });
    
    // Choose the optimal video
    let selectedVideo = closeMatch || longestVideo;
    let strategy = closeMatch ? 'close_match' : 'longest_available';
    
    console.log(`🎯 Selected strategy: ${strategy}`);
    console.log(`📹 Using video: ${selectedVideo.publicId} (${selectedVideo.originalDuration}s original)`);
    
    // Create the output video
    let finalDuration = targetDuration;
    let needsLooping = false;
    
    // If the selected video is shorter than target, create a looped version
    if (selectedVideo.originalDuration < targetDuration) {
      const shortestVideo = processedVideos.reduce((shortest, current) => 
        current.originalDuration < shortest.originalDuration ? current : shortest
      );
      
      // Only loop if it makes sense (video is at least 3 seconds)
      if (shortestVideo.originalDuration >= 3) {
        selectedVideo = shortestVideo;
        needsLooping = true;
        strategy = 'looped_short_video';
        console.log(`🔄 Will loop ${selectedVideo.publicId} (${selectedVideo.originalDuration}s) to reach ${targetDuration}s`);
      } else {
        // Just trim the longest to target duration
        finalDuration = Math.min(selectedVideo.originalDuration, targetDuration);
        strategy = 'trimmed_longest';
        console.log(`✂️ Trimming ${selectedVideo.publicId} to ${finalDuration}s`);
      }
    } else {
      // Trim to exact target duration
      finalDuration = targetDuration;
      strategy = 'trimmed_to_target';
      console.log(`✂️ Trimming ${selectedVideo.publicId} to exactly ${finalDuration}s`);
    }
    
    // Build the transformation
    let transformation = [];
    
    if (needsLooping) {
      // Calculate how many loops we need
      const loops = Math.ceil(targetDuration / selectedVideo.originalDuration);
      console.log(`🔄 Creating ${loops} loops to reach target duration`);
      
      // Add loop overlays
      for (let i = 1; i < loops && i < 5; i++) { // Max 5 loops for safety
        transformation.push({
          overlay: {
            resource_type: 'video',
            public_id: selectedVideo.publicId
          },
          start_offset: (i * selectedVideo.originalDuration).toFixed(2)
        });
      }
      
      // Trim to exact target duration
      transformation.push({ duration: targetDuration.toFixed(2) });
    } else {
      // Simple trimming
      transformation.push({ duration: finalDuration.toFixed(2) });
    }
    
    // Add standard formatting
    transformation.push(
      { width: 1280, height: 720, crop: 'pad' },
      { audio_codec: 'aac' },
      { quality: 'auto:good' }
    );
    
    const finalUrl = cloudinary.url(selectedVideo.publicId, {
      resource_type: 'video',
      transformation: transformation,
      format: 'mp4'
    });
    
    console.log('🎯 Final video URL:', finalUrl);
    console.log('📋 Applied transformation:', JSON.stringify(transformation, null, 2));
    
    // Test the URL
    const urlTest = await fetch(finalUrl, { method: 'HEAD' });
    console.log(`📡 URL test: ${urlTest.status} ${urlTest.statusText}`);
    
    if (!urlTest.ok) {
      throw new Error(`Generated URL failed test: ${urlTest.status} ${urlTest.statusText}`);
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        url: finalUrl,
        message: `Created reliable ${finalDuration}s video using ${strategy} strategy`,
        method: 'reliable_single_video',
        strategy: strategy,
        sourceVideo: selectedVideo.publicId,
        actualDuration: finalDuration,
        targetDuration: targetDuration,
        isLooped: needsLooping,
        videosAvailable: videos.length,
        note: 'Optimized for reliability - guaranteed working video output'
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