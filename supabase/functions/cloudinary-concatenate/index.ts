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

// Environment-based logging configuration
const LOG_LEVEL = Deno.env.get('LOG_LEVEL') || 'INFO'; // DEBUG, INFO, WARN, ERROR
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
    return; // Skip if message level is below current threshold
  }
  
  const timestamp = includeTimestamp ? `[${new Date().toISOString()}]` : '';
  const prefix = IS_PRODUCTION ? `[${level}]` : `[${level}] 🎬`;
  
  console.log(`${timestamp} ${prefix} ${message}`);
  
  if (data) {
    if (IS_PRODUCTION) {
      // In production, only log essential data and avoid deep object logging
      if (level === 'ERROR' || level === 'WARN') {
        console.log(`${timestamp} ${prefix} Data:`, JSON.stringify(data, null, 2));
      } else {
        console.log(`${timestamp} ${prefix} Data:`, JSON.stringify(data));
      }
    } else {
      // In development, log everything with formatting
      console.log(`${timestamp} ${prefix} Data:`, JSON.stringify(data, null, 2));
    }
  }
}

// Convenience functions
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
  progress: number; // 0-100
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
    
    // Also log for debugging
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

// Platform-specific transformations
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

async function waitForAssetAvailability(
  publicId: string, 
  resourceType: string = 'video', 
  maxAttempts: number = 15,
  progressTracker?: ProgressTracker
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await cloudinary.api.resource(publicId, { resource_type: resourceType });
      if (result && result.public_id) {
        debugLog(`Asset ${publicId} is available (attempt ${attempt})`);
        return true;
      }
    } catch (error) {
      debugLog(`Asset ${publicId} not ready yet (attempt ${attempt}/${maxAttempts})`, error.message);
      
      if (progressTracker) {
        progressTracker.sendProgress({
          phase: 'asset_verification',
          progress: 35 + (attempt / maxAttempts) * 10, // 35-45% range
          message: `Verifying asset ${publicId.split('_').pop()}... (${attempt}/${maxAttempts})`,
          timestamp: new Date().toISOString()
        });
      }
      
      if (attempt === maxAttempts) {
        throw new Error(`Asset ${publicId} never became available after ${maxAttempts} attempts`);
      }
      // Wait longer between retries
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  return false;
}

async function buildConcatenationUrl(assetIds: string[], platform: string): Promise<string> {
  if (assetIds.length === 0) {
    throw new Error('No assets to concatenate');
  }

  const platformTransformations = getPlatformTransformations(platform);

  if (assetIds.length === 1) {
    // Single video, just return its URL with platform transformations
    return cloudinary.url(assetIds[0], {
      resource_type: 'video',
      transformation: platformTransformations
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

  // Add platform-specific transformations
  transformations.push(...platformTransformations);

  return cloudinary.url(baseVideo, {
    resource_type: 'video',
    transformation: transformations
  });
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
        progress: 5 + (i / videos.length) * 25, // 5-30% range
        message: `Processing video ${i + 1} of ${videos.length} for ${platform}...`,
        details: { videoIndex: i, trimmedId, platform },
        timestamp: new Date().toISOString()
      });

      // Create transformation array step by step
      const transformationArray = [
        { duration: proportionalDuration.toFixed(6) }
      ];
      
      // Add platform-specific transformations
      transformationArray.push(...platformTransformations);
      
      const trimmedUrl = cloudinary.url(video.publicId, {
        resource_type: 'video',
        transformation: transformationArray
      });
      
      debugLog(`Creating trimmed and formatted video ${i + 1}/${videos.length}`, {
        originalId: video.publicId,
        trimmedId,
        platform,
        originalDuration: video.duration,
        proportionalDuration: proportionalDuration.toFixed(6),
        transformations: transformationArray,
        generatedUrl: trimmedUrl
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
    
    // Wait longer before checking availability
    infoLog('Waiting 8 seconds for assets to be fully processed...');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    for (const asset of sortedAssets) {
      await waitForAssetAvailability(asset.publicId, 'video', 15, progressTracker);
    }
    
    progressTracker.sendProgress({
      phase: 'asset_verification',
      progress: 45,
      message: 'All assets verified and ready for concatenation',
      timestamp: new Date().toISOString()
    });
    
    // ====================================================================
    // PHASE 2: CONCATENATE VIDEOS
    // ====================================================================
    progressTracker.sendProgress({
      phase: 'concatenation',
      progress: 50,
      message: `Combining videos for ${platform} output...`,
      timestamp: new Date().toISOString()
    });
    
    const publicIdsToConcat = sortedAssets.map(asset => asset.publicId);
    debugLog("Assets to concatenate in order:", publicIdsToConcat);

    // Method A: Try URL-based concatenation first (more reliable)
    try {
      progressTracker.sendProgress({
        phase: 'concatenation',
        progress: 55,
        message: `Building ${platform} concatenation URL...`,
        timestamp: new Date().toISOString()
      });

      const concatenationUrl = await buildConcatenationUrl(publicIdsToConcat, platform);
      debugLog("Built concatenation URL with platform formatting:", concatenationUrl);

      progressTracker.sendProgress({
        phase: 'concatenation',
        progress: 65,
        message: `Creating final ${platform} video...`,
        timestamp: new Date().toISOString()
      });

      const finalVideoPublicId = `p2_final_video_${timestamp}`;
      
      // Wait a bit more before final concatenation
      infoLog('Waiting 5 seconds before final concatenation...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const finalVideoResult = await cloudinary.uploader.upload(concatenationUrl, {
        resource_type: 'video',
        public_id: finalVideoPublicId,
        overwrite: true,
        transformation: [
          { quality: 'auto:good' }
        ]
      });

      const finalUrl = finalVideoResult.secure_url;
      
      infoLog(`Final ${platform} video created and will be preserved: ${finalVideoPublicId}`);
      
      progressTracker.sendProgress({
        phase: 'concatenation',
        progress: 80,
        message: `${platform} video concatenation completed successfully`,
        details: { method: 'url_concatenation', finalUrl, finalVideoId: finalVideoPublicId, platform },
        timestamp: new Date().toISOString()
      });

      // ====================================================================
      // PHASE 3: ENHANCED CLEANUP (ONLY TEMP FILES)
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
        method: 'url_concatenation',
        stats: {
          inputVideos: videos.length,
          totalOriginalDuration: totalOriginalDuration.toFixed(3),
          targetDuration: targetDuration.toFixed(3),
          trimmedAssets: createdAssets.length,
          platform,
          platformTransformations
        }
      };

    } catch (urlError) {
      warnLog("URL-based concatenation failed, trying manifest method", urlError);
      
      progressTracker.sendProgress({
        phase: 'concatenation',
        progress: 55,
        message: 'URL method failed, trying manifest-based concatenation...',
        timestamp: new Date().toISOString()
      });
      
      // Method B: Fallback to manifest-based concatenation (FIXED)
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
      
      progressTracker.sendProgress({
        phase: 'concatenation',
        progress: 70,
        message: `Creating final ${platform} video from manifest...`,
        timestamp: new Date().toISOString()
      });
      
      const finalVideoPublicId = `p2_final_video_${timestamp}`;
      
      // Create a simple concatenation using first video as base with overlays
      // This is a more reliable method than using manifest for concatenation
      const baseAsset = sortedAssets[0];
      const overlayAssets = sortedAssets.slice(1);
      
      const concatenationTransformations = [];
      
      // Add overlays for each additional video
      overlayAssets.forEach(asset => {
        concatenationTransformations.push({
          overlay: `video:${asset.publicId}`,
          flags: 'splice'
        });
      });
      
      // Add platform transformations
      concatenationTransformations.push(...platformTransformations);
      
      const finalVideoResult = await cloudinary.uploader.upload(
        cloudinary.url(baseAsset.publicId, {
          resource_type: 'video',
          transformation: concatenationTransformations
        }),
        {
          resource_type: 'video',
          public_id: finalVideoPublicId,
          overwrite: true,
        }
      );

      const finalUrl = finalVideoResult.secure_url;
      
      infoLog(`Final ${platform} video created via improved method and will be preserved: ${finalVideoPublicId}`);
      
      progressTracker.sendProgress({
        phase: 'concatenation',
        progress: 80,
        message: `${platform} video concatenation completed via improved method`,
        details: { method: 'improved_concatenation', finalUrl, finalVideoId: finalVideoPublicId, platform },
        timestamp: new Date().toISOString()
      });

      // Cleanup
      await performCleanup(temporaryAssetIds, finalVideoPublicId);

      progressTracker.sendProgress({
        phase: 'cleanup',
        progress: 95,
        message: 'Cleanup completed',
        timestamp: new Date().toISOString()
      });

      return {
        url: finalUrl,
        method: 'improved_concatenation',
        stats: {
          inputVideos: videos.length,
          totalOriginalDuration: totalOriginalDuration.toFixed(3),
          targetDuration: targetDuration.toFixed(3),
          trimmedAssets: createdAssets.length,
          platform,
          platformTransformations
        }
      };
    }

  } catch (error) {
    // Cleanup on error
    await performCleanup(temporaryAssetIds, '');
    throw error;
  }
}

async function performCleanup(temporaryAssetIds: Set<string>, finalVideoPublicId: string) {
  if (temporaryAssetIds.size > 0) {
    // Filter to only delete temporary files, NOT final videos
    const idsToDelete = Array.from(temporaryAssetIds).filter(id => 
      (id.startsWith('p1_trimmed_') || id.startsWith('p2_manifest_')) && id !== finalVideoPublicId
    );
    
    infoLog(`Cleanup strategy: Delete ${idsToDelete.length} temp files, keep final video ${finalVideoPublicId}`, {
      toDelete: idsToDelete,
      toKeep: finalVideoPublicId
    });
    
    if (idsToDelete.length > 0) {
      try {
        // Wait longer for assets to be fully processed and available for deletion
        infoLog('Waiting 5 seconds for temp assets to be fully processed...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        let successCount = 0;
        let failCount = 0;
        
        // Delete only temporary assets one by one with detailed logging and retries
        for (const assetId of idsToDelete) {
          let deleted = false;
          let lastError = null;
          
          // Try up to 3 times for each temp asset
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              infoLog(`Cleanup attempt ${attempt}/3 for temp asset: ${assetId}`);
              
              const resourceType = assetId.startsWith('p2_manifest_') ? 'raw' : 'video';
              const result = await cloudinary.api.delete_resources([assetId], { 
                resource_type: resourceType,
                invalidate: true // Force cache invalidation
              });
              
              infoLog(`Deletion API response for ${assetId}:`, result);
              
              // Check if actually deleted
              if (result.deleted && (result.deleted[assetId] === 'deleted' || result.deleted[assetId] === 'not_found')) {
                successCount++;
                deleted = true;
                infoLog(`✅ Successfully processed temp asset: ${assetId}`);
                break;
              } else {
                lastError = `Unexpected deletion result: ${JSON.stringify(result)}`;
                warnLog(`Attempt ${attempt} failed for ${assetId}:`, lastError);
              }
              
            } catch (deleteError) {
              lastError = deleteError?.message || 'Unknown error';
              warnLog(`Attempt ${attempt} failed for ${assetId}:`, lastError);
              
              // Wait before retry
              if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
          }
          
          if (!deleted) {
            failCount++;
            errorLog(`❌ Failed to delete temp asset after 3 attempts: ${assetId}`, lastError);
          }
          
          // Small delay between assets
          await new Promise(resolve => setTimeout(resolve, 500));
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

    // Check if client wants progress updates
    if (enableProgress) {
      // Return Server-Sent Events stream for progress updates
      const stream = new ReadableStream({
        start(controller) {
          const progressTracker = new ProgressTracker(controller);
          
          // Send initial progress
          progressTracker.sendProgress({
            phase: 'initialization',
            progress: 0,
            message: `Starting ${platform} video processing...`,
            timestamp: new Date().toISOString()
          });

          // Process video asynchronously
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
      // Traditional request-response
      const progressTracker = new ProgressTracker(); // No SSE controller, but still tracks progress
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
