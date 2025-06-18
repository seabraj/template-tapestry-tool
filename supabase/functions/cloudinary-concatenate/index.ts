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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videos, targetDuration } = await req.json();

    if (!videos || videos.length === 0) throw new Error('No videos provided.');
    if (!targetDuration || targetDuration <= 0) throw new Error('Invalid target duration.');

    // ====================================================================
    // --- PHASE 1: SYNCHRONOUSLY CREATE TRIMMED VIDEOS WITH METADATA ---
    // ====================================================================
    console.log('--- STARTING PHASE 1: Synchronous trim and verify ---');

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const createdAssets = []; // We will store the full verified asset data

    // This loop now processes each video ONE BY ONE, waiting for completion.
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `final_trimmed_${i}_${timestamp}`;
      
      console.log(`[Phase 1] Processing video ${i + 1}/${videos.length}: Creating ${trimmedId}`);

      // 1. Create the on-the-fly transformation URL for the trimmed video content.
      const trimmedUrl = cloudinary.url(video.publicId, {
        resource_type: 'video',
        transformation: [{ duration: proportionalDuration.toFixed(2) }],
        format: 'mp4'
      });
      
      // 2. Upload and AWAIT the completion of this single video.
      // No eager flags needed. The synchronous await forces full processing.
      await cloudinary.uploader.upload(trimmedUrl, {
        resource_type: 'video',
        public_id: trimmedId,
        overwrite: true,
      });

      console.log(`[Phase 1] Asset ${trimmedId} created. Now verifying metadata...`);

      // 3. IMMEDIATELY verify the asset to confirm metadata exists.
      const verification = await cloudinary.api.resource(trimmedId, { resource_type: 'video' });
      
      if (!verification.duration) {
        // If metadata is still missing, we stop and throw a clear error.
        throw new Error(`Verification failed: Duration metadata not found for ${trimmedId} after synchronous upload.`);
      }

      console.log(`[Phase 1] ✅ Verification successful for ${trimmedId}. Duration: ${verification.duration}`);
      createdAssets.push({
        publicId: verification.public_id,
        duration: verification.duration,
        order: i
      });
    }
    
    console.log(`--- PHASE 1 COMPLETE: ${createdAssets.length} trimmed videos were created and verified successfully. ---`);
    
    return new Response(JSON.stringify({ 
        success: true,
        message: "Phase 1: All videos trimmed and verified successfully.",
        phase: 1,
        // The response now contains the verified assets with their new durations
        createdAssets: createdAssets
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`❌ Phase 1 Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});