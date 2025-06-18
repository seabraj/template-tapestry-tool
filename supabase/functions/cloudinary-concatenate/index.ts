// FINAL code for: cloudinary-concatenate/index.ts

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

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    if (totalOriginalDuration <= 0) throw new Error('Total original duration of videos is zero.');

    const firstVideo = videos[0];
    const firstVideoProportionalDuration = (firstVideo.duration / totalOriginalDuration) * targetDuration;

    // Start building the transformation array for the Cloudinary SDK
    const transformations = [
      // First, set the dimensions and trim the base video
      { width: 1280, height: 720, crop: 'pad' },
      { duration: firstVideoProportionalDuration.toFixed(2) },
    ];

    // Loop through the rest of the videos and add them as overlays to be spliced
    for (let i = 1; i < videos.length; i++) {
      const subsequentVideo = videos[i];
      const subsequentVideoProportionalDuration = (subsequentVideo.duration / totalOriginalDuration) * targetDuration;

      // Define the video overlay, including its own trim transformation
      const overlayOptions = {
        resource_type: 'video',
        public_id: subsequentVideo.publicId,
        transformation: [
            { width: 1280, height: 720, crop: 'pad' },
            { duration: subsequentVideoProportionalDuration.toFixed(2) }
        ]
      };
      
      // Add the overlay layer and the splice flag
      transformations.push({ overlay: overlayOptions });
      transformations.push({ flags: 'splice' });
    }

    // Add final overall transformations for the output video
    transformations.push({ audio_codec: 'aac' }, { quality: 'auto:good' });

    // Let the Cloudinary SDK generate the final, complex URL using the original video IDs
    const finalUrl = cloudinary.url(firstVideo.publicId, {
      resource_type: 'video',
      transformation: transformations,
      format: 'mp4',
    });

    return new Response(JSON.stringify({ success: true, url: finalUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`❌ Edge Function Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});