
import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface CloudinaryUploadProgress {
  videoId: string;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  url?: string;
  publicId?: string;
}

interface CloudinaryProcessorOptions {
  cloudName: string;
  uploadPreset: string;
}

interface ProcessVideoOptions {
  videos: File[];
  onProgress?: (progress: CloudinaryUploadProgress[]) => void;
}

export const useCloudinaryProcessor = (options: CloudinaryProcessorOptions) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<CloudinaryUploadProgress[]>([]);
  const { toast } = useToast();

  const uploadToCloudinary = useCallback(async (file: File, videoId: string): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', options.uploadPreset);
    formData.append('resource_type', 'video');
    formData.append('folder', 'video_concatenation');

    const xhr = new XMLHttpRequest();
    
    return new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(prev => prev.map(p => 
            p.videoId === videoId 
              ? { ...p, progress, status: 'uploading' as const }
              : p
          ));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setUploadProgress(prev => prev.map(p => 
            p.videoId === videoId 
              ? { ...p, progress: 100, status: 'complete' as const, url: response.secure_url, publicId: response.public_id }
              : p
          ));
          resolve(response.public_id);
        } else {
          setUploadProgress(prev => prev.map(p => 
            p.videoId === videoId 
              ? { ...p, status: 'error' as const }
              : p
          ));
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        setUploadProgress(prev => prev.map(p => 
          p.videoId === videoId 
            ? { ...p, status: 'error' as const }
            : p
        ));
        reject(new Error('Upload failed'));
      });

      xhr.open('POST', `https://api.cloudinary.com/v1_1/${options.cloudName}/video/upload`);
      xhr.send(formData);
    });
  }, [options.cloudName, options.uploadPreset]);

  const concatenateVideos = useCallback(async (publicIds: string[]): Promise<string> => {
    try {
      // Call our API endpoint for server-side concatenation
      const response = await fetch('/api/concatenate-videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicIds,
          cloudName: options.cloudName,
        }),
      });

      if (!response.ok) {
        throw new Error(`Concatenation failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.url;
    } catch (error) {
      console.error('Concatenation error:', error);
      throw error;
    }
  }, [options.cloudName]);

  const processVideos = useCallback(async ({ videos, onProgress }: ProcessVideoOptions): Promise<string> => {
    setIsProcessing(true);
    
    try {
      // Initialize progress tracking
      const initialProgress = videos.map((video, index) => ({
        videoId: `video-${index}`,
        progress: 0,
        status: 'uploading' as const,
      }));
      
      setUploadProgress(initialProgress);
      onProgress?.(initialProgress);

      // Upload all videos to Cloudinary
      const uploadPromises = videos.map((video, index) => 
        uploadToCloudinary(video, `video-${index}`)
      );

      const publicIds = await Promise.all(uploadPromises);
      
      // Update progress to show processing phase
      const processingProgress = uploadProgress.map(p => ({
        ...p,
        status: 'processing' as const,
        progress: 100,
      }));
      
      setUploadProgress(processingProgress);
      onProgress?.(processingProgress);

      toast({
        title: "Videos Uploaded Successfully",
        description: `${videos.length} videos uploaded. Starting concatenation...`,
      });

      // Concatenate videos using Cloudinary
      const concatenatedUrl = await concatenateVideos(publicIds);

      // Final success state
      const finalProgress = uploadProgress.map(p => ({
        ...p,
        status: 'complete' as const,
      }));
      
      setUploadProgress(finalProgress);
      onProgress?.(finalProgress);

      toast({
        title: "Video Concatenation Complete!",
        description: "Your videos have been successfully concatenated and are ready for download.",
      });

      return concatenatedUrl;

    } catch (error) {
      console.error('Video processing failed:', error);
      
      toast({
        title: "Video Processing Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
      
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [uploadToCloudinary, concatenateVideos, toast, uploadProgress]);

  return {
    processVideos,
    isProcessing,
    uploadProgress,
  };
};
