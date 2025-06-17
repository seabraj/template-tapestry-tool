
interface RequiredEnvVars {
  VITE_CLOUDINARY_CLOUD_NAME?: string;
  VITE_CLOUDINARY_UPLOAD_PRESET?: string;
}

export const validateCloudinaryConfig = (): { isValid: boolean; missing: string[] } => {
  const required = ['VITE_CLOUDINARY_CLOUD_NAME', 'VITE_CLOUDINARY_UPLOAD_PRESET'];
  const missing: string[] = [];
  
  required.forEach(envVar => {
    if (!import.meta.env[envVar]) {
      missing.push(envVar);
    }
  });
  
  return {
    isValid: missing.length === 0,
    missing
  };
};

export const getEnvVar = (name: string, fallback?: string): string => {
  const value = import.meta.env[name];
  if (!value && !fallback) {
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value || fallback || '';
};
