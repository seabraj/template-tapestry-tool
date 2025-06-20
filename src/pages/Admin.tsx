import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trash2, Upload, Play, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCloudinaryConfig, formatFileSize } from '@/services/cloudinaryConfig';

interface VideoCategory {
  id: string;
  name: string;
  aspect_ratio: string;
  description?: string;
}

interface VideoAsset {
  id: string;
  name: string;
  description: string;
  duration: number;
  file_url: string;
  thumbnail_url: string;
  category_id: string;
  tags: string[];
  is_active: boolean;
  cloudinary_public_id?: string;
  video_categories?: VideoCategory;
}

const Admin = () => {
  const [assets, setAssets] = useState<VideoAsset[]>([]);
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newAsset, setNewAsset] = useState({
    name: '',
    description: '',
    tags: ''
  });
  const { toast } = useToast();
  const cloudinaryConfig = getCloudinaryConfig();

  useEffect(() => {
    fetchCategories();
    fetchAssets();
  }, []);

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('video_categories')
      .select('*')
      .order('name');
    
    if (error) {
      toast({
        title: "Error fetching categories",
        description: error.message,
        variant: "destructive"
      });
    } else {
      setCategories(data || []);
    }
  };

  const fetchAssets = async () => {
    try {
      const { data, error } = await supabase
        .from('video_assets')
        .select(`
          *,
          video_categories (
            id,
            name,
            aspect_ratio
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const transformedData = data?.map(item => ({
        ...item,
        video_categories: item.video_categories ? {
          id: item.video_categories.id,
          name: item.video_categories.name,
          aspect_ratio: item.video_categories.aspect_ratio
        } : undefined
      })) || [];
      
      setAssets(transformedData);
    } catch (err: any) {
      toast({
        title: "Error fetching assets",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(Math.round(video.duration));
      };
      
      video.onerror = () => {
        resolve(30); // Default duration if unable to detect
      };
      
      video.src = URL.createObjectURL(file);
    });
  };

  const uploadToCloudinary = async (file: File): Promise<{ url: string; publicId: string; thumbnailUrl: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    formData.append('resource_type', 'video');
    formData.append('folder', 'video_library');

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          const thumbnailUrl = response.secure_url.replace('/video/upload/', '/video/upload/w_200,h_150,c_fill,f_jpg/') + '.jpg';
          resolve({
            url: response.secure_url,
            publicId: response.public_id,
            thumbnailUrl
          });
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/video/upload`);
      xhr.send(formData);
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Auto-populate name from filename
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setNewAsset(prev => ({ ...prev, name: nameWithoutExt }));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !newAsset.name.trim()) {
      toast({
        title: "Missing information",
        description: "Please select a file and enter a video name.",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    
    try {
      // Get video duration
      const detectedDuration = await getVideoDuration(selectedFile);

      // Upload to Cloudinary
      const { url, publicId, thumbnailUrl } = await uploadToCloudinary(selectedFile);

      // Save metadata to Supabase without any category assignment
      const { error: insertError } = await supabase
        .from('video_assets')
        .insert({
          name: newAsset.name.trim(),
          description: newAsset.description.trim(),
          duration: detectedDuration,
          file_url: url,
          thumbnail_url: thumbnailUrl,
          file_size: selectedFile.size,
          category_id: null, // No category assignment
          cloudinary_public_id: publicId,
          tags: newAsset.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        });

      if (insertError) throw insertError;

      toast({
        title: "Video uploaded successfully",
        description: `Video uploaded with ${detectedDuration}s duration.`
      });

      // Reset form
      setNewAsset({
        name: '',
        description: '',
        tags: ''
      });
      setSelectedFile(null);
      setUploadProgress(0);
      fetchAssets();
      
      // Reset file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const deleteAsset = async (id: string, publicId?: string) => {
    try {
      const { error } = await supabase
        .from('video_assets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Video deleted",
        description: "The video has been removed from your library."
      });
      fetchAssets();
    } catch (err: any) {
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('video_assets')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: `Video ${!currentStatus ? 'activated' : 'deactivated'}`,
        description: `The video is now ${!currentStatus ? 'visible' : 'hidden'} in the library.`
      });
      fetchAssets();
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-400 mx-auto"></div>
          <h2 className="text-xl font-semibold text-white mt-4">Loading admin panel...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-20">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 logo-gradient rounded-2xl flex items-center justify-center text-white font-bold text-xl">
              ⚙
            </div>
            <div className="text-white text-lg font-medium">
              <span className="font-bold">itMatters</span> Content Creator - Admin Panel
            </div>
          </div>
          <Button 
            onClick={() => window.open('/', '_blank')} 
            variant="outline" 
            className="border-white/20 text-white hover:bg-white/5 hover:border-white/40 rounded-xl px-6 py-3 font-medium"
          >
            ← Back to App
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Form */}
          <div className="lg:col-span-1">
            <Card className="bg-[#111] border-white/10 rounded-3xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center text-xl">
                  <Upload className="h-6 w-6 mr-3" />
                  Upload Video
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Video File (MP4) *
                  </label>
                  <Input
                    type="file"
                    accept=".mp4,video/mp4"
                    onChange={handleFileSelect}
                    disabled={uploading}
                    className="bg-[#1a1a2e] border-white/20 text-white file:bg-white/10 file:text-white file:border-0 file:rounded-lg"
                  />
                  {selectedFile && (
                    <p className="text-sm text-green-400 mt-2">
                      Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Video Name *
                  </label>
                  <Input
                    value={newAsset.name}
                    onChange={(e) => setNewAsset({...newAsset, name: e.target.value})}
                    placeholder="Enter video name"
                    className="bg-[#1a1a2e] border-white/20 text-white placeholder:text-white/40"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Description
                  </label>
                  <Textarea
                    value={newAsset.description}
                    onChange={(e) => setNewAsset({...newAsset, description: e.target.value})}
                    placeholder="Enter description (optional)"
                    rows={3}
                    className="bg-[#1a1a2e] border-white/20 text-white placeholder:text-white/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Tags (comma-separated)
                  </label>
                  <Input
                    value={newAsset.tags}
                    onChange={(e) => setNewAsset({...newAsset, tags: e.target.value})}
                    placeholder="intro, outro, transition"
                    className="bg-[#1a1a2e] border-white/20 text-white placeholder:text-white/40"
                  />
                </div>

                {uploading && (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 text-orange-400">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-400"></div>
                      <span className="text-sm font-medium">Uploading to Cloudinary...</span>
                    </div>
                    <Progress value={uploadProgress} className="w-full" />
                    <p className="text-xs text-white/60">{uploadProgress}% complete</p>
                  </div>
                )}

                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || !newAsset.name.trim() || uploading}
                  className="w-full bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 disabled:opacity-50 rounded-xl py-3 font-medium"
                >
                  {uploading ? 'Uploading...' : 'Upload Video'}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Video Library */}
          <div className="lg:col-span-2">
            <Card className="bg-[#111] border-white/10 rounded-3xl">
              <CardHeader>
                <CardTitle className="text-white text-xl">Video Library ({assets.length} videos)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {assets.map((asset) => (
                    <div key={asset.id} className="border border-white/10 rounded-2xl p-6 bg-[#0f0f23] hover:bg-[#16162e] transition-colors">
                      <div className="flex items-start space-x-4">
                        {/* Thumbnail */}
                        <div className="w-32 h-24 bg-[#1a1a2e] rounded-xl flex items-center justify-center overflow-hidden">
                          {asset.thumbnail_url ? (
                            <img 
                              src={asset.thumbnail_url} 
                              alt={asset.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Fallback to video URL if thumbnail fails
                                e.currentTarget.style.display = 'none';
                                const video = document.createElement('video');
                                video.src = asset.file_url;
                                video.className = 'w-full h-full object-cover';
                                video.muted = true;
                                video.preload = 'metadata';
                                e.currentTarget.parentNode?.appendChild(video);
                              }}
                            />
                          ) : (
                            <video 
                              src={asset.file_url} 
                              className="w-full h-full object-cover"
                              preload="metadata"
                              muted
                            />
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-semibold text-white text-lg">{asset.name}</h3>
                              <p className="text-sm text-white/60 mt-1">{asset.description}</p>
                              <div className="flex items-center space-x-4 mt-3 text-sm text-white/40">
                                <span>Duration: {asset.duration}s</span>
                                <span>Category: {asset.video_categories?.name || 'None'}</span>
                                <Badge 
                                  variant={asset.is_active ? "default" : "secondary"}
                                  className={asset.is_active ? "bg-green-600 hover:bg-green-700" : "bg-white/10 text-white/60"}
                                >
                                  {asset.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                              <p className="text-xs text-white/30 mt-2">
                                Cloudinary ID: {asset.cloudinary_public_id || 'N/A'}
                              </p>
                              {asset.tags && asset.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {asset.tags.map((tag, index) => (
                                    <Badge 
                                      key={index} 
                                      variant="outline" 
                                      className="text-xs border-white/20 text-white/70 bg-white/5"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleActive(asset.id, asset.is_active)}
                                className="border-white/20 text-white/80 hover:bg-white/5 rounded-xl"
                              >
                                {asset.is_active ? 'Deactivate' : 'Activate'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(asset.file_url, '_blank')}
                                className="border-white/20 text-white/80 hover:bg-white/5 rounded-xl"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteAsset(asset.id, asset.cloudinary_public_id)}
                                className="bg-red-600 hover:bg-red-700 rounded-xl"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {assets.length === 0 && (
                    <div className="text-center py-16">
                      <Upload className="h-16 w-16 text-white/20 mx-auto mb-6" />
                      <h3 className="text-xl font-medium text-white mb-2">No videos uploaded yet</h3>
                      <p className="text-white/60">Upload your first video to get started!</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;
