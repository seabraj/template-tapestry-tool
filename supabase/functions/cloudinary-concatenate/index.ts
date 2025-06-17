import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configure Cloudinary Admin API for uploading the manifest
try {
  cloudinary.config({
    cloud_name: 'dsxrmo3kt',
    api_key: Deno.env.get('CLOUDINARY_API_KEY'),
    api_secret: Deno.env.get('CLOUDINARY_API_SECRET'),
    secure: true,
  });
  console.log('✅ Cloudinary SDK configured successfully.');
} catch (e) {
  console.error('❌ Failed to configure Cloudinary SDK.', e);
}

// The frontend will now send the video object with its duration
interface VideoInfo {
  publicId: string;
  duration: number;
}

interface ConcatenationRequest {
  videos: VideoInfo[];
  targetDuration: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 === Cloudinary Manifest Concatenation Started ===');
    
    const { videos, targetDuration } = await req.json() as ConcatenationRequest;
    const cloudName = 'dsxrmo3kt';
    
    if (!videos?.length) throw new Error('No videos provided');
    if (!targetDuration || targetDuration <= 0) throw new Error('A valid target duration is required.');

    console.log(`📊 Processing ${videos.length} videos. Target duration: ${targetDuration}s`);

    // --- MANIFEST-BASED SOLUTION ---

    // 1. Calculate total duration from the reliable data sent from the frontend
    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    if (totalOriginalDuration <= 0) throw new Error('Total duration of source videos is zero.');
    console.log(`⏱️ Total original duration: ${totalOriginalDuration.toFixed(2)}s`);
    
    // 2. Build the manifest entries with proportional trimming
    const manifest = {
      entries: videos.map(video => {
        const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
        return {
          public_id: video.publicId,
          transform: `du_${proportionalDuration.toFixed(2)}` // Simple duration trim
        };
      })
    };
    
    console.log('📝 Generated Manifest:', JSON.stringify(manifest, null, 2));

    // 3. Upload the manifest as a raw JSON file to Cloudinary
    const manifestString = JSON.stringify(manifest);
    const uploadResult = await cloudinary.uploader.upload(
      `data:text/plain;base64,${btoa(manifestString)}`, 
      { resource_type: 'raw', use_filename: true, unique_filename: true }
    );
    
    const manifestPublicId = uploadResult.public_id;
    console.log(`📄 Manifest uploaded successfully with public ID: ${manifestPublicId}`);

    // 4. Generate the final, simple URL using the manifest
    const finalUrl = cloudinary.url(`${manifestPublicId}.json`, {
      resource_type: 'video',
      transformation: [
        { width: 1280, height: 720, crop: 'pad', audio_codec: 'aac' },
        { effect: 'concatenate:manifest_json' },
        { fetch_format: 'mp4' }
      ]
    });

    console.log('🎯 Final URL generated:', finalUrl);

    return new Response(
      JSON.stringify({ success: true, url: finalUrl }),
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