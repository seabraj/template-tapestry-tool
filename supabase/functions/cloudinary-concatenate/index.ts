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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 === Cloudinary True Concatenation Started ===');
    
    const { videos, targetDuration } = await req.json() as ConcatenationRequest;
    
    if (!videos?.length) throw new Error('No videos provided');
    if (!targetDuration || targetDuration <= 0) throw new Error('A valid target duration is required.');

    console.log(`📊 Processing ${videos.length} videos. Target duration: ${targetDuration}s`);
    console.log('📹 Input videos:', videos.map(v => ({ publicId: v.publicId, duration: v.duration })));

    const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    if (totalOriginalDuration <= 0) throw new Error('Total duration of source videos is zero.');
    console.log(`⏱️ Total original duration: ${totalOriginalDuration.toFixed(2)}s`);
    
    // Calculate proportional durations for each video
    const processedVideos = videos.map((video, index) => {
      const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
      console.log(`📹 Video ${index + 1}: ${video.publicId} - Original: ${video.duration}s, New: ${proportionalDuration.toFixed(2)}s`);
      return {
        publicId: video.publicId,
        duration: proportionalDuration
      };
    });

    // Method 1: Create individual trimmed videos first, then concatenate
    console.log('🔧 Method 1: Creating trimmed videos for concatenation...');
    
    try {
      const resultPublicId = `concat_result_${Date.now()}`;
      
      // Step 1: Create trimmed versions of each video
      const trimmedVideos = [];
      
      for (let i = 0; i < processedVideos.length; i++) {
        const video = processedVideos[i];
        const trimmedId = `trimmed_${i}_${Date.now()}`;
        
        console.log(`✂️ Creating trimmed video ${i + 1}: ${trimmedId} (${video.duration.toFixed(2)}s)`);
        
        // Create trimmed video using upload with transformation
        try {
          const trimResult = await cloudinary.uploader.upload(
            cloudinary.url(video.publicId, {
              resource_type: 'video',
              transformation: [
                { duration: video.duration.toFixed(2) },
                { quality: 'auto:good' }
              ],
              format: 'mp4'
            }),
            {
              resource_type: 'video',
              public_id: trimmedId,
              overwrite: true
            }
          );
          
          trimmedVideos.push(trimmedId);
          console.log(`✅ Trimmed video ${i + 1} created: ${trimmedId}`);
          
        } catch (trimError) {
          console.error(`❌ Failed to create trimmed video ${i + 1}:`, trimError.message);
          throw trimError;
        }
      }
      
      // Step 2: Use Archive API to concatenate the trimmed videos
      console.log('🔗 Concatenating trimmed videos using Archive API...');
      
      const archiveResult = await cloudinary.uploader.create_archive({
        resource_type: 'video',
        type: 'upload',
        public_ids: trimmedVideos,
        target_format: 'mp4',
        mode: 'create',
        notification_url: null, // Synchronous
        transformation: [
          { width: 1280, height: 720, crop: 'pad' },
          { audio_codec: 'aac' },
          { quality: 'auto:good' }
        ]
      });
      
      console.log('✅ Archive concatenation completed:', archiveResult.secure_url);
      
      // Clean up trimmed videos
      console.log('🧹 Cleaning up temporary trimmed videos...');
      for (const trimmedId of trimmedVideos) {
        try {
          await cloudinary.uploader.destroy(trimmedId, { resource_type: 'video' });
        } catch (cleanupError) {
          console.warn(`⚠️ Failed to cleanup ${trimmedId}:`, cleanupError.message);
        }
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          url: archiveResult.secure_url,
          message: `Successfully concatenated ${videos.length} videos using Archive API`,
          method: 'archive_concatenation',
          totalDuration: targetDuration
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
      
    } catch (archiveError) {
      console.warn('⚠️ Archive concatenation failed:', archiveError.message);
    }
    
    // Method 2: Simple playlist approach using Cloudinary's video stitching
    console.log('🔧 Method 2: Using playlist-based concatenation...');
    
    try {
      // Create a simple manifest for concatenation
      const playlistManifest = {
        video: processedVideos.map(video => ({
          publicId: video.publicId,
          transformation: `du_${video.duration.toFixed(2)}`
        }))
      };
      
      console.log('📝 Playlist manifest:', JSON.stringify(playlistManifest, null, 2));
      
      // Upload manifest as raw JSON
      const manifestResult = await cloudinary.uploader.upload(
        `data:application/json;base64,${btoa(JSON.stringify(playlistManifest))}`,
        {
          resource_type: 'raw',
          public_id: `playlist_${Date.now()}`,
          use_filename: false,
          unique_filename: true
        }
      );
      
      console.log('📄 Playlist manifest uploaded:', manifestResult.public_id);
      
      // Create video from playlist
      const playlistUrl = cloudinary.url('sample', {
        resource_type: 'video',
        transformation: [
          { 
            overlay: `raw:${manifestResult.public_id}.json`,
            flags: 'splice'
          },
          { width: 1280, height: 720, crop: 'pad' },
          { audio_codec: 'aac' },
          { quality: 'auto:good' }
        ],
        format: 'mp4'
      });
      
      console.log('🎯 Playlist-based URL:', playlistUrl);
      
      // Test the playlist URL
      const playlistTest = await fetch(playlistUrl, { method: 'HEAD' });
      console.log(`📡 Playlist URL test: ${playlistTest.status} ${playlistTest.statusText}`);
      
      if (playlistTest.ok) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            url: playlistUrl,
            message: `Successfully created concatenated video using playlist method`,
            method: 'playlist',
            totalDuration: targetDuration
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
    } catch (playlistError) {
      console.warn('⚠️ Playlist method failed:', playlistError.message);
    }
    
    // Method 3: Reliable fallback - use the video that best fits the target duration
    console.log('🔧 Method 3: Smart video selection fallback...');
    
    // Find the video whose proportional duration is closest to the target
    const bestVideo = processedVideos.reduce((best, current) => {
      const bestDiff = Math.abs(best.duration - targetDuration);
      const currentDiff = Math.abs(current.duration - targetDuration);
      return currentDiff < bestDiff ? current : best;
    });
    
    const fallbackDuration = Math.min(bestVideo.duration, targetDuration);
    const fallbackTransforms = [
      `du_${fallbackDuration.toFixed(2)}`,
      'w_1280,h_720,c_pad',
      'ac_aac',
      'q_auto:good'
    ];
    
    const fallbackUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${fallbackTransforms.join('/')}/${bestVideo.publicId}.mp4`;
    console.log('🎯 Smart fallback URL:', fallbackUrl);
    console.log(`📹 Using best-fit video: ${bestVideo.publicId} (${fallbackDuration.toFixed(2)}s)`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        url: fallbackUrl,
        message: `Using best-fit video: ${fallbackDuration.toFixed(2)}s from ${bestVideo.publicId}`,
        method: 'smart_selection',
        selectedVideo: bestVideo.publicId,
        actualDuration: fallbackDuration,
        targetDuration: targetDuration,
        videosProcessed: 1,
        totalVideos: videos.length,
        note: 'True concatenation in development - using optimal single video'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ === Video Processing Failed ===');
    console.error('Error details:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});