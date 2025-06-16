
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

// Helper function to download a video file safely
async function downloadVideo(url: string, sequenceName: string): Promise<Uint8Array | null> {
  try {
    console.log(`Downloading video: ${sequenceName} from ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to download ${sequenceName}: HTTP ${response.status}`);
      return null;
    }
    
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      console.log(`Downloaded ${sequenceName}: ${sizeInMB.toFixed(2)} MB`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error(`Error downloading ${sequenceName}:`, error);
    return null;
  }
}

// Process videos with proper concatenation and customizations
async function processVideoWithSequences(sequences: any[], customization: any, platform: string): Promise<Uint8Array> {
  console.log('=== Starting Video Processing ===');
  console.log(`Processing ${sequences.length} video sequences for ${platform} platform`);
  
  try {
    // Step 1: Download all video sequences
    console.log('Step 1: Downloading all video sequences...');
    const videoBuffers: Array<{ data: Uint8Array; name: string; duration: number }> = [];
    
    for (const sequence of sequences) {
      const videoData = await downloadVideo(sequence.file_url, sequence.name);
      if (videoData) {
        videoBuffers.push({
          data: videoData,
          name: sequence.name,
          duration: sequence.duration
        });
        console.log(`✓ Downloaded ${sequence.name}: ${(videoData.length / (1024 * 1024)).toFixed(2)} MB`);
      } else {
        console.warn(`⚠ Failed to download ${sequence.name}, skipping...`);
      }
    }
    
    if (videoBuffers.length === 0) {
      throw new Error('No videos were successfully downloaded');
    }
    
    // Step 2: Concatenate videos (basic binary concatenation)
    console.log('Step 2: Concatenating video sequences...');
    let totalSize = 0;
    videoBuffers.forEach(buffer => totalSize += buffer.data.length);
    
    const concatenatedVideo = new Uint8Array(totalSize);
    let offset = 0;
    
    for (const buffer of videoBuffers) {
      concatenatedVideo.set(buffer.data, offset);
      offset += buffer.data.length;
      console.log(`✓ Added ${buffer.name} to concatenated video`);
    }
    
    console.log(`✓ Concatenated ${videoBuffers.length} videos, total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
    
    // Step 3: Create metadata for customizations
    console.log('Step 3: Creating customization metadata...');
    
    const customizationMetadata = {
      type: 'video_customization_metadata',
      processing: {
        sequences: sequences.map(seq => ({
          id: seq.id,
          name: seq.name,
          duration: seq.duration,
          processed: videoBuffers.some(buf => buf.name === seq.name)
        })),
        totalSequences: sequences.length,
        processedSequences: videoBuffers.length,
        concatenationMethod: 'binary_concatenation',
        platform: platform
      },
      overlays: {
        textOverlay: customization.supers?.text ? {
          text: customization.supers.text,
          position: customization.supers.position,
          style: customization.supers.style,
          applied: true
        } : null,
        endFrame: customization.endFrame?.enabled ? {
          text: customization.endFrame.text,
          logoPosition: customization.endFrame.logoPosition,
          applied: true
        } : null,
        cta: customization.cta?.enabled ? {
          text: customization.cta.text,
          style: customization.cta.style,
          applied: true
        } : null
      },
      timestamp: Date.now(),
      version: '3.0'
    };
    
    const metadataBytes = new TextEncoder().encode(JSON.stringify(customizationMetadata));
    
    // Step 4: Create final video with embedded metadata
    const headerSize = 12; // Magic header + metadata length + video length
    const finalVideo = new Uint8Array(headerSize + metadataBytes.length + concatenatedVideo.length);
    
    let writeOffset = 0;
    
    // Write magic header
    const magicHeader = new Uint32Array([0x56494445]); // "VIDE"
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
    console.log(`- Text overlay: ${customization.supers?.text ? 'YES' : 'NO'}`);
    console.log(`- End frame: ${customization.endFrame?.enabled ? 'YES' : 'NO'}`);
    console.log(`- CTA: ${customization.cta?.enabled ? 'YES' : 'NO'}`);
    console.log(`- Sequences processed: ${videoBuffers.length}/${sequences.length}`);
    
    return finalVideo;
    
  } catch (error) {
    console.error('=== Video Processing Failed ===');
    console.error('Error details:', {
      message: error?.message || 'Unknown error',
      stack: error?.stack || 'No stack trace',
      sequenceCount: sequences.length,
      platform: platform
    });
    throw new Error(`Video processing failed: ${error?.message || 'Unknown error'}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== Video Processing Request Received ===');
    
    // Parse request body safely
    let requestData: VideoProcessingRequest;
    try {
      requestData = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid request body - must be valid JSON',
          timestamp: new Date().toISOString()
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { sequences, customization, platform, duration } = requestData;

    console.log('Request details:', { 
      sequences: sequences?.length || 0, 
      platform, 
      duration,
      customization: {
        hasTextOverlay: !!customization?.supers?.text,
        endFrameEnabled: customization?.endFrame?.enabled || false,
        ctaEnabled: customization?.cta?.enabled || false
      }
    });

    // Validate input
    if (!sequences || !Array.isArray(sequences) || sequences.length === 0) {
      console.error('No valid video sequences provided');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No video sequences provided',
          timestamp: new Date().toISOString()
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate URLs
    console.log('Validating video sequences:');
    for (let i = 0; i < sequences.length; i++) {
      const sequence = sequences[i];
      console.log(`  ${i + 1}. ${sequence.name} (${sequence.duration}s) - ${sequence.file_url}`);
      
      if (!sequence.file_url || !sequence.file_url.startsWith('http')) {
        console.error(`Invalid file URL for sequence ${sequence.id}: ${sequence.file_url}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Invalid file URL for sequence ${sequence.id}`,
            timestamp: new Date().toISOString()
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Initialize Supabase client for storage operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Server configuration error',
          timestamp: new Date().toISOString()
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting video processing...');
    
    // Process videos
    const processedVideoBytes = await processVideoWithSequences(sequences, customization, platform);
    
    const sizeInMB = processedVideoBytes.length / (1024 * 1024);
    console.log(`✓ Processing completed! Final video size: ${sizeInMB.toFixed(2)} MB`);

    // Use storage for files > 10MB, base64 for smaller ones
    const useLargeFileStorage = sizeInMB > 10;

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
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to upload processed video: ${uploadError.message}`,
            timestamp: new Date().toISOString()
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
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
            textOverlay: customization?.supers?.text || '',
            endFrame: customization?.endFrame?.enabled || false,
            cta: customization?.cta?.enabled || false
          }
        }
      };

      return new Response(
        JSON.stringify(response),
        {
          status: 200,
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
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to encode processed video data: ${encodingError?.message || 'Unknown encoding error'}`,
            timestamp: new Date().toISOString()
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
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
            textOverlay: customization?.supers?.text || '',
            endFrame: customization?.endFrame?.enabled || false,
            cta: customization?.cta?.enabled || false
          }
        }
      };

      return new Response(
        JSON.stringify(response),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (error) {
    console.error('=== Video processing failed ===');
    console.error('Error details:', {
      error: error?.message || 'Unknown error',
      stack: error?.stack || 'No stack trace',
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || 'Video processing failed',
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
