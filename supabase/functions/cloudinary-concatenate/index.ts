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
      return { 
        width: 1080, 
        height: 1080, 
        crop: 'fill', 
        gravity: 'center',
        quality: 'auto:good'
      };
    case 'instagram':
    case 'instagram_story':
    case 'tiktok':
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

// Simple asset wait with better error handling
async function waitForAssetAvailability(publicId: string, resourceType: string = 'video', maxAttempts: number = 10): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType });
      
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
      await new Promise(resolve => setTimeout(resolve, 2000 + (attempt * 1000)));
    }
  }
  return false;
}

// Simplified segment creation with better error handling
async function createVideoSegment(video: any, index: number, timestamp: number, platformConfig: any, proportionalDuration: number): Promise<string> {
  const segmentId = `segment_${index}_${timestamp}`;
  
  try {
    // Create transformation for this segment
    const transformation = [
      { duration: proportionalDuration.toFixed(4) },
      { ...platformConfig }
    ];
    
    const sourceUrl = cloudinary.url(video.publicId, {
      resource_type: 'video',
      transformation: transformation
    });

    debugLog(`Creating segment ${index + 1}`, { segmentId, sourceUrl });

    const uploadResult = await cloudinary.uploader.upload(sourceUrl, {
      resource_type: 'video',
      public_id: segmentId,
      overwrite: true,
      timeout: 120000,
    });

    debugLog(`✅ Segment ${segmentId} created successfully`);
    return uploadResult.public_id;
  } catch (error) {
    debugLog(`❌ Failed to create segment ${segmentId}:`, error.message);
    throw new Error(`Failed to create video segment ${index + 1}: ${error.message}`);
  }
}

// Simplified concatenation without complex overlays initially
async function concatenateVideoSegments(segmentIds: string[], timestamp: number): Promise<string> {
  const concatenatedId = `concatenated_${timestamp}`;
  
  try {
    if (segmentIds.length === 1) {
      // Single video - just copy it
      const copyResult = await cloudinary.uploader.upload(
        cloudinary.url(segmentIds[0], { resource_type: 'video' }),
        {
          resource_type: 'video',
          public_id: concatenatedId,
          overwrite: true,
          timeout: 180000,
        }
      );
      return copyResult.public_id;
    }
    
    // Multiple videos - use splice method
    const transformations = [];
    
    // Add overlay videos with splice flag
    segmentIds.slice(1).forEach((segmentId) => {
      transformations.push({
        overlay: `video:${segmentId}`,
        flags: 'splice'
      });
    });
    
    // Add final quality settings
    transformations.push({
      quality: 'auto:good',
      audio_codec: 'aac'
    });
    
    const concatenationUrl = cloudinary.url(segmentIds[0], {
      resource_type: 'video',
      transformation: transformations
    });
    
    debugLog('Concatenating segments', { baseVideo: segmentIds[0], overlayCount: segmentIds.length - 1 });
    
    const result = await cloudinary.uploader.upload(concatenationUrl, {
      resource_type: 'video',
      public_id: concatenatedId,
      overwrite: true,
      timeout: 180000,
    });
    
    debugLog(`✅ Concatenation completed: ${concatenatedId}`);
    return result.public_id;
  } catch (error) {
    debugLog(`❌ Concatenation failed:`, error.message);
    throw new Error(`Video concatenation failed: ${error.message}`);
  }
}

// Apply customization overlays to the concatenated video
async function applyCustomizationOverlays(baseVideoId: string, customization: any, platformConfig: any, targetDuration: number, timestamp: number): Promise<{publicId: string, url: string}> {
  const finalVideoId = `final_video_${timestamp}`;
  
  try {
    const transformationParts = [];
    
    // Phase 1: Add text overlay for full video duration minus 3 seconds
    if (customization?.supers?.text) {
      const { text, position, style } = customization.supers;
      const baseFontSize = Math.min(platformConfig.width, platformConfig.height) * 0.06;
      
      let gravity = 'center';
      let yOffset = 0;
      
      if (position === 'top') {
        gravity = 'north';
        yOffset = Math.round(platformConfig.height * 0.1);
      } else if (position === 'bottom') {
        gravity = 'south';
        yOffset = Math.round(platformConfig.height * 0.1);
      }
      
      const textEndTime = Math.max(targetDuration - 3, 0);
      const fontWeight = style === 'bold' ? 'bold' : 'normal';
      const encodedText = encodeURIComponent(text);
      
      if (textEndTime > 0) {
        // Text overlay with time limits
        transformationParts.push(`l_text:Arial_${Math.round(baseFontSize)}_${fontWeight}:${encodedText},co_white,g_${gravity},y_${yOffset},so_0,eo_${textEndTime}`);
      } else {
        // Text overlay for full duration
        transformationParts.push(`l_text:Arial_${Math.round(baseFontSize)}_${fontWeight}:${encodedText},co_white,g_${gravity},y_${yOffset}`);
      }
      
      debugLog('Added text overlay transformation', { text, duration: textEndTime > 0 ? `0-${textEndTime}s` : 'full video' });
    }
    
    // Phase 2: Add end frame elements for last 3 seconds
    const startTime = Math.max(targetDuration - 3, 0);
    
    if (customization?.endFrame?.enabled && startTime < targetDuration) {
      const logoSize = Math.min(platformConfig.width, platformConfig.height) * 0.15;
      
      // Add logo
      if (customization.endFrame.logoPosition === 'center') {
        transformationParts.push(`l_branding:itmatters_logo,w_${Math.round(logoSize)},g_center,y_-50,so_${startTime},eo_${targetDuration}`);
      } else {
        transformationParts.push(`l_branding:itmatters_logo,w_${Math.round(logoSize * 0.7)},g_north_east,x_20,y_20,so_${startTime},eo_${targetDuration}`);
      }
      
      // Add end frame text
      if (customization.endFrame.text) {
        const fontSize = Math.min(platformConfig.width, platformConfig.height) * 0.05;
        const yPos = customization.endFrame.logoPosition === 'center' ? 100 : 0;
        const encodedEndText = encodeURIComponent(customization.endFrame.text);
        transformationParts.push(`l_text:Arial_${Math.round(fontSize)}_bold:${encodedEndText},co_white,g_center,y_${yPos},so_${startTime},eo_${targetDuration}`);
      }
      
      debugLog('Added end frame elements with logo', { duration: `${startTime}-${targetDuration}s` });
    }
    
    // Phase 3: Add CTA overlay for last 3 seconds - simplified approach with emojis
    if (customization?.cta?.enabled && customization?.cta?.text && startTime < targetDuration) {
      const { text, style } = customization.cta;
      const fontSize = Math.min(platformConfig.width, platformConfig.height) * 0.04;
      const yPos = Math.round(platformConfig.height * 0.15);
      
      let ctaText = text;
      if (style === 'button') {
        ctaText = `🔵 ${text} 🔵`;
      } else if (style === 'animated') {
        ctaText = `✨ ${text} ✨`;
      }
      
      const encodedCtaText = encodeURIComponent(ctaText);
      transformationParts.push(`l_text:Arial_${Math.round(fontSize)}_bold:${encodedCtaText},co_white,g_south,y_${yPos},so_${startTime},eo_${targetDuration}`);
      
      debugLog('Added CTA overlay', { text, style, duration: `${startTime}-${targetDuration}s` });
    }
    
    // Only proceed if we have transformations to apply
    if (transformationParts.length === 0) {
      debugLog('⚠️ No overlays to apply, returning base video');
      const fallbackUrl = cloudinary.url(baseVideoId, {
        resource_type: 'video',
        transformation: [{ quality: 'auto:good' }]
      });
      return { publicId: baseVideoId, url: fallbackUrl };
    }
    
    // Join all transformation parts with forward slashes
    const transformationString = transformationParts.join('/');
    
    debugLog('Final transformation string', { transformationString });
    
    // Create the transformation URL
    const transformationUrl = cloudinary.url(baseVideoId, {
      resource_type: 'video',
      transformation: transformationString
    });
    
    debugLog('Generated transformation URL', { transformationUrl });
    
    const result = await cloudinary.uploader.upload(transformationUrl, {
      resource_type: 'video',
      public_id: finalVideoId,
      overwrite: true,
      timeout: 180000,
    });
    
    debugLog(`✅ Customization applied successfully: ${finalVideoId}`);
    return { publicId: finalVideoId, url: result.secure_url };
  } catch (error) {
    debugLog(`❌ Customization overlay failed:`, error.message);
    // Return the base concatenated video as fallback
    const fallbackUrl = cloudinary.url(baseVideoId, {
      resource_type: 'video',
      transformation: [{ quality: 'auto:good' }]
    });
    debugLog(`⚠️ Returning fallback video without customization`);
    return { publicId: baseVideoId, url: fallbackUrl };
  }
}

serve(async (req) => {
  debugLog('🚀 Edge function called', { method: req.method, url: req.url });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    debugLog('📋 Handling CORS preflight request');
    return new Response('ok', { 
      headers: corsHeaders,
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

  const temporaryAssetIds = new Set<string>();
  let finalVideoId: string | null = null;
  
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
    
    debugLog("🚀 PROCESSING START WITH SIMPLIFIED APPROACH", { 
      videoCount: videos.length, 
      targetDuration, 
      platform, 
      hasCustomization: !!customization 
    });
    
    const timestamp = Date.now();
    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const platformConfig = getPlatformDimensions(platform);
    
    debugLog("📐 Platform configuration", { platform, config: platformConfig });

    // ====================================================================
    // PHASE 1: Create Trimmed & Cropped Video Segments
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
    // PHASE 2: Wait for Asset Availability
    // ====================================================================
    debugLog("--- PHASE 2: Ensuring asset availability ---");
    const sortedSegments = createdSegments.sort((a, b) => a.order - b.order);
    for (const asset of sortedSegments) {
      await waitForAssetAvailability(asset.publicId);
    }
    debugLog("--- PHASE 2 COMPLETE ---");

    // ====================================================================
    // PHASE 3: Concatenate Video Segments
    // ====================================================================
    debugLog("--- PHASE 3: Concatenating video segments ---");
    const publicIdsToConcat = sortedSegments.map(asset => asset.publicId);
    const concatenatedVideoId = await concatenateVideoSegments(publicIdsToConcat, timestamp);
    temporaryAssetIds.add(concatenatedVideoId);
    debugLog("--- PHASE 3 COMPLETE ---");

    // ====================================================================
    // PHASE 4: Apply Customization Overlays
    // ====================================================================
    debugLog("--- PHASE 4: Applying customization overlays ---");
    const customizationResult = await applyCustomizationOverlays(
      concatenatedVideoId, 
      customization, 
      platformConfig, 
      targetDuration, 
      timestamp
    );
    
    // If customization created a new video, track it but don't delete it
    if (customizationResult.publicId !== concatenatedVideoId) {
      finalVideoId = customizationResult.publicId;
      debugLog("✅ New customized video created", { finalVideoId });
    } else {
      // If using fallback, don't delete the concatenated video
      finalVideoId = concatenatedVideoId;
      temporaryAssetIds.delete(concatenatedVideoId); // Remove from cleanup list
      debugLog("⚠️ Using fallback concatenated video", { finalVideoId });
    }
    
    debugLog("--- PHASE 4 COMPLETE ---");

    // ====================================================================
    // PHASE 5: CLEANUP (Only delete segments, keep final video)
    // ====================================================================
    if (temporaryAssetIds.size > 0) {
      debugLog("--- CLEANUP: Deleting temporary segments only ---", { ids: Array.from(temporaryAssetIds) });
      try {
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
    debugLog("🎉 SUCCESS: Returning final response", { finalUrl: customizationResult.url });
    return new Response(JSON.stringify({ success: true, url: customizationResult.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    debugLog("❌ FATAL ERROR", { message: error.message, stack: error.stack });
    
    // Cleanup on error (delete everything including final video if it was created)
    if (temporaryAssetIds.size > 0 || finalVideoId) {
      debugLog("--- CLEANUP ON ERROR: Deleting all assets ---");
      const allAssets = [...Array.from(temporaryAssetIds)];
      if (finalVideoId && !temporaryAssetIds.has(finalVideoId)) {
        allAssets.push(finalVideoId);
      }
      
      for (const assetId of allAssets) {
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
