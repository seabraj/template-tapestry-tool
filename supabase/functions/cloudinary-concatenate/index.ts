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
    console.log('--- STARTING PHASE 1: Creating transformed assets directly ---');

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const uploadPromises = [];
    const createdAssetIDs = [];

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `final_trimmed_${i}_${timestamp}`; // New name for clarity
      
      createdAssetIDs.push(trimmedId);
      console.log(`[Phase 1] Creating new asset ${trimmedId} from ${video.publicId}`);

      // --- THE DEFINITIVE FIX ---
      // Instead of creating a temp URL, we upload the ORIGINAL public_id
      // and apply the transformation during the upload process.
      // This is a direct instruction to Cloudinary and triggers full analysis.
      const uploadPromise = cloudinary.uploader.upload(video.publicId, { // Source is the original public_id
        resource_type: 'video',
        public_id: trimmedId, // The ID of the NEW asset to create
        overwrite: true,
        // The transformation to apply to the source before saving the new asset
        transformation: [
          { duration: proportionalDuration.toFixed(2) }
        ]
      });

      uploadPromises.push(uploadPromise);
    }
    
    // Wait for all upload commands to complete.
    // This process is synchronous but should be fast as no video data is being sent.
    await Promise.all(uploadPromises);

    console.log(`--- PHASE 1 COMPLETE: ${videos.length} trimmed videos have been created. ---`);
    console.log('To verify, check your Cloudinary library for the new assets and inspect their duration metadata.');
    
    return new Response(JSON.stringify({ 
        success: true,
        message: "Phase 1: Trimmed videos created successfully with metadata.",
        phase: 1,
        trimmedVideoPublicIds: createdAssetIDs
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