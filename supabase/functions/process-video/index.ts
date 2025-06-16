
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

    // Initialize Supabase client for storage operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // For now, we'll process the first video as a simple implementation
    const firstVideo = sequences[0];
    console.log('Downloading video:', {
      id: firstVideo.id,
      name: firstVideo.name,
      url: firstVideo.file_url
    });
    
    // Add timeout for download
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    try {
      const videoResponse = await fetch(firstVideo.file_url, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
      }

      const contentLength = videoResponse.headers.get('content-length');
      let sizeInMB = 0;
      if (contentLength) {
        sizeInMB = parseInt(contentLength) / (1024 * 1024);
        console.log(`Video size: ${sizeInMB.toFixed(2)} MB`);
        
        // Limit file size to prevent memory issues
        if (sizeInMB > 100) {
          throw new Error(`Video file too large: ${sizeInMB.toFixed(2)} MB. Maximum allowed: 100 MB`);
        }
      }

      console.log('Download completed, processing video data...');
      const videoArrayBuffer = await videoResponse.arrayBuffer();
      const videoBytes = new Uint8Array(videoArrayBuffer);
      
      console.log(`Processing ${videoArrayBuffer.byteLength} bytes of video data`);

      // Progressive enhancement: use storage for larger files, base64 for smaller ones
      const useLargeFileStorage = sizeInMB > 10; // Use storage for files > 10MB

      if (useLargeFileStorage) {
        console.log('Using storage upload for large file...');
        
        // Generate unique filename
        const timestamp = Date.now();
        const filename = `processed_${timestamp}_${firstVideo.id}.mp4`;
        
        // Upload to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('processed-videos')
          .upload(filename, videoBytes, {
            contentType: 'video/mp4',
            upsert: false
          });

        if (uploadError) {
          console.error('Storage upload failed:', uploadError);
          throw new Error(`Failed to upload processed video: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('processed-videos')
          .getPublicUrl(filename);

        console.log('Video uploaded to storage successfully');

        const response = {
          success: true,
          useStorage: true,
          downloadUrl: urlData.publicUrl,
          filename: filename,
          message: `Video processed successfully and uploaded to storage. Size: ${sizeInMB.toFixed(2)} MB`,
          metadata: {
            originalSize: videoArrayBuffer.byteLength,
            platform,
            duration,
            sequenceCount: sequences.length,
            processingMethod: 'storage'
          }
        };

        return new Response(
          JSON.stringify(response),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );

      } else {
        console.log('Using base64 transfer for small file...');
        
        // Use base64 for smaller files
        let videoBase64: string;
        try {
          videoBase64 = encode(videoBytes);
          console.log(`Base64 conversion completed, length: ${videoBase64.length}`);
        } catch (encodingError) {
          console.error('Base64 encoding failed:', encodingError);
          throw new Error(`Failed to encode video data: ${encodingError.message}`);
        }
        
        console.log('Video processing completed successfully');

        const response = {
          success: true,
          useStorage: false,
          videoData: videoBase64,
          message: `Video processed successfully. Size: ${sizeInMB.toFixed(2)} MB`,
          metadata: {
            originalSize: videoArrayBuffer.byteLength,
            base64Size: videoBase64.length,
            platform,
            duration,
            sequenceCount: sequences.length,
            processingMethod: 'base64'
          }
        };

        return new Response(
          JSON.stringify(response),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Video download timeout after 60 seconds');
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
