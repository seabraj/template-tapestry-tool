import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== SIMPLE TEST ENDPOINT ===');
    
    const requestBody = await req.json();
    console.log('Request received:', requestBody);

    // Simulate the same response structure as your video processor
    const testResponse = {
      success: true,
      message: "Test: Communication working perfectly!",
      phase: 1,
      createdAssets: [
        {
          publicId: "test_video_1",
          duration: 5.0,
          order: 0,
          url: "https://res.cloudinary.com/dsxrmo3kt/video/upload/test.mp4",
          hasRealMetadata: false
        }
      ],
      stats: {
        withRealMetadata: 0,
        withCalculatedMetadata: 1,
        totalDuration: 5.0
      },
      videos: [
        {
          publicId: "test_video_1",
          duration: 5.0,
          order: 0,
          url: "https://res.cloudinary.com/dsxrmo3kt/video/upload/test.mp4"
        }
      ],
      resultUrl: "https://res.cloudinary.com/dsxrmo3kt/video/upload/test.mp4",
      timestamp: new Date().toISOString()
    };

    console.log('=== SENDING TEST RESPONSE ===', testResponse);

    return new Response(JSON.stringify(testResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (error) {
    console.error('Test endpoint error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      test: true,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});