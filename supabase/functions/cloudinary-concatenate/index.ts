import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
    const { action, videos, targetDuration, jobId } = await req.json();
    
    // Use the SERVICE_ROLE_KEY to bypass RLS for this backend service
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // ACTION 1: Start the trimming process
    if (action === 'start_job') {
      const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
      const timestamp = Date.now();
      const trimmedIds = [];

      // Create a new job record in the database
      const { data: newJob, error: createJobError } = await supabaseClient
        .from('jobs')
        .insert({ target_duration: targetDuration, status: 'processing_trims' })
        .select()
        .single();
      if (createJobError) throw createJobError;

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
        const trimmedId = `trimmed_${i}_${timestamp}`;
        trimmedIds.push(trimmedId);

        // Use eager_async: true to NOT wait for the response
        await cloudinary.uploader.explicit(video.publicId, {
          type: 'upload',
          resource_type: 'video',
          eager_async: true, 
          eager: [{
            public_id: trimmedId,
            format: 'mp4',
            quality: 'auto:good',
            transformation: [{ duration: proportionalDuration.toFixed(2) }]
          }]
        });
      }

      // Save the expected IDs to the job record
      await supabaseClient.from('jobs').update({ trimmed_ids: trimmedIds }).eq('id', newJob.id);

      // Return the Job ID to the client
      return new Response(JSON.stringify({ jobId: newJob.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION 2: Concatenate the finished videos
    else if (action === 'concatenate') {
      const { data: job, error: jobError } = await supabaseClient
        .from('jobs')
        .select('trimmed_ids, target_duration')
        .eq('id', jobId)
        .single();
      if (jobError || !job) throw new Error("Job not found or not ready.");

      const sortedVideos = job.trimmed_ids as string[];
      if (sortedVideos.length < 2) throw new Error("Not enough videos to concatenate.");

      // Build the concatenation URL
      const video1Id = sortedVideos[0];
      const transformationChain = ['w_1280,h_720,c_pad'];

      for (let i = 1; i < sortedVideos.length; i++) {
        const videoToSpliceId = (sortedVideos[i] as string).replace(/\//g, ':');
        transformationChain.push(`l_video:${videoToSpliceId},w_1280,h_720,c_pad`);
        transformationChain.push('fl_splice');
      }
      transformationChain.push('ac_aac', 'q_auto:good');

      const finalUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${transformationChain.join('/')}/${video1Id}.mp4`;
      
      // Save final URL and update status
      await supabaseClient.from('jobs').update({ status: 'completed', final_url: finalUrl }).eq('id', jobId);

      return new Response(JSON.stringify({ success: true, url: finalUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    else {
      throw new Error("Invalid 'action' provided.");
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});