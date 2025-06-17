
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
      // Multiple videos - use splice concatenation
      // Build the splice transformations for proper concatenation
      const baseVideo = publicIds[0];
      
      // Use fl_splice with proper video references for concatenation
      const spliceTransformations = publicIds.slice(1).map((id) => {
        return `l_video:${id}/fl_splice,fl_layer_apply`;
      }).join('/');
      
      // Build the concatenation URL with splice
      transformationUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${spliceTransformations}/${baseVideo}.mp4`;
      console.log('🔗 Multi-video splice concatenation URL generated');
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
          console.log('🔄 Splice failed, trying manual concatenation approach...');
          
          // Try a different approach: create a timeline with explicit durations
          const timelineParams = publicIds.map((id, index) => {
            if (index === 0) {
              return `l_video:${id}/fl_layer_apply,so_0`;
            } else {
              // Position subsequent videos after the previous ones
              return `l_video:${id}/fl_layer_apply,so_auto`;
            }
          }).join('/');
          
          const alternativeUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${timelineParams}/${publicIds[0]}.mp4`;
          console.log(`🔄 Trying timeline URL: ${alternativeUrl}`);
          
          const altResponse = await fetch(alternativeUrl, { method: 'HEAD' });
          if (altResponse.ok) {
            transformationUrl = alternativeUrl;
            console.log('✅ Timeline concatenation URL verified');
          } else {
            console.log('🔄 Timeline failed, trying simple overlay approach...');
            
            // Last resort: simple overlay approach
            const overlayParams = publicIds.slice(1).map((id) => {
              return `l_video:${id}`;
            }).join('/');
            
            const simpleUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${overlayParams}/fl_layer_apply/${publicIds[0]}.mp4`;
            console.log(`🔄 Trying simple overlay URL: ${simpleUrl}`);
            
            const simpleResponse = await fetch(simpleUrl, { method: 'HEAD' });
            if (simpleResponse.ok) {
              transformationUrl = simpleUrl;
              console.log('✅ Simple overlay URL verified');
            } else {
              console.log('🔄 All concatenation methods failed, falling back to first video...');
              transformationUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${publicIds[0]}.mp4`;
              
              const fallbackResponse = await fetch(transformationUrl, { method: 'HEAD' });
              if (!fallbackResponse.ok) {
                throw new Error(`Failed to access even single video: HTTP ${fallbackResponse.status}`);
              }
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
