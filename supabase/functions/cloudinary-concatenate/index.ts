import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment-based logging configuration
const LOG_LEVEL = Deno.env.get('LOG_LEVEL') || 'INFO';
const IS_PRODUCTION = Deno.env.get('ENVIRONMENT') === 'production';

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  'DEBUG': LogLevel.DEBUG,
  'INFO': LogLevel.INFO,
  'WARN': LogLevel.WARN,
  'ERROR': LogLevel.ERROR
};

function log(level: keyof typeof LogLevel, message: string, data?: any, includeTimestamp: boolean = true) {
  const currentLogLevel = LOG_LEVEL_MAP[LOG_LEVEL] || LogLevel.INFO;
  const messageLogLevel = LOG_LEVEL_MAP[level];
  
  if (messageLogLevel < currentLogLevel) {
    return;
  }
  
  const timestamp = includeTimestamp ? `[${new Date().toISOString()}]` : '';
  const prefix = IS_PRODUCTION ? `[${level}]` : `[${level}] 🎬`;
  
  console.log(`${timestamp} ${prefix} ${message}`);
  
  if (data) {
    if (IS_PRODUCTION) {
      if (level === 'ERROR' || level === 'WARN') {
        console.log(`${timestamp} ${prefix} Data:`, JSON.stringify(data, null, 2));
      } else {
        console.log(`${timestamp} ${prefix} Data:`, JSON.stringify(data));
      }
    } else {
      console.log(`${timestamp} ${prefix} Data:`, JSON.stringify(data, null, 2));
    }
  }
}

function debugLog(message: string, data?: any) {
  log('DEBUG', message, data);
}

function infoLog(message: string, data?: any) {
  log('INFO', message, data);
}

function warnLog(message: string, data?: any) {
  log('WARN', message, data);
}

function errorLog(message: string, data?: any) {
  log('ERROR', message, data);
}

// Progress tracking interface
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
        warnLog('Failed to send progress update', error);
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
        warnLog('Failed to send completion update', error);
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
        warnLog('Failed to send error update', sendError);
      }
    }
  }
}

// FIXED: Platform-specific transformations with correct resolutions
function getPlatformTransformations(platform: string) {
  switch (platform) {
    case 'youtube':
      return [
        { width: 1920, height: 1080, crop: 'fill', gravity: 'auto' },
        { quality: 'auto:good', audio_codec: 'aac' }
      ];
    case 'facebook':
      return [
        { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' },
        { quality: 'auto:good', audio_codec: 'aac' }
      ];
    case 'instagram':
      return [
        { width: 1080, height: 1920, crop: 'fill', gravity: 'auto' },
        { quality: 'auto:good', audio_codec: 'aac' }
      ];
    default:
      return [
        { width: 1920, height: 1080, crop: 'fill', gravity: 'auto' },
        { quality: 'auto:good', audio_codec: 'aac' }
      ];
  }
}

// Build Cloudinary URL manually
function buildCloudinaryUrl(publicId: string, transformations: any[]): string {
  const cloudName = 'dsxrmo3kt';
  let url = `https://res.cloudinary.com/${cloudName}/video/upload/`;
  
  // Convert transformations to string format
  const transformString = transformations.map(transform => {
    return Object.entries(transform).map(([key, value]) => {
      // Handle special cases
      if (key === 'overlay') return `l_${value}`;
      if (key === 'flags') return `fl_${value}`;
      if (key === 'gravity') return `g_${value}`;
      if (key === 'crop') return `c_${value}`;
      if (key === 'width') return `w_${value}`;
      if (key === 'height') return `h_${value}`;
      if (key === 'quality') return `q_${value}`;
      if (key === 'audio_codec') return `ac_${value}`;
      if (key === 'duration') return `du_${value}`;
      
      return `${key}_${value}`;
    }).join(',');
  }).join('/');
  
  return `${url}${transformString}/${publicId}`;
}

async function waitForAssetAvailability(
  publicId: string, 
  resourceType: string = 'video', 
  maxAttempts: number = 30,
  progressTracker?: ProgressTracker
): Promise<boolean> {
  const cloudName = 'dsxrmo3kt';
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

  if (!apiKey || !apiSecret) {
    throw new Error('Missing Cloudinary credentials for asset verification');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/${publicId}`, {
        headers: {
          'Authorization': `Basic ${btoa(`${apiKey}:${apiSecret}`)}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result && result.public_id) {
          debugLog(`Asset ${publicId} is available (attempt ${attempt})`);
          return true;
        }
      }
    } catch (error) {
      debugLog(`Asset ${publicId} not ready yet (attempt ${attempt}/${maxAttempts})`, error.message);
      
      if (progressTracker) {
        progressTracker.sendProgress({
          phase: 'asset_verification',
          progress: 35 + (attempt / maxAttempts) * 10,
          message: `Verifying asset ${publicId.split('_').pop()}... (${attempt}/${maxAttempts})`,
          timestamp: new Date().toISOString()
        });
      }
      
      if (attempt === maxAttempts) {
        throw new Error(`Asset ${publicId} never became available after ${maxAttempts} attempts`);
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  return false;
}

// FIXED: Complete signature generation including all parameters
async function uploadToCloudinary(sourceUrl: string, publicId: string, transformations?: any[]): Promise<any> {
  const cloudName = 'dsxrmo3kt';
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

  if (!apiKey || !apiSecret) {
    throw new Error('Missing Cloudinary credentials');
  }

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
  const timestamp = Math.round(Date.now() / 1000);
  
  // FIXED: Build all parameters for signature generation
  const params: Record<string, string> = {
    'api_key': apiKey,
    'file': sourceUrl,
    'public_id': publicId,
    'overwrite': 'true',
    'resource_type': 'video',
    'timestamp': timestamp.toString()
  };
  
  // Add transformation parameter if provided
  if (transformations && transformations.length > 0) {
    const transformString = transformations.map(transform => {
      return Object.entries(transform).map(([key, value]) => {
        if (key === 'gravity') return `g_${value}`;
        if (key === 'crop') return `c_${value}`;
        if (key === 'width') return `w_${value}`;
        if (key === 'height') return `h_${value}`;
        if (key === 'quality') return `q_${value}`;
        if (key === 'audio_codec') return `ac_${value}`;
        if (key === 'duration') return `du_${value}`;
        return `${key}_${value}`;
      }).join(',');
    }).join('/');
    params['transformation'] = transformString;
  }
  
  // FIXED: Create signature string with ALL parameters (except file and api_key)
  const sortedKeys = Object.keys(params)
    .filter(key => key !== 'file' && key !== 'api_key')
    .sort();
  
  const signatureString = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&') + apiSecret;
  
  debugLog('Signature string for Cloudinary:', { 
    signatureString: signatureString.replace(apiSecret, '[SECRET]'),
    sortedKeys,
    hasTransformation: !!params.transformation
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
  
  if (params.transformation) {
    formData.append('transformation', params.transformation);
  }
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    errorLog('Cloudinary upload failed', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
      publicId,
      hasTransformation: !!params.transformation
    });
    throw new Error(`Cloudinary upload failed: ${response.status} ${errorText}`);
  }
  
  return await response.json();
}

async function processVideo(
  videos: any[], 
  targetDuration: number,
  platform: string,
  progressTracker: ProgressTracker
): Promise<{ url: string; method: string; stats: any }> {
  const temporaryAssetIds = new Set<string>();
  
  try {
    // ====================================================================
    // PHASE 1: CREATE TRIMMED VIDEOS WITH PLATFORM FORMATTING
    // ====================================================================
    progressTracker.sendProgress({
      phase: 'trimming',
      progress: 5,
      message: `Preparing videos for ${platform} format...`,
      timestamp: new Date().toISOString()
    });

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const createdAssets = [];
    const platformTransformations = getPlatformTransformations(platform);
    
    infoLog(`Platform transformations for ${platform}:`, platformTransformations);
    
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `p1_trimmed_${i}_${timestamp}`;
      temporaryAssetIds.add(trimmedId);

      progressTracker.sendProgress({
        phase: 'trimming',
        progress: 5 + (i / videos.length) * 25,
        message: `Processing video ${i + 1} of ${videos.length} for ${platform}...`,
        details: { videoIndex: i, trimmedId, platform },
        timestamp: new Date().toISOString()
      });

      // FIXED: Create source URL with trimming and platform transformations
      const sourceTransformations = [
        { duration: proportionalDuration.toFixed(6) },
        ...platformTransformations
      ];
      
      const sourceUrl = buildCloudinaryUrl(video.publicId, sourceTransformations);
      
      debugLog(`Creating trimmed and formatted video ${i + 1}/${videos.length}`, {
        originalId: video.publicId,
        trimmedId,
        platform,
        originalDuration: video.duration,
        proportionalDuration: proportionalDuration.toFixed(6),
        sourceUrl,
        transformations: sourceTransformations
      });

      const uploadResult = await uploadToCloudinary(sourceUrl, trimmedId, sourceTransformations);
      
      createdAssets.push({ 
        publicId: uploadResult.public_id, 
        order: i,
        proportionalDuration 
      });
    }
    
    progressTracker.sendProgress({
      phase: 'trimming',
      progress: 30,
      message: `All ${createdAssets.length} videos processed for ${platform} format`,
      timestamp: new Date().toISOString()
    });
    
    // ====================================================================
    // PHASE 1.5: WAIT FOR ASSET AVAILABILITY
    // ====================================================================
    progressTracker.sendProgress({
      phase: 'asset_verification',
      progress: 35,
      message: 'Verifying all processed assets are ready...',
      timestamp: new Date().toISOString()
    });

    const sortedAssets = createdAssets.sort((a, b) => a.order - b.order);
    
    infoLog('Waiting 15 seconds for assets to be fully processed...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    for (const asset of sortedAssets) {
      await waitForAssetAvailability(asset.publicId, 'video', 30, progressTracker);
    }
    
    progressTracker.sendProgress({
      phase: 'asset_verification',
      progress: 45,
      message: 'All assets verified and ready for concatenation',
      timestamp: new Date().toISOString()
    });
    
    // ====================================================================
    // PHASE 2: CONCATENATE VIDEOS USING DIRECT API
    // ====================================================================
    progressTracker.sendProgress({
      phase: 'concatenation',
      progress: 50,
      message: `Combining videos for ${platform} output...`,
      timestamp: new Date().toISOString()
    });
    
    const publicIdsToConcat = sortedAssets.map(asset => asset.publicId);
    debugLog("Assets to concatenate in order:", publicIdsToConcat);

    // Use the first video as base and overlay others
    const baseAssetId = publicIdsToConcat[0];
    const overlayAssets = publicIdsToConcat.slice(1);
    
    progressTracker.sendProgress({
      phase: 'concatenation',
      progress: 65,
      message: `Creating final ${platform} video...`,
      timestamp: new Date().toISOString()
    });

    const finalVideoPublicId = `p2_final_video_${timestamp}`;
    
    // Build concatenation transformations
    const concatenationTransformations = [];
    
    // Add overlays with proper splice flag
    overlayAssets.forEach(assetId => {
      concatenationTransformations.push({ overlay: `video:${assetId}`, flags: 'splice' });
    });
    
    // FIXED: Add platform transformations again to ensure final output is correct
    concatenationTransformations.push(...platformTransformations);
    
    infoLog('Waiting 10 seconds before final concatenation...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const baseVideoUrl = buildCloudinaryUrl(baseAssetId, concatenationTransformations);
    debugLog("Final concatenation URL:", baseVideoUrl);
    
    const finalVideoResult = await uploadToCloudinary(baseVideoUrl, finalVideoPublicId, concatenationTransformations);

    const finalUrl = finalVideoResult.secure_url;
    
    infoLog(`Final ${platform} video created and will be preserved: ${finalVideoPublicId}`);
    
    progressTracker.sendProgress({
      phase: 'concatenation',
      progress: 80,
      message: `${platform} video concatenation completed successfully`,
      details: { method: 'direct_api_concatenation', finalUrl, finalVideoId: finalVideoPublicId, platform },
      timestamp: new Date().toISOString()
    });

    // ====================================================================
    // PHASE 3: CLEANUP (ONLY TEMP FILES)
    // ====================================================================
    progressTracker.sendProgress({
      phase: 'cleanup',
      progress: 85,
      message: 'Cleaning up temporary processing files...',
      timestamp: new Date().toISOString()
    });

    await performCleanup(temporaryAssetIds, finalVideoPublicId);
    
    progressTracker.sendProgress({
      phase: 'cleanup',
      progress: 95,
      message: 'Cleanup completed - temp files removed, final videos preserved',
      timestamp: new Date().toISOString()
    });

    return {
      url: finalUrl,
      method: 'direct_api_concatenation',
      stats: {
        inputVideos: videos.length,
        totalOriginalDuration: totalOriginalDuration.toFixed(3),
        targetDuration: targetDuration.toFixed(3),
        trimmedAssets: createdAssets.length,
        platform,
        platformTransformations
      }
    };

  } catch (error) {
    await performCleanup(temporaryAssetIds, '');
    throw error;
  }
}

async function performCleanup(temporaryAssetIds: Set<string>, finalVideoPublicId: string) {
  if (temporaryAssetIds.size > 0) {
    const idsToDelete = Array.from(temporaryAssetIds).filter(id => 
      id.startsWith('p1_trimmed_') && id !== finalVideoPublicId
    );
    
    infoLog(`Cleanup strategy: Delete ${idsToDelete.length} temp files, keep final video ${finalVideoPublicId}`, {
      toDelete: idsToDelete,
      toKeep: finalVideoPublicId
    });
    
    if (idsToDelete.length > 0) {
      try {
        infoLog('Waiting 10 seconds for temp assets to be fully processed...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        const cloudName = 'dsxrmo3kt';
        const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
        const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

        if (!apiKey || !apiSecret) {
          warnLog('Missing Cloudinary credentials for cleanup');
          return;
        }
        
        let successCount = 0;
        let failCount = 0;
        
        for (const assetId of idsToDelete) {
          let deleted = false;
          let lastError = null;
          
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              infoLog(`Cleanup attempt ${attempt}/3 for temp asset: ${assetId}`);
              
              const deleteUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/destroy`;
              const timestamp = Math.round(Date.now() / 1000);
              
              // FIXED: Proper signature for delete operation
              const deleteParams = {
                'public_id': assetId,
                'timestamp': timestamp.toString()
              };
              
              const sortedKeys = Object.keys(deleteParams).sort();
              const stringToSign = sortedKeys
                .map(key => `${key}=${deleteParams[key]}`)
                .join('&') + apiSecret;
              
              const encoder = new TextEncoder();
              const data = encoder.encode(stringToSign);
              const hashBuffer = await crypto.subtle.digest('SHA-1', data);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
              
              const formData = new FormData();
              formData.append('public_id', assetId);
              formData.append('api_key', apiKey);
              formData.append('timestamp', timestamp.toString());
              formData.append('signature', signature);
              
              const response = await fetch(deleteUrl, {
                method: 'POST',
                body: formData
              });
              
              if (response.ok) {
                const result = await response.json();
                if (result.result === 'ok' || result.result === 'not found') {
                  successCount++;
                  deleted = true;
                  infoLog(`✅ Successfully deleted: ${assetId}`);
                  break;
                } else {
                  lastError = `Unexpected deletion result: ${JSON.stringify(result)}`;
                }
              } else {
                const errorText = await response.text();
                lastError = `HTTP error: ${response.status} ${errorText}`;
              }
              
            } catch (deleteError) {
              lastError = deleteError?.message || 'Unknown error';
              
              if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
            }
          }
          
          if (!deleted) {
            failCount++;
            errorLog(`❌ Failed to delete temp asset after 3 attempts: ${assetId}`, lastError);
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        infoLog(`Cleanup summary: ${successCount}/${idsToDelete.length} temp assets processed`, {
          successCount,
          failCount,
          totalTempAssets: idsToDelete.length,
          keptFinalVideo: finalVideoPublicId,
          successRate: `${((successCount / idsToDelete.length) * 100).toFixed(1)}%`
        });
        
      } catch (cleanupError) {
        errorLog("Cleanup process failed", {
          error: cleanupError?.message || 'Unknown error',
          tempAssetsToDelete: idsToDelete
        });
      }
    } else {
      infoLog("No temporary assets to clean up");
    }
  }
}

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

    infoLog('Processing video request', {
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
            message: `Starting ${platform} video processing...`,
            timestamp: new Date().toISOString()
          });

          processVideo(videos, targetDuration, platform, progressTracker)
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
      const result = await processVideo(videos, targetDuration, platform, progressTracker);
      
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