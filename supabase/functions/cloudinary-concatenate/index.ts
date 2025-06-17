
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
        // Use proper trimming syntax: du_<duration> for duration
        transformations.push(`du_${targetDuration}`);
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

    // Multiple videos - try concatenation approaches
    console.log('🔗 Starting video concatenation process...');
    
    // Method 1: Using l_video overlays with fl_splice (Cloudinary's recommended approach for concatenation)
    console.log('🔄 Trying Method 1 (overlay concatenation with fl_splice)...');
    
    const baseVideo = publicIds[0];
    const additionalVideos = publicIds.slice(1);
    
    console.log(`🎯 Base video: ${baseVideo}`);
    console.log(`➕ Additional videos: ${additionalVideos.join(', ')}`);
    
    // Build overlay concatenation URL
    let transformations = ['q_auto:good'];
    
    // Add each additional video as an overlay
    for (const videoId of additionalVideos) {
      transformations.push(`l_video:${videoId}/fl_splice`);
    }
    
    // Add duration trimming if specified
    if (targetDuration) {
      transformations.push(`du_${targetDuration}`);
      console.log(`✂️ Will trim concatenated result to ${targetDuration}s`);
    }
    
    // Add final format
    transformations.push('f_mp4');
    
    const method1Url = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${baseVideo}.mp4`;
    console.log(`🎯 Method 1 URL: ${method1Url}`);

    // Test Method 1
    try {
      console.log('🔍 Testing Method 1 (overlay concatenation)...');
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
            message: `Successfully concatenated ${publicIds.length} videos using overlay method${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
            metadata: {
              videoCount: publicIds.length,
              targetDuration: targetDuration,
              method: 'overlay_concatenation'
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
    
    // Method 2: Simple concatenation without overlays (just video list)
    console.log('🔄 Trying Method 2 (simple concatenation)...');
    
    // Reset transformations for Method 2
    transformations = ['q_auto:good'];
    
    // Try concatenating by listing all videos in the URL path
    const allVideos = publicIds.join('/');
    
    // Add duration trimming if specified
    if (targetDuration) {
      transformations.push(`du_${targetDuration}`);
    }
    
    // Add final format
    transformations.push('f_mp4');
    
    const method2Url = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${allVideos}.mp4`;
    console.log(`🎯 Method 2 URL: ${method2Url}`);
    
    // Test Method 2
    try {
      console.log('🔍 Testing Method 2 (simple concatenation)...');
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
            message: `Successfully concatenated ${publicIds.length} videos using simple method${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
            metadata: {
              videoCount: publicIds.length,
              targetDuration: targetDuration,
              method: 'simple_concatenation'
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
    
    // Method 3: Using fl_splice with all videos listed
    console.log('🔄 Trying Method 3 (fl_splice with video list)...');
    
    transformations = ['q_auto:good'];
    
    // Build video list for fl_splice
    const videoList = publicIds.join(',');
    transformations.push(`fl_splice/l_video:${videoList}`);
    
    if (targetDuration) {
      transformations.push(`du_${targetDuration}`);
    }
    
    transformations.push('f_mp4');
    
    const method3Url = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${baseVideo}.mp4`;
    console.log(`🎯 Method 3 URL: ${method3Url}`);
    
    // Test Method 3
    try {
      console.log('🔍 Testing Method 3 (fl_splice with video list)...');
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
            message: `Successfully concatenated ${publicIds.length} videos using fl_splice method${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
            metadata: {
              videoCount: publicIds.length,
              targetDuration: targetDuration,
              method: 'fl_splice_concatenation'
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
    
    // All methods failed - return PROPERLY TRIMMED first video as fallback
    console.log('⚠️ All concatenation methods failed, falling back to TRIMMED first video');
    
    const fallbackVideo = publicIds[0];
    let fallbackTransformations = ['q_auto:good'];
    
    // ENSURE trimming is applied to fallback
    if (targetDuration) {
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
