import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Import the Cloudinary SDK
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Configure Cloudinary Admin API ---
// This uses the environment variables you set in the Supabase Dashboard
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
  platform?: string;
  targetDuration?: number;
}

interface VideoInfo {
  publicId: string;
  duration: number;
  url: string;
}

// --- NEW, ROBUST FUNCTION TO FETCH VIDEO DETAILS ---
async function fetchVideoInfo(publicIds: string[]): Promise<VideoInfo[]> {
  console.log('📡 Fetching video information using Cloudinary Admin API...');
  
  const videoInfos: VideoInfo[] = [];
  
  for (const publicId of publicIds) {
    try {
      // Use the SDK to get resource details
      const result = await cloudinary.api.resource(publicId, { resource_type: 'video' });
      const duration = Math.round(result.duration * 100) / 100;

      if (!duration) {
         throw new Error('Duration not available in API response.');
      }

      console.log(`📹 Video ${publicId}: ${duration}s duration (from API)`);
      videoInfos.push({
        publicId: publicId,
        duration: duration,
        url: result.secure_url,
      });

    } catch (error) {
      console.warn(`⚠️ Error fetching info for ${publicId} from Admin API:`, error.message);
      console.warn('Falling back to 10s default duration for this video.');
      videoInfos.push({
        publicId: publicId,
        duration: 10, // Keep a fallback, but it should not be hit if credentials are correct
        url: `https://res.cloudinary.com/dsxrmo3kt/video/upload/${publicId}.mp4`
      });
    }
  }
  return videoInfos;
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 === Cloudinary Video Concatenation Started ===');
    
    const requestData: ConcatenationRequest = await req.json();
    const { publicIds, targetDuration } = requestData;
    const cloudName = 'dsxrmo3kt';
    
    if (!publicIds?.length) throw new Error('No video public IDs provided');

    console.log(`📊 Processing ${publicIds.length} videos. Target duration: ${targetDuration || 'auto'}s`);

    // This now calls the new, robust function
    const videoInfos = await fetchVideoInfo(publicIds);
    console.log('📹 Video info fetched:', videoInfos.map(v => `${v.publicId}: ${v.duration}s`));

    const totalOriginalDuration = videoInfos.reduce((sum, v) => sum + v.duration, 0);
    console.log(`⏱️ Total original duration: ${totalOriginalDuration.toFixed(2)}s`);


    // --- Proportional Trimming Calculation ---
    // This is the core logic your tool needs
    let transformations = [];
    let builtFromScratch = false;

    // Check if trimming is actually needed
    if (targetDuration && targetDuration < totalOriginalDuration) {
        console.log('🔄 Applying proportional trimming to all clips.');
        transformations.push('w_1280,h_720,c_pad,q_auto:good'); // Example base transformation for consistency

        // First video is the base layer
        const firstVideo = videoInfos[0];
        const firstVideoTrimmedDuration = (firstVideo.duration / totalOriginalDuration) * targetDuration;
        transformations.push(`l_video:${firstVideo.publicId},du_${firstVideoTrimmedDuration.toFixed(2)},fl_layer_apply`);
        
        // Add subsequent videos as overlays
        for (let i = 1; i < videoInfos.length; i++) {
            const video = videoInfos[i];
            const trimmedDuration = (video.duration / totalOriginalDuration) * targetDuration;
            // Splice this video, trimmed to its proportional duration
            transformations.push(`l_video:${video.publicId},du_${trimmedDuration.toFixed(2)},fl_splice,fl_layer_apply`);
        }
        builtFromScratch = true;
    } else {
        // If no trimming is needed, just concatenate them as is
        console.log('🔗 Concatenating all clips without trimming.');
        transformations.push('w_1280,h_720,c_pad,q_auto:good');

        // Add first video
        transformations.push(`l_video:${videoInfos[0].publicId},fl_layer_apply`);
        // Splice subsequent videos
        for (let i = 1; i < videoInfos.length; i++) {
            transformations.push(`l_video:${videoInfos[i].publicId},fl_splice,fl_layer_apply`);
        }
        builtFromScratch = true;
    }
    
    // To create a video from layers, you must use a base canvas, like a color source
    // The public ID at the end of the URL is the base layer.
    const finalUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join('/')}/e_colorize,co_black/w_1,h_1/f_mp4/canvas.mp4`;
    console.log('🎯 Final URL generated:', finalUrl);

    // Test the generated URL
    const isUrlValid = await testUrl(finalUrl);
    if (!isUrlValid) {
        console.error('❌ The final generated URL is not valid. Returning error.');
        throw new Error('Failed to generate a valid video URL after processing.');
    }

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

async function testUrl(url: string): Promise<boolean> {
  try {
    console.log('🔍 Testing URL:', url);
    const response = await fetch(url, { method: 'HEAD' });
    console.log(`📊 URL test result: ${response.status}`);
    // A 400 bad request might still be "ok" during generation, but 404 is a real error
    return response.status < 404; 
  } catch (error) {
    console.log('❌ URL test failed:', error);
    return false;
  }
}