
interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
}

export const getCloudinaryConfig = (): CloudinaryConfig => {
  const cloudName = 'dsxrmo3kt';
  const uploadPreset = 'video_concatenation_preset';

  return {
    cloudName,
    uploadPreset,
  };
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
