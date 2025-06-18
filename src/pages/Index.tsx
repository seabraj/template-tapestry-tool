import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

cloudinary.config({
  cloud_name: 'dsxrmo3kt',
  api_key: Deno.env.get('CLOUDINARY_API_KEY'),
  api_secret: Deno.env.get('CLOUDINARY_API_SECRET'),
  secure: true,
});

// Helper function to poll for metadata availability
async function waitForMetadata(publicId: string, maxAttempts: number = 10): Promise<any> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[Metadata Check] Attempt ${attempt}/${maxAttempts} for ${publicId}`);
    
    try {
      const resource = await cloudinary.api.resource(publicId, { 
        resource_type: 'video',
        video_metadata: true 
      });
      
      if (resource.duration && resource.duration > 0) {
        console.log(`[Metadata Check] ✅ Duration found: ${resource.duration}s`);
        return resource;
      }
      
      console.log(`[Metadata Check] Duration not yet available, waiting...`);
      
      // Exponential backoff: 2s, 4s, 8s, etc.
      const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
    } catch (error) {
      console.log(`[Metadata Check] Error on attempt ${attempt}:`, error.message);
      if (attempt === maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error(`Metadata not available after ${maxAttempts} attempts`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videos, targetDuration } = await req.json();

    if (!videos || videos.length === 0) throw new Error('No videos provided.');
    if (!targetDuration || targetDuration <= 0) throw new Error('Invalid target duration.');

    console.log('--- STARTING PHASE 1: Async video processing with metadata polling ---');

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const createdAssets = [];

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `final_trimmed_${i}_${timestamp}`;
      
      console.log(`[Phase 1] Processing video ${i + 1}/${videos.length}: Creating ${trimmedId}`);
      console.log(`[Phase 1] Target duration: ${proportionalDuration.toFixed(2)}s`);

      // Method 3: Use explicit with correct parameters for creating derived assets
      try {
        const explicitResult = await cloudinary.uploader.explicit(video.publicId, {
          resource_type: 'video',
          type: 'upload',
          eager: [
            {
              start_offset: 0,
              duration: proportionalDuration.toFixed(2),
              format: 'mp4',
              quality: 'auto:good',
              video_codec: 'h264',
              audio_codec: 'aac'
            }
          ],
          eager_async: true, // Process asynchronously for better metadata handling
          // Create a new asset from the eager transformation
          eager_notification_url: null, // You could add webhook URL here
          video_metadata: true,
          overwrite: true
        });

        console.log(`[Phase 1] Explicit result:`, explicitResult);

        if (explicitResult.eager && explicitResult.eager.length > 0) {
          const eagerUrl = explicitResult.eager[0].secure_url;
          console.log(`[Phase 1] Eager transformation URL: ${eagerUrl}`);

          // Upload the eager result as a new permanent asset
          // Use multipart upload which better preserves metadata
          const uploadResult = await cloudinary.uploader.upload(eagerUrl, {
            resource_type: 'video',
            public_id: trimmedId,
            overwrite: true,
            upload_preset: undefined, // Ensure no preset interferes
            // These help ensure proper video processing
            video_metadata: true,
            quality_analysis: true,
            use_filename: false,
            unique_filename: false,
            // Force synchronous processing for metadata
            eager_async: false,
            eager: [
              {
                format: 'mp4',
                flags: 'preserve_transparency'
              }
            ]
          });

          console.log(`[Phase 1] Upload result:`, uploadResult);

          // Now wait for metadata to be available
          const verifiedAsset = await waitForMetadata(trimmedId);

          console.log(`[Phase 1] ✅ Asset ${trimmedId} verified with duration: ${verifiedAsset.duration}s`);
          
          createdAssets.push({
            publicId: verifiedAsset.public_id,
            duration: verifiedAsset.duration,
            order: i,
            url: verifiedAsset.secure_url
          });

        } else {
          throw new Error(`No eager transformations generated for ${video.publicId}`);
        }

      } catch (error) {
        console.error(`[Phase 1] Error processing video ${i}:`, error);
        throw new Error(`Failed to process video ${video.publicId}: ${error.message}`);
      }
    }
    
    console.log(`--- PHASE 1 COMPLETE: ${createdAssets.length} videos processed successfully ---`);
    
    return new Response(JSON.stringify({ 
        success: true,
        message: "Phase 1: All videos trimmed and verified with metadata.",
        phase: 1,
        createdAssets: createdAssets,
        totalDuration: createdAssets.reduce((sum, asset) => sum + asset.duration, 0)
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`❌ Phase 1 Error: ${error.message}`);
    return new Response(JSON.stringify({ 
      error: error.message,
      phase: 1,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});