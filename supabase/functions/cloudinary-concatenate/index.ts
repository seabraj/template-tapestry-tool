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

  const temporaryAssetIds = new Set<string>();
  try {
    debugLog("=== PRODUCTION VIDEO PROCESSING (ITERATIVE) ===");
    const requestBody = await req.json();
    const { videos, targetDuration } = requestBody;

    if (!videos || videos.length === 0 || !targetDuration || targetDuration <= 0) {
      throw new Error('Invalid request body');
    }

    // ====================================================================
    // --- PHASE 1: CREATE TRIMMED VIDEOS (WORKING) ---
    // ====================================================================
    debugLog("--- STARTING PHASE 1: CREATE TRIMMED VIDEOS ---");
    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const createdAssets = [];
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `p1_trimmed_${i}_${timestamp}`;
      temporaryAssetIds.add(trimmedId); // Add to cleanup list

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
    // --- PHASE 2: ITERATIVE CONCATENATION ---
    // ====================================================================
    debugLog("--- STARTING PHASE 2: ITERATIVE CONCATENATION ---");
    const sortedAssets = createdAssets.sort((a, b) => a.order - b.order);
    
    let baseVideoId = sortedAssets[0].publicId;

    for (let i = 1; i < sortedAssets.length; i++) {
      const overlayVideoId = sortedAssets[i].publicId;
      debugLog(`[Phase 2] Iteration ${i}: Concatenating ${baseVideoId} + ${overlayVideoId}`);
      
      const transformation = [
        { width: 1280, height: 720, crop: 'pad' },
        { overlay: `video:${overlayVideoId.replace(/\//g, ':')}`, width: 1280, height: 720, crop: 'pad' },
        { flags: 'splice' }
      ];

      const newPublicId = `p2_intermediate_${i-1}_${timestamp}`;
      temporaryAssetIds.add(newPublicId); // Add intermediate to cleanup list
      
      const result = await cloudinary.uploader.explicit(baseVideoId, {
          type: 'upload',
          resource_type: 'video',
          public_id: newPublicId,
          transformation: transformation,
          format: 'mp4'
      });
      
      baseVideoId = result.public_id; // The new base is the result of the last concatenation
      debugLog(`[Phase 2] Iteration ${i}: Created intermediate asset ${baseVideoId}`);
    }

    const finalVideoPublicId = baseVideoId;
    const finalUrl = cloudinary.url(finalVideoPublicId, {
        resource_type: 'video',
        transformation: [{ audio_codec: 'aac', quality: 'auto:good' }]
    });

    debugLog(`--- PHASE 2 COMPLETE: Final video is ${finalVideoPublicId} ---`, { finalUrl });

    // ====================================================================
    // --- PHASE 3: CLEANUP ---
    // ====================================================================
    debugLog("--- STARTING PHASE 3: CLEANUP ---");
    // We want to delete all temporary assets EXCEPT the final one.
    temporaryAssetIds.delete(finalVideoPublicId);
    
    if (temporaryAssetIds.size > 0) {
      const idsToDelete = Array.from(temporaryAssetIds);
      debugLog(`[Phase 3] Deleting ${idsToDelete.length} temporary assets...`, idsToDelete);
      await cloudinary.api.delete_resources(idsToDelete, { resource_type: 'video' });
      debugLog(`[Phase 3] Cleanup complete.`);
    } else {
      debugLog(`[Phase 3] No temporary assets to clean up.`);
    }

    // ====================================================================
    // --- FINAL RESPONSE ---
    // ====================================================================
    const finalResponse = { 
        success: true,
        message: `All phases complete. Final video created successfully.`,
        url: finalUrl,
    };
    
    return new Response(JSON.stringify(finalResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
    });

  } catch (error) {
    debugLog(`❌ FATAL ERROR`, { message: error.message, stack: error.stack });
    // In case of error, try to clean up any assets that were created.
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