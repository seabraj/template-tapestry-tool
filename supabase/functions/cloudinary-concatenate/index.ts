import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configure Cloudinary
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
    // --- PHASE 1: CREATE TRIMMED VIDEOS WITH METADATA ---
    // ====================================================================
    console.log('--- STARTING PHASE 1: INITIATE TRIMMING ---');

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const uploadPromises = [];
    const createdAssetIDs = [];

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `trimmed_phase1_${i}_${timestamp}`; // New naming for clarity
      
      createdAssetIDs.push(trimmedId);
      console.log(`[Phase 1] Preparing job for ${video.publicId}. New ID will be ${trimmedId}`);

      // 1. Create the on-the-fly URL for the trimmed video content.
      const trimmedUrl = cloudinary.url(video.publicId, {
        resource_type: 'video',
        transformation: [{ duration: proportionalDuration.toFixed(2) }],
        format: 'mp4'
      });
      
      // 2. Upload from that URL to create a new, permanent asset.
      const uploadPromise = cloudinary.uploader.upload(trimmedUrl, {
        resource_type: 'video',
        public_id: trimmedId,
        overwrite: true,
        // --- THE FIX FOR METADATA ---
        // This tells Cloudinary this is a background job.
        eager_async: true,
        // This "no-op" transform forces the video into the processing queue
        // where duration and other metadata are correctly generated.
        eager: [{ quality: 'auto' }] 
      });

      uploadPromises.push(uploadPromise);
    }
    
    // Wait for all the upload commands to be sent to Cloudinary.
    await Promise.all(uploadPromises);

    console.log(`--- PHASE 1 COMPLETE: ${videos.length} trimming jobs have been initiated. ---`);
    console.log('Verification: Check your Cloudinary library for new assets and inspect their duration after a few moments.');
    
    return new Response(JSON.stringify({ 
        success: true,
        message: "Phase 1: Trimming jobs initiated successfully.",
        phase: 1,
        // The list of IDs for the files that are now being created:
        trimmedVideoPublicIds: createdAssetIDs 
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`❌ Function Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});