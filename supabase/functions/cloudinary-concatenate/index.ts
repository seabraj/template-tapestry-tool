
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConcatenationRequest {
  publicIds: string[];
  cloudName: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 === Cloudinary Video Concatenation Started ===');
    
    // Parse request
    let requestData: ConcatenationRequest;
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
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { publicIds, cloudName } = requestData;
    
    if (!publicIds?.length) {
      throw new Error('No video public IDs provided');
    }
    
    if (!cloudName) {
      throw new Error('Cloud name is required');
    }

    console.log(`📊 Processing ${publicIds.length} videos for concatenation`);

    // Build Cloudinary transformation URL for concatenation
    let transformationUrl: string;
    
    if (publicIds.length === 1) {
      // Single video - just optimize
      transformationUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${publicIds[0]}.mp4`;
    } else {
      // Multiple videos - concatenate using overlay transformations
      const baseVideo = publicIds[0];
      const overlays = publicIds.slice(1).map((id, index) => {
        return `l_video:${id},fl_splice,so_0`;
      }).join('/');
      
      transformationUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${overlays}/${baseVideo}.mp4`;
    }

    console.log('✅ Cloudinary transformation URL generated');
    console.log(`🔗 URL: ${transformationUrl}`);

    // Verify the video is accessible
    const verifyResponse = await fetch(transformationUrl, { method: 'HEAD' });
    if (!verifyResponse.ok) {
      throw new Error(`Failed to generate concatenated video: HTTP ${verifyResponse.status}`);
    }

    const response = {
      success: true,
      url: transformationUrl,
      message: publicIds.length === 1 
        ? 'Video processed successfully with Cloudinary'
        : `Successfully concatenated ${publicIds.length} videos using Cloudinary`,
      metadata: {
        videoCount: publicIds.length,
        processingMethod: 'cloudinary_transformation',
        cloudName,
      }
    };

    console.log('🎉 Concatenation completed successfully');

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('❌ === Cloudinary Concatenation Failed ===');
    console.error('Error:', {
      message: error?.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
    
    const errorResponse = {
      success: false,
      error: error?.message || 'Video concatenation failed',
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
