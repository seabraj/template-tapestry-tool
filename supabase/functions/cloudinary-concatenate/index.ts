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

async function waitForAssetAvailability(
  publicId: string, 
  resourceType: string = 'video', 
  maxAttempts: number = 10,
  progressTracker?: ProgressTracker
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await cloudinary.api.resource(publicId, { resource_type: resourceType });
      debugLog(`Asset ${publicId} is available (attempt ${attempt})`);
      return true;
    } catch (error) {
      debugLog(`Asset ${publicId} not ready yet (attempt ${attempt}/${maxAttempts})`);
      
      if (progressTracker) {
        progressTracker.sendProgress({
          phase: 'asset_verification',
          progress: 35 + (attempt / maxAttempts) * 5, // 35-40% range
          message: `Verifying asset ${publicId.split('_').pop()}... (${attempt}/${maxAttempts})`,
          timestamp: new Date().toISOString()
        });
      }
      
      if (attempt === maxAttempts) {
        throw new Error(`Asset ${publicId} never became available after ${maxAttempts} attempts`);
      }
      // Wait 2 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return false;
}

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

async function processVideo(
  videos: any[], 
  targetDuration: number,
  progressTracker: ProgressTracker
): Promise<{ url: string; method: string; stats: any }> {
  const temporaryAssetIds = new Set<string>();
  
  try {
    // ====================================================================
    // PHASE 1: CREATE TRIMMED VIDEOS
    // ====================================================================
    progressTracker.sendProgress({
      phase: 'trimming',
      progress: 5,
      message: 'Starting video trimming process...',
      timestamp: new Date().toISOString()
    });

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const createdAssets = [];
    
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `p1_trimmed_${i}_${timestamp}`;
      temporaryAssetIds.add(trimmedId);

      progressTracker.sendProgress({
        phase: 'trimming',
        progress: 5 + (i / videos.length) * 25, // 5-30% range
        message: `Trimming video ${i + 1} of ${videos.length}...`,
        details: { videoIndex: i, trimmedId },
        timestamp: new Date().toISOString()
      });

      const trimmedUrl = cloudinary.url(video.publicId, {
        resource_type: 'video',
        transformation: [{ duration: proportionalDuration.toFixed(6) }]
      });
      
      debugLog(`Creating trimmed video ${i + 1}/${videos.length}`, {
        originalId: video.publicId,
        trimmedId,
        originalDuration: video.duration,
        proportionalDuration: proportionalDuration.toFixed(6)
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
      message: `All ${createdAssets.length} videos trimmed successfully`,
      timestamp: new Date().toISOString()
    });
    
    // ====================================================================
    // PHASE 1.5: WAIT FOR ASSET AVAILABILITY
    // ====================================================================
    progressTracker.sendProgress({
      phase: 'asset_verification',
      progress: 35,
      message: 'Verifying all assets are ready...',
      timestamp: new Date().toISOString()
    });

    const sortedAssets = createdAssets.sort((a, b) => a.order - b.order);
    
    for (const asset of sortedAssets) {
      await waitForAssetAvailability(asset.publicId, 'video', 10, progressTracker);
    }
    
    progressTracker.sendProgress({
      phase: 'asset_verification',
      progress: 40,
      message: 'All assets verified and ready',
      timestamp: new Date().toISOString()
    });
    
    // ====================================================================
    // PHASE 2: CONCATENATE VIDEOS
    // ====================================================================
    progressTracker.sendProgress({
      phase: 'concatenation',
      progress: 45,
      message: 'Starting video concatenation...',
      timestamp: new Date().toISOString()
    });
    
    const publicIdsToConcat = sortedAssets.map(asset => asset.publicId);
    debugLog("Assets to concatenate in order:", publicIdsToConcat);

    // Method A: Try URL-based concatenation first (more reliable)
    try {
      progressTracker.sendProgress({
        phase: 'concatenation',
        progress: 50,
        message: 'Building concatenation URL...',
        timestamp: new Date().toISOString()
      });

      const concatenationUrl = await buildConcatenationUrl(publicIdsToConcat);
      debugLog("Built concatenation URL:", concatenationUrl);

      progressTracker.sendProgress({
        phase: 'concatenation',
        progress: 60,
        message: 'Uploading final concatenated video...',
        timestamp: new Date().toISOString()
      });

      const finalVideoPublicId = `p2_final_video_${timestamp}`;
      
      const finalVideoResult = await cloudinary.uploader.upload(concatenationUrl, {
        resource_type: 'video',
        public_id: finalVideoPublicId,
        overwrite: true,
        transformation: [
          { quality: 'auto:good' }
        ]
      });

      const finalUrl = finalVideoResult.secure_url;
      
      progressTracker.sendProgress({
        phase: 'concatenation',
        progress: 80,
        message: 'Video concatenation completed successfully',
        details: { method: 'url_concatenation', finalUrl },
        timestamp: new Date().toISOString()
      });

      // ====================================================================
      // PHASE 3: CLEANUP
      // ====================================================================
      progressTracker.sendProgress({
        phase: 'cleanup',
        progress: 85,
        message: 'Cleaning up temporary assets...',
        timestamp: new Date().toISOString()
      });

      if (temporaryAssetIds.size > 0) {
        const idsToDelete = Array.from(temporaryAssetIds);
        debugLog(`Deleting ${idsToDelete.length} temporary assets`, idsToDelete);
        
        try {
          // Delete video assets in batches (Cloudinary limit is 100 per request)
          const batchSize = 100;
          for (let i = 0; i < idsToDelete.length; i += batchSize) {
            const batch = idsToDelete.slice(i, i + batchSize);
            infoLog(`Deleting batch ${Math.floor(i/batchSize) + 1}: ${batch.length} assets`);
            
            const deleteResult = await cloudinary.api.delete_resources(batch, { 
              resource_type: 'video',
              type: 'upload' // Specify the asset type
            });
            
            debugLog(`Batch deletion result:`, {
              deleted: deleteResult.deleted,
              partial: deleteResult.partial,
              not_found: deleteResult.not_found
            });
          }
          
          infoLog("Cleanup completed successfully");
        } catch (cleanupError) {
          errorLog("Cleanup failed, but final video was created successfully", {
            error: cleanupError.message,
            stack: cleanupError.stack,
            assetsToDelete: idsToDelete
          });
        }
      }
      
      progressTracker.sendProgress({
        phase: 'cleanup',
        progress: 95,
        message: 'Cleanup completed',
        timestamp: new Date().toISOString()
      });

      return {
        url: finalUrl,
        method: 'url_concatenation',
        stats: {
          inputVideos: videos.length,
          totalOriginalDuration: totalOriginalDuration.toFixed(3),
          targetDuration: targetDuration.toFixed(3),
          trimmedAssets: createdAssets.length
        }
      };

    } catch (urlError) {
      warnLog("URL-based concatenation failed, trying manifest method", urlError);
      
      progressTracker.sendProgress({
        phase: 'concatenation',
        progress: 50,
        message: 'URL method failed, trying manifest-based concatenation...',
        timestamp: new Date().toISOString()
      });
      
      // Method B: Fallback to manifest-based concatenation
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
        progress: 65,
        message: 'Creating final video from manifest...',
        timestamp: new Date().toISOString()
      });
      
      // Get the manifest URL
      const manifestUrl = cloudinary.url(manifestPublicId, { resource_type: 'raw' });
      
      const finalVideoPublicId = `p2_final_video_${timestamp}`;
      
      // Try using the manifest URL directly
      const finalVideoResult = await cloudinary.uploader.upload(manifestUrl, {
        resource_type: 'video',
        public_id: finalVideoPublicId,
        raw_convert: 'concatenate',
        overwrite: true,
      });

      const finalUrl = finalVideoResult.secure_url;
      
      progressTracker.sendProgress({
        phase: 'concatenation',
        progress: 80,
        message: 'Video concatenation completed via manifest method',
        details: { method: 'manifest_concatenation', finalUrl },
        timestamp: new Date().toISOString()
      });

      // Cleanup
      temporaryAssetIds.add(manifestPublicId);
      if (temporaryAssetIds.size > 0) {
        const videoIdsToDelete = Array.from(temporaryAssetIds).filter(id => id !== finalVideoPublicId && !id.includes('manifest'));
        try {
          if (videoIdsToDelete.length > 0) {
            await cloudinary.api.delete_resources(videoIdsToDelete, { 
              resource_type: 'video',
              type: 'upload'
            });
          }
          await cloudinary.api.delete_resources([manifestPublicId], { 
            resource_type: 'raw',
            type: 'upload'
          });
          infoLog("Cleanup completed successfully");
        } catch (cleanupError) {
          errorLog("Cleanup failed", {
            error: cleanupError.message,
            videoAssets: videoIdsToDelete,
            manifestAsset: manifestPublicId
          });
        }
      }

      progressTracker.sendProgress({
        phase: 'cleanup',
        progress: 95,
        message: 'Cleanup completed',
        timestamp: new Date().toISOString()
      });

      return {
        url: finalUrl,
        method: 'manifest_concatenation',
        stats: {
          inputVideos: videos.length,
          totalOriginalDuration: totalOriginalDuration.toFixed(3),
          targetDuration: targetDuration.toFixed(3),
          trimmedAssets: createdAssets.length
        }
      };
    }

  } catch (error) {
    // Cleanup on error
    if (temporaryAssetIds.size > 0) {
      try {
        const idsToDelete = Array.from(temporaryAssetIds);
        infoLog(`Attempting cleanup after error: ${idsToDelete.length} assets`);
        
        await cloudinary.api.delete_resources(idsToDelete, { 
          resource_type: 'video',
          type: 'upload'
        });
        
        infoLog("Error cleanup completed successfully");
      } catch (cleanupError) {
        errorLog("Cleanup after error also failed:", {
          originalError: error.message,
          cleanupError: cleanupError.message,
          assetsToDelete: Array.from(temporaryAssetIds)
        });
      }
    }
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const { videos, targetDuration, enableProgress = false } = requestBody;

    if (!videos || videos.length === 0 || !targetDuration || targetDuration <= 0) {
      throw new Error('Invalid request body');
    }

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
            message: 'Starting video processing...',
            timestamp: new Date().toISOString()
          });

          // Process video asynchronously
          processVideo(videos, targetDuration, progressTracker)
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
      // Traditional request-response for backward compatibility
      const progressTracker = new ProgressTracker(); // No SSE controller
      const result = await processVideo(videos, targetDuration, progressTracker);
      
      return new Response(JSON.stringify({ 
        success: true, 
        ...result
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

  } catch (error) {
    errorLog(`FATAL ERROR`, { message: error.message, stack: error.stack });
    
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