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
    const { videos, targetDuration } = await req.json();

    // Debug logging
    console.log('=== REQUEST DEBUG ===');
    console.log('Raw request body:', JSON.stringify({ videos, targetDuration }, null, 2));
    console.log('Videos received:', videos);
    console.log('Videos length:', videos?.length);
    console.log('Target duration:', targetDuration);

    // Validation
    if (!videos || videos.length === 0) {
      throw new Error('No videos provided.');
    }
    if (!targetDuration || targetDuration <= 0) {
      throw new Error('Invalid target duration.');
    }

    // Debug each video
    videos.forEach((video, index) => {
      console.log(`Video ${index}:`, {
        publicId: video.publicId,
        duration: video.duration,
        durationType: typeof video.duration,
        hasPublicId: !!video.publicId,
        hasDuration: !!video.duration
      });
    });

    // Validate exact durations
    const invalidVideos = videos.filter(v => !v.duration || v.duration <= 0);
    if (invalidVideos.length > 0) {
      console.log('❌ Invalid videos found:', invalidVideos);
      throw new Error(`Invalid videos: ${invalidVideos.map((v, i) => `Video ${i}: duration=${v.duration}, publicId=${v.publicId}`).join(', ')}`);
    }

    console.log(`✅ Processing ${videos.length} videos for ${targetDuration}s target duration`);

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    const timestamp = Date.now();
    const createdAssets = [];

    // Process each video
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `final_trimmed_${i}_${timestamp}`;
      
      console.log(`Processing video ${i + 1}/${videos.length}: ${video.publicId}`);

      // Create transformation URL
      const trimmedUrl = cloudinary.url(video.publicId, {
        resource_type: 'video',
        transformation: [{ 
          duration: proportionalDuration.toFixed(6),
          format: 'mp4',
          quality: 'auto:good'
        }]
      });

      // Upload transformed video
      const uploadResult = await cloudinary.uploader.upload(trimmedUrl, {
        resource_type: 'video',
        public_id: trimmedId,
        overwrite: true,
        use_filename: false,
        unique_filename: false
      });

      createdAssets.push({
        publicId: uploadResult.public_id,
        duration: proportionalDuration,
        order: i,
        url: uploadResult.secure_url
      });

      console.log(`✅ Created ${trimmedId}: ${proportionalDuration.toFixed(3)}s`);
    }
    
    const actualTotalDuration = createdAssets.reduce((sum, asset) => sum + asset.duration, 0);
    
    console.log(`✅ Phase 1 complete: ${createdAssets.length} videos, ${actualTotalDuration.toFixed(3)}s total`);
    
    return new Response(JSON.stringify({ 
        success: true,
        message: `Phase 1: ${createdAssets.length} videos processed successfully.`,
        phase: 1,
        createdAssets: createdAssets,
        url: createdAssets[0]?.url,
        stats: {
          totalCreated: createdAssets.length,
          targetDuration: targetDuration,
          actualTotalDuration: actualTotalDuration
        },
        status: "completed",
        timestamp: new Date().toISOString()
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
    });

  } catch (error) {
    console.error(`❌ Processing failed: ${error.message}`);
    
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      phase: 1,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});