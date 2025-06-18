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

// Helper function to create a delay
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const temporaryAssetIds = new Set<string>();
  try {
    debugLog("=== PRODUCTION VIDEO PROCESSING (ITERATIVE + DELAY) ===");
    const requestBody = await req.json();
    const { videos, targetDuration } = requestBody;

    if (!videos || videos.length === 0 || !targetDuration || targetDuration <= 0) {
      throw new Error('Invalid request body');
    }

    // ====================================================================
    // PHASE 1: CREATE TRIMMED VIDEOS
    // ====================================================================
    debugLog("--- STARTING PHASE 1: CREATE TRIMMED VIDEOS ---");
    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const createdAssets = [];
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `p1_trimmed_${i}_${timestamp}`;
      temporaryAssetIds.add(trimmedId);

      const trimmedUrl = cloudinary.url(video.publicId, {
        resource_type: 'video',
        transformation: [{ duration: proportionalDuration.toFixed(6) }]
      });
      
      const uploadResult = await cloudinary.uploader.upload(trimmedUrl, {
        resource_type: 'video',
        public_id: trimmedId,
        overwrite: true,
      });
      createdAssets.push({ publicId: uploadResult.public_id, order: i });
    }
    debugLog(`--- PHASE 1 COMPLETE: ${createdAssets.length} trimmed assets created. ---`);
    
    // ====================================================================
    // PHASE 2: ITERATIVE CONCATENATION
    // ====================================================================
    debugLog("--- STARTING PHASE 2: ITERATIVE CONCATENATION ---");
    const sortedAssets = createdAssets.sort((a, b) => a.order - b.order);
    
    let baseVideoId = sortedAssets[0].publicId;

    for (let i = 1; i < sortedAssets.length; i++) {
      const overlayVideoId = sortedAssets[i].publicId;
      debugLog(`[Phase 2] Iteration ${i}: Preparing to concatenate ${baseVideoId} + ${overlayVideoId}`);
      
      const concatUrl = cloudinary.url(baseVideoId, {
          resource_type: 'video',
          transformation: [
              { width: 1280, height: 720, crop: 'pad' },
              { overlay: `video:${overlayVideoId.replace(/\//g, ':')}`, width: 1280, height: 720, crop: 'pad' },
              { flags: 'splice' }
          ],
          format: 'mp4'
      });
      
      const newPublicId = `p2_intermediate_${i-1}_${timestamp}`;
      temporaryAssetIds.add(newPublicId);
      
      const result = await cloudinary.uploader.upload(concatUrl, {
          resource_type: 'video',
          public_id: newPublicId,
          overwrite: true,
      });
      
      baseVideoId = result.public_id;
      debugLog(`[Phase 2] Iteration ${i}: Created intermediate asset ${baseVideoId}.`);
      
      // --- THE FIX: Wait for 5 seconds before the next loop ---
      // This gives Cloudinary time to propagate the new asset across its system.
      debugLog(`[Phase 2] Waiting for 5 seconds for asset to propagate...`);
      await delay(5000); // 5 second delay
    }

    const finalVideoPublicId = baseVideoId;
    const finalUrl = cloudinary.url(finalVideoPublicId, {
        resource_type: 'video',
        transformation: [{ audio_codec: 'aac', quality: 'auto:good' }]
    });

    debugLog(`--- PHASE 2 COMPLETE: Final video is ${finalVideoPublicId} ---`, { finalUrl });

    // ====================================================================
    // PHASE 3: CLEANUP
    // ====================================================================
    debugLog("--- STARTING PHASE 3: CLEANUP ---");
    temporaryAssetIds.delete(finalVideoPublicId);
    if (temporaryAssetIds.size > 0) {
      const idsToDelete = Array.from(temporaryAssetIds);
      debugLog(`[Phase 3] Deleting ${idsToDelete.length} temporary assets...`, idsToDelete);
      await cloudinary.api.delete_resources(idsToDelete, { resource_type: 'video' });
    }
    
    // FINAL RESPONSE
    return new Response(JSON.stringify({ success: true, url: finalUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
    });

  } catch (error) {
    debugLog(`❌ FATAL ERROR`, { message: error.message, stack: error.stack });
    if (temporaryAssetIds.size > 0) {
        debugLog(`Attempting cleanup after error...`);
        await cloudinary.api.delete_resources(Array.from(temporaryAssetIds), { resource_type: 'video' });
    }
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});