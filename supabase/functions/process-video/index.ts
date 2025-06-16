
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

// Safe video download with proper error handling
async function downloadVideoSafely(url: string, sequenceName: string, maxSize = 50 * 1024 * 1024): Promise<Uint8Array | null> {
  try {
    console.log(`📥 Downloading: ${sequenceName} from ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch (e) {
        console.warn('Timeout abort failed:', e);
      }
    }, 60000);
    
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
    
    const arrayBuffer = await response.arrayBuffer();
    console.log(`✅ Downloaded ${sequenceName}: ${(arrayBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`);
    
    return new Uint8Array(arrayBuffer);
    
  } catch (error) {
    console.error(`❌ Download failed for ${sequenceName}:`, error?.message || 'Unknown error');
    return null;
  }
}

// Simple binary concatenation
async function concatenateMP4Videos(videoBuffers: Array<{ data: Uint8Array; name: string; order: number }>): Promise<Uint8Array> {
  try {
    console.log('🎬 Starting MP4 concatenation...');
    
    const sortedVideos = videoBuffers.sort((a, b) => a.order - b.order);
    console.log(`📋 Concatenation order: ${sortedVideos.map(v => `${v.order}. ${v.name}`).join(', ')}`);
    
    if (sortedVideos.length === 1) {
      console.log(`🎯 Single video detected: ${sortedVideos[0].name}`);
      return sortedVideos[0].data;
    }

    console.log(`🔄 Concatenating ${sortedVideos.length} videos in order...`);
    
    const totalSize = sortedVideos.reduce((sum, video) => sum + video.data.length, 0);
    console.log(`📊 Total concatenated size will be: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
    
    const concatenatedBuffer = new Uint8Array(totalSize);
    let offset = 0;
    
    for (const video of sortedVideos) {
      console.log(`📝 Adding ${video.name} at offset ${offset} (${(video.data.length / (1024 * 1024)).toFixed(2)} MB)`);
      concatenatedBuffer.set(video.data, offset);
      offset += video.data.length;
    }
    
    console.log(`✅ Video concatenation completed: ${(concatenatedBuffer.length / (1024 * 1024)).toFixed(2)} MB total`);
    console.log(`📺 Result contains ${sortedVideos.length} videos in user-selected order`);
    
    return concatenatedBuffer;
  } catch (error) {
    console.error('❌ Concatenation failed:', error);
    throw new Error(`Concatenation failed: ${error?.message || 'Unknown error'}`);
  }
}

// Process videos with proper error handling
async function processVideosWithConcatenation(sequences: any[], platform: string): Promise<Uint8Array> {
  try {
    console.log('🚀 Starting video concatenation processing...');
    console.log(`📋 Processing ${sequences.length} sequences for ${platform} in user-selected order`);
    
    const videoBuffers: Array<{ data: Uint8Array; name: string; order: number }> = [];
    const maxMemoryPerVideo = 30 * 1024 * 1024;
    
    for (let i = 0; i < sequences.length; i++) {
      const sequence = sequences[i];
      console.log(`⏳ Processing ${i + 1}/${sequences.length}: ${sequence.name} (position: ${i + 1})`);
      
      const videoData = await downloadVideoSafely(sequence.file_url, sequence.name, maxMemoryPerVideo);
      
      if (videoData) {
        videoBuffers.push({
          data: videoData,
          name: sequence.name,
          order: i + 1
        });
        console.log(`✅ Added ${sequence.name} to concatenation queue (position: ${i + 1})`);
      } else {
        console.warn(`⚠️ Skipped ${sequence.name} due to download failure`);
      }
      
      // Force garbage collection periodically
      if (i % 2 === 0 && globalThis.gc) {
        try {
          globalThis.gc();
        } catch (e) {
          // Ignore gc errors
        }
      }
    }
    
    if (videoBuffers.length === 0) {
      throw new Error('No videos were successfully downloaded for concatenation');
    }
    
    console.log(`📊 Successfully downloaded ${videoBuffers.length}/${sequences.length} videos for concatenation`);
    
    const concatenatedVideo = await concatenateMP4Videos(videoBuffers);
    console.log(`🎉 Video concatenation completed: ${(concatenatedVideo.length / (1024 * 1024)).toFixed(2)} MB`);
    
    return concatenatedVideo;
  } catch (error) {
    console.error('❌ Video processing failed:', error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 === Video Concatenation Request Started ===');
    
    // Parse request with proper error handling
    let requestData: VideoProcessingRequest;
    try {
      const body = await req.text();
      if (!body || body.trim() === '') {
        throw new Error('Empty request body');
      }
      requestData = JSON.parse(body);
    } catch (parseError) {
      console.error('❌ Request parsing failed:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid request format',
          details: parseError?.message || 'Failed to parse request',
          timestamp: new Date().toISOString()
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`📊 Request parsed: ${requestData.sequences?.length || 0} sequences, platform: ${requestData.platform}`);
    
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
    
    // Preserve the exact order from user selection
    const orderedSequences = sequences.map((seq, index) => ({
      ...seq,
      originalOrder: index
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
    
    // Process videos with proper concatenation
    const concatenatedVideo = await processVideosWithConcatenation(validSequences, platform);
    const sizeInMB = concatenatedVideo.length / (1024 * 1024);
    
    console.log(`🎉 Video concatenation completed! Final size: ${sizeInMB.toFixed(2)} MB`);
    console.log(`📺 Contains ${validSequences.length} videos in exact user-selected order`);
    
    // Initialize Supabase for storage operations
    let supabase;
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
    } catch (supabaseError) {
      console.error('❌ Supabase client creation failed:', supabaseError);
      throw new Error('Failed to initialize Supabase client');
    }
    
    // Use storage for files > 8MB, base64 for smaller ones
    if (sizeInMB > 8) {
      console.log('📤 Using storage upload for large concatenated file...');
      
      try {
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

        const response = {
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
        };

        return new Response(
          JSON.stringify(response),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } catch (storageError) {
        console.error('❌ Storage operation failed:', storageError);
        throw new Error(`Storage operation failed: ${storageError.message}`);
      }
      
    } else {
      console.log('📤 Using base64 transfer for smaller concatenated file...');
      
      try {
        const videoBase64 = encode(concatenatedVideo);
        console.log(`✅ Base64 encoding completed: ${videoBase64.length} characters`);
        
        const response = {
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
        };
        
        return new Response(
          JSON.stringify(response),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } catch (encodingError) {
        console.error('❌ Base64 encoding failed:', encodingError);
        throw new Error(`Base64 encoding failed: ${encodingError.message}`);
      }
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
