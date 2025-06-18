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
    debugLog("=== PRODUCTION VIDEO PROCESSING (MANIFEST V4 - FINAL) ===");
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
    // PHASE 2: CONCATENATE USING A VIDEO MANIFEST
    // ====================================================================
    debugLog("--- STARTING PHASE 2: MANIFEST CONCATENATION ---");
    const sortedAssets = createdAssets.sort((a, b) => a.order - b.order);
    const publicIdsToConcat = sortedAssets.map(asset => asset.publicId);

    const manifestContent = `v:1\n${publicIdsToConcat.join('\n')}`;
    const manifestPublicId = `p2_manifest_${timestamp}.vtt`;
    temporaryAssetIds.add(manifestPublicId);
    
    await cloudinary.uploader.upload(`data:text/plain;base64,${btoa(manifestContent)}`, {
        resource_type: 'raw',
        public_id: manifestPublicId,
        overwrite: true,
    });
    debugLog(`[Phase 2] Uploaded manifest file: ${manifestPublicId}`);

    // --- THE FINAL FIX IS HERE ---
    // Generate the final video URL by applying transformations TO the manifest file.
    // This tells Cloudinary to stitch the videos in the manifest into a single mp4.
    const finalUrl = cloudinary.url(manifestPublicId, {
        resource_type: 'video', // We request a 'video' despite the source being a 'raw' manifest
        transformation: [
            { width: 1920, height: 1080, crop: 'pad' },
            { audio_codec: 'aac', quality: 'auto:good' }
        ],
        format: 'mp4'
    });
    debugLog(`--- PHASE 2 COMPLETE: Final video URL generated. ---`, { finalUrl });

    // ====================================================================
    // PHASE 3: CLEANUP (Re-enabled)
    // ====================================================================
    debugLog("--- STARTING PHASE 3: CLEANUP ---");
    if (temporaryAssetIds.size > 0) {
      const idsToDelete = Array.from(temporaryAssetIds);
      debugLog(`[Phase 3] Deleting ${idsToDelete.length} temporary assets...`, idsToDelete);
      // Run cleanup in the background without waiting for it to finish
      cloudinary.api.delete_resources(idsToDelete, { resource_type: 'video' });
      cloudinary.api.delete_resources([manifestPublicId], { resource_type: 'raw' });
    }
    
    // FINAL RESPONSE
    return new Response(JSON.stringify({ success: true, url: finalUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
    });

  } catch (error) {
    debugLog(`❌ FATAL ERROR`, { message: error.message, stack: error.stack });
    // Attempt to clean up any created assets even if an error occurs
    if (temporaryAssetIds.size > 0) {
        debugLog(`Attempting cleanup after error...`);
        cloudinary.api.delete_resources(Array.from(temporaryAssetIds), { resource_type: 'video' });
    }
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});