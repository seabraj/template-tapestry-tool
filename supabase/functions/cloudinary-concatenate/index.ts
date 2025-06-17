import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Configure Cloudinary Admin API ---
try {
  cloudinary.config({
    cloud_name: 'dsxrmo3kt', // Your cloud name
    api_key: Deno.env.get('CLOUDINARY_API_KEY'),
    api_secret: Deno.env.get('CLOUDINARY_API_SECRET'),
    secure: true,
  });
  console.log('✅ Cloudinary SDK configured successfully.');
} catch(e) {
  console.error('❌ Failed to configure Cloudinary SDK. Ensure API Key and Secret are set in Supabase environment variables.', e);
}


interface ConcatenationRequest {
  publicIds: string[];
  targetDuration: number;
}

interface VideoInfo {
  publicId: string;
  duration: number;
  url: string;
}

// --- FINAL, ROBUST FUNCTION TO FETCH VIDEO DETAILS ---
async function fetchVideoInfo(publicIds: string[]): Promise<VideoInfo[]> {
  console.log('📡 Fetching video information using Cloudinary Admin API...');
  
  const videoInfos: VideoInfo[] = [];
  
  for (const publicId of publicIds) {
    try {
      // THE FIX: Use `cinemagraph_analysis: true` to force full video metadata retrieval.
      const result = await cloudinary.api.resource(publicId, { 
        resource_type: 'video',
        cinemagraph_analysis: true 
      });

      const duration = result.duration;

      if (!duration || typeof duration !== 'number') {
         throw new Error(`Duration not found in API response for ${publicId}.`);
      }

      const roundedDuration = Math.round(duration * 100) / 100;
      console.log(`📹 Video ${publicId}: ${roundedDuration}s duration (from API)`);
      
      videoInfos.push({
        publicId: publicId,
        duration: roundedDuration,
        url: result.secure_url,
      });

    } catch (error) {
      console.warn(`⚠️ Error fetching info for ${publicId} from Admin API:`, error.message);
      throw new Error(`Failed to get metadata for video ${publicId}.`);
    }
  }
  return videoInfos;
}


serve(async (req) => {
  // Standard OPTIONS request handling
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 === Cloudinary Video Concatenation Started ===');
    
    const { publicIds, targetDuration } = await req.json() as ConcatenationRequest;
    const cloudName = 'dsxrmo3kt';
    
    if (!publicIds?.length) throw new Error('No video public IDs provided');
    if (!targetDuration || targetDuration <= 0) throw new Error('A valid target duration is required.');

    console.log(`📊 Processing ${publicIds.length} videos. Target duration: ${targetDuration}s`);

    // Fetch video info with the corrected API call
    const videoInfos = await fetchVideoInfo(publicIds);
    const totalOriginalDuration = videoInfos.reduce((sum, v) => sum + v.duration, 0);
    console.log(`⏱️ Total original duration: ${totalOriginalDuration.toFixed(2)}s`);

    // --- Build Transformation URL ---
    let transformations = [ 'w_1280,h_720,c_pad,q_auto:good' ];

    // Determine the final duration of the video
    const finalDuration = Math.min(totalOriginalDuration, targetDuration);

    // Add the first video as the base layer, trimmed proportionally
    const firstVideo = videoInfos[0];
    const firstVideoTrimmedDuration = (firstVideo.duration / totalOriginalDuration) * finalDuration;
    transformations.push(`l_video:${firstVideo.publicId}`);
    transformations.push(`du_${firstVideoTrimmedDuration.toFixed(2)}`);
    transformations.push('fl_layer_apply');
    
    // Add subsequent videos as trimmed and spliced overlays
    for (let i = 1; i < videoInfos.length; i++) {
        const video = videoInfos[i];
        const trimmedDuration = (video.duration / totalOriginalDuration) * finalDuration;
        transformations.push(`l_video:${video.publicId}`);
        transformations.push('fl_splice');
        transformations.push(`du_${trimmedDuration.toFixed(2)}`);
        transformations.push('fl_layer_apply');
    }
    
    // To create a final video from layers, we use a base canvas.
    // The final URL is constructed with comma-separated transformations.
    const finalUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/e_colorize,co_black/w_1,h_1/f_mp4/canvas.mp4`;
    console.log('🎯 Final URL generated:', finalUrl);

    return new Response(
      JSON.stringify({
        success: true,
        url: finalUrl,
        message: `Successfully processed ${publicIds.length} videos.`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ === Cloudinary Concatenation Failed ===');
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});