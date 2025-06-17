
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
      let transformations = ['q_auto:good'];
      
      if (targetDuration) {
        transformations.push(`du_${targetDuration}`);
        console.log(`✂️ Trimming single video to ${targetDuration}s`);
      }
      
      transformations.push('f_mp4');
      
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

    // Multiple videos - try various concatenation approaches
    console.log('🔗 Starting video concatenation process...');
    
    // Method 1: Using video_concat with simpler syntax
    console.log('🔄 Trying Method 1 (video_concat with colon syntax)...');
    
    const videoIds = publicIds.join(':');
    let transformations = ['q_auto:good'];
    transformations.push(`video_concat:${videoIds}`);
    
    if (targetDuration) {
      transformations.push(`du_${targetDuration}`);
      console.log(`✂️ Will trim concatenated result to ${targetDuration}s`);
    }
    
    transformations.push('f_mp4');
    
    const method1Url = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${publicIds[0]}.mp4`;
    console.log(`🎯 Method 1 URL: ${method1Url}`);

    try {
      console.log('🔍 Testing Method 1 (video_concat colon syntax)...');
      const testResponse = await fetch(method1Url, { 
        method: 'HEAD',
        headers: { 'User-Agent': 'Supabase-Edge-Function/1.0' }
      });
      
      console.log(`📊 Method 1 response status: ${testResponse.status}`);
      
      if (testResponse.ok) {
        console.log('✅ Method 1 successful');
        return new Response(
          JSON.stringify({
            success: true,
            url: method1Url,
            message: `Successfully concatenated ${publicIds.length} videos using video_concat${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
            metadata: {
              videoCount: publicIds.length,
              targetDuration: targetDuration,
              method: 'video_concat_colon'
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
    
    // Method 2: Using l_video with fl_splice for each additional video
    console.log('🔄 Trying Method 2 (overlay with fl_splice)...');
    
    const baseVideo = publicIds[0];
    const additionalVideos = publicIds.slice(1);
    
    transformations = ['q_auto:good'];
    
    for (const videoId of additionalVideos) {
      transformations.push(`l_video:${videoId}`);
      transformations.push('fl_splice');
    }
    
    if (targetDuration) {
      transformations.push(`du_${targetDuration}`);
    }
    
    transformations.push('f_mp4');
    
    const method2Url = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${baseVideo}.mp4`;
    console.log(`🎯 Method 2 URL: ${method2Url}`);
    
    try {
      console.log('🔍 Testing Method 2 (overlay splice)...');
      const testResponse = await fetch(method2Url, { 
        method: 'HEAD',
        headers: { 'User-Agent': 'Supabase-Edge-Function/1.0' }
      });
      
      console.log(`📊 Method 2 response status: ${testResponse.status}`);
      
      if (testResponse.ok) {
        console.log('✅ Method 2 successful');
        return new Response(
          JSON.stringify({
            success: true,
            url: method2Url,
            message: `Successfully concatenated ${publicIds.length} videos using overlay splice${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
            metadata: {
              videoCount: publicIds.length,
              targetDuration: targetDuration,
              method: 'overlay_splice'
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
    
    // Method 3: Using fl_concat with multiple l_video layers
    console.log('🔄 Trying Method 3 (fl_concat with layers)...');
    
    transformations = ['q_auto:good'];
    
    // Add each video as a layer, then use fl_concat
    for (let i = 1; i < publicIds.length; i++) {
      transformations.push(`l_video:${publicIds[i]}`);
    }
    transformations.push('fl_concat');
    
    if (targetDuration) {
      transformations.push(`du_${targetDuration}`);
    }
    
    transformations.push('f_mp4');
    
    const method3Url = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${publicIds[0]}.mp4`;
    console.log(`🎯 Method 3 URL: ${method3Url}`);
    
    try {
      console.log('🔍 Testing Method 3 (fl_concat layers)...');
      const testResponse = await fetch(method3Url, { 
        method: 'HEAD',
        headers: { 'User-Agent': 'Supabase-Edge-Function/1.0' }
      });
      
      console.log(`📊 Method 3 response status: ${testResponse.status}`);
      
      if (testResponse.ok) {
        console.log('✅ Method 3 successful');
        return new Response(
          JSON.stringify({
            success: true,
            url: method3Url,
            message: `Successfully concatenated ${publicIds.length} videos using fl_concat${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
            metadata: {
              videoCount: publicIds.length,
              targetDuration: targetDuration,
              method: 'fl_concat_layers'
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
    
    // Method 4: Simple comma-separated video list with fl_concat
    console.log('🔄 Trying Method 4 (comma-separated fl_concat)...');
    
    const videoList = publicIds.join(',');
    transformations = ['q_auto:good'];
    transformations.push(`videos:${videoList}`);
    transformations.push('fl_concat');
    
    if (targetDuration) {
      transformations.push(`du_${targetDuration}`);
    }
    
    transformations.push('f_mp4');
    
    const method4Url = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${publicIds[0]}.mp4`;
    console.log(`🎯 Method 4 URL: ${method4Url}`);
    
    try {
      console.log('🔍 Testing Method 4 (comma-separated concat)...');
      const testResponse = await fetch(method4Url, { 
        method: 'HEAD',
        headers: { 'User-Agent': 'Supabase-Edge-Function/1.0' }
      });
      
      console.log(`📊 Method 4 response status: ${testResponse.status}`);
      
      if (testResponse.ok) {
        console.log('✅ Method 4 successful');
        return new Response(
          JSON.stringify({
            success: true,
            url: method4Url,
            message: `Successfully concatenated ${publicIds.length} videos using comma-separated concat${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
            metadata: {
              videoCount: publicIds.length,
              targetDuration: targetDuration,
              method: 'comma_separated_concat'
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } else {
        console.log(`❌ Method 4 failed: ${testResponse.status}`);
      }
    } catch (error) {
      console.log('❌ Method 4 test failed:', error);
    }

    // Method 5: Try video stitching approach
    console.log('🔄 Trying Method 5 (video stitching)...');
    
    transformations = ['q_auto:good'];
    
    // Build a sequence of videos using offsets
    for (let i = 1; i < publicIds.length; i++) {
      transformations.push(`l_video:${publicIds[i]}`);
      transformations.push('fl_splice');
      transformations.push('so_auto'); // automatic start offset
    }
    
    if (targetDuration) {
      transformations.push(`du_${targetDuration}`);
    }
    
    transformations.push('f_mp4');
    
    const method5Url = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${publicIds[0]}.mp4`;
    console.log(`🎯 Method 5 URL: ${method5Url}`);
    
    try {
      console.log('🔍 Testing Method 5 (video stitching)...');
      const testResponse = await fetch(method5Url, { 
        method: 'HEAD',
        headers: { 'User-Agent': 'Supabase-Edge-Function/1.0' }
      });
      
      console.log(`📊 Method 5 response status: ${testResponse.status}`);
      
      if (testResponse.ok) {
        console.log('✅ Method 5 successful');
        return new Response(
          JSON.stringify({
            success: true,
            url: method5Url,
            message: `Successfully concatenated ${publicIds.length} videos using video stitching${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
            metadata: {
              videoCount: publicIds.length,
              targetDuration: targetDuration,
              method: 'video_stitching'
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } else {
        console.log(`❌ Method 5 failed: ${testResponse.status}`);
      }
    } catch (error) {
      console.log('❌ Method 5 test failed:', error);
    }
    
    // All concatenation methods failed - use proportionally trimmed first video
    console.log('⚠️ All concatenation methods failed, using proportionally trimmed first video');
    
    const fallbackVideo = publicIds[0];
    let fallbackTransformations = ['q_auto:good'];
    
    // Calculate proportional duration for first video if we have target duration
    if (targetDuration && publicIds.length > 1) {
      // For proportional trimming, we assume each video should get equal time
      const proportionalDuration = Math.max(1, Math.floor(targetDuration / publicIds.length));
      fallbackTransformations.push(`du_${proportionalDuration}`);
      console.log(`🔧 Applying proportional duration of ${proportionalDuration}s to first video (${targetDuration}s total / ${publicIds.length} videos)`);
    } else if (targetDuration) {
      // Single video or no proportional logic needed
      fallbackTransformations.push(`du_${targetDuration}`);
      console.log(`🔧 Applying ${targetDuration}s duration to fallback video`);
    }
    
    fallbackTransformations.push('f_mp4');
    
    const fallbackUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${fallbackTransformations.join(',')}/${fallbackVideo}.mp4`;
    
    console.log(`🔄 Fallback URL: ${fallbackUrl}`);
    
    // Test the fallback URL to ensure it works
    try {
      console.log('🔍 Testing fallback URL...');
      const testResponse = await fetch(fallbackUrl, { 
        method: 'HEAD',
        headers: { 'User-Agent': 'Supabase-Edge-Function/1.0' }
      });
      
      console.log(`📊 Fallback response status: ${testResponse.status}`);
      
      if (!testResponse.ok) {
        console.error(`❌ Even fallback failed: ${testResponse.status}`);
        throw new Error(`Fallback video processing failed: ${testResponse.status}`);
      }
    } catch (error) {
      console.error('❌ Fallback test failed:', error);
      throw new Error(`Complete processing failure: ${error.message}`);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        url: fallbackUrl,
        message: `Concatenation failed, using proportionally trimmed first video (${targetDuration ? Math.floor(targetDuration / publicIds.length) : 'full'}s from first clip)`,
        metadata: {
          videoCount: 1,
          originalRequest: publicIds.length,
          method: 'proportional_fallback',
          targetDuration: targetDuration,
          actualDuration: targetDuration ? Math.floor(targetDuration / publicIds.length) : undefined
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
