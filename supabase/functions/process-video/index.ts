
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Efficient chunk-based base64 conversion for large files
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192; // Process in 8KB chunks to avoid stack overflow
  let base64 = '';
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    const chunkString = Array.from(chunk, byte => String.fromCharCode(byte)).join('');
    base64 += btoa(chunkString);
  }
  
  return base64;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sequences, customization, platform, duration }: VideoProcessingRequest = await req.json();

    console.log('Processing video request:', { 
      sequences: sequences.length, 
      platform, 
      duration,
      totalFileUrls: sequences.map(s => s.file_url).length
    });

    // Validate input
    if (!sequences || sequences.length === 0) {
      throw new Error('No video sequences provided');
    }

    // Validate URLs
    for (const sequence of sequences) {
      if (!sequence.file_url || !sequence.file_url.startsWith('http')) {
        throw new Error(`Invalid file URL for sequence ${sequence.id}: ${sequence.file_url}`);
      }
    }

    // For now, we'll process the first video as a simple implementation
    // In production, this would concatenate multiple videos using FFmpeg
    const firstVideo = sequences[0];
    console.log('Downloading video:', {
      id: firstVideo.id,
      name: firstVideo.name,
      url: firstVideo.file_url
    });
    
    // Add timeout for download
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const videoResponse = await fetch(firstVideo.file_url, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
      }

      const contentLength = videoResponse.headers.get('content-length');
      if (contentLength) {
        const sizeInMB = parseInt(contentLength) / (1024 * 1024);
        console.log(`Video size: ${sizeInMB.toFixed(2)} MB`);
        
        // Limit file size to prevent memory issues
        if (sizeInMB > 50) {
          throw new Error(`Video file too large: ${sizeInMB.toFixed(2)} MB. Maximum allowed: 50 MB`);
        }
      }

      console.log('Download completed, processing video data...');
      const videoArrayBuffer = await videoResponse.arrayBuffer();
      
      console.log(`Processing ${videoArrayBuffer.byteLength} bytes of video data`);
      
      // Use the efficient base64 conversion
      const videoBase64 = arrayBufferToBase64(videoArrayBuffer);
      
      console.log('Video processing completed successfully');

      return new Response(
        JSON.stringify({
          success: true,
          videoData: videoBase64,
          message: `Video processed successfully. Size: ${(videoArrayBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`,
          metadata: {
            originalSize: videoArrayBuffer.byteLength,
            platform,
            duration,
            sequenceCount: sequences.length
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Video download timeout after 30 seconds');
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Server-side video processing failed:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Server-side processing failed',
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
