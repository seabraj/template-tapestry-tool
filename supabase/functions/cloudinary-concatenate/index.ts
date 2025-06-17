
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
        transformations.push(`so_0,eo_${targetDuration},du_${targetDuration}`);
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

    // Multiple videos - use proper concatenation
    console.log('🔗 Starting video concatenation process...');
    
    // Try Method 1: Using video_concat parameter (preferred method)
    const baseVideo = publicIds[0];
    const additionalVideos = publicIds.slice(1);
    
    console.log(`🎯 Base video: ${baseVideo}`);
    console.log(`➕ Additional videos: ${additionalVideos.join(', ')}`);
    
    // Build concatenation using video_concat parameter
    let transformations = ['q_auto:good', 'f_mp4'];
    
    // Add video concatenation parameter
    const concatParam = `video_concat:${additionalVideos.join(':')}`;
    transformations.push(concatParam);
    
    // Add trimming if target duration is specified
    if (targetDuration) {
      transformations.push(`so_0,eo_${targetDuration},du_${targetDuration}`);
      console.log(`✂️ Will trim concatenated result to ${targetDuration}s`);
    }
    
    const concatenatedUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${baseVideo}.mp4`;
    console.log(`🎯 Method 1 URL: ${concatenatedUrl}`);

    // Test Method 1
    try {
      console.log('🔍 Testing Method 1 (video_concat)...');
      const testResponse = await fetch(concatenatedUrl, { 
        method: 'HEAD',
        headers: { 'User-Agent': 'Supabase-Edge-Function/1.0' }
      });
      
      if (testResponse.ok) {
        console.log('✅ Method 1 successful');
        return new Response(
          JSON.stringify({
            success: true,
            url: concatenatedUrl,
            message: `Successfully concatenated ${publicIds.length} videos using video_concat${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
            metadata: {
              videoCount: publicIds.length,
              targetDuration: targetDuration,
              method: 'video_concat'
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } else {
        console.log(`❌ Method 1 failed: ${testResponse.status}`);
      }
    } catch (error) {
      console.log('❌ Method 1 test failed:', error);
    }
    
    // Try Method 2: Using transformation chain approach
    console.log('🔄 Trying Method 2 (transformation chain)...');
    
    // Reset transformations for Method 2
    transformations = ['q_auto:good', 'f_mp4'];
    
    // Build transformation chain
    let chainParts = [baseVideo];
    
    // Add overlay transformations for each additional video
    for (let i = 0; i < additionalVideos.length; i++) {
      const video = additionalVideos[i];
      chainParts.push(`l_video:${video}/fl_layer_apply,fl_splice`);
    }
    
    // Add trimming if specified
    if (targetDuration) {
      transformations.push(`so_0,eo_${targetDuration},du_${targetDuration}`);
    }
    
    const method2Url = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${chainParts.join('/')}.mp4`;
    console.log(`🎯 Method 2 URL: ${method2Url}`);
    
    // Test Method 2
    try {
      console.log('🔍 Testing Method 2 (transformation chain)...');
      const testResponse = await fetch(method2Url, { 
        method: 'HEAD',
        headers: { 'User-Agent': 'Supabase-Edge-Function/1.0' }
      });
      
      if (testResponse.ok) {
        console.log('✅ Method 2 successful');
        return new Response(
          JSON.stringify({
            success: true,
            url: method2Url,
            message: `Successfully concatenated ${publicIds.length} videos using transformation chain${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
            metadata: {
              videoCount: publicIds.length,
              targetDuration: targetDuration,
              method: 'transformation_chain'
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } else {
        console.log(`❌ Method 2 failed: ${testResponse.status}`);
      }
    } catch (error) {
      console.log('❌ Method 2 test failed:', error);
    }
    
    // Try Method 3: Simple concatenation with fl_splice
    console.log('🔄 Trying Method 3 (fl_splice)...');
    
    transformations = ['q_auto:good', 'f_mp4'];
    
    // Build splice URL
    const spliceVideos = publicIds.join(',');
    transformations.push(`fl_splice,l_video:${spliceVideos}`);
    
    if (targetDuration) {
      transformations.push(`so_0,eo_${targetDuration},du_${targetDuration}`);
    }
    
    const method3Url = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${baseVideo}.mp4`;
    console.log(`🎯 Method 3 URL: ${method3Url}`);
    
    // Test Method 3
    try {
      console.log('🔍 Testing Method 3 (fl_splice)...');
      const testResponse = await fetch(method3Url, { 
        method: 'HEAD',
        headers: { 'User-Agent': 'Supabase-Edge-Function/1.0' }
      });
      
      if (testResponse.ok) {
        console.log('✅ Method 3 successful');
        return new Response(
          JSON.stringify({
            success: true,
            url: method3Url,
            message: `Successfully concatenated ${publicIds.length} videos using fl_splice${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
            metadata: {
              videoCount: publicIds.length,
              targetDuration: targetDuration,
              method: 'fl_splice'
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } else {
        console.log(`❌ Method 3 failed: ${testResponse.status}`);
      }
    } catch (error) {
      console.log('❌ Method 3 test failed:', error);
    }
    
    // All methods failed - return first video with trimming as fallback
    console.log('⚠️ All concatenation methods failed, falling back to first video with trimming');
    
    const fallbackVideo = publicIds[0];
    let fallbackTransformations = ['q_auto:good', 'f_mp4'];
    
    if (targetDuration) {
      fallbackTransformations.push(`so_0,eo_${targetDuration},du_${targetDuration}`);
    }
    
    const fallbackUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${fallbackTransformations.join(',')}/${fallbackVideo}.mp4`;
    
    console.log(`🔄 Fallback URL: ${fallbackUrl}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        url: fallbackUrl,
        message: `Concatenation methods failed, processed first video${targetDuration ? ` and trimmed to ${targetDuration}s` : ''} as fallback`,
        metadata: {
          videoCount: 1,
          originalRequest: publicIds.length,
          method: 'fallback_with_trimming',
          targetDuration: targetDuration
        }
      }),
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
