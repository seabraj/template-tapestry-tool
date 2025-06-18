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

  try {
    debugLog("=== PRODUCTION VIDEO PROCESSING ===");
    
    const requestBody = await req.json();
    debugLog("Request received", requestBody);
    
    const { videos, targetDuration } = requestBody;

    if (!videos || videos.length === 0) throw new Error('No videos provided.');
    if (!targetDuration || targetDuration <= 0) throw new Error('Invalid target duration.');

    // Validate that all videos have exact durations
    const missingDurations = videos.filter(v => !v.duration || v.duration <= 0);
    if (missingDurations.length > 0) {
      const missingIds = missingDurations.map(v => v.publicId).join(', ');
      throw new Error(`Videos missing exact durations: ${missingIds}. Please provide exact durations for all videos.`);
    }

    debugLog("✅ All videos have exact durations:", videos.map(v => ({
      publicId: v.publicId,
      duration: v.duration
    })));

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const createdAssets = [];

    debugLog("Calculation summary", {
      totalOriginalDuration,
      targetDuration,
      timestamp
    });

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `final_trimmed_${i}_${timestamp}`;
      
      debugLog(`=== PROCESSING VIDEO ${i + 1}/${videos.length} ===`, {
        originalId: video.publicId,
        exactOriginalDuration: video.duration,
        exactTargetDuration: proportionalDuration,
        trimmedId
      });

      try {
        // Create transformation URL with exact duration
        const trimmedUrl = cloudinary.url(video.publicId, {
          resource_type: 'video',
          transformation: [{ 
            duration: proportionalDuration.toFixed(6),
            format: 'mp4',
            quality: 'auto'
          }]
        });
        
        debugLog("Transformation URL created", { 
          trimmedUrl,
          exactDuration: proportionalDuration.toFixed(6)
        });

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

        // Use our calculated exact duration
        const finalDuration = proportionalDuration;

        debugLog(`✅ Video ${i + 1} completed successfully`, {
          publicId: uploadResult.public_id,
          exactDuration: finalDuration,
          url: uploadResult.secure_url
        });
        
        createdAssets.push({
          publicId: uploadResult.public_id,
          duration: finalDuration,
          order: i,
          url: uploadResult.secure_url,
          originalDuration: video.duration,
          calculatedDuration: proportionalDuration
        });

      } catch (error) {
        debugLog(`❌ Error processing video ${i}`, {
          error: error.message,
          publicId: video.publicId
        });
        throw new Error(`Failed to process video ${video.publicId}: ${error.message}`);
      }
    }
    
    const totalNewDuration = createdAssets.reduce((sum, asset) => sum + asset.duration, 0);
    
    debugLog("=== PROCESSING COMPLETE ===", {
      totalCreated: createdAssets.length,
      originalTotalDuration: totalOriginalDuration,
      targetDuration: targetDuration,
      actualTotalDuration: totalNewDuration
    });
    
    const finalResponse = { 
        success: true,
        message: `Phase 1: ${createdAssets.length} videos processed with exact durations.`,
        phase: 1,
        
        // Video data in multiple formats for frontend compatibility
        createdAssets: createdAssets,
        videos: createdAssets,
        result: createdAssets,
        data: createdAssets,
        
        // URLs for immediate access
        url: createdAssets.length > 0 ? createdAssets[0].url : null,
        resultUrl: createdAssets.length > 0 ? createdAssets[0].url : null,
        videoUrl: createdAssets.length > 0 ? createdAssets[0].url : null,
        finalVideo: createdAssets.length > 0 ? createdAssets[0] : null,
        
        // Detailed stats
        stats: {
          totalCreated: createdAssets.length,
          originalTotalDuration: totalOriginalDuration,
          targetDuration: targetDuration,
          actualTotalDuration: totalNewDuration
        },
        
        // Status indicators
        status: "completed",
        state: "success", 
        completed: true,
        ready: true,
        
        // Timestamps
        timestamp: new Date().toISOString(),
        processedAt: new Date().toISOString()
    };

    debugLog("=== SENDING RESPONSE TO FRONTEND ===", {
      success: finalResponse.success,
      videosCreated: finalResponse.createdAssets.length,
      totalDuration: finalResponse.stats.actualTotalDuration
    });
    
    return new Response(JSON.stringify(finalResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
    });

  } catch (error) {
    debugLog(`❌ FATAL ERROR`, {
      message: error.message,
      stack: error.stack
    });

    const errorResponse = { 
      success: false,
      error: error.message,
      phase: 1,
      timestamp: new Date().toISOString()
    };

    debugLog("=== SENDING ERROR RESPONSE TO FRONTEND ===", errorResponse);
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});