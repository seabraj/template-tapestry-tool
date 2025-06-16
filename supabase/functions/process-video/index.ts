
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    originalOrder?: number;
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

// Download video with validation
async function downloadVideoSafely(url: string, sequenceName: string): Promise<Uint8Array | null> {
  try {
    console.log(`📥 Downloading: ${sequenceName} from ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Supabase-Edge-Function/1.0' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`❌ HTTP error for ${sequenceName}: ${response.status}`);
      return null;
    }
    
    const contentLength = response.headers.get('content-length');
    const maxSize = 15 * 1024 * 1024; // 15MB limit
    if (contentLength && parseInt(contentLength) > maxSize) {
      console.warn(`⚠️ File too large: ${sequenceName} (${parseInt(contentLength)} bytes)`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    console.log(`✅ Downloaded ${sequenceName}: ${(arrayBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`);
    
    return new Uint8Array(arrayBuffer);
    
  } catch (error) {
    console.error(`❌ Download failed for ${sequenceName}:`, error?.message);
    return null;
  }
}

// For single video - just return as is
function processSingleVideo(videoData: Uint8Array, name: string): Uint8Array {
  console.log(`🎯 Processing single video: ${name}`);
  return videoData;
}

// For multiple videos - return the first video with a warning
// Note: True MP4 concatenation requires complex container manipulation
function processMultipleVideos(videoBuffers: Array<{ data: Uint8Array; name: string; order: number }>): Uint8Array {
  console.log('⚠️ Multiple video processing: Returning first video in sequence due to MP4 concatenation limitations');
  
  const sortedVideos = videoBuffers.sort((a, b) => a.order - b.order);
  console.log(`📋 Video order: ${sortedVideos.map(v => `${v.order + 1}. ${v.name}`).join(', ')}`);
  
  if (sortedVideos.length === 0) {
    throw new Error('No videos to process');
  }
  
  // Return the first video in the user-defined sequence
  const firstVideo = sortedVideos[0];
  console.log(`🎬 Returning first video in sequence: ${firstVideo.name} (${(firstVideo.data.length / (1024 * 1024)).toFixed(2)} MB)`);
  
  return firstVideo.data;
}

// Process videos with proper ordering
async function processVideos(sequences: any[], platform: string): Promise<Uint8Array> {
  try {
    console.log('🚀 Starting video processing...');
    console.log(`📋 Processing ${sequences.length} sequences for ${platform}`);
    
    const videoBuffers: Array<{ data: Uint8Array; name: string; order: number }> = [];
    
    // Download videos in order
    for (let i = 0; i < sequences.length; i++) {
      const sequence = sequences[i];
      const order = sequence.originalOrder !== undefined ? sequence.originalOrder : i;
      console.log(`⏳ Processing ${i + 1}/${sequences.length}: ${sequence.name} (order: ${order + 1})`);
      
      const videoData = await downloadVideoSafely(sequence.file_url, sequence.name);
      
      if (videoData) {
        videoBuffers.push({
          data: videoData,
          name: sequence.name,
          order: order
        });
        console.log(`✅ Added ${sequence.name} to processing queue (order: ${order + 1})`);
      } else {
        console.warn(`⚠️ Skipped ${sequence.name} due to download failure`);
      }
    }
    
    if (videoBuffers.length === 0) {
      throw new Error('No videos successfully downloaded');
    }
    
    console.log(`📊 Downloaded ${videoBuffers.length}/${sequences.length} videos`);
    
    // Process based on number of videos
    if (videoBuffers.length === 1) {
      const result = processSingleVideo(videoBuffers[0].data, videoBuffers[0].name);
      console.log(`🎉 Single video processing completed: ${(result.length / (1024 * 1024)).toFixed(2)} MB`);
      return result;
    } else {
      const result = processMultipleVideos(videoBuffers);
      console.log(`🎉 Multiple video processing completed: ${(result.length / (1024 * 1024)).toFixed(2)} MB`);
      return result;
    }
    
  } catch (error) {
    console.error('❌ Video processing failed:', error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 === Video Processing Started ===');
    
    // Parse request
    let requestData: VideoProcessingRequest;
    try {
      const body = await req.text();
      if (!body?.trim()) {
        throw new Error('Empty request body');
      }
      requestData = JSON.parse(body);
    } catch (parseError) {
      console.error('❌ Request parsing failed:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid request format',
          details: parseError?.message,
          timestamp: new Date().toISOString()
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`📊 Request: ${requestData.sequences?.length || 0} sequences, platform: ${requestData.platform}`);
    
    // Environment validation
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing environment variables');
    }
    
    // Input validation
    const { sequences, platform } = requestData;
    
    if (!sequences?.length) {
      throw new Error('No sequences provided');
    }
    
    // Filter valid sequences and preserve order
    const validSequences = sequences.filter((seq) => {
      if (!seq.file_url?.startsWith('http')) {
        console.warn(`❌ Invalid URL for ${seq.id}: ${seq.file_url}`);
        return false;
      }
      return true;
    });
    
    if (validSequences.length === 0) {
      throw new Error('No valid sequence URLs');
    }
    
    console.log(`✅ Validated ${validSequences.length}/${sequences.length} sequences`);
    
    // Process videos
    const processedVideo = await processVideos(validSequences, platform);
    const sizeInMB = processedVideo.length / (1024 * 1024);
    
    console.log(`🎉 Processing completed! Size: ${sizeInMB.toFixed(2)} MB`);
    
    // Initialize Supabase
    let supabase;
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
    } catch (supabaseError) {
      console.error('❌ Supabase client failed:', supabaseError);
      throw new Error('Supabase client initialization failed');
    }
    
    // Upload to storage
    console.log('📤 Uploading to storage...');
    
    try {
      const timestamp = Date.now();
      const filename = validSequences.length === 1 
        ? `processed_${timestamp}_${platform}_single.mp4`
        : `first-video_${timestamp}_${platform}_from-${validSequences.length}videos.mp4`;
      
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

      console.log('✅ Upload successful');

      const response = {
        success: true,
        useStorage: true,
        downloadUrl: urlData.publicUrl,
        filename: filename,
        message: validSequences.length === 1 
          ? `🎬 Video processing completed! Processed: ${validSequences[0].name}`
          : `⚠️ Multiple video limitation: Due to MP4 container complexity, returning first video in your sequence: ${validSequences.find(v => v.originalOrder === 0 || (v.originalOrder === undefined && validSequences.indexOf(v) === 0))?.name}`,
        metadata: {
          originalSize: processedVideo.length,
          platform,
          sequenceCount: validSequences.length,
          processingMethod: validSequences.length === 1 ? 'single_video' : 'first_video_only',
          limitation: validSequences.length > 1 ? 'MP4 concatenation requires complex container manipulation not available in edge functions' : null,
          videoOrder: validSequences.map((seq, idx) => ({ 
            position: (seq.originalOrder !== undefined ? seq.originalOrder : idx) + 1, 
            name: seq.name 
          })).sort((a, b) => a.position - b.position)
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

  } catch (error) {
    console.error('❌ === Processing Failed ===');
    console.error('Error:', {
      message: error?.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
    
    const errorResponse = {
      success: false,
      error: error?.message || 'Video processing failed',
      timestamp: new Date().toISOString(),
      details: 'Check edge function logs for details'
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
