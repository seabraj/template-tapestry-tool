import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

// ... (CORS headers and Cloudinary config remain the same) ...

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
    console.log('🎬 === DYNAMIC VIDEO CONCATENATION STARTED ===');
    
    const { videos, targetDuration } = await req.json() as ConcatenationRequest;
    
    if (!videos?.length) throw new Error('No videos provided');
    if (!targetDuration || targetDuration <= 0) throw new Error('A valid target duration is required.');

    console.log(`📊 Processing ${videos.length} videos. Target duration: ${targetDuration}s`);
    
    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    if (totalOriginalDuration <= 0) throw new Error('Total duration of source videos is zero.');
    console.log(`⏱️ Total original duration: ${totalOriginalDuration.toFixed(2)}s`);
    
    // 1. SELECT THE BASE VIDEO
    const baseVideo = videos[0];
    const baseVideoProportionalDuration = (baseVideo.duration / totalOriginalDuration) * targetDuration;

    // 2. BUILD THE TRANSFORMATION CHAIN
    const transformations = [
      // Base video transformations (padding and trimming)
      { width: 1280, height: 720, crop: 'pad' },
      { duration: baseVideoProportionalDuration.toFixed(2) },
    ];

    // Add subsequent videos as trimmed overlays, each followed by a splice flag
    for (let i = 1; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;

      // Define the overlay video with its own trim transformation
      const overlayOptions = {
        resource_type: 'video',
        public_id: video.publicId,
        transformation: [
          { width: 1280, height: 720, crop: 'pad' },
          { duration: proportionalDuration.toFixed(2) }
        ]
      };
      
      // Add the overlay and the splice flag
      transformations.push({ overlay: overlayOptions });
      transformations.push({ flags: 'splice' });
    }

    // Add final transformations for the entire resulting video
    transformations.push(
      { audio_codec: 'aac' },
      { quality: 'auto:good' }
    );

    // 3. GENERATE THE FINAL URL
    // The Cloudinary SDK will intelligently construct the complex URL from this array
    const finalUrl = cloudinary.url(baseVideo.publicId, {
      resource_type: 'video',
      transformation: transformations,
      format: 'mp4',
    });
    
    console.log('✅ Concatenation URL generated successfully.');
    console.log('🎯 Final URL:', finalUrl);
    
    // 4. RETURN THE RESULT
    return new Response(
      JSON.stringify({ 
        success: true,
        url: finalUrl,
        message: `Successfully generated URL for ${videos.length} videos.`,
        method: 'dynamic_concatenation'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ === VIDEO PROCESSING FAILED ===');
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