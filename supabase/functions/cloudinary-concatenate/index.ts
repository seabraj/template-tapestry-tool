import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

// CORS headers - simplified and explicit
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cloudinary config
cloudinary.config({
  cloud_name: 'dsxrmo3kt',
  api_key: Deno.env.get('CLOUDINARY_API_KEY'),
  api_secret: Deno.env.get('CLOUDINARY_API_SECRET'),
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
      // Wait 2 seconds before retrying - same as your working version
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return false;
}

// Platform dimensions
function getPlatformDimensions(platform: string) {
  switch (platform) {
    case 'youtube':
      return { width: 1920, height: 1080, crop: 'pad', background: 'black' };
    case 'instagram':
      return { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' };
    case 'instagram_story':
      return { width: 1080, height: 1920, crop: 'fill', gravity: 'auto' };
    default:
      return { width: 1920, height: 1080, crop: 'pad', background: 'black' };
  }
}

// Build concatenation URL - from your working version
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      status: 200
    });
  }

  const temporaryAssetIds = new Set<string>();
  try {
    const { videos, targetDuration, platform } = await req.json();

    if (!videos?.length || !targetDuration || !platform) {
      throw new Error('Invalid request: `videos`, `targetDuration`, and `platform` are required.');
    }
    
    debugLog("🚀 PROCESSING START", { videoCount: videos.length, targetDuration, platform });
    const timestamp = Date.now();
    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const platformConfig = getPlatformDimensions(platform);

    // ====================================================================
    // PHASE 1: Create Trimmed & Cropped Video Segments
    // ====================================================================
    debugLog("--- PHASE 1: Creating trimmed and cropped segments ---");
    const segmentPromises = videos.map(async (video, i) => {
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const segmentId = `segment_${i}_${timestamp}`;
      temporaryAssetIds.add(segmentId);

      // This transformation both trims the video and applies the platform's frame
      const transformation = [
        { duration: proportionalDuration.toFixed(4) },
        { ...platformConfig }
      ];

      const sourceUrl = cloudinary.url(video.publicId, {
        resource_type: 'video',
        transformation: transformation
      });

      debugLog(`Creating segment ${i + 1}`, { segmentId, sourceUrl });

      const uploadResult = await cloudinary.uploader.upload(sourceUrl, {
        resource_type: 'video',
        public_id: segmentId,
        overwrite: true,
      });

      return { publicId: uploadResult.public_id, order: i };
    });

    const createdSegments = await Promise.all(segmentPromises);
    debugLog("--- PHASE 1 COMPLETE ---", { count: createdSegments.length });

    // ====================================================================
    // PHASE 2: Wait for Asset Availability
    // ====================================================================
    debugLog("--- PHASE 2: Ensuring asset availability ---");
    const sortedSegments = createdSegments.sort((a, b) => a.order - b.order);
    for (const asset of sortedSegments) {
      await waitForAssetAvailability(asset.publicId);
    }
    debugLog("--- PHASE 2 COMPLETE ---");

    // ====================================================================
    // PHASE 3: Concatenate Segments with Splice
    // ====================================================================
    debugLog("--- PHASE 3: Concatenating segments ---");
    const finalVideoPublicId = `final_video_${timestamp}`;
    const baseVideoId = sortedSegments[0].publicId;

    const concatTransformation = sortedSegments.slice(1).map(segment => ({
      overlay: `video:${segment.publicId}`,
      flags: "splice"
    }));
    
    // Final formatting transformation
    concatTransformation.push({ ...platformConfig });
    concatTransformation.push({ quality: 'auto', audio_codec: 'aac' });


    const finalVideoResult = await cloudinary.uploader.explicit(baseVideoId, {
      type: 'upload',
      resource_type: 'video',
      public_id: finalVideoPublicId,
      overwrite: true,
      eager: [{ transformation: concatTransformation }]
    });

    const finalUrl = finalVideoResult.eager?.[0]?.secure_url || finalVideoResult.secure_url;
    
    if (!finalUrl) {
      throw new Error("Concatenation failed to produce a final URL.");
    }
    
    debugLog("--- PHASE 3 COMPLETE ---", { finalUrl });

    // ====================================================================
    // FINAL RESPONSE
    // ====================================================================
    return new Response(JSON.stringify({ success: true, url: finalUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    debugLog("❌ FATAL ERROR", { message: error.message, stack: error.stack });
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
      if (temporaryAssetIds.size > 0) {
          debugLog("--- CLEANUP: Deleting temporary assets ---", { ids: Array.from(temporaryAssetIds) });
          cloudinary.api.delete_resources(Array.from(temporaryAssetIds), { resource_type: 'video' }).catch(err => {
              debugLog("⚠️ Cleanup failed", err);
          });
      }
  }
});
