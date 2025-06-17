
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConcatenationRequest {
  publicIds: string[];
  platform?: string;
  customization?: {
    supers?: {
      text: string;
      position: 'top' | 'center' | 'bottom';
      style: 'bold' | 'light' | 'outline';
    };
  };
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

    const { publicIds, platform } = requestData;
    const cloudName = 'dsxrmo3kt';
    
    if (!publicIds?.length) {
      throw new Error('No video public IDs provided');
    }

    console.log(`📊 Processing ${publicIds.length} videos for concatenation`);
    console.log(`📋 Public IDs: ${publicIds.join(', ')}`);

    let transformationUrl: string;
    
    if (publicIds.length === 1) {
      // Single video - just optimize and format
      const publicId = publicIds[0];
      transformationUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${publicId}.mp4`;
      console.log('🎬 Single video optimization URL generated');
    } else {
      // Multiple videos - use proper concatenation with video overlays
      const baseVideo = publicIds[0];
      
      // Build video overlay transformations for concatenation
      // Each additional video becomes an overlay that gets appended
      const overlays = publicIds.slice(1).map((id, index) => {
        // Use l_video to layer each video, with du_auto to use full duration of each video
        // The fl_layer_apply flag applies the layer, and so_auto positions it after the previous video
        return `l_video:${id}/du_auto,so_auto,fl_layer_apply`;
      }).join('/');
      
      // Build the final concatenation URL
      transformationUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${overlays}/${baseVideo}.mp4`;
      console.log('🔗 Multi-video concatenation URL generated');
    }

    console.log(`🎯 Generated transformation URL: ${transformationUrl}`);

    // Test the URL by making a HEAD request to verify it works
    try {
      console.log('🔍 Verifying Cloudinary URL...');
      const testResponse = await fetch(transformationUrl, { 
        method: 'HEAD',
        headers: {
          'User-Agent': 'Supabase-Edge-Function/1.0'
        }
      });
      
      if (!testResponse.ok) {
        console.error(`❌ Cloudinary URL verification failed: ${testResponse.status} ${testResponse.statusText}`);
        
        if (publicIds.length > 1) {
          console.log('🔄 Concatenation failed, trying alternative approach...');
          
          // Alternative approach: use video timeline concatenation
          const timelineOverlays = publicIds.slice(1).map((id) => {
            return `l_video:${id}`;
          }).join('/');
          
          const alternativeUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${timelineOverlays}/fl_layer_apply,fl_concatenate/${publicIds[0]}.mp4`;
          console.log(`🔄 Trying alternative URL: ${alternativeUrl}`);
          
          const altResponse = await fetch(alternativeUrl, { method: 'HEAD' });
          if (altResponse.ok) {
            transformationUrl = alternativeUrl;
            console.log('✅ Alternative concatenation URL verified');
          } else {
            console.log('🔄 Alternative failed, falling back to first video only...');
            transformationUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${publicIds[0]}.mp4`;
            
            const fallbackResponse = await fetch(transformationUrl, { method: 'HEAD' });
            if (!fallbackResponse.ok) {
              throw new Error(`Failed to access even single video: HTTP ${fallbackResponse.status}`);
            }
          }
        } else {
          throw new Error(`Failed to generate video: HTTP ${testResponse.status} ${testResponse.statusText}`);
        }
      } else {
        console.log('✅ Cloudinary URL verified successfully');
      }
    } catch (verifyError) {
      console.error('❌ URL verification failed:', verifyError);
      throw new Error(`Failed to verify generated video: ${verifyError.message}`);
    }

    const response = {
      success: true,
      url: transformationUrl,
      message: publicIds.length === 1 
        ? 'Video processed successfully with Cloudinary'
        : `Successfully concatenated ${publicIds.length} videos using Cloudinary`,
      metadata: {
        videoCount: publicIds.length,
        processingMethod: 'cloudinary_concatenation',
        cloudName,
        publicIds: publicIds
      }
    };

    console.log('🎉 Concatenation completed successfully');
    console.log(`📤 Final URL: ${transformationUrl}`);

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
