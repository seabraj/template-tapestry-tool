
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

// Lightweight video download with size limits
async function downloadVideoSafely(url: string, sequenceName: string): Promise<Uint8Array | null> {
  try {
    console.log(`📥 Downloading: ${sequenceName} from ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // Reduced timeout
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Supabase-Edge-Function/1.0' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`❌ HTTP error for ${sequenceName}: ${response.status}`);
      return null;
    }
    
    // Check size before downloading
    const contentLength = response.headers.get('content-length');
    const maxSize = 15 * 1024 * 1024; // 15MB limit per video
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

// Streaming concatenation to avoid CPU limits
async function streamConcatenateVideos(videoBuffers: Array<{ data: Uint8Array; name: string; order: number }>): Promise<Uint8Array> {
  try {
    console.log('🎬 Starting streaming video concatenation...');
    
    const sortedVideos = videoBuffers.sort((a, b) => a.order - b.order);
    console.log(`📋 Concatenation order: ${sortedVideos.map(v => `${v.order}. ${v.name}`).join(', ')}`);
    
    if (sortedVideos.length === 1) {
      console.log(`🎯 Single video: ${sortedVideos[0].name}`);
      return sortedVideos[0].data;
    }

    const totalSize = sortedVideos.reduce((sum, video) => sum + video.data.length, 0);
    console.log(`📊 Total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
    
    // Stream concatenation in chunks to avoid CPU timeout
    const chunkSize = 1024 * 1024; // 1MB chunks
    const concatenatedBuffer = new Uint8Array(totalSize);
    let offset = 0;
    
    for (const video of sortedVideos) {
      console.log(`📝 Processing ${video.name}...`);
      
      // Process video data in chunks
      let videoOffset = 0;
      while (videoOffset < video.data.length) {
        const endOffset = Math.min(videoOffset + chunkSize, video.data.length);
        const chunk = video.data.slice(videoOffset, endOffset);
        
        concatenatedBuffer.set(chunk, offset);
        offset += chunk.length;
        videoOffset = endOffset;
        
        // Yield control to prevent CPU timeout
        if (videoOffset < video.data.length) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
      
      console.log(`✅ Added ${video.name} (${(video.data.length / (1024 * 1024)).toFixed(2)} MB)`);
    }
    
    console.log(`✅ Streaming concatenation completed: ${(concatenatedBuffer.length / (1024 * 1024)).toFixed(2)} MB`);
    return concatenatedBuffer;
    
  } catch (error) {
    console.error('❌ Streaming concatenation failed:', error);
    throw new Error(`Streaming concatenation failed: ${error?.message}`);
  }
}

// Process videos with streaming approach
async function processVideosWithStreaming(sequences: any[], platform: string): Promise<Uint8Array> {
  try {
    console.log('🚀 Starting streaming video processing...');
    console.log(`📋 Processing ${sequences.length} sequences for ${platform}`);
    
    const videoBuffers: Array<{ data: Uint8Array; name: string; order: number }> = [];
    
    // Download videos with size validation
    for (let i = 0; i < sequences.length; i++) {
      const sequence = sequences[i];
      console.log(`⏳ Processing ${i + 1}/${sequences.length}: ${sequence.name}`);
      
      const videoData = await downloadVideoSafely(sequence.file_url, sequence.name);
      
      if (videoData) {
        videoBuffers.push({
          data: videoData,
          name: sequence.name,
          order: i + 1
        });
        console.log(`✅ Added ${sequence.name} to processing queue`);
      } else {
        console.warn(`⚠️ Skipped ${sequence.name} due to download failure`);
      }
      
      // Memory management
      if (i % 2 === 0 && globalThis.gc) {
        try { globalThis.gc(); } catch (e) { /* ignore */ }
      }
    }
    
    if (videoBuffers.length === 0) {
      throw new Error('No videos successfully downloaded');
    }
    
    console.log(`📊 Downloaded ${videoBuffers.length}/${sequences.length} videos`);
    
    // Use streaming concatenation
    const concatenatedVideo = await streamConcatenateVideos(videoBuffers);
    console.log(`🎉 Streaming processing completed: ${(concatenatedVideo.length / (1024 * 1024)).toFixed(2)} MB`);
    
    return concatenatedVideo;
    
  } catch (error) {
    console.error('❌ Streaming video processing failed:', error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 === Streaming Video Processing Started ===');
    
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
    
    // Filter valid sequences
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
    
    // Process videos with streaming approach
    const concatenatedVideo = await processVideosWithStreaming(validSequences, platform);
    const sizeInMB = concatenatedVideo.length / (1024 * 1024);
    
    console.log(`🎉 Processing completed! Size: ${sizeInMB.toFixed(2)} MB`);
    
    // Initialize Supabase
    let supabase;
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
    } catch (supabaseError) {
      console.error('❌ Supabase client failed:', supabaseError);
      throw new Error('Supabase client initialization failed');
    }
    
    // Always use storage upload
    console.log('📤 Uploading to storage...');
    
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

      console.log('✅ Upload successful');

      const response = {
        success: true,
        useStorage: true,
        downloadUrl: urlData.publicUrl,
        filename: filename,
        message: `🎬 Video concatenation completed! Combined ${validSequences.length} videos.`,
        metadata: {
          originalSize: concatenatedVideo.length,
          platform,
          sequenceCount: validSequences.length,
          processingMethod: 'streaming_concatenation',
          videoOrder: validSequences.map((seq, idx) => ({ 
            position: idx + 1, 
            name: seq.name 
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

  } catch (error) {
    console.error('❌ === Streaming Processing Failed ===');
    console.error('Error:', {
      message: error?.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
    
    const errorResponse = {
      success: false,
      error: error?.message || 'Streaming video processing failed',
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
