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

function getPlatformDimensions(platform: string): { width: number; height: number; aspectRatio: string } {
  switch (platform) {
    case 'youtube':
      return { width: 1920, height: 1080, aspectRatio: '16:9' };
    case 'facebook':
      return { width: 1080, height: 1080, aspectRatio: '1:1' };
    case 'instagram':
      return { width: 1080, height: 1920, aspectRatio: '9:16' };
    default:
      return { width: 1920, height: 1080, aspectRatio: '16:9' };
  }
}

async function processVideo(
  videos: any[],
  targetDuration: number,
  platform: string,
  progressTracker: ProgressTracker
): Promise<{ url: string; method: string; stats: any }> {
  const temporaryAssetIds = new Set<string>();
  const timestamp = Date.now();

  try {
    const { width, height } = getPlatformDimensions(platform);
    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);

    // ====================================================================
    // PHASE 1: CREATE TRIMMED VIDEOS
    // ====================================================================
    progressTracker.sendProgress({ phase: 'trimming', progress: 5, message: 'Starting video trimming...', timestamp: new Date().toISOString() });
    const trimmedAssets = [];
    for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
        const trimmedId = `p1_trimmed_${i}_${timestamp}`;
        temporaryAssetIds.add(trimmedId);

        progressTracker.sendProgress({ phase: 'trimming', progress: 5 + (i / videos.length) * 15, message: `Trimming video ${i + 1}/${videos.length}...`, timestamp: new Date().toISOString() });

        const trimmedUrl = cloudinary.url(video.publicId, { resource_type: 'video', transformation: [{ duration: proportionalDuration.toFixed(6) }] });
        const uploadResult = await cloudinary.uploader.upload(trimmedUrl, { resource_type: 'video', public_id: trimmedId, overwrite: true });
        
        trimmedAssets.push({ publicId: uploadResult.public_id, order: i });
    }
    progressTracker.sendProgress({ phase: 'trimming', progress: 20, message: 'All videos trimmed.', timestamp: new Date().toISOString() });

    // ====================================================================
    // PHASE 2: CROP & RESIZE TRIMMED VIDEOS
    // ====================================================================
    progressTracker.sendProgress({ phase: 'cropping', progress: 25, message: 'Starting video cropping/resizing...', timestamp: new Date().toISOString() });
    const croppedAssets = [];
    for (let i = 0; i < trimmedAssets.length; i++) {
        const asset = trimmedAssets[i];
        await waitForAssetAvailability(asset.publicId, 'video'); // Wait for trimmed asset
        
        const croppedId = `p2_cropped_${i}_${timestamp}`;
        temporaryAssetIds.add(croppedId);

        progressTracker.sendProgress({ phase: 'cropping', progress: 25 + (i / trimmedAssets.length) * 25, message: `Cropping video ${i + 1}/${trimmedAssets.length}...`, timestamp: new Date().toISOString() });
        
        const croppedUrl = cloudinary.url(asset.publicId, { resource_type: 'video', transformation: [{ width, height, crop: 'fill', gravity: 'auto' }] });
        const uploadResult = await cloudinary.uploader.upload(croppedUrl, { resource_type: 'video', public_id: croppedId, overwrite: true });

        croppedAssets.push({ publicId: uploadResult.public_id, order: i });
    }
    progressTracker.sendProgress({ phase: 'cropping', progress: 50, message: 'All videos cropped.', timestamp: new Date().toISOString() });

    // ====================================================================
    // PHASE 3: CONCATENATE CROPPED VIDEOS VIA MANIFEST
    // ====================================================================
    progressTracker.sendProgress({ phase: 'concatenation', progress: 55, message: 'Starting concatenation...', timestamp: new Date().toISOString() });
    const sortedCroppedAssets = croppedAssets.sort((a, b) => a.order - b.order);
    for (const asset of sortedCroppedAssets) {
        await waitForAssetAvailability(asset.publicId, 'video'); // Wait for cropped asset
    }

    const manifestLines = sortedCroppedAssets.map(asset => `file '${asset.publicId}'`);
    const manifestContent = manifestLines.join('\n');
    const manifestPublicId = `p3_manifest_${timestamp}`;
    temporaryAssetIds.add(manifestPublicId);

    progressTracker.sendProgress({ phase: 'concatenation', progress: 65, message: 'Uploading concatenation manifest...', timestamp: new Date().toISOString() });
    await cloudinary.uploader.upload(`data:text/plain;base64,${btoa(manifestContent)}`, { resource_type: 'raw', public_id: manifestPublicId, overwrite: true });
    await waitForAssetAvailability(manifestPublicId, 'raw');

    progressTracker.sendProgress({ phase: 'concatenation', progress: 75, message: 'Generating final video from manifest...', timestamp: new Date().toISOString() });
    
    const finalVideoPublicId = `final_video_${timestamp}`;
    // We DO NOT add final video to cleanup list
    const finalVideoResult = await cloudinary.uploader.upload(cloudinary.url(manifestPublicId, { resource_type: 'raw' }), {
        resource_type: 'video',
        public_id: finalVideoPublicId,
        raw_convert: 'concatenate',
        overwrite: true,
    });
    
    progressTracker.sendProgress({ phase: 'concatenation', progress: 90, message: 'Final video generated.', timestamp: new Date().toISOString() });
    
    // ====================================================================
    // PHASE 4: CLEANUP
    // ====================================================================
    infoLog("Starting cleanup of temporary assets...", { assets: Array.from(temporaryAssetIds) });
    try {
      await cloudinary.api.delete_resources(Array.from(temporaryAssetIds), { resource_type: 'video' });
      await cloudinary.api.delete_resources([manifestPublicId], { resource_type: 'raw' });
      infoLog("Cleanup successful.");
    } catch (cleanupError) {
      errorLog("Cleanup process failed, some temporary files may remain.", cleanupError);
    }
    progressTracker.sendProgress({ phase: 'cleanup', progress: 95, message: 'Cleanup complete.', timestamp: new Date().toISOString() });

    return {
      url: finalVideoResult.secure_url,
      method: 'staged_manifest_concatenation',
      stats: {
        inputVideos: videos.length,
        totalOriginalDuration: totalOriginalDuration.toFixed(3),
        targetDuration: targetDuration.toFixed(3),
      }
    };
  } catch (error) {
      errorLog("Video processing pipeline failed.", error);
      // Aggressive cleanup on failure
      if (temporaryAssetIds.size > 0) {
        warnLog("Attempting to cleanup failed assets...");
        try {
          await cloudinary.api.delete_resources(Array.from(temporaryAssetIds), { resource_type: 'video' });
          const manifestId = Array.from(temporaryAssetIds).find(id => id.includes('_manifest_'));
          if (manifestId) {
            await cloudinary.api.delete_resources([manifestId], { resource_type: 'raw' });
          }
        } catch (cleanupError) {
          errorLog("Cleanup after error also failed.", cleanupError);
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
    const { videos, targetDuration, platform, enableProgress = false } = requestBody;

    if (!videos || videos.length === 0 || !targetDuration || targetDuration <= 0 || !platform) {
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
      // Traditional request-response with enhanced cleanup
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