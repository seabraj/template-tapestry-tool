import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1'; // We keep this for the config setup

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configure Cloudinary - this part is still necessary
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

    // --- MANUAL URL STRING CONSTRUCTION ---
    const transformationParts = [];

    // 1. Add base transformations for the FIRST video
    transformationParts.push(`w_1280,h_720,c_pad,du_${firstVideoProportionalDuration.toFixed(2)}`);

    // 2. Loop through SUBSEQUENT videos to build the overlay and splice chain
    for (let i = 1; i < videos.length; i++) {
      const subsequentVideo = videos[i];
      const subsequentVideoProportionalDuration = (subsequentVideo.duration / totalOriginalDuration) * targetDuration;

      // A. Add the overlay layer, specifying the video public ID
      transformationParts.push(`l_video:${subsequentVideo.publicId.replace(/\//g, ':')}`);
      
      // B. Apply sizing transformations TO THAT a new layer
      transformationParts.push(`w_1280,h_720,c_pad`);
      
      // C. Apply the duration trim specifically TO THAT LAYER using the layer_apply flag
      transformationParts.push(`fl_layer_apply,du_${subsequentVideoProportionalDuration.toFixed(2)}`);
      
      // D. Splice the now-transformed layer onto the main video
      transformationParts.push(`fl_splice`);
    }

    // 3. Add final global transformations for the output video
    transformationParts.push(`ac_aac,q_auto:good`);

    // 4. Join all transformation parts with slashes
    const transformationString = transformationParts.join('/');

    // 5. Manually construct the final, complete URL
    const finalUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${transformationString}/${firstVideo.publicId}.mp4`;

    // 6. Return the manually built URL
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