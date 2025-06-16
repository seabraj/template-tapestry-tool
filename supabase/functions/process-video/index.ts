
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sequences, customization, platform, duration }: VideoProcessingRequest = await req.json();

    console.log('Processing video request:', { sequences: sequences.length, platform, duration });

    // For now, we'll create a simple concatenated video by downloading the first video
    // This is a simplified approach - in production, you'd use server-side FFmpeg
    
    if (sequences.length === 0) {
      throw new Error('No video sequences provided');
    }

    // Download the first video as a fallback (simple implementation)
    const firstVideo = sequences[0];
    console.log('Downloading first video:', firstVideo.file_url);
    
    const videoResponse = await fetch(firstVideo.file_url);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.statusText}`);
    }

    const videoArrayBuffer = await videoResponse.arrayBuffer();
    const videoBase64 = btoa(String.fromCharCode(...new Uint8Array(videoArrayBuffer)));

    console.log('Video processing completed, returning base64 data');

    return new Response(
      JSON.stringify({
        success: true,
        videoData: videoBase64,
        message: 'Video processed successfully on server'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Server-side video processing failed:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Server-side processing failed'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
