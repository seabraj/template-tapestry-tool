
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConcatenationRequest {
  publicIds: string[];
  platform?: string;
}

interface VideoMetadata {
  public_id: string;
  duration: number;
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

    const { publicIds } = requestData;
    const cloudName = 'dsxrmo3kt';
    
    if (!publicIds?.length) {
      throw new Error('No video public IDs provided');
    }

    console.log(`📊 Processing ${publicIds.length} videos for concatenation`);
    console.log(`📋 Public IDs: ${publicIds.join(', ')}`);

    if (publicIds.length === 1) {
      // Single video - just optimize and format
      const publicId = publicIds[0];
      const singleVideoUrl = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${publicId}.mp4`;
      console.log('🎬 Single video optimization URL generated');
      
      return new Response(
        JSON.stringify({
          success: true,
          url: singleVideoUrl,
          message: 'Single video processed successfully',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Multiple videos - get metadata and create proper concatenation
    console.log('🔍 Fetching video metadata for duration calculations...');
    
    const videoMetadata: VideoMetadata[] = [];
    
    // Fetch metadata for each video to get durations
    for (const publicId of publicIds) {
      try {
        const metadataUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}.json`;
        const metadataResponse = await fetch(metadataUrl);
        
        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json();
          videoMetadata.push({
            public_id: publicId,
            duration: metadata.duration || 10 // fallback to 10 seconds if no duration
          });
          console.log(`📊 Video ${publicId}: ${metadata.duration || 10}s`);
        } else {
          // Fallback: use default duration if metadata fetch fails
          videoMetadata.push({
            public_id: publicId,
            duration: 10
          });
          console.log(`⚠️ Could not fetch metadata for ${publicId}, using 10s default`);
        }
      } catch (metadataError) {
        console.log(`⚠️ Metadata fetch failed for ${publicId}, using 10s default`);
        videoMetadata.push({
          public_id: publicId,
          duration: 10
        });
      }
    }

    // Build concatenation transformation
    const baseVideo = videoMetadata[0];
    console.log(`🎯 Base video: ${baseVideo.public_id} (${baseVideo.duration}s)`);
    
    // Create transformation chain for proper video concatenation
    const transformations = ['q_auto:good', 'f_mp4'];
    
    let currentStartTime = baseVideo.duration;
    
    // Add each subsequent video as overlay with correct timing
    for (let i = 1; i < videoMetadata.length; i++) {
      const video = videoMetadata[i];
      
      // Use proper Cloudinary overlay syntax with start_offset
      transformations.push(`l_video:${video.public_id}`);
      transformations.push(`so_${currentStartTime}`);
      transformations.push('fl_layer_apply');
      
      console.log(`📎 Adding ${video.public_id} at ${currentStartTime}s (duration: ${video.duration}s)`);
      currentStartTime += video.duration;
    }
    
    // Build the final concatenation URL
    const transformationString = transformations.join('/');
    const concatenatedUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${transformationString}/${baseVideo.public_id}.mp4`;
    
    console.log(`🎯 Generated concatenation URL with ${videoMetadata.length} videos`);
    console.log(`📤 Total duration: ${currentStartTime}s`);

    // Verify the URL works
    try {
      console.log('🔍 Verifying concatenation URL...');
      const testResponse = await fetch(concatenatedUrl, { 
        method: 'HEAD',
        headers: {
          'User-Agent': 'Supabase-Edge-Function/1.0'
        }
      });
      
      if (!testResponse.ok) {
        console.error(`❌ Concatenation URL verification failed: ${testResponse.status} ${testResponse.statusText}`);
        
        // Fallback: try simpler overlay approach without timing
        console.log('🔄 Trying simplified overlay concatenation...');
        const fallbackTransformations = ['q_auto:good', 'f_mp4'];
        
        for (let i = 1; i < videoMetadata.length; i++) {
          fallbackTransformations.push(`l_video:${videoMetadata[i].public_id}`);
          fallbackTransformations.push('fl_layer_apply');
        }
        
        const fallbackUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${fallbackTransformations.join('/')}/${baseVideo.public_id}.mp4`;
        console.log(`🔄 Fallback URL: ${fallbackUrl}`);
        
        const fallbackResponse = await fetch(fallbackUrl, { method: 'HEAD' });
        if (fallbackResponse.ok) {
          console.log('✅ Fallback concatenation URL verified');
          return new Response(
            JSON.stringify({
              success: true,
              url: fallbackUrl,
              message: `Successfully concatenated ${publicIds.length} videos using fallback method`,
              metadata: {
                videoCount: publicIds.length,
                totalDuration: currentStartTime,
                method: 'cloudinary_overlay_fallback'
              }
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        } else {
          throw new Error('Both concatenation methods failed');
        }
      } else {
        console.log('✅ Concatenation URL verified successfully');
      }
    } catch (verifyError) {
      console.error('❌ URL verification failed:', verifyError);
      throw new Error(`Failed to verify concatenated video: ${verifyError.message}`);
    }

    const response = {
      success: true,
      url: concatenatedUrl,
      message: `Successfully concatenated ${publicIds.length} videos using Cloudinary`,
      metadata: {
        videoCount: publicIds.length,
        totalDuration: currentStartTime,
        processingMethod: 'cloudinary_timed_concatenation',
        videoMetadata: videoMetadata
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
