
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Upload, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  video_categories?: VideoCategory;
}

const Admin = () => {
  const [assets, setAssets] = useState<VideoAsset[]>([]);
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newAsset, setNewAsset] = useState({
    name: '',
    description: '',
    duration: 0,
    category_id: '',
    tags: ''
  });
  const { toast } = useToast();

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
      
      // Transform the data to match our interface
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
    try {
      // Upload file to Supabase Storage
      const fileName = `${Date.now()}.${file.name.split('.').pop()}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('video-assets')
        .upload(`videos/${fileName}`, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('video-assets')
        .getPublicUrl(`videos/${fileName}`);

      // Create video asset record
      const { error: insertError } = await supabase
        .from('video_assets')
        .insert({
          name: newAsset.name,
          description: newAsset.description,
          duration: newAsset.duration,
          file_url: urlData.publicUrl,
          file_size: file.size,
          category_id: newAsset.category_id,
          tags: newAsset.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        });

      if (insertError) throw insertError;

      toast({
        title: "Video uploaded successfully",
        description: "The video has been added to your library."
      });

      // Reset form and refresh data
      setNewAsset({
        name: '',
        description: '',
        duration: 0,
        category_id: '',
        tags: ''
      });
      fetchAssets();
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

  const deleteAsset = async (id: string) => {
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-gradient-to-r from-red-600 to-orange-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">VA</span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Video Asset Admin</h1>
            </div>
            <Button onClick={() => window.open('/', '_blank')} variant="outline">
              ← Back to App
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Form */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Upload New Video</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Video Name
                  </label>
                  <Input
                    value={newAsset.name}
                    onChange={(e) => setNewAsset({...newAsset, name: e.target.value})}
                    placeholder="Enter video name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <Textarea
                    value={newAsset.description}
                    onChange={(e) => setNewAsset({...newAsset, description: e.target.value})}
                    placeholder="Enter description"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (seconds)
                  </label>
                  <Input
                    type="number"
                    value={newAsset.duration}
                    onChange={(e) => setNewAsset({...newAsset, duration: parseInt(e.target.value) || 0})}
                    placeholder="Duration in seconds"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <Select 
                    value={newAsset.category_id} 
                    onValueChange={(value) => setNewAsset({...newAsset, category_id: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name} ({category.aspect_ratio})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags (comma-separated)
                  </label>
                  <Input
                    value={newAsset.tags}
                    onChange={(e) => setNewAsset({...newAsset, tags: e.target.value})}
                    placeholder="intro, outro, transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Video File (MP4)
                  </label>
                  <Input
                    type="file"
                    accept=".mp4,video/mp4"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </div>

                {uploading && (
                  <div className="flex items-center space-x-2 text-blue-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-sm">Uploading...</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Video Library */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Video Library ({assets.length} videos)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {assets.map((asset) => (
                    <div key={asset.id} className="border rounded-lg p-4 bg-white shadow-sm">
                      <div className="flex items-start space-x-4">
                        {/* Video Preview */}
                        <div className="w-32 h-24 bg-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
                          <video 
                            src={asset.file_url} 
                            className="w-full h-full object-cover"
                            preload="metadata"
                            muted
                          />
                        </div>

                        {/* Details */}
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-semibold text-gray-900">{asset.name}</h3>
                              <p className="text-sm text-gray-600 mt-1">{asset.description}</p>
                              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                                <span>Duration: {asset.duration}s</span>
                                <span>Category: {asset.video_categories?.name}</span>
                                <Badge variant={asset.is_active ? "default" : "secondary"}>
                                  {asset.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                              {asset.tags && asset.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {asset.tags.map((tag, index) => (
                                    <Badge key={index} variant="outline" className="text-xs">
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
                              >
                                {asset.is_active ? 'Deactivate' : 'Activate'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(asset.file_url, '_blank')}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteAsset(asset.id)}
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
                      <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No videos uploaded yet</h3>
                      <p className="text-gray-600">Upload your first video to get started!</p>
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
