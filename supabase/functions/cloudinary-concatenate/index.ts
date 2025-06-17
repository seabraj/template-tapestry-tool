import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Configure Cloudinary Admin API ---
// We still need the config for the SDK to sign URLs if needed in the future.
try {
  cloudinary.config({
    cloud_name: 'dsxrmo3kt',
    api_key: Deno.env.get('CLOUDINARY_API_KEY'),
    api_secret: Deno.env.get('CLOUDINARY_API_SECRET'),
    secure: true,
  });
  console.log('✅ Cloudinary SDK configured successfully.');
} catch(e) {
  console.error('❌ Failed to configure Cloudinary SDK.', e);
}

interface ConcatenationRequest {
  publicIds: string[];
  targetDuration: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 === Cloudinary Video Concatenation Started ===');
    
    const { publicIds, targetDuration } = await req.json() as ConcatenationRequest;
    const cloudName = 'dsxrmo3kt';
    
    if (!publicIds?.length) throw new Error('No video public IDs provided');
    if (!targetDuration || targetDuration <= 0) throw new Error('A valid target duration is required.');

    console.log(`📊 Processing ${publicIds.length} videos. Target duration: ${targetDuration}s`);

    // --- FINAL ROBUST SOLUTION using on-the-fly variables ---
    
    const transformations = [];
    
    // 1. Define a variable for the final target duration
    const targetDurationVar = `$finalDuration_to_f_${targetDuration}`;
    transformations.push(targetDurationVar);
    
    // 2. Define variables for each video's original duration using 'idu' (initial duration)
    const durationVars = publicIds.map((id, i) => `$d${i}_to_i_idu`);
    
    // 3. To use 'idu' for each video, they must be part of a transformation chain.
    // We will build this chain using layers.
    
    // Define the total duration variable by summing the individual duration variables
    const totalDurationVar = `$totalDuration_to_f_${durationVars.map(v => v.split('_')[0]).join('_add_')}`;
    
    // --- Build the Transformation Chain ---
    // Start with a base canvas and quality settings
    transformations.push('w_1280,h_720,c_pad,q_auto:good');
    
    // Add the first video as the base layer, with its duration variable defined.
    transformations.push(`l_video:${publicIds[0]}/${durationVars[0]}`);
    
    // Add subsequent videos as layers, each defining its own duration variable
    for (let i = 1; i < publicIds.length; i++) {
        transformations.push(`l_video:${publicIds[i]}/${durationVars[i]}/fl_layer_apply`);
    }

    // Now that all durations are in variables, calculate the total
    transformations.push(totalDurationVar);

    // Now, create the final video by splicing the layers again, but this time with proportional trimming.
    // This requires a second "pass" in the transformation string.
    
    // Trim the first video proportionally
    const firstVideoTrim = `l_video:${publicIds[0]},du_($finalDuration_mul_$d0)_div_$totalDuration`;
    transformations.push(firstVideoTrim);
    
    // Splice subsequent videos, trimmed proportionally
    for (let i = 1; i < publicIds.length; i++) {
        const subsequentTrim = `l_video:${publicIds[i]},du_($finalDuration_mul_$d${i})_div_$totalDuration,fl_splice`;
        transformations.push(subsequentTrim);
    }

    // Apply all layer transformations
    transformations.push('fl_layer_apply');

    // Generate the final URL using a base canvas, with comma-separated transformations
    const finalUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${transformations.join(',')}/e_colorize,co_black/w_1,h_1/f_mp4/canvas.mp4`;
    console.log('🎯 Final URL generated:', finalUrl);

    return new Response(
      JSON.stringify({
        success: true,
        url: finalUrl,
        message: `Successfully generated proportional video URL for ${publicIds.length} videos.`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ === Cloudinary Concatenation Failed ===');
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});