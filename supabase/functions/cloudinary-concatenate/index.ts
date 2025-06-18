import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

cloudinary.config({
  cloud_name: 'dsxrmo3kt',
  api_key: Deno.env.get('CLOUDINARY_API_KEY'),
  api_secret: Deno.env.get('CLOUDINARY_API_SECRET'),
  secure: true,
});

function debugLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(`[${timestamp}] Data:`, JSON.stringify(data, null, 2));
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    debugLog("=== PRODUCTION VIDEO PROCESSING ===");
    const requestBody = await req.json();
    debugLog("Request received", requestBody);
    
    const { videos, targetDuration } = requestBody;

    if (!videos || videos.length === 0 || !targetDuration || targetDuration <= 0) {
      throw new Error('Invalid request body: Missing videos or targetDuration.');
    }
    if (!videos.every(v => v.duration && v.duration > 0)) {
        throw new Error(`All videos must have an exact duration provided.`);
    }

    // ====================================================================
    // --- PHASE 1: CREATE TRIMMED VIDEOS ---
    // ====================================================================
    debugLog("--- STARTING PHASE 1: CREATE TRIMMED VIDEOS ---");

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const createdAssets = [];

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `final_trimmed_${i}_${timestamp}`;
      
      const trimmedUrl = cloudinary.url(video.publicId, {
        resource_type: 'video',
        transformation: [{ duration: proportionalDuration.toFixed(6) }]
      });
      
      const uploadResult = await cloudinary.uploader.upload(trimmedUrl, {
        resource_type: 'video',
        public_id: trimmedId,
        overwrite: true,
      });

      createdAssets.push({
        publicId: uploadResult.public_id,
        duration: proportionalDuration,
        order: i
      });
    }

    debugLog(`--- PHASE 1 COMPLETE: ${createdAssets.length} trimmed assets created. ---`, createdAssets);
    
    // ====================================================================
    // --- PHASE 2: CONCATENATE TRIMMED VIDEOS (REVISED LOGIC) ---
    // ====================================================================
    debugLog("--- STARTING PHASE 2: CONCATENATE VIDEOS ---");

    if (createdAssets.length === 0) throw new Error("Phase 1 did not produce any videos to concatenate.");

    const sortedAssets = createdAssets.sort((a, b) => a.order - b.order);
    const baseVideo = sortedAssets[0];
    
    // Start with an empty transformation array for the base video.
    // We will apply sizing to the entire chain at the end.
    const transformationParts = [];

    // Loop through the rest of the videos to build the splice chain
    for (let i = 1; i < sortedAssets.length; i++) {
        const overlayVideo = sortedAssets[i];
        const overlayPublicId = overlayVideo.publicId.replace(/\//g, ':');
        
        // For each subsequent video, create a sized overlay and splice it.
        transformationParts.push(`l_video:${overlayPublicId},w_1280,h_720,c_pad`);
        transformationParts.push('fl_splice');
    }

    // Now, prepend the overall sizing and append the final encoding transformations.
    // This ensures the entire concatenated result is sized correctly.
    transformationParts.unshift('w_1280,h_720,c_pad');
    transformationParts.push('ac_aac', 'q_auto:good');

    const transformationString = transformationParts.join('/');
    const finalConcatenatedUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${transformationString}/${baseVideo.publicId}.mp4`;

    debugLog(`--- PHASE 2 COMPLETE: Concatenation URL generated. ---`, { finalUrl: finalConcatenatedUrl });

    // ====================================================================
    // --- FINAL RESPONSE ---
    // ====================================================================
    const finalResponse = { 
        success: true,
        message: `Phase 2: Concatenation successful.`,
        phase: 2,
        url: finalConcatenatedUrl,
        createdAssets: createdAssets,
        stats: {
          totalCreated: createdAssets.length,
          targetDuration: targetDuration,
          actualTotalDuration: createdAssets.reduce((sum, asset) => sum + asset.duration, 0)
        }
    };
    
    return new Response(JSON.stringify(finalResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
    });

  } catch (error) {
    debugLog(`❌ FATAL ERROR`, { message: error.message, stack: error.stack });
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});