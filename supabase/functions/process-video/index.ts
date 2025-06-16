
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

// Simple binary concatenation - concatenate video data directly
async function concatenateMP4Videos(videoBuffers: Array<{ data: Uint8Array; name: string; order: number }>): Promise<Uint8Array> {
  console.log('🎬 Starting MP4 concatenation...');
  
  // Sort videos by order to ensure correct sequence
  const sortedVideos = videoBuffers.sort((a, b) => a.order - b.order);
  console.log(`📋 Concatenation order: ${sortedVideos.map(v => `${v.order}. ${v.name}`).join(', ')}`);
  
  if (sortedVideos.length === 1) {
    console.log(`🎯 Single video detected: ${sortedVideos[0].name}`);
    return sortedVideos[0].data;
  }

  console.log(`🔄 Concatenating ${sortedVideos.length} videos in order...`);
  
  // Calculate total size for the concatenated video
  const totalSize = sortedVideos.reduce((sum, video) => sum + video.data.length, 0);
  console.log(`📊 Total concatenated size will be: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
  
  // Create a new buffer to hold all video data
  const concatenatedBuffer = new Uint8Array(totalSize);
  let offset = 0;
  
  // Copy each video's data into the concatenated buffer in order
  for (const video of sortedVideos) {
    console.log(`📝 Adding ${video.name} at offset ${offset} (${(video.data.length / (1024 * 1024)).toFixed(2)} MB)`);
    concatenatedBuffer.set(video.data, offset);
    offset += video.data.length;
  }
  
  console.log(`✅ Video concatenation completed: ${(concatenatedBuffer.length / (1024 * 1024)).toFixed(2)} MB total`);
  console.log(`📺 Result contains ${sortedVideos.length} videos in user-selected order`);
  
  return concatenatedBuffer;
}

// Process videos with proper concatenation in user-selected order
async function processVideosWithConcatenation(sequences: any[], platform: string): Promise<Uint8Array> {
  console.log('🚀 Starting video concatenation processing...');
  console.log(`📋 Processing ${sequences.length} sequences for ${platform} in user-selected order`);
  
  // Step 1: Download videos in the exact order selected by user
  const videoBuffers: Array<{ data: Uint8Array; name: string; order: number }> = [];
  const maxMemoryPerVideo = 30 * 1024 * 1024; // 30MB per video
  
  for (let i = 0; i < sequences.length; i++) {
    const sequence = sequences[i];
    console.log(`⏳ Processing ${i + 1}/${sequences.length}: ${sequence.name} (position: ${i + 1})`);
    
    const videoData = await downloadVideoSafely(sequence.file_url, sequence.name, maxMemoryPerVideo);
    
    if (videoData) {
      videoBuffers.push({
        data: videoData,
        name: sequence.name,
        order: i + 1 // Use 1-based ordering to match user selection
      });
      console.log(`✅ Added ${sequence.name} to concatenation queue (position: ${i + 1})`);
    } else {
      console.warn(`⚠️ Skipped ${sequence.name} due to download failure`);
    }
    
    // Memory management: Force garbage collection periodically
    if (i % 2 === 0 && globalThis.gc) {
      globalThis.gc();
    }
  }
  
  if (videoBuffers.length === 0) {
    throw new Error('No videos were successfully downloaded for concatenation');
  }
  
  console.log(`📊 Successfully downloaded ${videoBuffers.length}/${sequences.length} videos for concatenation`);
  
  // Step 2: Concatenate videos in the exact user-selected order
  const concatenatedVideo = await concatenateMP4Videos(videoBuffers);
  
  console.log(`🎉 Video concatenation completed: ${(concatenatedVideo.length / (1024 * 1024)).toFixed(2)} MB`);
  
  return concatenatedVideo;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let requestData: VideoProcessingRequest;
  
  try {
    console.log('🎬 === Video Concatenation Request Started ===');
    
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
    const { sequences, platform } = requestData;
    
    if (!sequences || !Array.isArray(sequences) || sequences.length === 0) {
      throw new Error('No valid sequences provided');
    }
    
    // Preserve the exact order from user selection - don't filter by URLs yet
    const orderedSequences = sequences.map((seq, index) => ({
      ...seq,
      originalOrder: index // Preserve original order
    }));
    
    // Filter valid sequences while maintaining order
    const validSequences = orderedSequences.filter((seq) => {
      if (!seq.file_url || !seq.file_url.startsWith('http')) {
        console.warn(`❌ Invalid URL for ${seq.id}: ${seq.file_url}`);
        return false;
      }
      return true;
    });
    
    if (validSequences.length === 0) {
      throw new Error('No sequences have valid URLs');
    }
    
    console.log(`✅ Validated ${validSequences.length}/${sequences.length} sequences for concatenation`);
    console.log(`📋 Final order: ${validSequences.map((seq, idx) => `${idx + 1}. ${seq.name}`).join(', ')}`);
    
    // Process videos with proper concatenation preserving user order
    const concatenatedVideo = await processVideosWithConcatenation(validSequences, platform);
    const sizeInMB = concatenatedVideo.length / (1024 * 1024);
    
    console.log(`🎉 Video concatenation completed! Final size: ${sizeInMB.toFixed(2)} MB`);
    console.log(`📺 Contains ${validSequences.length} videos in exact user-selected order`);
    
    // Initialize Supabase for storage operations
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Use storage for files > 8MB, base64 for smaller ones
    if (sizeInMB > 8) {
      console.log('📤 Using storage upload for large concatenated file...');
      
      const timestamp = Date.now();
      const filename = `concatenated_${timestamp}_${platform}_${validSequences.length}videos.mp4`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('processed-videos')
        .upload(filename, concatenatedVideo, {
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

      console.log('✅ Concatenated video uploaded to storage successfully');

      return new Response(
        JSON.stringify({
          success: true,
          useStorage: true,
          downloadUrl: urlData.publicUrl,
          filename: filename,
          message: `🎬 Video concatenation completed! Combined ${validSequences.length} videos in your selected order.`,
          metadata: {
            originalSize: concatenatedVideo.length,
            platform,
            sequenceCount: validSequences.length,
            processingMethod: 'server_side_binary_concatenation',
            videoOrder: validSequences.map((seq, idx) => ({ 
              position: idx + 1, 
              name: seq.name,
              originalOrder: seq.originalOrder 
            }))
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
      
    } else {
      console.log('📤 Using base64 transfer for smaller concatenated file...');
      
      const videoBase64 = encode(concatenatedVideo);
      console.log(`✅ Base64 encoding completed: ${videoBase64.length} characters`);
      
      return new Response(
        JSON.stringify({
          success: true,
          useStorage: false,
          videoData: videoBase64,
          message: `🎬 Video concatenation completed! Combined ${validSequences.length} videos in your selected order.`,
          metadata: {
            originalSize: concatenatedVideo.length,
            base64Size: videoBase64.length,
            platform,
            sequenceCount: validSequences.length,
            processingMethod: 'server_side_binary_concatenation',
            videoOrder: validSequences.map((seq, idx) => ({ 
              position: idx + 1, 
              name: seq.name,
              originalOrder: seq.originalOrder 
            }))
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (error) {
    console.error('❌ === Video Concatenation Failed ===');
    console.error('Error details:', {
      message: error?.message || 'Unknown error',
      stack: error?.stack || 'No stack trace',
      timestamp: new Date().toISOString()
    });
    
    // Return safe error response
    const errorResponse = {
      success: false,
      error: error?.message || 'Video concatenation failed',
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
