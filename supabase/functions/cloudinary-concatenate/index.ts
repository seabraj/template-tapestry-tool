
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

// CORS headers - comprehensive
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  'Access-Control-Max-Age': '86400',
};

// Cloudinary config
const cloudinaryApiKey = Deno.env.get('CLOUDINARY_API_KEY');
const cloudinaryApiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

if (!cloudinaryApiKey || !cloudinaryApiSecret) {
  throw new Error('Missing Cloudinary API credentials. Please set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET environment variables.');
}

cloudinary.config({
  cloud_name: 'dsxrmo3kt',
  api_key: cloudinaryApiKey,
  api_secret: cloudinaryApiSecret,
  secure: true,
});

// Simple logging
function debugLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(`[${timestamp}] Data:`, JSON.stringify(data, null, 2));
  }
}

// Simple asset wait - based on your working version
async function waitForAssetAvailability(publicId: string, resourceType: string = 'video', maxAttempts: number = 15): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType });
      
      // Additional checks for video processing status
      if (resourceType === 'video' && resource.status && resource.status !== 'complete') {
        debugLog(`⏳ Asset ${publicId} still processing, status: ${resource.status} (attempt ${attempt}/${maxAttempts})`);
        throw new Error(`Asset still processing: ${resource.status}`);
      }
      
      debugLog(`✅ Asset ${publicId} is available (attempt ${attempt})`);
      return true;
    } catch (error) {
      debugLog(`⏳ Asset ${publicId} not ready yet (attempt ${attempt}/${maxAttempts}): ${error.message}`);
      if (attempt === maxAttempts) {
        throw new Error(`Asset ${publicId} never became available after ${maxAttempts} attempts`);
      }
      // Progressive wait times: 2s, 3s, 4s, etc.
      await new Promise(resolve => setTimeout(resolve, 1000 + (attempt * 1000)));
    }
  }
  return false;
}

// Enhanced platform dimensions with safer cropping strategies
function getPlatformDimensions(platform: string) {
  switch (platform?.toLowerCase()) {
    case 'youtube':
      return { 
        width: 1920, 
        height: 1080, 
        crop: 'pad', 
        background: 'black',
        gravity: 'center'
      };
    case 'facebook':
      // For 1:1 from 16:9 source, use smart cropping with center focus
      return { 
        width: 1080, 
        height: 1080, 
        crop: 'fill', 
        gravity: 'center', // More predictable than 'auto'
        quality: 'auto:good'
      };
    case 'instagram':
    case 'instagram_story':
    case 'tiktok':
      // For 9:16 from 16:9 source, crop to center and fill
      return { 
        width: 1080, 
        height: 1920, 
        crop: 'fill', 
        gravity: 'center',
        quality: 'auto:good'
      };
    case 'instagram_post':
      return { 
        width: 1080, 
        height: 1080, 
        crop: 'fill', 
        gravity: 'center',
        quality: 'auto:good'
      };
    default:
      return { 
        width: 1920, 
        height: 1080, 
        crop: 'pad', 
        background: 'black',
        gravity: 'center'
      };
  }
}

// Safer segment creation with fallback strategies
async function createVideoSegment(video: any, index: number, timestamp: number, platformConfig: any, proportionalDuration: number): Promise<string> {
  const segmentId = `segment_${index}_${timestamp}`;
  
  // Primary transformation with enhanced error handling
  const primaryTransformation = [
    { duration: proportionalDuration.toFixed(4) },
    { ...platformConfig }
  ];
  
  const sourceUrl = cloudinary.url(video.publicId, {
    resource_type: 'video',
    transformation: primaryTransformation
  });

  debugLog(`Creating segment ${index + 1}`, { segmentId, sourceUrl, platformConfig });

  try {
    // Attempt primary upload
    const uploadResult = await cloudinary.uploader.upload(sourceUrl, {
      resource_type: 'video',
      public_id: segmentId,
      overwrite: true,
      timeout: 120000, // 2 minute timeout
    });

    return uploadResult.public_id;
  } catch (primaryError) {
    debugLog(`❌ Primary segment creation failed for ${segmentId}:`, primaryError.message);
    
    // Fallback strategy: simpler transformation
    const fallbackTransformation = [
      { duration: proportionalDuration.toFixed(4) },
      { 
        width: platformConfig.width, 
        height: platformConfig.height, 
        crop: 'pad', // Safer than fill
        background: 'black',
        quality: 'auto:good'
      }
    ];
    
    const fallbackUrl = cloudinary.url(video.publicId, {
      resource_type: 'video',
      transformation: fallbackTransformation
    });
    
    debugLog(`🔄 Attempting fallback creation for ${segmentId}`, { fallbackUrl });
    
    try {
      const fallbackResult = await cloudinary.uploader.upload(fallbackUrl, {
        resource_type: 'video',
        public_id: `${segmentId}_fallback`,
        overwrite: true,
        timeout: 120000,
      });

      return fallbackResult.public_id;
    } catch (fallbackError) {
      debugLog(`❌ Fallback segment creation also failed for ${segmentId}:`, fallbackError.message);
      throw new Error(`Both primary and fallback segment creation failed: ${fallbackError.message}`);
    }
  }
}

// Build concatenation URL with platform dimensions
async function buildConcatenationUrl(assetIds: string[], platformConfig: any): Promise<string> {
  if (assetIds.length === 0) {
    throw new Error('No assets to concatenate');
  }

  if (assetIds.length === 1) {
    // Single video, apply platform dimensions
    return cloudinary.url(assetIds[0], {
      resource_type: 'video',
      transformation: [
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

  // Add final quality settings
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
  debugLog('🚀 Edge function called', { method: req.method, url: req.url });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    debugLog('📋 Handling CORS preflight request');
    return new Response('ok', { 
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      status: 200
    });
  }

  if (req.method !== 'POST') {
    debugLog('❌ Method not allowed:', req.method);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Method not allowed' 
    }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  debugLog('✅ Processing POST request - function is now public, no auth required');

  const temporaryAssetIds = new Set<string>();
  try {
    const requestBody = await req.json();
    debugLog('📨 Request body received', requestBody);

    const { videos, targetDuration, platform } = requestBody;

    if (!videos?.length || !targetDuration || !platform) {
      const errorMsg = 'Invalid request: `videos`, `targetDuration`, and `platform` are required.';
      debugLog('❌ Validation failed:', errorMsg);
      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMsg 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    debugLog("🚀 PROCESSING START", { videoCount: videos.length, targetDuration, platform });
    const timestamp = Date.now();
    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const platformConfig = getPlatformDimensions(platform);
    
    debugLog("📐 Platform configuration", { platform, config: platformConfig });

    // ====================================================================
    // PHASE 1: Create Trimmed & Cropped Video Segments with Enhanced Error Handling
    // ====================================================================
    debugLog("--- PHASE 1: Creating trimmed and cropped segments ---");
    const segmentPromises = videos.map(async (video, i) => {
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      
      try {
        const publicId = await createVideoSegment(video, i, timestamp, platformConfig, proportionalDuration);
        temporaryAssetIds.add(publicId);
        return { publicId, order: i };
      } catch (error) {
        debugLog(`❌ Failed to create segment ${i}:`, error.message);
        throw new Error(`Failed to create video segment ${i + 1}: ${error.message}`);
      }
    });

    const createdSegments = await Promise.all(segmentPromises);
    debugLog("--- PHASE 1 COMPLETE ---", { count: createdSegments.length });

    // ====================================================================
    // PHASE 2: Wait for Asset Availability with Enhanced Checks
    // ====================================================================
    debugLog("--- PHASE 2: Ensuring asset availability ---");
    const sortedSegments = createdSegments.sort((a, b) => a.order - b.order);
    for (const asset of sortedSegments) {
      await waitForAssetAvailability(asset.publicId);
    }
    debugLog("--- PHASE 2 COMPLETE ---");

    // ====================================================================
    // PHASE 3: Concatenate using URL-based method
    // ====================================================================
    debugLog("--- PHASE 3: Concatenating segments ---");
    const finalVideoPublicId = `final_video_${timestamp}`;
    
    const publicIdsToConcat = sortedSegments.map(asset => asset.publicId);
    debugLog("Assets to concatenate in order:", publicIdsToConcat);

    try {
      debugLog("Attempting URL-based concatenation...");
      const concatenationUrl = await buildConcatenationUrl(publicIdsToConcat, platformConfig);
      debugLog("Built concatenation URL:", concatenationUrl);

      const finalVideoResult = await cloudinary.uploader.upload(concatenationUrl, {
        resource_type: 'video',
        public_id: finalVideoPublicId,
        overwrite: true,
        timeout: 180000, // 3 minute timeout for final video
        transformation: [
          { quality: 'auto:good' }
        ]
      });

      const finalUrl = finalVideoResult.secure_url;
      debugLog("--- PHASE 3 COMPLETE: Final video created via URL method ---", { 
        finalUrl, 
        public_id: finalVideoPublicId 
      });

      if (!finalUrl) {
        throw new Error("URL-based concatenation failed to produce a final URL.");
      }

      // ====================================================================
      // PHASE 4: CLEANUP (before sending response)
      // ====================================================================
      if (temporaryAssetIds.size > 0) {
        debugLog("--- CLEANUP: Deleting temporary assets ---", { ids: Array.from(temporaryAssetIds) });
        try {
          // Delete assets one by one to avoid bulk delete issues
          for (const assetId of temporaryAssetIds) {
            try {
              await cloudinary.uploader.destroy(assetId, { resource_type: 'video' });
              debugLog(`✅ Deleted ${assetId}`);
            } catch (deleteError) {
              debugLog(`⚠️ Failed to delete ${assetId}:`, deleteError.message);
            }
          }
          debugLog("✅ Cleanup completed");
        } catch (cleanupError) {
          debugLog("⚠️ Cleanup failed but processing succeeded", cleanupError);
        }
      }

      // ====================================================================
      // FINAL RESPONSE
      // ====================================================================
      debugLog("🎉 SUCCESS: Returning final response", { finalUrl });
      return new Response(JSON.stringify({ success: true, url: finalUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } catch (urlError) {
      debugLog("❌ URL-based concatenation failed", urlError);
      throw new Error(`Concatenation failed: ${urlError.message}`);
    }

  } catch (error) {
    debugLog("❌ FATAL ERROR", { message: error.message, stack: error.stack });
    
    // Cleanup on error (safely)
    if (temporaryAssetIds.size > 0) {
      debugLog("--- CLEANUP ON ERROR: Deleting temporary assets ---", { ids: Array.from(temporaryAssetIds) });
      // Don't wait for cleanup on error - just fire and forget
      for (const assetId of temporaryAssetIds) {
        cloudinary.uploader.destroy(assetId, { resource_type: 'video' }).catch(err => {
          debugLog(`⚠️ Failed to delete ${assetId} during error cleanup:`, err.message);
        });
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
