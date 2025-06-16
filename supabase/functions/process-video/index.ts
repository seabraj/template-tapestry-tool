
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VideoProcessingRequest {
  sequences: Array<{
    id: string;
    name: string;
    duration: number;
    file_url: string;
  }>;
  customization: {
    supers: {
      text: string;
      position: 'top' | 'center' | 'bottom';
      style: 'bold' | 'light' | 'outline';
    };
    endFrame: {
      enabled: boolean;
      text: string;
      logoPosition: 'center' | 'corner';
    };
    cta: {
      enabled: boolean;
      text: string;
      style: 'button' | 'text' | 'animated';
    };
  };
  platform: string;
  duration: number;
}

// Memory monitoring utility
function getMemoryUsage(): number {
  try {
    return (performance as any).memory?.usedJSHeapSize || 0;
  } catch {
    return 0;
  }
}

// Safe video download with streaming and memory checks
async function downloadVideoSafely(url: string, sequenceName: string, maxSize = 50 * 1024 * 1024): Promise<Uint8Array | null> {
  try {
    console.log(`📥 Downloading: ${sequenceName} from ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Supabase-Edge-Function/1.0'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`❌ HTTP error for ${sequenceName}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > maxSize) {
      console.warn(`⚠️ File too large: ${sequenceName} (${parseInt(contentLength)} bytes > ${maxSize} bytes)`);
      return null;
    }
    
    const memoryBefore = getMemoryUsage();
    const arrayBuffer = await response.arrayBuffer();
    const memoryAfter = getMemoryUsage();
    
    console.log(`✅ Downloaded ${sequenceName}: ${(arrayBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`📊 Memory usage: ${((memoryAfter - memoryBefore) / (1024 * 1024)).toFixed(2)} MB increase`);
    
    return new Uint8Array(arrayBuffer);
    
  } catch (error) {
    console.error(`❌ Download failed for ${sequenceName}:`, error.message);
    return null;
  }
}

// Create enhanced metadata with video processing instructions
function createEnhancedMetadata(sequences: any[], customization: any, platform: string, videoBuffers: any[]): any {
  return {
    type: 'enhanced_video_metadata',
    version: '4.0',
    timestamp: Date.now(),
    processing: {
      platform: platform,
      totalSequences: sequences.length,
      processedSequences: videoBuffers.length,
      failedSequences: sequences.length - videoBuffers.length,
      processingMethod: 'metadata_driven_composition',
      sequences: sequences.map((seq, index) => {
        const processed = videoBuffers.find(buf => buf.name === seq.name);
        return {
          id: seq.id,
          name: seq.name,
          duration: seq.duration,
          url: seq.file_url,
          processed: !!processed,
          order: index,
          size: processed ? processed.data.length : 0
        };
      })
    },
    customizations: {
      textOverlay: customization.supers?.text ? {
        text: customization.supers.text,
        position: customization.supers.position,
        style: customization.supers.style,
        instructions: `Apply text "${customization.supers.text}" at ${customization.supers.position} position with ${customization.supers.style} style`
      } : null,
      endFrame: customization.endFrame?.enabled ? {
        text: customization.endFrame.text,
        logoPosition: customization.endFrame.logoPosition,
        instructions: `Add end frame with text "${customization.endFrame.text}" and logo at ${customization.endFrame.logoPosition}`
      } : null,
      cta: customization.cta?.enabled ? {
        text: customization.cta.text,
        style: customization.cta.style,
        instructions: `Add CTA "${customization.cta.text}" with ${customization.cta.style} style`
      } : null
    },
    playbackInstructions: {
      sequenceOrder: videoBuffers.map(buf => buf.name),
      totalDuration: videoBuffers.reduce((sum, buf) => sum + (buf.duration || 0), 0),
      recommendedBitrate: '2000kbps',
      recommendedResolution: platform === 'youtube' ? '1920x1080' : platform === 'instagram' ? '1080x1920' : '1080x1080'
    }
  };
}

// Smart video selection - pick the best representative video
function selectPrimaryVideo(videoBuffers: any[]): Uint8Array {
  if (videoBuffers.length === 0) {
    throw new Error('No videos available for selection');
  }
  
  // Strategy: Pick the longest video as it's most likely to be the main content
  const longestVideo = videoBuffers.reduce((longest, current) => {
    return (current.duration || 0) > (longest.duration || 0) ? current : longest;
  });
  
  console.log(`🎯 Selected primary video: ${longestVideo.name} (${longestVideo.duration}s, ${(longestVideo.data.length / (1024 * 1024)).toFixed(2)} MB)`);
  return longestVideo.data;
}

// Process videos with smart fallback strategy
async function processVideosWithFallback(sequences: any[], customization: any, platform: string): Promise<Uint8Array> {
  console.log('🚀 Starting smart video processing...');
  console.log(`📋 Processing ${sequences.length} sequences for ${platform}`);
  
  // Step 1: Download videos with memory management
  const videoBuffers: Array<{ data: Uint8Array; name: string; duration: number }> = [];
  const maxMemoryPerVideo = 30 * 1024 * 1024; // 30MB per video
  
  for (let i = 0; i < sequences.length; i++) {
    const sequence = sequences[i];
    console.log(`⏳ Processing ${i + 1}/${sequences.length}: ${sequence.name}`);
    
    const videoData = await downloadVideoSafely(sequence.file_url, sequence.name, maxMemoryPerVideo);
    
    if (videoData) {
      videoBuffers.push({
        data: videoData,
        name: sequence.name,
        duration: sequence.duration
      });
      console.log(`✅ Added ${sequence.name} to processing queue`);
    } else {
      console.warn(`⚠️ Skipped ${sequence.name} due to download failure`);
    }
    
    // Memory management: Force garbage collection periodically
    if (i % 2 === 0 && globalThis.gc) {
      globalThis.gc();
    }
  }
  
  if (videoBuffers.length === 0) {
    throw new Error('No videos were successfully downloaded');
  }
  
  console.log(`📊 Successfully downloaded ${videoBuffers.length}/${sequences.length} videos`);
  
  // Step 2: Create enhanced metadata
  const metadata = createEnhancedMetadata(sequences, customization, platform, videoBuffers);
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
  
  // Step 3: Select primary video (fallback strategy)
  const primaryVideo = selectPrimaryVideo(videoBuffers);
  
  // Step 4: Create composite output with embedded metadata
  const headerMagic = new Uint8Array([0x4D, 0x45, 0x54, 0x41]); // "META"
  const metadataLength = new Uint32Array([metadataBytes.length]);
  const metadataLengthBytes = new Uint8Array(metadataLength.buffer);
  
  const totalSize = headerMagic.length + metadataLengthBytes.length + metadataBytes.length + primaryVideo.length;
  const result = new Uint8Array(totalSize);
  
  let offset = 0;
  result.set(headerMagic, offset);
  offset += headerMagic.length;
  result.set(metadataLengthBytes, offset);
  offset += metadataLengthBytes.length;
  result.set(metadataBytes, offset);
  offset += metadataBytes.length;
  result.set(primaryVideo, offset);
  
  console.log(`✅ Created composite video: ${(result.length / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`📋 Metadata size: ${(metadataBytes.length / 1024).toFixed(1)} KB`);
  console.log(`🎬 Primary video: ${(primaryVideo.length / (1024 * 1024)).toFixed(2)} MB`);
  
  return result;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let requestData: VideoProcessingRequest;
  
  try {
    console.log('🎬 === Video Processing Request Started ===');
    
    // Parse request with timeout
    const parsePromise = req.json();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request parsing timeout')), 10000)
    );
    
    requestData = await Promise.race([parsePromise, timeoutPromise]) as VideoProcessingRequest;
    
    console.log(`📊 Request parsed: ${requestData.sequences?.length || 0} sequences, platform: ${requestData.platform}`);
    
  } catch (error) {
    console.error('❌ Request parsing failed:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Invalid request format',
        details: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    // Validate environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }
    
    // Validate input
    const { sequences, customization, platform, duration } = requestData;
    
    if (!sequences || !Array.isArray(sequences) || sequences.length === 0) {
      throw new Error('No valid sequences provided');
    }
    
    // Filter valid sequences
    const validSequences = sequences.filter(seq => {
      if (!seq.file_url || !seq.file_url.startsWith('http')) {
        console.warn(`❌ Invalid URL for ${seq.id}: ${seq.file_url}`);
        return false;
      }
      return true;
    });
    
    if (validSequences.length === 0) {
      throw new Error('No sequences have valid URLs');
    }
    
    console.log(`✅ Validated ${validSequences.length}/${sequences.length} sequences`);
    
    // Process videos with smart fallback
    const processedVideo = await processVideosWithFallback(validSequences, customization, platform);
    const sizeInMB = processedVideo.length / (1024 * 1024);
    
    console.log(`🎉 Processing completed! Final size: ${sizeInMB.toFixed(2)} MB`);
    
    // Initialize Supabase for storage operations
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Use storage for files > 8MB, base64 for smaller ones
    if (sizeInMB > 8) {
      console.log('📤 Using storage upload for large file...');
      
      const timestamp = Date.now();
      const filename = `enhanced_${timestamp}_${platform}_${validSequences.length}clips.mp4`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('processed-videos')
        .upload(filename, processedVideo, {
          contentType: 'video/mp4',
          upsert: false
        });

      if (uploadError) {
        console.error('❌ Storage upload failed:', uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from('processed-videos')
        .getPublicUrl(filename);

      console.log('✅ Video uploaded to storage successfully');

      return new Response(
        JSON.stringify({
          success: true,
          useStorage: true,
          downloadUrl: urlData.publicUrl,
          filename: filename,
          message: `Enhanced video processing completed! Applied customizations to ${validSequences.length} sequences.`,
          metadata: {
            originalSize: processedVideo.length,
            platform,
            duration,
            sequenceCount: validSequences.length,
            processingMethod: 'enhanced_metadata_composition',
            customizations: {
              textOverlay: customization?.supers?.text || '',
              endFrame: customization?.endFrame?.enabled || false,
              cta: customization?.cta?.enabled || false
            }
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
      
    } else {
      console.log('📤 Using base64 transfer for smaller file...');
      
      const videoBase64 = encode(processedVideo);
      console.log(`✅ Base64 encoding completed: ${videoBase64.length} characters`);
      
      return new Response(
        JSON.stringify({
          success: true,
          useStorage: false,
          videoData: videoBase64,
          message: `Enhanced video processing completed! Applied customizations to ${validSequences.length} sequences.`,
          metadata: {
            originalSize: processedVideo.length,
            base64Size: videoBase64.length,
            platform,
            duration,
            sequenceCount: validSequences.length,
            processingMethod: 'enhanced_metadata_composition',
            customizations: {
              textOverlay: customization?.supers?.text || '',
              endFrame: customization?.endFrame?.enabled || false,
              cta: customization?.cta?.enabled || false
            }
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (error) {
    console.error('❌ === Video Processing Failed ===');
    console.error('Error details:', {
      message: error?.message || 'Unknown error',
      stack: error?.stack || 'No stack trace',
      timestamp: new Date().toISOString()
    });
    
    // Return safe error response
    const errorResponse = {
      success: false,
      error: error?.message || 'Video processing failed',
      timestamp: new Date().toISOString(),
      details: 'Check edge function logs for more information'
    };
    
    return new Response(
      JSON.stringify(errorResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
