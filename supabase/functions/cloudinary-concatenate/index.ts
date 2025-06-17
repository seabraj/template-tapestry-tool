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

interface VideoInfo {
  publicId: string;
  duration: number;
  url: string;
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

    // Fetch video information first
    const videoInfos = await fetchVideoInfo(publicIds, cloudName);
    console.log('📹 Video info fetched:', videoInfos.map(v => `${v.publicId}: ${v.duration}s`));

    if (publicIds.length === 1) {
      // Single video - just optimize and format, optionally trim
      const videoInfo = videoInfos[0];
      let transformations = ['q_auto:good'];
      
      if (targetDuration && targetDuration < videoInfo.duration) {
        transformations.push(`du_${targetDuration}`);
        console.log(`✂️ Trimming single video to ${targetDuration}s`);
      }
      
      transformations.push('f_mp4');
      
      const singleVideoUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${videoInfo.publicId}.mp4`;
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

    // Multiple videos - try concatenation methods
    console.log('🔗 Starting video concatenation process...');
    
    // Method 1: Simple video list concatenation
    console.log('🔄 Trying Method 1 (simple video list)...');
        
    let transformations = ['q_auto:good'];
    
    // Use publicIds directly in the concatenation
    const videoList = publicIds.map(id => `video:${id}`).join('|');
    transformations.push(`video_concat:${videoList}`);
    
    if (targetDuration) {
      transformations.push(`du_${targetDuration}`);
      console.log(`✂️ Will trim concatenated result to ${targetDuration}s`);
    }
    
    transformations.push('f_mp4');
    
    const method1Url = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${publicIds[0]}.mp4`;
    console.log(`🎯 Method 1 URL: ${method1Url}`);

    if (await testUrl(method1Url)) {
      console.log('✅ Method 1 successful');
      return new Response(
        JSON.stringify({
          success: true,
          url: method1Url,
          message: `Successfully concatenated ${publicIds.length} videos using simple video list${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
          metadata: {
            videoCount: publicIds.length,
            targetDuration: targetDuration,
            method: 'simple_video_list'
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    // Method 2: Layer-based concatenation
    console.log('🔄 Trying Method 2 (layer concatenation)...');
    
    transformations = ['q_auto:good'];
    
    // Add videos as layers using publicIds directly
    for (let i = 1; i < publicIds.length; i++) {
      transformations.push(`l_video:${publicIds[i]}`);
      transformations.push('fl_splice');
    }
    
    if (targetDuration) {
      transformations.push(`du_${targetDuration}`);
    }
    
    transformations.push('f_mp4');
    
    const method2Url = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${publicIds[0]}.mp4`;
    console.log(`🎯 Method 2 URL: ${method2Url}`);
    
    if (await testUrl(method2Url)) {
      console.log('✅ Method 2 successful');
      return new Response(
        JSON.stringify({
          success: true,
          url: method2Url,
          message: `Successfully concatenated ${publicIds.length} videos using layer concatenation${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
          metadata: {
            videoCount: publicIds.length,
            targetDuration: targetDuration,
            method: 'layer_concatenation'
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Method 3: Timeline-based concatenation using Upload API
    console.log('🔄 Trying Method 3 (Upload API concatenation)...');
    
    try {
      const uploadApiResult = await concatenateWithUploadAPI(videoInfos, targetDuration, cloudName);
      if (uploadApiResult.success) {
        console.log('✅ Method 3 (Upload API) successful');
        return new Response(
          JSON.stringify({
            success: true,
            url: uploadApiResult.url,
            message: `Successfully concatenated ${publicIds.length} videos using Upload API${targetDuration ? ` and trimmed to ${targetDuration}s` : ''}`,
            metadata: {
              videoCount: publicIds.length,
              targetDuration: targetDuration,
              method: 'upload_api'
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    } catch (error) {
      console.log('❌ Method 3 (Upload API) failed:', error);
    }

    // All concatenation methods failed - use proportionally trimmed videos
    console.log('⚠️ All concatenation methods failed, using proportionally trimmed approach');
    
    const totalOriginalDuration = videoInfos.reduce((sum, v) => sum + v.duration, 0);
    
    if (targetDuration && targetDuration < totalOriginalDuration) {
      // Calculate proportional duration for first video
      const firstVideo = videoInfos[0];
      const proportionalDuration = Math.max(1, Math.round((firstVideo.duration / totalOriginalDuration) * targetDuration * 100) / 100);
      
      console.log(`🔧 Proportional calculation: ${firstVideo.duration}s / ${totalOriginalDuration}s * ${targetDuration}s = ${proportionalDuration}s`);
      
      let fallbackTransformations = ['q_auto:good'];
      fallbackTransformations.push(`du_${proportionalDuration}`);
      fallbackTransformations.push('f_mp4');
      
      const fallbackUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${fallbackTransformations.join(',')}/${firstVideo.publicId}.mp4`;
      console.log(`🔄 Proportional fallback URL: ${fallbackUrl}`);
      
      // Test the fallback URL
      if (await testUrl(fallbackUrl)) {
        return new Response(
          JSON.stringify({
            success: true,
            url: fallbackUrl,
            message: `Concatenation failed, using proportionally trimmed first video (${proportionalDuration}s from ${firstVideo.duration}s clip)`,
            metadata: {
              videoCount: 1,
              originalRequest: publicIds.length,
              method: 'proportional_fallback',
              targetDuration: targetDuration,
              actualDuration: proportionalDuration,
              proportionalCalculation: {
                originalVideoDuration: firstVideo.duration,
                totalOriginalDuration: totalOriginalDuration,
                targetDuration: targetDuration,
                resultDuration: proportionalDuration
              }
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }
    
    // Final fallback - return first video without trimming
    const finalFallbackUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${videoInfos[0].publicId}.mp4`;
    
    return new Response(
      JSON.stringify({
        success: true,
        url: finalFallbackUrl,
        message: `All methods failed, returning first video without modification`,
        metadata: {
          videoCount: 1,
          originalRequest: publicIds.length,
          method: 'final_fallback'
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

async function fetchVideoInfo(publicIds: string[], cloudName: string): Promise<VideoInfo[]> {
  console.log('📡 Fetching video information...');
  
  const videoInfos: VideoInfo[] = [];
  
  for (const publicId of publicIds) {
    try {
      // Use publicId directly without cleaning
      const infoUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}.json`;
      
      console.log(`🔍 Fetching info for ${publicId} from: ${infoUrl}`);
      
      const response = await fetch(infoUrl);
      if (response.ok) {
        const data = await response.json();
        const duration = data.duration || 10; // Default to 10s if not available
        console.log(`📹 Video ${publicId}: ${duration}s duration`);
        
        videoInfos.push({
          publicId: publicId,
          duration: duration,
          url: `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}.mp4`
        });
      } else {
        console.warn(`⚠️ Could not fetch info for ${publicId}, using default duration`);
        videoInfos.push({
          publicId: publicId,
          duration: 10, // Default duration
          url: `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}.mp4`
        });
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching info for ${publicId}:`, error);
      videoInfos.push({
        publicId: publicId,
        duration: 10, // Default duration
        url: `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}.mp4`
      });
    }
  }
  
  return videoInfos;
}

async function testUrl(url: string): Promise<boolean> {
  try {
    console.log('🔍 Testing URL:', url);
    const response = await fetch(url, { 
      method: 'HEAD',
      headers: { 'User-Agent': 'Supabase-Edge-Function/1.0' }
    });
    
    console.log(`📊 URL test result: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.log('❌ URL test failed:', error);
    return false;
  }
}

async function concatenateWithUploadAPI(videoInfos: VideoInfo[], targetDuration: number | undefined, cloudName: string): Promise<{success: boolean, url?: string, error?: string}> {
  try {
    console.log('🚀 Attempting Upload API concatenation...');
    
    const publicIds = videoInfos.map(v => v.publicId);
    
    let transformations = ['q_auto:good'];
    
    // Build timeline-based concatenation
    let currentOffset = 0;
    
    for (let i = 0; i < videoInfos.length; i++) {
      const video = videoInfos[i];
      if (i === 0) {
        if (targetDuration) {
          const videoDuration = targetDuration ? Math.min(video.duration, targetDuration / videoInfos.length) : video.duration;
          transformations.push(`du_${videoDuration}`);
        }
      } else {
        transformations.push(`l_video:${video.publicId}`);
        transformations.push(`so_${currentOffset}`);
        transformations.push('fl_splice');
      }
      
      currentOffset += targetDuration ? (targetDuration / videoInfos.length) : video.duration;
    }
    
    if (targetDuration) {
      transformations.push(`du_${targetDuration}`);
    }
    
    transformations.push('f_mp4');
    
    const timelineUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/${publicIds[0]}.mp4`;
    console.log(`🎯 Timeline-based URL: ${timelineUrl}`);
    
    if (await testUrl(timelineUrl)) {
      return { success: true, url: timelineUrl };
    }
    
    return { success: false, error: 'Timeline approach failed' };
    
  } catch (error) {
    console.error('❌ Upload API concatenation failed:', error);
    return { success: false, error: error.message };
  }
}