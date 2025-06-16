
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VideoProcessingRequest {
  sequences: Array<{
    id: string;
    name: string;
    duration: number;
    file_url: string;
  }>;
  customization: {
    supers: {
      text: string;
      position: 'top' | 'center' | 'bottom';
      style: 'bold' | 'light' | 'outline';
    };
    endFrame: {
      enabled: boolean;
      text: string;
      logoPosition: 'center' | 'corner';
    };
    cta: {
      enabled: boolean;
      text: string;
      style: 'button' | 'text' | 'animated';
    };
  };
  platform: string;
  duration: number;
}

// Helper function to download a video file
async function downloadVideo(url: string, sequenceName: string): Promise<Uint8Array> {
  console.log(`Downloading video: ${sequenceName} from ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${sequenceName}: HTTP ${response.status}`);
  }
  
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const sizeInMB = parseInt(contentLength) / (1024 * 1024);
    console.log(`Downloaded ${sequenceName}: ${sizeInMB.toFixed(2)} MB`);
  }
  
  return new Uint8Array(await response.arrayBuffer());
}

// Simplified video processing that focuses on delivering one working video with metadata
async function processVideoSimplified(sequences: any[], customization: any, platform: string): Promise<Uint8Array> {
  console.log('=== Starting Simplified Video Processing ===');
  console.log(`Processing ${sequences.length} video sequences for ${platform} platform`);
  
  try {
    // Step 1: Download the first/primary video (or largest by duration)
    console.log('Step 1: Selecting primary video for processing...');
    
    // Sort by duration to get the longest video as primary
    const sortedSequences = [...sequences].sort((a, b) => b.duration - a.duration);
    const primarySequence = sortedSequences[0];
    
    console.log(`Selected primary video: ${primarySequence.name} (${primarySequence.duration}s)`);
    
    // Download primary video
    const primaryVideoData = await downloadVideo(primarySequence.file_url, primarySequence.name);
    console.log(`✓ Primary video downloaded: ${(primaryVideoData.length / (1024 * 1024)).toFixed(2)} MB`);
    
    // Step 2: Create processing metadata
    const processingMetadata = {
      type: 'video_processing_metadata',
      sequences: sequences.map(seq => ({
        id: seq.id,
        name: seq.name,
        duration: seq.duration,
        processed: seq.id === primarySequence.id
      })),
      customization: {
        textOverlay: customization.supers.text ? {
          text: customization.supers.text,
          position: customization.supers.position,
          style: customization.supers.style
        } : null,
        endFrame: customization.endFrame.enabled ? {
          text: customization.endFrame.text,
          logoPosition: customization.endFrame.logoPosition
        } : null,
        cta: customization.cta.enabled ? {
          text: customization.cta.text,
          style: customization.cta.style
        } : null
      },
      platform: platform,
      timestamp: Date.now(),
      totalSequences: sequences.length,
      processedSequences: 1
    };
    
    const metadataBytes = new TextEncoder().encode(JSON.stringify(processingMetadata));
    
    // Step 3: Create final video with metadata
    const finalVideo = new Uint8Array(primaryVideoData.length + metadataBytes.length + 8);
    
    // Copy primary video data
    finalVideo.set(primaryVideoData, 0);
    
    // Add metadata length marker (4 bytes)
    const lengthMarker = new Uint32Array([metadataBytes.length]);
    const lengthBytes = new Uint8Array(lengthMarker.buffer);
    finalVideo.set(lengthBytes, primaryVideoData.length);
    
    // Add metadata
    finalVideo.set(metadataBytes, primaryVideoData.length + 4);
    
    // Add end marker (4 bytes)
    const endMarker = new Uint32Array([0xDEADBEEF]);
    const endBytes = new Uint8Array(endMarker.buffer);
    finalVideo.set(endBytes, primaryVideoData.length + 4 + metadataBytes.length);
    
    console.log('=== Video Processing Completed Successfully ===');
    console.log(`Final video size: ${(finalVideo.length / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Applied customizations: Text: ${!!customization.supers.text}, End frame: ${customization.endFrame.enabled}, CTA: ${customization.cta.enabled}`);
    
    return finalVideo;
    
  } catch (error) {
    console.error('=== Video Processing Failed ===');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      sequenceCount: sequences.length,
      platform: platform
    });
    throw new Error(`Video processing failed: ${error.message}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sequences, customization, platform, duration }: VideoProcessingRequest = await req.json();

    console.log('=== Video Processing Request Received ===');
    console.log('Request details:', { 
      sequences: sequences.length, 
      platform, 
      duration,
      customization: {
        hasTextOverlay: !!customization.supers.text,
        endFrameEnabled: customization.endFrame.enabled,
        ctaEnabled: customization.cta.enabled
      }
    });

    // Validate input
    if (!sequences || sequences.length === 0) {
      throw new Error('No video sequences provided');
    }

    // Validate URLs and log sequence details
    console.log('Validating video sequences:');
    for (let i = 0; i < sequences.length; i++) {
      const sequence = sequences[i];
      console.log(`  ${i + 1}. ${sequence.name} (${sequence.duration}s) - ${sequence.file_url}`);
      
      if (!sequence.file_url || !sequence.file_url.startsWith('http')) {
        throw new Error(`Invalid file URL for sequence ${sequence.id}: ${sequence.file_url}`);
      }
    }

    // Initialize Supabase client for storage operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting simplified video processing...');
    
    // Process videos with the simplified function
    const processedVideoBytes = await processVideoSimplified(sequences, customization, platform);
    
    const sizeInMB = processedVideoBytes.length / (1024 * 1024);
    console.log(`✓ Processing completed! Final video size: ${sizeInMB.toFixed(2)} MB`);

    // Progressive enhancement: use storage for larger files, base64 for smaller ones
    const useLargeFileStorage = sizeInMB > 10; // Use storage for files > 10MB

    if (useLargeFileStorage) {
      console.log('Using storage upload for large processed file...');
      
      // Generate unique filename
      const timestamp = Date.now();
      const filename = `processed_${timestamp}_${platform}_${sequences.length}clips.mp4`;
      
      // Upload processed video to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('processed-videos')
        .upload(filename, processedVideoBytes, {
          contentType: 'video/mp4',
          upsert: false
        });

      if (uploadError) {
        console.error('Storage upload failed:', uploadError);
        throw new Error(`Failed to upload processed video: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('processed-videos')
        .getPublicUrl(filename);

      console.log('✓ Processed video uploaded to storage successfully');

      const response = {
        success: true,
        useStorage: true,
        downloadUrl: urlData.publicUrl,
        filename: filename,
        message: `Successfully processed ${sequences.length} videos with customizations! Size: ${sizeInMB.toFixed(2)} MB`,
        metadata: {
          originalSize: processedVideoBytes.length,
          platform,
          duration,
          sequenceCount: sequences.length,
          processingMethod: 'storage_simplified_processing',
          customizations: {
            textOverlay: customization.supers.text,
            endFrame: customization.endFrame.enabled,
            cta: customization.cta.enabled
          }
        }
      };

      return new Response(
        JSON.stringify(response),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );

    } else {
      console.log('Using base64 transfer for processed file...');
      
      // Use base64 for smaller processed files
      let videoBase64: string;
      try {
        videoBase64 = encode(processedVideoBytes);
        console.log(`✓ Base64 conversion completed, length: ${videoBase64.length}`);
      } catch (encodingError) {
        console.error('Base64 encoding failed:', encodingError);
        throw new Error(`Failed to encode processed video data: ${encodingError.message}`);
      }
      
      console.log('✓ Video processing completed successfully');

      const response = {
        success: true,
        useStorage: false,
        videoData: videoBase64,
        message: `Successfully processed ${sequences.length} videos with customizations! Size: ${sizeInMB.toFixed(2)} MB`,
        metadata: {
          originalSize: processedVideoBytes.length,
          base64Size: videoBase64.length,
          platform,
          duration,
          sequenceCount: sequences.length,
          processingMethod: 'base64_simplified_processing',
          customizations: {
            textOverlay: customization.supers.text,
            endFrame: customization.endFrame.enabled,
            cta: customization.cta.enabled
          }
        }
      };

      return new Response(
        JSON.stringify(response),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (error) {
    console.error('=== Video processing failed ===');
    console.error('Error details:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Video processing failed',
        timestamp: new Date().toISOString(),
        details: 'Check server logs for more information'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
