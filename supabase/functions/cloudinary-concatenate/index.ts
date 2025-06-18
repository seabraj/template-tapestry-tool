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

async function waitForAssetAvailability(publicId: string, resourceType: string = 'video', maxAttempts: number = 10): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await cloudinary.api.resource(publicId, { resource_type: resourceType });
      debugLog(`✅ Asset ${publicId} is available (attempt ${attempt})`);
      return true;
    } catch (error) {
      debugLog(`⏳ Asset ${publicId} not ready yet (attempt ${attempt}/${maxAttempts})`);
      if (attempt === maxAttempts) {
        throw new Error(`Asset ${publicId} never became available after ${maxAttempts} attempts`);
      }
      // Wait 2 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return false;
}

async function buildConcatenationUrl(assetIds: string[]): Promise<string> {
  if (assetIds.length === 0) {
    throw new Error('No assets to concatenate');
  }

  if (assetIds.length === 1) {
    // Single video, just return its URL
    return cloudinary.url(assetIds[0], {
      resource_type: 'video',
      transformation: [
        { width: 1920, height: 1080, crop: 'pad', background: 'black' },
        { quality: 'auto:good', audio_codec: 'aac' }
      ]
    });
  }

  // For multiple videos, use the video overlay approach with fl_splice
  const baseVideo = assetIds[0];
  const overlayVideos = assetIds.slice(1);

  const transformations = [];

  // Add each overlay video with fl_splice
  overlayVideos.forEach((videoId, index) => {
    transformations.push({
      overlay: `video:${videoId}`,
      flags: 'splice'
    });
  });

  // Add final formatting
  transformations.push({
    width: 1920,
    height: 1080,
    crop: 'pad',
    background: 'black'
  });

  transformations.push({
    quality: 'auto:good',
    audio_codec: 'aac'
  });

  return cloudinary.url(baseVideo, {
    resource_type: 'video',
    transformation: transformations
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const temporaryAssetIds = new Set<string>();
  try {
    debugLog("=== PRODUCTION VIDEO PROCESSING (IMPROVED CONCATENATION) ===");
    const requestBody = await req.json();
    const { videos, targetDuration } = requestBody;

    if (!videos || videos.length === 0 || !targetDuration || targetDuration <= 0) {
      throw new Error('Invalid request body');
    }

    // ====================================================================
    // PHASE 1: CREATE TRIMMED VIDEOS (Working)
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
      
      debugLog(`Creating trimmed video ${i + 1}/${videos.length}`, {
        originalId: video.publicId,
        trimmedId,
        originalDuration: video.duration,
        proportionalDuration: proportionalDuration.toFixed(6)
      });

      const uploadResult = await cloudinary.uploader.upload(trimmedUrl, {
        resource_type: 'video',
        public_id: trimmedId,
        overwrite: true,
      });
      
      createdAssets.push({ 
        publicId: uploadResult.public_id, 
        order: i,
        proportionalDuration 
      });
    }
    
    debugLog(`--- PHASE 1 COMPLETE: ${createdAssets.length} trimmed assets created. ---`);
    
    // ====================================================================
    // PHASE 1.5: WAIT FOR ASSET AVAILABILITY
    // ====================================================================
    debugLog("--- PHASE 1.5: ENSURING ASSET AVAILABILITY ---");
    const sortedAssets = createdAssets.sort((a, b) => a.order - b.order);
    
    for (const asset of sortedAssets) {
      await waitForAssetAvailability(asset.publicId, 'video');
    }
    
    debugLog("--- PHASE 1.5 COMPLETE: All assets confirmed available ---");
    
    // ====================================================================
    // PHASE 2: CONCATENATE USING IMPROVED METHOD
    // ====================================================================
    debugLog("--- STARTING PHASE 2: IMPROVED CONCATENATION ---");
    
    const publicIdsToConcat = sortedAssets.map(asset => asset.publicId);
    debugLog("Assets to concatenate in order:", publicIdsToConcat);

    // Method A: Try URL-based concatenation first (more reliable)
    try {
      debugLog("Attempting URL-based concatenation...");
      const concatenationUrl = await buildConcatenationUrl(publicIdsToConcat);
      debugLog("Built concatenation URL:", concatenationUrl);

      const finalVideoPublicId = `p2_final_video_${timestamp}`;
      
      const finalVideoResult = await cloudinary.uploader.upload(concatenationUrl, {
        resource_type: 'video',
        public_id: finalVideoPublicId,
        overwrite: true,
        transformation: [
          { quality: 'auto:good' }
        ]
      });

      const finalUrl = finalVideoResult.secure_url;
      debugLog(`--- PHASE 2 COMPLETE: Final video created via URL method. ---`, { 
        finalUrl, 
        public_id: finalVideoPublicId 
      });

      // ====================================================================
      // PHASE 3: CLEANUP
      // ====================================================================
      debugLog("--- STARTING PHASE 3: CLEANUP ---");
      if (temporaryAssetIds.size > 0) {
        const idsToDelete = Array.from(temporaryAssetIds);
        debugLog(`[Phase 3] Deleting ${idsToDelete.length} temporary assets...`, idsToDelete);
        
        try {
          await cloudinary.api.delete_resources(idsToDelete, { resource_type: 'video' });
          debugLog("✅ Cleanup completed successfully");
        } catch (cleanupError) {
          debugLog("⚠️ Cleanup failed, but final video was created successfully:", cleanupError);
        }
      }
      
      // FINAL RESPONSE
      return new Response(JSON.stringify({ 
        success: true, 
        url: finalUrl,
        method: 'url_concatenation',
        stats: {
          inputVideos: videos.length,
          totalOriginalDuration: totalOriginalDuration.toFixed(3),
          targetDuration: targetDuration.toFixed(3),
          trimmedAssets: createdAssets.length
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });

    } catch (urlError) {
      debugLog("❌ URL-based concatenation failed, trying manifest method...", urlError);
      
      // Method B: Fallback to manifest-based concatenation
      try {
        debugLog("Attempting manifest-based concatenation...");
        
        // Create proper manifest content
        const manifestLines = ['# Video Concatenation Manifest'];
        sortedAssets.forEach(asset => {
          manifestLines.push(`file '${asset.publicId}'`);
        });
        const manifestContent = manifestLines.join('\n');
        
        debugLog("Manifest content:", manifestContent);
        
        const manifestPublicId = `p2_manifest_${timestamp}`;
        temporaryAssetIds.add(manifestPublicId);
        
        // Upload manifest as raw text file
        await cloudinary.uploader.upload(`data:text/plain;base64,${btoa(manifestContent)}`, {
          resource_type: 'raw',
          public_id: manifestPublicId,
          overwrite: true,
        });
        
        // Wait for manifest to be available
        await waitForAssetAvailability(manifestPublicId, 'raw');
        
        // Get the manifest URL
        const manifestUrl = cloudinary.url(manifestPublicId, { resource_type: 'raw' });
        
        const finalVideoPublicId = `p2_final_video_${timestamp}`;
        
        // Try using the manifest URL directly
        const finalVideoResult = await cloudinary.uploader.upload(manifestUrl, {
          resource_type: 'video',
          public_id: finalVideoPublicId,
          raw_convert: 'concatenate',
          overwrite: true,
        });

        const finalUrl = finalVideoResult.secure_url;
        debugLog(`--- PHASE 2 COMPLETE: Final video created via manifest method. ---`, { 
          finalUrl, 
          public_id: finalVideoPublicId 
        });

        // Cleanup
        temporaryAssetIds.add(manifestPublicId);
        if (temporaryAssetIds.size > 0) {
          const idsToDelete = Array.from(temporaryAssetIds);
          try {
            await cloudinary.api.delete_resources(idsToDelete.filter(id => id !== finalVideoPublicId), { resource_type: 'video' });
            await cloudinary.api.delete_resources([manifestPublicId], { resource_type: 'raw' });
          } catch (cleanupError) {
            debugLog("⚠️ Cleanup failed:", cleanupError);
          }
        }

        return new Response(JSON.stringify({ 
          success: true, 
          url: finalUrl,
          method: 'manifest_concatenation',
          stats: {
            inputVideos: videos.length,
            totalOriginalDuration: totalOriginalDuration.toFixed(3),
            targetDuration: targetDuration.toFixed(3),
            trimmedAssets: createdAssets.length
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });

      } catch (manifestError) {
        debugLog("❌ Both concatenation methods failed", { urlError, manifestError });
        throw new Error(`Concatenation failed with both methods: URL (${urlError.message}), Manifest (${manifestError.message})`);
      }
    }

  } catch (error) {
    debugLog(`❌ FATAL ERROR`, { message: error.message, stack: error.stack });
    
    if (temporaryAssetIds.size > 0) {
      debugLog(`Attempting cleanup after error...`);
      try {
        await cloudinary.api.delete_resources(Array.from(temporaryAssetIds), { resource_type: 'video' });
      } catch (cleanupError) {
        debugLog("Cleanup after error also failed:", cleanupError);
      }
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      details: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});