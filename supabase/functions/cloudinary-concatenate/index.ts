import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';
// Note: createClient is not used in Phase 1, but we'll keep it for future phases.
// import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    // --- INPUT VALIDATION ---
    if (!videos || videos.length === 0) throw new Error('No videos provided.');
    if (!targetDuration || targetDuration <= 0) throw new Error('Invalid target duration.');

    // ====================================================================
    // --- PHASE 1: INITIATE PROPORTIONAL TRIMMING ---
    // The goal of this phase is to create trimmed video files in Cloudinary
    // and ensure they have correct duration metadata.
    // ====================================================================
    console.log('--- STARTING PHASE 1: INITIATE TRIMMING ---');

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const uploadPromises = [];
    const createdAssetIDs = [];

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `trimmed_${i}_${timestamp}`;
      
      createdAssetIDs.push(trimmedId);
      console.log(`[Phase 1] Preparing to trim video ${i + 1}: ${video.publicId} to ${proportionalDuration.toFixed(2)}s. New ID will be ${trimmedId}`);

      // 1. Create the on-the-fly transformation URL for the trimmed video.
      const trimmedUrl = cloudinary.url(video.publicId, {
        resource_type: 'video',
        transformation: [{ duration: proportionalDuration.toFixed(2) }],
        format: 'mp4'
      });
      
      // 2. Upload the content from that URL as a new asset.
      const uploadPromise = cloudinary.uploader.upload(trimmedUrl, {
        resource_type: 'video',
        public_id: trimmedId,
        overwrite: true,
        // --- THE FIX FOR METADATA ---
        // This tells Cloudinary to process the job in the background.
        eager_async: true,
        // This "no-op" transformation forces the video into the processing
        // queue where duration and other metadata are correctly analyzed and generated.
        eager: [{ quality: 'auto' }] 
      });

      uploadPromises.push(uploadPromise);
    }
    
    // Wait for all the upload commands to be sent to Cloudinary.
    await Promise.all(uploadPromises);

    console.log(`--- PHASE 1 COMPLETE: ${videos.length} trimming jobs have been initiated. ---`);
    console.log('To verify, check your Cloudinary library for the new assets and inspect their duration metadata after a few moments.');
    
    // For now, Phase 1 will return the list of public IDs that are being created.
    // This allows the frontend to know what to expect for Phase 2.
    return new Response(JSON.stringify({ 
        success: true,
        message: "Phase 1: Trimming jobs initiated successfully.",
        phase: 1,
        trimmedVideoPublicIds: createdAssetIDs // This will be used in Phase 2
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