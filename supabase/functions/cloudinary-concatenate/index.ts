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

// ===============================================
// PHASE 1: VIDEO TRIMMING (EXISTING FUNCTIONALITY)
// ===============================================
async function handlePhase1Trimming(requestBody: any) {
  debugLog("🎬 === PHASE 1: STARTING VIDEO TRIMMING ===");
  
  const { videos, targetDuration } = requestBody;

  if (!videos || videos.length === 0) throw new Error('No videos provided.');
  if (!targetDuration || targetDuration <= 0) throw new Error('Invalid target duration.');

  // Validate that all videos have exact durations
  const missingDurations = videos.filter((v: any) => !v.duration || v.duration <= 0);
  if (missingDurations.length > 0) {
    const missingIds = missingDurations.map((v: any) => v.publicId).join(', ');
    throw new Error(`Videos missing exact durations: ${missingIds}. Please provide exact durations for all videos.`);
  }

  debugLog("✅ PHASE 1: All videos have exact durations:", videos.map((v: any) => ({
    publicId: v.publicId,
    duration: v.duration
  })));

  const totalOriginalDuration = videos.reduce((sum: number, v: any) => sum + v.duration, 0);
  const timestamp = Date.now();
  const createdAssets = [];

  debugLog("PHASE 1: Calculation summary", {
    totalOriginalDuration,
    targetDuration,
    timestamp
  });

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
    const trimmedId = `phase1_trimmed_${i}_${timestamp}`;
    
    debugLog(`=== PHASE 1: PROCESSING VIDEO ${i + 1}/${videos.length} ===`, {
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
      
      debugLog("PHASE 1: Transformation URL created", { 
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

      debugLog("PHASE 1: Upload completed", {
        public_id: uploadResult.public_id,
        url: uploadResult.secure_url,
        duration: uploadResult.duration,
        bytes: uploadResult.bytes
      });

      // Use our calculated exact duration
      const finalDuration = proportionalDuration;

      debugLog(`✅ PHASE 1: Video ${i + 1} completed successfully`, {
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

    } catch (error: any) {
      debugLog(`❌ PHASE 1: Error processing video ${i}`, {
        error: error.message,
        publicId: video.publicId
      });
      throw new Error(`Failed to process video ${video.publicId}: ${error.message}`);
    }
  }
  
  const totalNewDuration = createdAssets.reduce((sum, asset) => sum + asset.duration, 0);
  
  debugLog("=== PHASE 1: PROCESSING COMPLETE ===", {
    totalCreated: createdAssets.length,
    originalTotalDuration: totalOriginalDuration,
    targetDuration: targetDuration,
    actualTotalDuration: totalNewDuration
  });
  
  return { 
    success: true,
    message: `Phase 1 Complete: ${createdAssets.length} videos trimmed with exact durations.`,
    phase: 1,
    action: 'trim',
    
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
}

// ===============================================
// PHASE 2: VIDEO CONCATENATION (NEW FUNCTIONALITY)
// ===============================================
async function handlePhase2Concatenation(requestBody: any) {
  debugLog("🎬 === PHASE 2: STARTING VIDEO CONCATENATION ===");
  
  const { trimmedVideos, outputSettings = {} } = requestBody;

  if (!trimmedVideos || !Array.isArray(trimmedVideos) || trimmedVideos.length < 2) {
    throw new Error('Phase 2 requires at least 2 trimmed videos from Phase 1');
  }

  debugLog("✅ PHASE 2: Received trimmed videos for concatenation:", trimmedVideos.map((v: any) => ({
    publicId: v.publicId,
    duration: v.duration
  })));

  // Default output settings
  const settings = {
    width: 1280,
    height: 720,
    quality: 'auto:best',
    format: 'mp4',
    background: 'black',
    ...outputSettings
  };

  debugLog("PHASE 2: Using output settings:", settings);

  try {
    // Build the concatenation transformation
    const baseVideo = trimmedVideos[0];
    const additionalVideos = trimmedVideos.slice(1);
    const timestamp = Date.now();

    debugLog("PHASE 2: Building concatenation transformation", {
      baseVideo: baseVideo.publicId,
      additionalVideos: additionalVideos.map((v: any) => v.publicId),
      totalVideos: trimmedVideos.length
    });

    // Start with base video transformations
    const transformations = [
      {
        width: settings.width,
        height: settings.height,
        crop: 'pad',
        background: settings.background,
        quality: settings.quality
      }
    ];

    // Add concatenation layers for additional videos
    for (let i = 0; i < additionalVideos.length; i++) {
      const video = additionalVideos[i];
      
      // Convert public ID format: replace / with :
      const overlayId = video.publicId.replace(/\//g, ':');
      
      debugLog(`PHASE 2: Adding splice layer ${i + 1}/${additionalVideos.length}`, {
        originalId: video.publicId,
        overlayId: overlayId,
        duration: video.duration
      });

      // Add splice layer
      transformations.push({
        overlay: `video:${overlayId}`,
        flags: 'splice',
        width: settings.width,
        height: settings.height,
        crop: 'pad',
        background: settings.background
      });
      
      // Close the layer
      transformations.push({
        flags: 'layer_apply'
      });
    }

    debugLog("PHASE 2: Final transformation chain:", transformations);

    // Generate the concatenated video URL
    const concatenatedUrl = cloudinary.url(baseVideo.publicId, {
      resource_type: 'video',
      transformation: transformations,
      format: settings.format
    });

    debugLog("PHASE 2: Generated concatenation URL:", { concatenatedUrl });

    // Calculate total duration
    const totalDuration = trimmedVideos.reduce((sum: number, video: any) => sum + video.duration, 0);

    debugLog("PHASE 2: Duration calculation", {
      individualDurations: trimmedVideos.map((v: any) => v.duration),
      totalDuration: totalDuration
    });

    // Create a permanent asset by uploading the transformation URL
    const concatenatedId = `phase2_concatenated_${timestamp}`;
    
    debugLog("PHASE 2: Creating permanent concatenated asset...");
    
    const uploadResult = await cloudinary.uploader.upload(concatenatedUrl, {
      resource_type: 'video',
      public_id: concatenatedId,
      overwrite: true,
      use_filename: false,
      unique_filename: false
    });

    debugLog("✅ PHASE 2: Concatenated asset created successfully", {
      public_id: uploadResult.public_id,
      url: uploadResult.secure_url,
      bytes: uploadResult.bytes
    });

    const response = {
      success: true,
      message: `Phase 2 Complete: ${trimmedVideos.length} videos concatenated successfully.`,
      phase: 2,
      action: 'concatenate',
      
      // Concatenated video details
      concatenatedVideo: {
        publicId: uploadResult.public_id,
        url: uploadResult.secure_url,
        duration: totalDuration,
        settings: settings
      },
      
      // URLs for immediate access
      concatenatedUrl: uploadResult.secure_url,
      url: uploadResult.secure_url,
      resultUrl: uploadResult.secure_url,
      videoUrl: uploadResult.secure_url,
      
      // Source videos used
      sourceVideos: trimmedVideos,
      
      // Processing stats
      stats: {
        totalVideos: trimmedVideos.length,
        totalDuration: totalDuration,
        outputSettings: settings
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

    debugLog("=== PHASE 2: CONCATENATION COMPLETE ===", {
      success: response.success,
      videosUsed: trimmedVideos.length,
      finalDuration: totalDuration,
      finalUrl: uploadResult.secure_url
    });

    return response;

  } catch (error: any) {
    debugLog(`❌ PHASE 2: Concatenation error`, {
      error: error.message,
      stack: error.stack
    });
    throw new Error(`Phase 2 concatenation failed: ${error.message}`);
  }
}

// ===============================================
// MAIN REQUEST HANDLER
// ===============================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    debugLog("=== REQUEST RECEIVED ===", {
      action: requestBody.action || 'trim', // Default to Phase 1
      hasVideos: !!requestBody.videos,
      hasTrimmedVideos: !!requestBody.trimmedVideos,
      targetDuration: requestBody.targetDuration
    });
    
    let response;
    
    // Route to appropriate phase based on action
    if (!requestBody.action || requestBody.action === 'trim') {
      // PHASE 1: Video trimming (default/existing behavior)
      debugLog("🎯 Routing to PHASE 1: Video Trimming");
      response = await handlePhase1Trimming(requestBody);
      
    } else if (requestBody.action === 'concatenate') {
      // PHASE 2: Video concatenation
      debugLog("🎯 Routing to PHASE 2: Video Concatenation");
      response = await handlePhase2Concatenation(requestBody);
      
    } else {
      throw new Error(`Unknown action: ${requestBody.action}. Use 'trim' for Phase 1 or 'concatenate' for Phase 2.`);
    }

    debugLog("=== SENDING SUCCESS RESPONSE ===", {
      success: response.success,
      phase: response.phase,
      action: response.action
    });
    
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (error: any) {
    debugLog(`❌ FATAL ERROR`, {
      message: error.message,
      stack: error.stack
    });

    const errorResponse = { 
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };

    debugLog("=== SENDING ERROR RESPONSE ===", errorResponse);
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});