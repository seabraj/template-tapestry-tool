import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced logging function
function debugLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(`[${timestamp}] Data:`, JSON.stringify(data, null, 2));
  }
}

cloudinary.config({
  cloud_name: 'dsxrmo3kt',
  api_key: Deno.env.get('CLOUDINARY_API_KEY'),
  api_secret: Deno.env.get('CLOUDINARY_API_SECRET'),
  secure: true,
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videos, targetDuration } = await req.json();

    if (!videos || videos.length === 0) throw new Error('No videos provided.');
    if (!targetDuration || targetDuration <= 0) throw new Error('Invalid target duration.');

    console.log('--- STARTING PHASE 1: Creating trimmed videos ---');

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const createdAssets = [];

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `final_trimmed_${i}_${timestamp}`;
      
      console.log(`[Phase 1] Processing video ${i + 1}/${videos.length}: Creating ${trimmedId}`);
      console.log(`[Phase 1] Duration: ${video.duration}s -> ${proportionalDuration.toFixed(2)}s`);

      // Create the transformation URL
      const trimmedUrl = cloudinary.url(video.publicId, {
        resource_type: 'video',
        transformation: [{ 
          duration: proportionalDuration.toFixed(2),
          format: 'mp4',
          quality: 'auto'
        }]
      });
      
      console.log(`[Phase 1] Transformation URL: ${trimmedUrl}`);

      // Upload with additional metadata flags to try forcing analysis
      const result = await cloudinary.uploader.upload(trimmedUrl, {
        resource_type: 'video',
        public_id: trimmedId,
        overwrite: true,
        // Add these flags to try forcing metadata generation
        video_metadata: true,
        use_filename: false,
        unique_filename: false,
        // Try adding an eager transformation to force processing
        eager: [
          {
            format: 'mp4',
            quality: 'auto'
          }
        ],
        eager_async: false // Wait for processing
      });

      console.log(`[Phase 1] Upload result:`, {
        public_id: result.public_id,
        duration: result.duration,
        bytes: result.bytes,
        format: result.format
      });

      // Wait a moment for any async processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Try to get metadata
      let finalDuration = result.duration;
      
      if (!finalDuration || finalDuration === 0) {
        console.log(`[Phase 1] No duration in upload result, checking resource...`);
        
        try {
          const verification = await cloudinary.api.resource(trimmedId, { 
            resource_type: 'video',
            video_metadata: true 
          });
          
          finalDuration = verification.duration;
          console.log(`[Phase 1] Resource check result: duration = ${finalDuration}`);
        } catch (verifyError) {
          console.log(`[Phase 1] Resource verification failed:`, verifyError.message);
        }
      }

      // If still no metadata, use calculated duration but warn
      if (!finalDuration || finalDuration === 0) {
        console.log(`[Phase 1] ⚠️  No metadata found, using calculated duration: ${proportionalDuration.toFixed(2)}s`);
        finalDuration = proportionalDuration;
      }

      createdAssets.push({
        publicId: result.public_id,
        duration: finalDuration,
        order: i,
        url: result.secure_url,
        hasMetadata: (result.duration && result.duration > 0)
      });

      console.log(`[Phase 1] ✅ Created ${trimmedId} with duration: ${finalDuration}s`);
    }
    
    console.log(`--- PHASE 1 COMPLETE: ${createdAssets.length} trimmed videos created ---`);
    
    const withMetadata = createdAssets.filter(a => a.hasMetadata).length;
    const withoutMetadata = createdAssets.length - withMetadata;
    
    return new Response(JSON.stringify({ 
        success: true,
        message: `Phase 1: ${createdAssets.length} videos processed. ${withMetadata} with metadata, ${withoutMetadata} using calculated durations.`,
        phase: 1,
        createdAssets: createdAssets,
        stats: {
          withMetadata,
          withoutMetadata,
          totalDuration: createdAssets.reduce((sum, asset) => sum + asset.duration, 0)
        }
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`❌ Phase 1 Error: ${error.message}`);
    console.error(`❌ Full error:`, error);
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