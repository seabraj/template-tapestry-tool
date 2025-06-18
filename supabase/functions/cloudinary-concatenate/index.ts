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
    debugLog("=== PRODUCTION VIDEO PROCESSING (EXPLICIT MANIFEST) ===");
    const requestBody = await req.json();
    const { videos, targetDuration } = requestBody;

    if (!videos || videos.length === 0 || !targetDuration || targetDuration <= 0) {
      throw new Error('Invalid request body');
    }

    // ====================================================================
    // PHASE 1: CREATE TRIMMED VIDEOS (Unchanged and Working)
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
    // PHASE 2: CONCATENATE USING A VIDEO MANIFEST (Corrected)
    // ====================================================================
    debugLog("--- STARTING PHASE 2: MANIFEST CONCATENATION ---");
    const sortedAssets = createdAssets.sort((a, b) => a.order - b.order);
    const publicIdsToConcat = sortedAssets.map(asset => ({ public_id: asset.publicId }));

    const manifestTransformation = {
        transformation: [
            { width: 1920, height: 1080, crop: 'pad' },
            { audio_codec: 'aac', quality: 'auto:good' }
        ],
        format: 'mp4'
    };
    
    // 1. Generate the manifest string content
    const manifestContent = cloudinary.utils.generate_video_concatenation_manifest(publicIdsToConcat);
    debugLog(`[Phase 2] Generated manifest content`, { manifestContent });

    // 2. Upload the manifest content as a new asset
    const manifestPublicId = `p2_manifest_${timestamp}`;
    temporaryAssetIds.add(manifestPublicId);
    
    await cloudinary.uploader.upload(`data:text/plain;base64,${btoa(manifestContent)}`, {
        resource_type: 'raw',
        public_id: manifestPublicId,
        overwrite: true,
    });
    debugLog(`[Phase 2] Uploaded manifest file to Cloudinary with public_id: ${manifestPublicId}`);

    // 3. Create the final video by applying a transformation to the manifest
    const finalVideoPublicId = `p2_final_video_${timestamp}`;
    
    // Using `explicit` is the correct, documented way to create a derived asset from a manifest.
    const finalVideoResult = await cloudinary.uploader.explicit(manifestPublicId, {
        type: 'concatenate',
        resource_type: 'video',
        public_id: finalVideoPublicId,
        transformation: manifestTransformation
    });

    const finalUrl = finalVideoResult.secure_url;
    debugLog(`--- PHASE 2 COMPLETE: Final video created. ---`, { finalUrl, public_id: finalVideoPublicId });

    // ====================================================================
    // PHASE 3: CLEANUP
    // ====================================================================
    debugLog("--- STARTING PHASE 3: CLEANUP ---");
    if (temporaryAssetIds.size > 0) {
      const idsToDelete = Array.from(temporaryAssetIds);
      debugLog(`[Phase 3] Deleting ${idsToDelete.length} temporary assets...`, idsToDelete);
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
    if (temporaryAssetIds.size > 0) {
        debugLog(`Attempting cleanup after error...`);
        cloudinary.api.delete_resources(Array.from(temporaryAssetIds), { resource_type: 'video' });
        cloudinary.api.delete_resources(Array.from(temporaryAssetIds).filter(id => id.startsWith("p2_manifest")), { resource_type: 'raw' });
    }
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});