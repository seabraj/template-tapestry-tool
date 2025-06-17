import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configure Cloudinary
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

interface VideoInfo {
  publicId: string;
  duration: number;
}

interface ConcatenationRequest {
  videos: VideoInfo[];
  targetDuration: number;
}

interface TrimmedVideo {
  publicId: string;
  originalId: string;
  duration: number;
  order: number;
  verified: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 === PHASE 1: Video Trimming Started ===');
    
    const { videos, targetDuration } = await req.json() as ConcatenationRequest;
    
    if (!videos?.length) throw new Error('No videos provided');
    if (!targetDuration || targetDuration <= 0) throw new Error('A valid target duration is required.');

    console.log(`📊 Processing ${videos.length} videos. Target duration: ${targetDuration}s`);
    console.log('📹 Input videos:', videos.map(v => ({ publicId: v.publicId, duration: v.duration })));

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    if (totalOriginalDuration <= 0) throw new Error('Total duration of source videos is zero.');
    console.log(`⏱️ Total original duration: ${totalOriginalDuration.toFixed(2)}s`);
    
    // PHASE 1: Create proportionally trimmed videos
    const timestamp = Date.now();
    const trimmedVideos: TrimmedVideo[] = [];
    
    console.log('✂️ Creating proportionally trimmed videos...');
    
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      const trimmedId = `temp_processing/trimmed_${i}_${timestamp}`;
      
      console.log(`📹 Video ${i + 1}/${videos.length}: ${video.publicId}`);
      console.log(`   Original duration: ${video.duration}s`);
      console.log(`   Proportional duration: ${proportionalDuration.toFixed(2)}s`);
      console.log(`   Temp ID: ${trimmedId}`);
      
      try {
        // Create the trimmed video URL
        const trimmedUrl = cloudinary.url(video.publicId, {
          resource_type: 'video',
          transformation: [
            { duration: proportionalDuration.toFixed(2) },
            { quality: 'auto:good' }
          ],
          format: 'mp4'
        });
        
        console.log(`🔗 Trimmed URL for video ${i + 1}: ${trimmedUrl}`);
        
        // Upload the trimmed video to temp folder
        console.log(`⬆️ Uploading trimmed video ${i + 1} to Cloudinary...`);
        const uploadResult = await cloudinary.uploader.upload(trimmedUrl, {
          resource_type: 'video',
          public_id: trimmedId,
          overwrite: true,
          use_filename: false,
          unique_filename: false
        });
        
        console.log(`✅ Upload successful for video ${i + 1}:`, {
          public_id: uploadResult.public_id,
          secure_url: uploadResult.secure_url,
          duration: uploadResult.duration,
          format: uploadResult.format
        });
        
        // Verify the trimmed video exists and get its details
        console.log(`🔍 Verifying trimmed video ${i + 1}...`);
        
        const verification = await cloudinary.api.resource(trimmedId, { 
          resource_type: 'video'
        });
        
        if (!verification) {
          throw new Error(`Verification failed for trimmed video: ${trimmedId}`);
        }
        
        console.log(`✅ Verification successful for video ${i + 1}:`, {
          public_id: verification.public_id,
          duration: verification.duration,
          format: verification.format,
          bytes: verification.bytes
        });
        
        // Store the verified trimmed video info
        trimmedVideos.push({
          publicId: trimmedId,
          originalId: video.publicId,
          duration: proportionalDuration,
          order: i,
          verified: true
        });
        
        console.log(`🎯 Video ${i + 1} successfully processed and verified`);
        
      } catch (videoError) {
        console.error(`❌ Failed to process video ${i + 1} (${video.publicId}):`, videoError);
        
        // Clean up any successfully created videos if one fails
        console.log('🧹 Cleaning up due to error...');
        for (const cleanupVideo of trimmedVideos) {
          try {
            await cloudinary.uploader.destroy(cleanupVideo.publicId, { resource_type: 'video' });
            console.log(`🗑️ Cleaned up: ${cleanupVideo.publicId}`);
          } catch (cleanupError) {
            console.warn(`⚠️ Cleanup warning for ${cleanupVideo.publicId}:`, cleanupError.message);
          }
        }
        
        throw new Error(`Video processing failed at video ${i + 1}: ${videoError.message}`);
      }
    }
    
    // PHASE 1 COMPLETE - All videos trimmed and verified
    console.log('🎉 === PHASE 1 COMPLETE ===');
    console.log(`✅ Successfully created ${trimmedVideos.length} trimmed videos:`);
    
    trimmedVideos.forEach((video, index) => {
      console.log(`   ${index + 1}. ${video.publicId} (${video.duration.toFixed(2)}s) ✓`);
    });
    
    const totalTrimmedDuration = trimmedVideos.reduce((sum, v) => sum + v.duration, 0);
    console.log(`⏱️ Total trimmed duration: ${totalTrimmedDuration.toFixed(2)}s (target: ${targetDuration}s)`);
    
    // For now, return success with trimmed video details
    // Phase 2 (concatenation) will be implemented next
    return new Response(
      JSON.stringify({ 
        success: true,
        phase: 'phase_1_complete',
        message: `Phase 1 complete: ${trimmedVideos.length} videos trimmed and verified`,
        trimmedVideos: trimmedVideos.map(v => ({
          publicId: v.publicId,
          originalId: v.originalId,
          duration: v.duration,
          order: v.order
        })),
        totalDuration: totalTrimmedDuration,
        targetDuration: targetDuration,
        nextStep: 'Phase 2: Concatenation (to be implemented)',
        // Temporary: Return the first trimmed video URL for testing
        tempVideoUrl: cloudinary.url(trimmedVideos[0].publicId, {
          resource_type: 'video',
          quality: 'auto:good',
          format: 'mp4'
        })
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ === PHASE 1 FAILED ===');
    console.error('Error details:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        phase: 'phase_1_failed',
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});