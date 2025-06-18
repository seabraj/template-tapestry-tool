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

// Manual duration mapping since Cloudinary API returns undefined
const KNOWN_DURATIONS = {
  'video_library/sigsig8mltjbmucxg7h3': 3.0,     // ~3s
  'video_library/gquadddvckk1eqnyk2bz': 0.8,     // <1s 
  'video_library/ki4y9fuhwu9z3b1tzi9n': 15.0     // ~15s
};

function debugLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(`[${timestamp}] Data:`, JSON.stringify(data, null, 2));
  }
}

// Helper function to wait for metadata (with fallback to calculated duration)
async function waitForMetadataOrFallback(publicId: string, calculatedDuration: number, maxAttempts: number = 5): Promise<any> {
  debugLog(`Checking metadata for ${publicId} (fallback: ${calculatedDuration}s)`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resource = await cloudinary.api.resource(publicId, { 
        resource_type: 'video',
        video_metadata: true 
      });
      
      debugLog(`Attempt ${attempt}: Got resource`, {
        public_id: resource.public_id,
        duration: resource.duration,
        bytes: resource.bytes,
        format: resource.format
      });
      
      if (resource.duration && resource.duration > 0) {
        debugLog(`✅ Real metadata found: ${resource.duration}s`);
        return { ...resource, duration: resource.duration, hasRealMetadata: true };
      }
      
      if (attempt < maxAttempts) {
        const waitTime = 1000 * attempt; // 1s, 2s, 3s, 4s, 5s
        debugLog(`No metadata yet, waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
    } catch (error) {
      debugLog(`Error on attempt ${attempt}:`, error.message);
      if (attempt === maxAttempts) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Fallback to calculated duration
  debugLog(`⚠️ Using calculated duration: ${calculatedDuration}s`);
  return {
    public_id: publicId,
    duration: calculatedDuration,
    hasRealMetadata: false,
    secure_url: cloudinary.url(publicId, { resource_type: 'video', format: 'mp4' })
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    debugLog("=== STARTING PRODUCTION VIDEO PROCESSING ===");
    
    const requestBody = await req.json();
    debugLog("Request received", requestBody);
    
    const { videos, targetDuration } = requestBody;

    if (!videos || videos.length === 0) throw new Error('No videos provided.');
    if (!targetDuration || targetDuration <= 0) throw new Error('Invalid target duration.');

    // Use known durations instead of relying on Cloudinary API
    const videosWithDuration = videos.map(video => {
      const knownDuration = KNOWN_DURATIONS[video.publicId];
      if (!knownDuration) {
        throw new Error(`Unknown video: ${video.publicId}. Please add to KNOWN_DURATIONS mapping.`);
      }
      return {
        ...video,
        duration: knownDuration
      };
    });

    debugLog("Videos with known durations", videosWithDuration);

    const totalOriginalDuration = videosWithDuration.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const createdAssets = [];

    debugLog("Calculation summary", {
      totalOriginalDuration,
      targetDuration,
      timestamp,
      proportions: videosWithDuration.map(v => ({
        publicId: v.publicId,
        original: v.duration,
        target: (v.duration / totalOriginalDuration) * targetDuration
      }))
    });

    for (let i = 0; i < videosWithDuration.length; i++) {
      const video = videosWithDuration[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `final_trimmed_${i}_${timestamp}`;
      
      debugLog(`=== PROCESSING VIDEO ${i + 1}/${videosWithDuration.length} ===`, {
        originalId: video.publicId,
        originalDuration: video.duration,
        targetDuration: proportionalDuration,
        trimmedId
      });

      try {
        // Create transformation URL
        const trimmedUrl = cloudinary.url(video.publicId, {
          resource_type: 'video',
          transformation: [{ 
            duration: proportionalDuration.toFixed(2),
            format: 'mp4',
            quality: 'auto'
          }]
        });
        
        debugLog("Transformation URL created", { trimmedUrl });

        // Upload the transformed video
        const uploadResult = await cloudinary.uploader.upload(trimmedUrl, {
          resource_type: 'video',
          public_id: trimmedId,
          overwrite: true,
          use_filename: false,
          unique_filename: false
        });

        debugLog("Upload completed", {
          public_id: uploadResult.public_id,
          url: uploadResult.secure_url,
          duration: uploadResult.duration,
          bytes: uploadResult.bytes
        });

        // Wait for metadata or use calculated duration
        const verifiedAsset = await waitForMetadataOrFallback(trimmedId, proportionalDuration);

        debugLog(`✅ Video ${i + 1} completed successfully`, {
          publicId: verifiedAsset.public_id,
          duration: verifiedAsset.duration,
          hasRealMetadata: verifiedAsset.hasRealMetadata,
          url: verifiedAsset.secure_url
        });
        
        createdAssets.push({
          publicId: verifiedAsset.public_id,
          duration: verifiedAsset.duration,
          order: i,
          url: verifiedAsset.secure_url,
          hasRealMetadata: verifiedAsset.hasRealMetadata || false
        });

      } catch (error) {
        debugLog(`❌ Error processing video ${i}`, {
          error: error.message,
          publicId: video.publicId
        });
        throw new Error(`Failed to process video ${video.publicId}: ${error.message}`);
      }
    }
    
    const withRealMetadata = createdAssets.filter(a => a.hasRealMetadata).length;
    const withCalculatedMetadata = createdAssets.length - withRealMetadata;
    
    debugLog("=== PROCESSING COMPLETE ===", {
      totalCreated: createdAssets.length,
      withRealMetadata,
      withCalculatedMetadata,
      totalDuration: createdAssets.reduce((sum, asset) => sum + asset.duration, 0)
    });
    
    return new Response(JSON.stringify({ 
        success: true,
        message: `Phase 1: ${createdAssets.length} videos processed successfully.`,
        phase: 1,
        createdAssets: createdAssets,
        stats: {
          withRealMetadata,
          withCalculatedMetadata,
          totalDuration: createdAssets.reduce((sum, asset) => sum + asset.duration, 0)
        }
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    debugLog(`❌ FATAL ERROR`, {
      message: error.message,
      stack: error.stack
    });
    
    return new Response(JSON.stringify({ 
      error: error.message,
      phase: 1,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});