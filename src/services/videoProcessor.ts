// In src/services/videoProcessor.ts

private async processVideoWithCloudinary(options: VideoProcessingOptions, onProgress?: (progress: number) => void): Promise<Blob> {
    try {
      console.log('🔧 Starting Cloudinary video processing...');
      onProgress?.(10);

      const validSequences = this.validateSequences(options.sequences);
      if (validSequences.length === 0) {
        throw new Error('No valid video sequences found after validation');
      }

      console.log(`✅ Validated ${validSequences.length} sequence(s)`);
      onProgress?.(25);
      onProgress?.(40);

      console.log('📡 Calling cloudinary-concatenate edge function with manifest-based approach...');
      onProgress?.(50);

      // --- DEBUGGING STEP IS HERE ---
      const requestBody = {
        videos: validSequences.map(seq => ({
          publicId: this.extractPublicIdFromUrl(seq.file_url),
          duration: seq.duration
        })),
        targetDuration: options.duration
      };

      // This new log will show us exactly what is being sent to the backend.
      console.log('--- PAYLOAD TO BACKEND ---', JSON.stringify(requestBody, null, 2));

      const { data, error } = await supabase.functions.invoke('cloudinary-concatenate', {
        body: requestBody
      });
      // --- END OF DEBUGGING STEP ---

      if (error) {
        console.error('❌ Cloudinary concatenation error:', error);
        throw new Error(`Cloudinary concatenation failed: ${error.message}`);
      }

      if (!data?.success) {
        console.error('❌ Cloudinary concatenation returned unsuccessful result:', data);
        throw new Error(data?.error || 'Video concatenation failed');
      }

      console.log('✅ Cloudinary concatenation completed successfully:', {
        url: data.url,
        message: data.message,
      });
      onProgress?.(75);

      console.log('📥 Downloading processed video from:', data.url);
      const videoBlob = await this.downloadFromUrl(data.url);

      onProgress?.(100);
      console.log('✅ Video processing completed successfully');
      
      return videoBlob;

    } catch (error) {
      console.error('❌ Cloudinary processing failed:', error);
      throw new Error(`Video processing failed: ${error.message}`);
    }
  }