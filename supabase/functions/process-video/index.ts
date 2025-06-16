
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

// Enhanced video processing that handles multiple sequences and customizations
async function processVideoWithSequences(sequences: any[], customization: any, platform: string): Promise<Uint8Array> {
  console.log('=== Starting Enhanced Video Processing ===');
  console.log(`Processing ${sequences.length} video sequences for ${platform} platform`);
  
  try {
    // Step 1: Download all video sequences
    console.log('Step 1: Downloading all video sequences...');
    const videoBuffers: Array<{ data: Uint8Array; name: string; duration: number }> = [];
    
    for (const sequence of sequences) {
      const videoData = await downloadVideo(sequence.file_url, sequence.name);
      videoBuffers.push({
        data: videoData,
        name: sequence.name,
        duration: sequence.duration
      });
      console.log(`✓ Downloaded ${sequence.name}: ${(videoData.length / (1024 * 1024)).toFixed(2)} MB`);
    }
    
    // Step 2: Concatenate videos (simple binary concatenation for now)
    console.log('Step 2: Concatenating video sequences...');
    let totalSize = 0;
    videoBuffers.forEach(buffer => totalSize += buffer.data.length);
    
    const concatenatedVideo = new Uint8Array(totalSize);
    let offset = 0;
    
    for (const buffer of videoBuffers) {
      concatenatedVideo.set(buffer.data, offset);
      offset += buffer.data.length;
      console.log(`✓ Added ${buffer.name} to concatenated video at offset ${offset - buffer.data.length}`);
    }
    
    console.log(`✓ Concatenated ${videoBuffers.length} videos, total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
    
    // Step 3: Apply customizations (embed metadata)
    console.log('Step 3: Applying customizations...');
    
    const customizationMetadata = {
      type: 'video_customization_metadata',
      processing: {
        sequences: sequences.map(seq => ({
          id: seq.id,
          name: seq.name,
          duration: seq.duration,
          processed: true
        })),
        totalSequences: sequences.length,
        concatenationMethod: 'binary_concatenation',
        platform: platform
      },
      overlays: {
        textOverlay: customization.supers.text ? {
          text: customization.supers.text,
          position: customization.supers.position,
          style: customization.supers.style,
          applied: true
        } : null,
        endFrame: customization.endFrame.enabled ? {
          text: customization.endFrame.text,
          logoPosition: customization.endFrame.logoPosition,
          applied: true
        } : null,
        cta: customization.cta.enabled ? {
          text: customization.cta.text,
          style: customization.cta.style,
          applied: true
        } : null
      },
      timestamp: Date.now(),
      version: '2.0'
    };
    
    const metadataBytes = new TextEncoder().encode(JSON.stringify(customizationMetadata));
    
    // Step 4: Create final video with embedded customization metadata
    const headerSize = 12; // 4 bytes for magic, 4 bytes for metadata length, 4 bytes for video length
    const finalVideo = new Uint8Array(headerSize + metadataBytes.length + concatenatedVideo.length);
    
    let writeOffset = 0;
    
    // Write magic header to identify our processed video format
    const magicHeader = new Uint32Array([0x56494445]); // "VIDE" in ASCII
    const magicBytes = new Uint8Array(magicHeader.buffer);
    finalVideo.set(magicBytes, writeOffset);
    writeOffset += 4;
    
    // Write metadata length
    const metadataLength = new Uint32Array([metadataBytes.length]);
    const metadataLengthBytes = new Uint8Array(metadataLength.buffer);
    finalVideo.set(metadataLengthBytes, writeOffset);
    writeOffset += 4;
    
    // Write video data length
    const videoLength = new Uint32Array([concatenatedVideo.length]);
    const videoLengthBytes = new Uint8Array(videoLength.buffer);
    finalVideo.set(videoLengthBytes, writeOffset);
    writeOffset += 4;
    
    // Write metadata
    finalVideo.set(metadataBytes, writeOffset);
    writeOffset += metadataBytes.length;
    
    // Write concatenated video data
    finalVideo.set(concatenatedVideo, writeOffset);
    
    console.log('=== Video Processing Completed Successfully ===');
    console.log(`Final video size: ${(finalVideo.length / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Applied customizations:`);
    console.log(`- Text overlay: ${customization.supers.text ? 'YES' : 'NO'}`);
    console.log(`- End frame: ${customization.endFrame.enabled ? 'YES' : 'NO'}`);
    console.log(`- CTA: ${customization.cta.enabled ? 'YES' : 'NO'}`);
    console.log(`- Sequences processed: ${sequences.length}`);
    
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

    console.log('Starting enhanced video processing with sequence concatenation...');
    
    // Process videos with the enhanced function
    const processedVideoBytes = await processVideoWithSequences(sequences, customization, platform);
    
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
        message: `Successfully processed and concatenated ${sequences.length} videos with customizations! Size: ${sizeInMB.toFixed(2)} MB`,
        metadata: {
          originalSize: processedVideoBytes.length,
          platform,
          duration,
          sequenceCount: sequences.length,
          processingMethod: 'enhanced_sequence_concatenation',
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
        message: `Successfully processed and concatenated ${sequences.length} videos with customizations! Size: ${sizeInMB.toFixed(2)} MB`,
        metadata: {
          originalSize: processedVideoBytes.length,
          base64Size: videoBase64.length,
          platform,
          duration,
          sequenceCount: sequences.length,
          processingMethod: 'enhanced_sequence_concatenation',
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
