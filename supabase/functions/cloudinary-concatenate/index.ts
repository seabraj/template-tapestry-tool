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
    console.log('=== CLOUDINARY CONNECTION TEST ===');
    
    // Test 1: Basic connection
    console.log('Testing connection...');
    const pingResult = await cloudinary.api.ping();
    console.log('Ping result:', pingResult);
    
    // Test 2: List first few resources
    console.log('Listing resources...');
    const resources = await cloudinary.api.resources({
      resource_type: 'video',
      max_results: 5
    });
    
    console.log('Found resources:', resources.resources.map(r => ({
      public_id: r.public_id,
      duration: r.duration,
      format: r.format,
      bytes: r.bytes,
      created_at: r.created_at
    })));
    
    // Test 3: Try to get details of your actual videos
    console.log('Getting details of your actual videos...');
    
    const videoIds = [
      'video_library/sigsig8mltjbmucxg7h3',
      'video_library/gquadddvckk1eqnyk2bz', 
      'video_library/ki4y9fuhwu9z3b1tzi9n'
    ];
    
    const videoDetails = {};
    for (const videoId of videoIds) {
      try {
        const video = await cloudinary.api.resource(videoId, {
          resource_type: 'video'
        });
        videoDetails[videoId] = {
          public_id: video.public_id,
          duration: video.duration,
          format: video.format,
          width: video.width,
          height: video.height,
          bytes: video.bytes
        };
        console.log(`Video ${videoId}:`, videoDetails[videoId]);
      } catch (error) {
        console.log(`Error getting ${videoId}:`, error.message);
        videoDetails[videoId] = { error: error.message };
      }
    }
    
    // Test 4: Generate transformation URLs for your actual videos
    console.log('Testing transformation URLs...');
    
    const testVideoId = 'video_library/ki4y9fuhwu9z3b1tzi9n'; // The 15s video
    
    const urls = {
      original: cloudinary.url(testVideoId, {
        resource_type: 'video',
        format: 'mp4'
      }),
      quality: cloudinary.url(testVideoId, {
        resource_type: 'video',
        transformation: [{ quality: 'auto' }],
        format: 'mp4'
      }),
      trim_to_5s: cloudinary.url(testVideoId, {
        resource_type: 'video',
        transformation: [{ duration: '5.0' }],
        format: 'mp4'
      }),
      trim_to_2s: cloudinary.url(testVideoId, {
        resource_type: 'video', 
        transformation: [{ duration: '2.0' }],
        format: 'mp4'
      })
    };
    
    console.log('Generated URLs for testing:', urls);
    
    return new Response(JSON.stringify({
      success: true,
      message: "Cloudinary connection test completed",
      results: {
        pingResult,
        resourceCount: resources.resources.length,
        videoDetails,
        urls
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`❌ Test Error: ${error.message}`);
    console.error(`❌ Full error:`, error);
    
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack,
      name: error.name
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});