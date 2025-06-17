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
    const { jobId } = await req.json();
    if (!jobId) throw new Error("Job ID is required.");

    // Use the SERVICE_ROLE_KEY to bypass RLS for this backend service
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Get the job details from the database
    const { data: job, error: jobError } = await supabaseClient
      .from('jobs')
      .select('status, trimmed_ids')
      .eq('id', jobId)
      .single();

    if (jobError || !job) throw new Error(`Job not found: ${jobError?.message}`);
    if (job.status === 'completed') {
      return new Response(JSON.stringify({ status: 'completed' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Check Cloudinary for the resources
    const publicIds = job.trimmed_ids as string[];
    if (!publicIds || publicIds.length === 0) {
      // Not an error, but the job isn't ready yet.
      return new Response(JSON.stringify({ status: 'processing_trims' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { resources } = await cloudinary.api.resources({
        type: 'upload',
        resource_type: 'video',
        public_ids: publicIds
    });
    
    // 3. Verify if all videos are trimmed and have duration
    let allReady = true;
    if (resources.length !== publicIds.length) {
        allReady = false;
    } else {
        for (const resource of resources) {
            if (!resource.duration || resource.duration === 0) {
                allReady = false;
                break;
            }
        }
    }

    // 4. Update status if ready, otherwise return processing
    if (allReady) {
        await supabaseClient.from('jobs').update({ status: 'ready_to_concatenate' }).eq('id', jobId);
        return new Response(JSON.stringify({ status: 'ready_to_concatenate' }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } else {
        return new Response(JSON.stringify({ status: 'processing_trims' }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});