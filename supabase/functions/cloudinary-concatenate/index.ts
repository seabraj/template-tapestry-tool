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
  maxAttempts: number = 20, // Increased from 10 to 20
  progressTracker?: ProgressTracker
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      debugLog(`waitForAssetAvailability: Attempt ${attempt} for ${publicId}`);
debugLog(`Fetching resource: ${publicId}`);
const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType });
debugLog(`Fetched resource ${publicId} with status: ${resource.status}`);
      
      // Additional checks for video resources - allow more statuses
      if (resourceType === 'video' && resource.status && ['failed', 'error', 'timeout'].includes(resource.status.toLowerCase())) {
        debugLog(`Asset ${publicId} has failed status: ${resource.status}`);
        throw new Error(`Asset processing failed, status: ${resource.status}`);
      }
      
      // Check if video has basic properties that indicate it's processable
      if (resourceType === 'video' && (!resource.width || !resource.height)) {
        debugLog(`Asset ${publicId} missing video dimensions`);
        // Don't throw error, just log - some videos might still be processing
      }
      
      debugLog(`Asset ${publicId} is available and ready.`);
      return true;
    } catch (error) {
      debugLog(`Asset ${publicId} not ready yet. Attempt ${attempt}/${maxAttempts}`);
      if (attempt === maxAttempts) {
        throw new Error(`Asset ${publicId} never became available after ${maxAttempts} attempts. Last error: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 3000)); // Increased delay to 3 seconds
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
        // PHASE 1: CREATE FINAL SEGMENTS (TRIMMED & CROPPED) IN ONE STEP
        // ====================================================================
        progressTracker.sendProgress({ phase: 'transformation', progress: 5, message: 'Starting video segment processing...', timestamp: new Date().toISOString() });
        
        const finalSegmentPromises = videos.map(async (video, i) => {
            const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
            const finalSegmentId = `p_final_segment_${i}_${timestamp}`;
            temporaryAssetIds.add(finalSegmentId);

            progressTracker.sendProgress({ phase: 'transformation', progress: 10 + (i / videos.length) * 40, message: `Processing video segment ${i + 1}/${videos.length}...`, timestamp: new Date().toISOString() });
            
            // Define a single, chained transformation with proper video codec
            const transformation = [
                { duration: `${proportionalDuration.toFixed(3)}` }, // String format for duration
                { width, height, crop: 'fill', gravity: 'auto', quality: 'auto' },
                { video_codec: 'h264', audio_codec: 'aac', format: 'mp4' } // Ensure compatible codecs and format
            ];

            const uploadOptions = {
                resource_type: 'video',
                public_id: finalSegmentId,
                overwrite: true,
                transformation: transformation
            };

            debugLog(`Uploading and Transforming video ${i+1}`, { file: video.file_url, options: uploadOptions });
            debugLog(`Starting upload and transformation for video: ${video.file_url}`);
            
            // First, validate the URL is accessible
            try {
                const response = await fetch(video.file_url, { method: 'HEAD' });
                if (!response.ok) {
                    throw new Error(`Video URL not accessible: ${response.status} ${response.statusText}`);
                }
                debugLog(`Video URL validated successfully: ${video.file_url}`);
            } catch (fetchError) {
                errorLog(`Failed to validate video URL: ${video.file_url}`, fetchError);
                throw new Error(`Video file not accessible: ${fetchError.message}`);
            }
            
            // Use a two-step approach: upload first, then transform
            try {
                // Step 1: Upload without transformation to avoid corruption issues
                const simpleOptions = {
                    resource_type: 'video',
                    public_id: finalSegmentId,
                    overwrite: true
                };
                
                debugLog(`Step 1: Uploading video without transformation: ${video.file_url}`);
                const uploadResult = await cloudinary.uploader.upload(video.file_url, simpleOptions);
                debugLog(`Step 1 completed - Upload successful:`, {
                    publicId: uploadResult.public_id,
                    status: uploadResult.status || 'completed',
                    format: uploadResult.format,
                    duration: uploadResult.duration
                });
                
                // Wait for the upload to be fully processed
                await waitForAssetAvailability(finalSegmentId, 'video', 5);
                
                // Step 2: Apply transformation separately
                debugLog(`Step 2: Applying transformation to uploaded video: ${finalSegmentId}`);
                const transformResult = await cloudinary.uploader.explicit(finalSegmentId, {
                    resource_type: 'video',
                    type: 'upload',
                    eager: transformation,
                    overwrite: true
                });
                debugLog(`Step 2 completed - Transformation applied successfully`);
                
            } catch (error) {
                errorLog(`Two-step processing failed for: ${video.file_url}`, {
                    error: error.message,
                    code: error.code,
                    httpCode: error.http_code
                });
                throw new Error(`Video processing failed: ${error.message}`);
            }
            
            return { publicId: finalSegmentId, order: i };
        });

        const finalSegments = await Promise.all(finalSegmentPromises);
        progressTracker.sendProgress({ phase: 'transformation', progress: 50, message: 'All video segments processed.', timestamp: new Date().toISOString() });

        // ====================================================================
        // PHASE 2: CONCATENATE THE FINAL SEGMENTS VIA SIMPLE MANIFEST
        // ====================================================================
        progressTracker.sendProgress({ phase: 'concatenation', progress: 60, message: 'Preparing final concatenation...', timestamp: new Date().toISOString() });
        
        // Wait for all final segments to be fully available with optimized timing
        for (const asset of finalSegments) {
            await waitForAssetAvailability(asset.publicId, 'video', 10);
        }

        const manifestLines = finalSegments
            .sort((a, b) => a.order - b.order)
            .map(asset => `file '${asset.publicId}'`); // Simple manifest, no transformations needed

        const manifestContent = manifestLines.join('\n');
        debugLog("Generated simple manifest:", manifestContent);

        const manifestPublicId = `p_manifest_${timestamp}`;
        temporaryAssetIds.add(manifestPublicId);

        progressTracker.sendProgress({ phase: 'concatenation', progress: 70, message: 'Uploading concatenation manifest...', timestamp: new Date().toISOString() });
        await cloudinary.uploader.upload(`data:text/plain;base64,${btoa(manifestContent)}`, {
            resource_type: 'raw',
            public_id: manifestPublicId,
            overwrite: true,
        });
        await waitForAssetAvailability(manifestPublicId, 'raw');

        progressTracker.sendProgress({ phase: 'concatenation', progress: 80, message: 'Generating final video from manifest...', timestamp: new Date().toISOString() });
        
        const finalVideoPublicId = `final_video_${timestamp}`;
        
        const finalVideoOptions = {
            resource_type: 'video',
            public_id: finalVideoPublicId,
            raw_convert: 'concatenate',
            overwrite: true,
        };
        debugLog("Uploading final video from manifest", { url: cloudinary.url(manifestPublicId, { resource_type: 'raw' }), options: finalVideoOptions });
        const finalVideoResult = await cloudinary.uploader.upload(cloudinary.url(manifestPublicId, { resource_type: 'raw' }), finalVideoOptions);
        
        progressTracker.sendProgress({ phase: 'concatenation', progress: 90, message: 'Final video generated.', timestamp: new Date().toISOString() });

        // ====================================================================
        // PHASE 3: CLEANUP
        // ====================================================================
        infoLog("Starting cleanup of temporary assets...", { assets: Array.from(temporaryAssetIds) });
        try {
            const videoIdsToDelete = Array.from(temporaryAssetIds).filter(id => id.includes('segment'));
            const manifestIdsToDelete = [manifestPublicId];
            
            if (videoIdsToDelete.length > 0) {
              debugLog("Deleting temporary video assets", videoIdsToDelete);
              await cloudinary.api.delete_resources(videoIdsToDelete, { resource_type: 'video' });
            }
            if (manifestIdsToDelete.length > 0) {
              debugLog("Deleting temporary manifest asset", manifestIdsToDelete);
              await cloudinary.api.delete_resources(manifestIdsToDelete, { resource_type: 'raw' });
            }
            infoLog("Cleanup successful.");
        } catch (cleanupError) {
            errorLog("Cleanup process failed, some temporary files may remain.", cleanupError);
        }
        progressTracker.sendProgress({ phase: 'cleanup', progress: 95, message: 'Cleanup complete.', timestamp: new Date().toISOString() });

        return {
            url: finalVideoResult.secure_url,
            method: 'single_step_transform_and_manifest',
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

    infoLog('Processing request with:', {
      videoCount: videos?.length || 0,
      targetDuration,
      platform,
      enableProgress
    });

    if (!videos || videos.length === 0 || !targetDuration || targetDuration <= 0 || !platform) {
      throw new Error('Invalid request body: Missing one of videos, targetDuration, or platform.');
    }

    // Validate video objects have required fields
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      if (!video.publicId && !video.file_url) {
        throw new Error(`Video ${i + 1}: Missing both publicId and file_url`);
      }
      if (!video.duration || video.duration <= 0) {
        throw new Error(`Video ${i + 1}: Invalid duration: ${video.duration}`);
      }
      if (!video.file_url) {
        throw new Error(`Video ${i + 1}: Missing file_url for processing`);
      }
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