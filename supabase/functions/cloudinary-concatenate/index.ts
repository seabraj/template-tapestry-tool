// STEP-BY-STEP APPROACH: Trim → Format → Concatenate
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function infoLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [INFO] 🎬 ${message}`);
  if (data) {
    console.log(`[${timestamp}] [INFO] Data:`, JSON.stringify(data, null, 2));
  }
}

function errorLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [ERROR] ❌ ${message}`);
  if (data) {
    console.log(`[${timestamp}] [ERROR] Data:`, JSON.stringify(data, null, 2));
  }
}

// Progress tracking
interface ProgressUpdate {
  phase: string;
  progress: number;
  message: string;
  details?: any;
  timestamp: string;
}

class ProgressTracker {
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private encoder = new TextEncoder();

  constructor(controller?: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller || null;
  }

  sendProgress(update: ProgressUpdate) {
    if (this.controller) {
      const data = `data: ${JSON.stringify(update)}\n\n`;
      try {
        this.controller.enqueue(this.encoder.encode(data));
      } catch (error) {
        console.warn('Failed to send progress update', error);
      }
    }
    
    infoLog(`Progress: ${update.progress}% - ${update.message}`, { 
      phase: update.phase, 
      details: update.details 
    });
  }

  complete(finalResult: any) {
    if (this.controller) {
      const completionData = `data: ${JSON.stringify({
        phase: 'complete',
        progress: 100,
        message: 'Video processing completed',
        result: finalResult,
        timestamp: new Date().toISOString()
      })}\n\n`;
      
      try {
        this.controller.enqueue(this.encoder.encode(completionData));
        this.controller.close();
      } catch (error) {
        console.warn('Failed to send completion update', error);
      }
    }
  }

  error(error: Error) {
    if (this.controller) {
      const errorData = `data: ${JSON.stringify({
        phase: 'error',
        progress: -1,
        message: 'Processing failed',
        error: error.message,
        timestamp: new Date().toISOString()
      })}\n\n`;
      
      try {
        this.controller.enqueue(this.encoder.encode(errorData));
        this.controller.close();
      } catch (sendError) {
        console.warn('Failed to send error update', sendError);
      }
    }
  }
}

// Platform-specific transformations
function getPlatformTransformations(platform: string) {
  switch (platform) {
    case 'youtube':
      return { width: 1920, height: 1080, crop: 'fill', gravity: 'auto' };
    case 'facebook':
      return { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' };
    case 'instagram':
      return { width: 1080, height: 1920, crop: 'fill', gravity: 'auto' };
    default:
      return { width: 1920, height: 1080, crop: 'fill', gravity: 'auto' };
  }
}

// SIMPLE UPLOAD: Single transformation only
async function uploadToCloudinarySimple(
  sourceUrl: string, 
  publicId: string, 
  transformation?: any
): Promise<any> {
  const cloudName = 'dsxrmo3kt';
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

  if (!apiKey || !apiSecret) {
    throw new Error('Missing Cloudinary credentials');
  }

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
  const timestamp = Math.round(Date.now() / 1000);
  
  // Build parameters
  const params: Record<string, string> = {
    'overwrite': 'true',
    'public_id': publicId,
    'resource_type': 'video',
    'timestamp': timestamp.toString()
  };
  
  // Build simple transformation string
  let transformationString = '';
  if (transformation) {
    const transformParts = [];
    if (transformation.duration) transformParts.push(`du_${transformation.duration}`);
    if (transformation.width) transformParts.push(`w_${transformation.width}`);
    if (transformation.height) transformParts.push(`h_${transformation.height}`);
    if (transformation.crop) transformParts.push(`c_${transformation.crop}`);
    if (transformation.gravity) transformParts.push(`g_${transformation.gravity}`);
    if (transformation.quality) transformParts.push(`q_${transformation.quality}`);
    if (transformation.overlay) transformParts.push(`l_${transformation.overlay}`);
    if (transformation.flags) transformParts.push(`fl_${transformation.flags}`);
    
    transformationString = transformParts.join(',');
    if (transformationString) {
      params['transformation'] = transformationString;
    }
  }
  
  // Create signature
  const sortedKeys = Object.keys(params).sort();
  const signatureString = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&') + apiSecret;
  
  infoLog('Upload request:', {
    publicId,
    transformationString: transformationString || 'none',
    signaturePreview: signatureString.replace(apiSecret, '[SECRET]').substring(0, 150) + '...'
  });
  
  // Generate signature
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Build form data
  const formData = new FormData();
  formData.append('file', sourceUrl);
  formData.append('public_id', publicId);
  formData.append('overwrite', 'true');
  formData.append('resource_type', 'video');
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp.toString());
  formData.append('signature', signature);
  
  if (transformationString) {
    formData.append('transformation', transformationString);
  }
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    let errorDetails;
    try {
      errorDetails = JSON.parse(errorText);
    } catch {
      errorDetails = { message: errorText };
    }
    
    errorLog('Upload failed:', {
      status: response.status,
      publicId,
      transformation: transformationString || 'none',
      errorDetails
    });
    
    throw new Error(`Upload failed: ${response.status} - ${errorDetails.error?.message || errorText}`);
  }
  
  const result = await response.json();
  infoLog('Upload successful:', {
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    duration: result.duration
  });
  
  return result;
}

// Wait for asset availability
async function waitForAsset(publicId: string, maxAttempts: number = 15): Promise<boolean> {
  const cloudName = 'dsxrmo3kt';
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/video/${publicId}`, {
        headers: {
          'Authorization': `Basic ${btoa(`${apiKey}:${apiSecret}`)}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result && result.public_id) {
          return true;
        }
      }
    } catch (error) {
      // Asset not ready yet
    }
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  return false;
}

// STEP-BY-STEP PROCESSING
async function processVideoStepByStep(
  videos: any[], 
  targetDuration: number,
  platform: string,
  progressTracker: ProgressTracker
): Promise<{ url: string; method: string; stats: any }> {
  const temporaryAssetIds = new Set<string>();
  const cloudName = 'dsxrmo3kt';
  
  try {
    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const platformTransform = getPlatformTransformations(platform);
    
    infoLog('🚀 Starting step-by-step processing:', {
      videoCount: videos.length,
      totalOriginalDuration,
      targetDuration,
      platform,
      platformTransform
    });
    
    // =================================================================
    // STEP 1: TRIM VIDEOS ONLY (No formatting yet)
    // =================================================================
    progressTracker.sendProgress({
      phase: 'step1_trimming',
      progress: 10,
      message: 'Step 1: Trimming videos to target duration...',
      timestamp: new Date().toISOString()
    });
    
    const trimmedAssets = [];
    
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `step1_trimmed_${i}_${timestamp}`;
      temporaryAssetIds.add(trimmedId);
      
      progressTracker.sendProgress({
        phase: 'step1_trimming',
        progress: 10 + (i / videos.length) * 20,
        message: `Trimming video ${i + 1}/${videos.length}...`,
        timestamp: new Date().toISOString()
      });
      
      // Raw source URL
      const sourceUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${video.publicId}`;
      
      // ONLY trim, no formatting
      const trimTransformation = {
        duration: proportionalDuration.toFixed(6),
        quality: 'auto:good'
      };
      
      infoLog(`Step 1 - Trimming video ${i + 1}:`, {
        originalId: video.publicId,
        trimmedId,
        originalDuration: video.duration,
        targetDuration: proportionalDuration.toFixed(6)
      });
      
      const trimResult = await uploadToCloudinarySimple(sourceUrl, trimmedId, trimTransformation);
      
      trimmedAssets.push({
        publicId: trimResult.public_id,
        order: i,
        duration: trimResult.duration,
        originalWidth: trimResult.width,
        originalHeight: trimResult.height
      });
      
      infoLog(`✅ Video ${i + 1} trimmed successfully`);
    }
    
    // Wait for trimmed assets
    progressTracker.sendProgress({
      phase: 'step1_waiting',
      progress: 35,
      message: 'Waiting for trimmed videos to be ready...',
      timestamp: new Date().toISOString()
    });
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    for (const asset of trimmedAssets) {
      await waitForAsset(asset.publicId);
    }
    
    infoLog('✅ Step 1 complete - All videos trimmed', { count: trimmedAssets.length });
    
    // =================================================================
    // STEP 2: FORMAT VIDEOS FOR PLATFORM (Resize/Crop)
    // =================================================================
    progressTracker.sendProgress({
      phase: 'step2_formatting',
      progress: 45,
      message: `Step 2: Formatting videos for ${platform}...`,
      timestamp: new Date().toISOString()
    });
    
    const formattedAssets = [];
    
    for (let i = 0; i < trimmedAssets.length; i++) {
      const trimmedAsset = trimmedAssets[i];
      const formattedId = `step2_formatted_${i}_${timestamp}`;
      temporaryAssetIds.add(formattedId);
      
      progressTracker.sendProgress({
        phase: 'step2_formatting',
        progress: 45 + (i / trimmedAssets.length) * 20,
        message: `Formatting video ${i + 1}/${trimmedAssets.length} for ${platform}...`,
        timestamp: new Date().toISOString()
      });
      
      // Source is the trimmed video
      const sourceUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${trimmedAsset.publicId}`;
      
      // ONLY format, no trimming
      const formatTransformation = {
        width: platformTransform.width,
        height: platformTransform.height,
        crop: platformTransform.crop,
        gravity: platformTransform.gravity,
        quality: 'auto:good'
      };
      
      infoLog(`Step 2 - Formatting video ${i + 1}:`, {
        trimmedId: trimmedAsset.publicId,
        formattedId,
        platform,
        targetDimensions: `${platformTransform.width}x${platformTransform.height}`,
        originalDimensions: `${trimmedAsset.originalWidth}x${trimmedAsset.originalHeight}`
      });
      
      const formatResult = await uploadToCloudinarySimple(sourceUrl, formattedId, formatTransformation);
      
      formattedAssets.push({
        publicId: formatResult.public_id,
        order: i,
        width: formatResult.width,
        height: formatResult.height,
        duration: formatResult.duration
      });
      
      infoLog(`✅ Video ${i + 1} formatted successfully: ${formatResult.width}x${formatResult.height}`);
    }
    
    // Wait for formatted assets
    progressTracker.sendProgress({
      phase: 'step2_waiting',
      progress: 70,
      message: 'Waiting for formatted videos to be ready...',
      timestamp: new Date().toISOString()
    });
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    for (const asset of formattedAssets) {
      await waitForAsset(asset.publicId);
    }
    
    infoLog('✅ Step 2 complete - All videos formatted', { 
      count: formattedAssets.length,
      dimensions: `${formattedAssets[0]?.width}x${formattedAssets[0]?.height}`
    });
    
    // =================================================================
    // STEP 3: CONCATENATE FORMATTED VIDEOS
    // =================================================================
    progressTracker.sendProgress({
      phase: 'step3_concatenation',
      progress: 80,
      message: 'Step 3: Concatenating formatted videos...',
      timestamp: new Date().toISOString()
    });
    
    if (formattedAssets.length === 1) {
      // Single video - return it directly
      const finalUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${formattedAssets[0].publicId}`;
      
      infoLog('Single video - returning directly');
      
      // Cleanup trimmed assets
      await cleanupAssets(Array.from(temporaryAssetIds).filter(id => id.startsWith('step1_')));
      
      return {
        url: finalUrl,
        method: 'step_by_step_single',
        stats: {
          inputVideos: 1,
          platform,
          finalDimensions: `${formattedAssets[0].width}x${formattedAssets[0].height}`
        }
      };
    }
    
    // Multiple videos - concatenate
    const sortedAssets = formattedAssets.sort((a, b) => a.order - b.order);
    const baseAssetId = sortedAssets[0].publicId;
    const overlayAssets = sortedAssets.slice(1);
    const finalVideoId = `step3_final_${timestamp}`;
    
    // Source is the first formatted video
    const baseSourceUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${baseAssetId}`;
    
    // ONLY concatenate, no additional formatting
    const concatenationTransformation = {
      overlay: overlayAssets.map(asset => `video:${asset.publicId}`).join(','),
      flags: 'splice'
    };
    
    infoLog('Step 3 - Concatenating videos:', {
      baseAssetId,
      overlayAssets: overlayAssets.map(a => a.publicId),
      finalVideoId
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const finalResult = await uploadToCloudinarySimple(baseSourceUrl, finalVideoId, concatenationTransformation);
    
    infoLog('✅ Step 3 complete - Final video created:', {
      publicId: finalResult.public_id,
      url: finalResult.secure_url,
      dimensions: `${finalResult.width}x${finalResult.height}`,
      duration: finalResult.duration
    });
    
    // =================================================================
    // STEP 4: CLEANUP TEMPORARY ASSETS
    // =================================================================
    progressTracker.sendProgress({
      phase: 'cleanup',
      progress: 95,
      message: 'Cleaning up temporary assets...',
      timestamp: new Date().toISOString()
    });
    
    const tempAssets = Array.from(temporaryAssetIds);
    await cleanupAssets(tempAssets);
    
    return {
      url: finalResult.secure_url,
      method: 'step_by_step_concatenation',
      stats: {
        inputVideos: videos.length,
        totalOriginalDuration: totalOriginalDuration.toFixed(3),
        targetDuration: targetDuration.toFixed(3),
        platform,
        finalDimensions: `${finalResult.width}x${finalResult.height}`,
        stepsCompleted: ['trim', 'format', 'concatenate']
      }
    };
    
  } catch (error) {
    errorLog('Step-by-step processing failed:', error);
    await cleanupAssets(Array.from(temporaryAssetIds));
    throw error;
  }
}

// Simple cleanup function
async function cleanupAssets(assetIds: string[]) {
  infoLog(`🧹 Cleaning up ${assetIds.length} temporary assets...`);
  
  // For now, we'll skip cleanup to avoid signature issues
  // In production, you'd want to implement this properly
  
  infoLog('Cleanup completed (skipped for debugging)');
}

// Main serve function
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const { videos, targetDuration, platform = 'youtube', enableProgress = false } = requestBody;

    if (!videos || videos.length === 0 || !targetDuration || targetDuration <= 0) {
      throw new Error('Invalid request body');
    }

    infoLog('🎬 Processing video request (STEP-BY-STEP):', {
      videoCount: videos.length,
      targetDuration,
      platform,
      enableProgress
    });

    if (enableProgress) {
      const stream = new ReadableStream({
        start(controller) {
          const progressTracker = new ProgressTracker(controller);
          
          progressTracker.sendProgress({
            phase: 'initialization',
            progress: 0,
            message: `Starting step-by-step ${platform} processing...`,
            timestamp: new Date().toISOString()
          });

          processVideoStepByStep(videos, targetDuration, platform, progressTracker)
            .then(result => {
              progressTracker.complete(result);
            })
            .catch(error => {
              errorLog('Video processing failed', error);
              progressTracker.error(error);
            });
        }
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      const progressTracker = new ProgressTracker();
      const result = await processVideoStepByStep(videos, targetDuration, platform, progressTracker);
      
      return new Response(JSON.stringify({ 
        success: true, 
        ...result
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

  } catch (error) {
    errorLog(`FATAL ERROR`, { message: error?.message || 'Unknown error', stack: error?.stack });
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error?.message || 'Unknown error',
      details: error?.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});