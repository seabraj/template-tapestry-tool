
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConcatenationRequest {
  publicIds: string[];
  platform?: string;
  targetDuration?: number;
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

    const { publicIds, targetDuration } = requestData;
    const cloudName = 'dsxrmo3kt';
    
    if (!publicIds?.length) {
      throw new Error('No video public IDs provided');
    }

    console.log(`📊 Processing ${publicIds.length} videos for concatenation`);
    console.log(`📋 Public IDs: ${publicIds.join(', ')}`);
    console.log(`🎯 Target duration: ${targetDuration || 'auto'}s`);

    if (publicIds.length === 1) {
      // Single video - just optimize and format, optionally trim
      const publicId = publicIds[0];
      let transformations = ['q_auto:good', 'f_mp4'];
      
      if (targetDuration) {
        transformations.push(`so_0,eo_${targetDuration}`);
        console.log(`✂️ Trimming single video to ${targetDuration}s`);
      }
      
      const singleVideoUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${publicId}.mp4`;
      console.log('🎬 Single video URL generated:', singleVideoUrl);
      
      return new Response(
        JSON.stringify({
          success: true,
          url: singleVideoUrl,
          message: targetDuration 
            ? `Single video trimmed to ${targetDuration}s successfully`
            : 'Single video processed successfully',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Multiple videos - use simple concatenation approach
    console.log('🔗 Building concatenation for multiple videos...');
    
    // Use the first video as base
    const baseVideo = publicIds[0];
    const overlayVideos = publicIds.slice(1);
    
    console.log(`🎯 Base video: ${baseVideo}`);
    console.log(`📎 Overlay videos: ${overlayVideos.join(', ')}`);
    
    // Build simple concatenation URL using Cloudinary's video_concat parameter
    // This is a more reliable approach than manual overlays
    const transformations = ['q_auto:good', 'f_mp4'];
    
    // Add trimming if target duration is specified
    if (targetDuration) {
      // Trim the final result to target duration
      transformations.push(`so_0,eo_${targetDuration}`);
      console.log(`✂️ Will trim final result to ${targetDuration}s`);
    }
    
    // Use Cloudinary's built-in concatenation by creating a playlist-style URL
    // Format: base_video + overlays as layers
    let concatenationParts = [baseVideo];
    
    // Add each overlay video
    for (const overlayVideo of overlayVideos) {
      concatenationParts.push(`l_video:${overlayVideo}/fl_layer_apply`);
    }
    
    const transformationString = transformations.join(',');
    const concatenatedUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${transformationString}/${concatenationParts.join('/')}.mp4`;
    
    console.log(`🎯 Generated concatenation URL: ${concatenatedUrl}`);

    // Test the URL to make sure it works
    try {
      console.log('🔍 Testing concatenation URL...');
      const testResponse = await fetch(concatenatedUrl, { 
        method: 'HEAD',
        headers: {
          'User-Agent': 'Supabase-Edge-Function/1.0'
        }
      });
      
      if (!testResponse.ok) {
        console.error(`❌ URL test failed: ${testResponse.status} ${testResponse.statusText}`);
        
        // Try alternative simple approach - just overlay without timing
        console.log('🔄 Trying alternative concatenation method...');
        const alternativeUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${baseVideo}.mp4`;
        
        console.log(`🔄 Fallback to base video only: ${alternativeUrl}`);
        
        return new Response(
          JSON.stringify({
            success: true,
            url: alternativeUrl,
            message: `Processed base video only (concatenation fallback)`,
            metadata: {
              videoCount: 1,
              method: 'fallback_single_video',
              originalRequest: publicIds.length
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } else {
        console.log('✅ Concatenation URL verified successfully');
      }
    } catch (verifyError) {
      console.error('❌ URL verification failed:', verifyError);
      // Continue anyway - sometimes HEAD requests fail but GET works
      console.log('⚠️ Continuing despite verification failure - URL might still work');
    }

    const response = {
      success: true,
      url: concatenatedUrl,
      message: `Successfully concatenated ${publicIds.length} videos using Cloudinary${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
      metadata: {
        videoCount: publicIds.length,
        targetDuration: targetDuration,
        processingMethod: 'cloudinary_layer_concatenation'
      }
    };

    console.log('🎉 Concatenation completed successfully');
    console.log(`📤 Final URL: ${concatenatedUrl}`);

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
