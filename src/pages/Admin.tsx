import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  cloudinary_public_id?: string; // Made optional to fix TS error
  video_categories?: VideoCategory;
}

const Admin = () => {
  const [assets, setAssets] = useState<VideoAsset[]>([]);
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [newAsset, setNewAsset] = useState({
    name: '',
    description: '',
    duration: 0,
    category_id: '',
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
        cloudinary_public_id: item.cloudinary_public_id || undefined,
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
        resolve(0); // Default duration if unable to detect
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
          const thumbnailUrl = response.secure_url.replace('/video/upload/', '/video/upload/w_200,h_150,c_fill/');
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !newAsset.category_id) {
      toast({
        title: "Missing information",
        description: "Please select a file and category first.",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    
    try {
      // Get video duration
      const detectedDuration = await getVideoDuration(file);
      const finalDuration = newAsset.duration || detectedDuration;

      // Upload to Cloudinary
      const { url, publicId, thumbnailUrl } = await uploadToCloudinary(file);

      // Save metadata to Supabase
      const { error: insertError } = await supabase
        .from('video_assets')
        .insert({
          name: newAsset.name,
          description: newAsset.description,
          duration: finalDuration,
          file_url: url,
          thumbnail_url: thumbnailUrl,
          file_size: file.size,
          category_id: newAsset.category_id,
          cloudinary_public_id: publicId,
          tags: newAsset.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        });

      if (insertError) throw insertError;

      toast({
        title: "Video uploaded successfully",
        description: `Video uploaded to Cloudinary with ${finalDuration}s duration.`
      });

      // Reset form and refresh data
      setNewAsset({
        name: '',
        description: '',
        duration: 0,
        category_id: '',
        tags: ''
      });
      setUploadProgress(0);
      fetchAssets();
      
      // Reset file input
      event.target.value = '';
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
      // Delete from Supabase first
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">VA</span>
              </div>
              <h1 className="text-xl font-semibold text-white">Video Asset Admin</h1>
            </div>
            <Button onClick={() => window.open('/', '_blank')} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800">
              ← Back to App
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Form - First */}
          <div className="lg:col-span-1 lg:order-1">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Upload className="h-5 w-5 mr-2" />
                  Upload to Cloudinary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Video File (MP4)
                  </label>
                  <Input
                    type="file"
                    accept=".mp4,video/mp4"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="bg-gray-800 border-gray-700 text-white file:bg-gray-700 file:text-gray-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Video Name
                  </label>
                  <Input
                    value={newAsset.name}
                    onChange={(e) => setNewAsset({...newAsset, name: e.target.value})}
                    placeholder="Enter video name"
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Description
                  </label>
                  <Textarea
                    value={newAsset.description}
                    onChange={(e) => setNewAsset({...newAsset, description: e.target.value})}
                    placeholder="Enter description"
                    rows={3}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Duration (seconds) - Auto-detected
                  </label>
                  <Input
                    type="number"
                    value={newAsset.duration}
                    onChange={(e) => setNewAsset({...newAsset, duration: parseInt(e.target.value) || 0})}
                    placeholder="Will be auto-detected"
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave empty for auto-detection</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Category
                  </label>
                  <Select 
                    value={newAsset.category_id} 
                    onValueChange={(value) => setNewAsset({...newAsset, category_id: value})}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id} className="text-white">
                          {category.name} ({category.aspect_ratio})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Tags (comma-separated)
                  </label>
                  <Input
                    value={newAsset.tags}
                    onChange={(e) => setNewAsset({...newAsset, tags: e.target.value})}
                    placeholder="intro, outro, transition"
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>

                {uploading && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2 text-blue-400">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                      <span className="text-sm">Uploading to Cloudinary...</span>
                    </div>
                    <Progress value={uploadProgress} className="w-full" />
                    <p className="text-xs text-gray-400">{uploadProgress}% complete</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Video Library - Second */}
          <div className="lg:col-span-2 lg:order-2">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Cloudinary Video Library ({assets.length} videos)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {assets.map((asset) => (
                    <div key={asset.id} className="border border-gray-700 rounded-lg p-4 bg-gray-800 shadow-sm">
                      <div className="flex items-start space-x-4">
                        {/* Video Preview */}
                        <div className="w-32 h-24 bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden">
                          {asset.thumbnail_url ? (
                            <img 
                              src={asset.thumbnail_url} 
                              alt={asset.name}
                              className="w-full h-full object-cover"
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
                              <h3 className="font-semibold text-white">{asset.name}</h3>
                              <p className="text-sm text-gray-300 mt-1">{asset.description}</p>
                              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-400">
                                <span>Duration: {asset.duration}s</span>
                                <span>Category: {asset.video_categories?.name}</span>
                                <Badge variant={asset.is_active ? "default" : "secondary"}>
                                  {asset.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                Cloudinary ID: {asset.cloudinary_public_id || 'N/A'}
                              </p>
                              {asset.tags && asset.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {asset.tags.map((tag, index) => (
                                    <Badge key={index} variant="outline" className="text-xs border-gray-600 text-gray-300">
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
                                className="border-gray-600 text-gray-300 hover:bg-gray-700"
                              >
                                {asset.is_active ? 'Deactivate' : 'Activate'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(asset.file_url, '_blank')}
                                className="border-gray-600 text-gray-300 hover:bg-gray-700"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteAsset(asset.id, asset.cloudinary_public_id)}
                                className="bg-red-600 hover:bg-red-700"
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
                    <div className="text-center py-12">
                      <Upload className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-white mb-2">No videos uploaded yet</h3>
                      <p className="text-gray-400">Upload your first video to Cloudinary to get started!</p>
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
