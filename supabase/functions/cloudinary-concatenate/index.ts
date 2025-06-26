
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

// Create text overlay transformation for full video duration minus 3s
function createTextOverlay(customization: any, platformConfig: any, targetDuration: number) {
  if (!customization?.supers?.text) return null;
  
  const { text, position, style } = customization.supers;
  
  // Calculate font size based on platform dimensions
  const baseFontSize = Math.min(platformConfig.width, platformConfig.height) * 0.06;
  
  let textColor = 'white';
  
  // Determine text position
  let gravity = 'center';
  let yOffset = 0;
  
  if (position === 'top') {
    gravity = 'north';
    yOffset = Math.round(platformConfig.height * 0.1);
  } else if (position === 'bottom') {
    gravity = 'south';
    yOffset = Math.round(platformConfig.height * 0.1);
  }
  
  // Apply text overlay for full duration minus 3 seconds (for end frame)
  const overlayEndTime = Math.max(targetDuration - 3, 0);
  
  return {
    overlay: {
      font_family: 'Arial',
      font_size: Math.round(baseFontSize),
      font_weight: style === 'bold' ? 'bold' : 'normal',
      text: text
    },
    color: textColor,
    gravity: gravity,
    y: yOffset,
    start_offset: 0,
    end_offset: overlayEndTime
  };
}

// Create end frame overlay elements (logo + text) for last 3 seconds
function createEndFrameOverlays(customization: any, platformConfig: any, targetDuration: number) {
  const overlays = [];
  const startTime = Math.max(targetDuration - 3, 0);
  
  if (customization?.endFrame?.enabled) {
    // Add logo overlay for last 3 seconds
    const logoSize = Math.min(platformConfig.width, platformConfig.height) * 0.15;
    
    if (customization.endFrame.logoPosition === 'center') {
      overlays.push({
        overlay: 'branding/itmatters_logo',
        width: Math.round(logoSize),
        gravity: 'center',
        y: -50,
        start_offset: startTime,
        end_offset: targetDuration
      });
    } else {
      overlays.push({
        overlay: 'branding/itmatters_logo',
        width: Math.round(logoSize * 0.7),
        gravity: 'north_east',
        x: 20,
        y: 20,
        start_offset: startTime,
        end_offset: targetDuration
      });
    }
    
    // Add end frame text overlay for last 3 seconds
    if (customization.endFrame.text) {
      const fontSize = Math.min(platformConfig.width, platformConfig.height) * 0.05;
      overlays.push({
        overlay: {
          font_family: 'Arial',
          font_size: Math.round(fontSize),
          font_weight: 'bold',
          text: customization.endFrame.text
        },
        color: 'white',
        gravity: 'center',
        y: customization.endFrame.logoPosition === 'center' ? 100 : 0,
        start_offset: startTime,
        end_offset: targetDuration
      });
    }
  }
  
  return overlays;
}

// Create CTA overlay for last 3 seconds
function createCTAOverlay(customization: any, platformConfig: any, targetDuration: number) {
  if (!customization?.cta?.enabled || !customization?.cta?.text) return null;
  
  const { text, style } = customization.cta;
  const fontSize = Math.min(platformConfig.width, platformConfig.height) * 0.04;
  const startTime = Math.max(targetDuration - 3, 0);
  
  if (style === 'button') {
    return {
      overlay: {
        font_family: 'Arial',
        font_size: Math.round(fontSize),
        font_weight: 'bold',
        text: text
      },
      color: 'white',
      gravity: 'south',
      y: Math.round(platformConfig.height * 0.15),
      background: 'blue',
      start_offset: startTime,
      end_offset: targetDuration
    };
  } else if (style === 'text') {
    return {
      overlay: {
        font_family: 'Arial',
        font_size: Math.round(fontSize),
        font_weight: 'bold',
        text: text
      },
      color: 'white',
      gravity: 'south',
      y: Math.round(platformConfig.height * 0.1),
      start_offset: startTime,
      end_offset: targetDuration
    };
  } else if (style === 'animated') {
    return {
      overlay: {
        font_family: 'Arial',
        font_size: Math.round(fontSize),
        font_weight: 'bold',
        text: `${text} ✨`
      },
      color: 'white',
      gravity: 'south',
      y: Math.round(platformConfig.height * 0.15),
      background: 'purple',
      start_offset: startTime,
      end_offset: targetDuration
    };
  }
  
  return null;
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

// Build concatenation URL with customization overlays applied correctly
async function buildConcatenationUrl(assetIds: string[], platformConfig: any, customization: any, targetDuration: number): Promise<string> {
  if (assetIds.length === 0) {
    throw new Error('No assets to concatenate');
  }

  const transformations = [];

  // Phase 1: Add text overlay for full video duration minus 3 seconds
  const textOverlay = createTextOverlay(customization, platformConfig, targetDuration);
  if (textOverlay) {
    debugLog('Adding text overlay for duration', { startOffset: textOverlay.start_offset, endOffset: textOverlay.end_offset });
    transformations.push(textOverlay);
  }

  // Phase 2: Handle video concatenation
  if (assetIds.length === 1) {
    // Single video - no splicing needed
    debugLog('Single video detected, no splicing required');
  } else {
    // Multiple videos - use the video overlay approach with fl_splice
    const overlayVideos = assetIds.slice(1);
    debugLog('Multiple videos detected, adding splice overlays', { overlayVideos });

    // Add each overlay video with fl_splice
    overlayVideos.forEach((videoId, index) => {
      transformations.push({
        overlay: `video:${videoId}`,
        flags: 'splice'
      });
    });
  }

  // Phase 3: Add end frame overlays for last 3 seconds
  const endFrameOverlays = createEndFrameOverlays(customization, platformConfig, targetDuration);
  if (endFrameOverlays.length > 0) {
    debugLog('Adding end frame overlays for last 3 seconds', { count: endFrameOverlays.length });
    endFrameOverlays.forEach(overlay => {
      transformations.push(overlay);
    });
  }

  // Phase 4: Add CTA overlay for last 3 seconds
  const ctaOverlay = createCTAOverlay(customization, platformConfig, targetDuration);
  if (ctaOverlay) {
    debugLog('Adding CTA overlay for last 3 seconds', { startOffset: ctaOverlay.start_offset, endOffset: ctaOverlay.end_offset });
    transformations.push(ctaOverlay);
  }

  // Phase 5: Add final quality settings
  transformations.push({
    quality: 'auto:good',
    audio_codec: 'aac'
  });

  const baseVideo = assetIds[0];
  debugLog('Building final concatenation URL', { baseVideo, transformationCount: transformations.length });

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

    const { videos, targetDuration, platform, customization } = requestBody;

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
    
    debugLog("🚀 PROCESSING START WITH FIXED CUSTOMIZATION", { videoCount: videos.length, targetDuration, platform, hasCustomization: !!customization });
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
    // PHASE 3: Concatenate with Fixed Customization Overlays
    // ====================================================================
    debugLog("--- PHASE 3: Concatenating segments with FIXED customization overlays ---");
    const finalVideoPublicId = `final_video_${timestamp}`;
    
    const publicIdsToConcat = sortedSegments.map(asset => asset.publicId);
    debugLog("Assets to concatenate in order:", publicIdsToConcat);

    try {
      debugLog("Attempting URL-based concatenation with FIXED customization overlays...");
      const concatenationUrl = await buildConcatenationUrl(
        publicIdsToConcat, 
        platformConfig, 
        customization, 
        targetDuration
      );
      debugLog("Built concatenation URL with fixed overlays:", concatenationUrl);

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
      debugLog("--- PHASE 3 COMPLETE: Final video created with FIXED customization ---", { 
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
      debugLog("🎉 SUCCESS: Returning final response with FIXED customization", { finalUrl });
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
