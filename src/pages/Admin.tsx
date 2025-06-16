
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Play, Trash2, Edit, Plus } from 'lucide-react';

interface VideoCategory {
  id: string;
  name: string;
  description: string;
  aspect_ratio: string;
}

interface VideoAsset {
  id: string;
  name: string;
  description: string;
  duration: number;
  file_url: string;
  file_size: number;
  thumbnail_url: string;
  category_id: string;
  tags: string[];
  is_active: boolean;
  created_at: string;
  video_categories?: VideoCategory;
}

const Admin = () => {
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [assets, setAssets] = useState<VideoAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [editingAsset, setEditingAsset] = useState<VideoAsset | null>(null);
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration: '',
    category_id: '',
    tags: '',
    file: null as File | null
  });

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

    if (error) {
      toast({
        title: "Error fetching assets",
        description: error.message,
        variant: "destructive"
      });
    } else {
      setAssets(data || []);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFormData(prev => ({ ...prev, file }));
      
      // Auto-extract duration from video file if possible
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        setFormData(prev => ({ 
          ...prev, 
          duration: Math.round(video.duration).toString() 
        }));
      };
      video.src = URL.createObjectURL(file);
    }
  };

  const uploadVideoFile = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `videos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('video-assets')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('video-assets')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file || !formData.name || !formData.category_id) {
      toast({
        title: "Missing required fields",
        description: "Please fill in all required fields and select a video file.",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);

    try {
      // Upload file to Supabase Storage
      const fileUrl = await uploadVideoFile(formData.file);

      // Insert video asset record
      const { error } = await supabase
        .from('video_assets')
        .insert({
          name: formData.name,
          description: formData.description,
          duration: parseInt(formData.duration) || 0,
          file_url: fileUrl,
          file_size: formData.file.size,
          category_id: formData.category_id,
          tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : []
        });

      if (error) throw error;

      toast({
        title: "Video uploaded successfully",
        description: "The video has been added to your library."
      });

      // Reset form
      setFormData({
        name: '',
        description: '',
        duration: '',
        category_id: '',
        tags: '',
        file: null
      });

      // Refresh assets list
      fetchAssets();

    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (assetId: string) => {
    if (!confirm('Are you sure you want to delete this video asset?')) return;

    const { error } = await supabase
      .from('video_assets')
      .delete()
      .eq('id', assetId);

    if (error) {
      toast({
        title: "Error deleting asset",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Asset deleted",
        description: "The video asset has been removed."
      });
      fetchAssets();
    }
  };

  const toggleAssetStatus = async (assetId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('video_assets')
      .update({ is_active: !currentStatus })
      .eq('id', assetId);

    if (error) {
      toast({
        title: "Error updating asset",
        description: error.message,
        variant: "destructive"
      });
    } else {
      fetchAssets();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">VA</span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Video Assets Admin</h1>
            </div>
            <Button onClick={() => window.location.href = '/'} variant="outline">
              Back to App
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Upload Form */}
          <div className="lg:col-span-1">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Upload className="h-5 w-5" />
                  <span>Upload New Video</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Video File *</label>
                    <Input 
                      type="file" 
                      accept="video/*"
                      onChange={handleFileUpload}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Name *</label>
                    <Input 
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter video name"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Category *</label>
                    <Select 
                      value={formData.category_id} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
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
                    <label className="block text-sm font-medium mb-1">Duration (seconds)</label>
                    <Input 
                      type="number"
                      value={formData.duration}
                      onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                      placeholder="Auto-detected or enter manually"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <Textarea 
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe the video content"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Tags</label>
                    <Input 
                      value={formData.tags}
                      onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                      placeholder="intro, product, demo (comma separated)"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isUploading}
                  >
                    {isUploading ? 'Uploading...' : 'Upload Video'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Assets List */}
          <div className="lg:col-span-2">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Video Library ({assets.length} assets)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Tags</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assets.map((asset) => (
                        <TableRow key={asset.id}>
                          <TableCell className="font-medium">
                            {asset.name}
                            {asset.description && (
                              <p className="text-xs text-gray-500 mt-1">{asset.description}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {asset.video_categories?.name} ({asset.video_categories?.aspect_ratio})
                            </Badge>
                          </TableCell>
                          <TableCell>{asset.duration}s</TableCell>
                          <TableCell>
                            {asset.file_size ? `${(asset.file_size / 1024 / 1024).toFixed(1)}MB` : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {asset.tags?.map((tag, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={asset.is_active ? "default" : "secondary"}
                              className="cursor-pointer"
                              onClick={() => toggleAssetStatus(asset.id, asset.is_active)}
                            >
                              {asset.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(asset.file_url, '_blank')}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(asset.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
