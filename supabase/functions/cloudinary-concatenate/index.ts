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
        // PHASE 1: TRIM AND EAGERLY CROP VIDEOS
        // ====================================================================
        progressTracker.sendProgress({ phase: 'transformation', progress: 5, message: 'Starting video trimming and cropping...', timestamp: new Date().toISOString() });
        
        const transformationPromises = videos.map(async (video, i) => {
            const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
            const trimmedId = `p1_trimmed_${i}_${timestamp}`;
            temporaryAssetIds.add(trimmedId);

            progressTracker.sendProgress({ phase: 'transformation', progress: 10 + (i / videos.length) * 30, message: `Processing video ${i + 1}/${videos.length}...`, timestamp: new Date().toISOString() });
            
            // Create a trimmed version, and EAGERLY create a cropped version of it
            await cloudinary.uploader.upload(video.file_url, {
                resource_type: 'video',
                public_id: trimmedId,
                overwrite: true,
                transformation: [{ duration: proportionalDuration.toFixed(6) }],
                eager: [
                    { width, height, crop: 'fill', gravity: 'auto' }
                ],
                eager_async: false // Wait for eager transformations to complete
            });
            
            return { publicId: trimmedId, order: i };
        });

        const transformedAssets = await Promise.all(transformationPromises);
        progressTracker.sendProgress({ phase: 'transformation', progress: 40, message: 'All videos transformed.', timestamp: new Date().toISOString() });

        // ====================================================================
        // PHASE 2: CONCATENATE THE EAGERLY CROPPED VIDEOS
        // ====================================================================
        progressTracker.sendProgress({ phase: 'concatenation', progress: 50, message: 'Preparing final concatenation...', timestamp: new Date().toISOString() });

        // Construct the transformation string for the final asset
        const cropTransformation = `w_${width},h_${height},c_fill,g_auto`;

        const manifestLines = transformedAssets
            .sort((a, b) => a.order - b.order)
            // Use the derived (eagerly transformed) version for concatenation
            .map(asset => `file '${cropTransformation}/${asset.publicId}.mp4'`);

        const manifestContent = manifestLines.join('\n');
        debugLog("Generated Manifest:", manifestContent);

        const manifestPublicId = `p2_manifest_${timestamp}`;
        temporaryAssetIds.add(manifestPublicId);

        progressTracker.sendProgress({ phase: 'concatenation', progress: 65, message: 'Uploading concatenation manifest...', timestamp: new Date().toISOString() });
        await cloudinary.uploader.upload(`data:text/plain;base64,${btoa(manifestContent)}`, {
            resource_type: 'raw',
            public_id: manifestPublicId,
            overwrite: true,
        });

        await waitForAssetAvailability(manifestPublicId, 'raw');

        progressTracker.sendProgress({ phase: 'concatenation', progress: 75, message: 'Generating final video from manifest...', timestamp: new Date().toISOString() });
        
        const finalVideoPublicId = `final_video_${timestamp}`;
        
        const finalVideoResult = await cloudinary.uploader.upload(cloudinary.url(manifestPublicId, { resource_type: 'raw' }), {
            resource_type: 'video',
            public_id: finalVideoPublicId,
            raw_convert: 'concatenate',
            overwrite: true,
        });
        
        progressTracker.sendProgress({ phase: 'concatenation', progress: 90, message: 'Final video generated.', timestamp: new Date().toISOString() });

        // ====================================================================
        // PHASE 3: CLEANUP
        // ====================================================================
        infoLog("Starting cleanup of temporary assets...", { assets: Array.from(temporaryAssetIds) });
        try {
            await cloudinary.api.delete_resources(Array.from(temporaryAssetIds).filter(id => !id.includes('manifest')), { resource_type: 'video' });
            await cloudinary.api.delete_resources([manifestPublicId], { resource_type: 'raw' });
            infoLog("Cleanup successful.");
        } catch (cleanupError) {
            errorLog("Cleanup process failed, some temporary files may remain.", cleanupError);
        }
        progressTracker.sendProgress({ phase: 'cleanup', progress: 95, message: 'Cleanup complete.', timestamp: new Date().toISOString() });

        return {
            url: finalVideoResult.secure_url,
            method: 'eager_transform_and_manifest',
            stats: {
                inputVideos: videos.length,
                totalOriginalDuration: totalOriginalDuration.toFixed(3),
                targetDuration: targetDuration.toFixed(3),
            }
        };
    } catch (error) {
        errorLog("Video processing pipeline failed.", error);
        if (temporaryAssetIds.size > 0) {
            warnLog("Attempting to cleanup failed assets...", { assets: Array.from(temporaryAssetIds) });
            // Cleanup logic...
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