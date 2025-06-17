
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Platform, Language, VideoSequence, CustomizationSettings } from '@/pages/Index';
import { useState } from 'react';
import { useVideoAssets } from '@/hooks/useVideoAssets';
import { useToast } from '@/hooks/use-toast';
import CloudinaryVideoProcessor from './CloudinaryVideoProcessor';
import { Settings, ArrowLeft } from 'lucide-react';

interface ExportPanelProps {
  platform: Platform;
  language: Language;
  duration: number;
  sequences: VideoSequence[];
  customization: CustomizationSettings;
}

const ExportPanel = ({ 
  platform, 
  language, 
  duration, 
  sequences, 
  customization 
}: ExportPanelProps) => {
  const [useCloudinary, setUseCloudinary] = useState(false);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const getAspectRatio = () => {
    switch (platform) {
      case 'youtube': return '16:9';
      case 'facebook': return '1:1';
      case 'instagram': return '9:16';
      default: return '16:9';
    }
  };

  const getResolution = () => {
    switch (platform) {
      case 'youtube': return '1920x1080';
      case 'facebook': return '1080x1080';
      case 'instagram': return '1080x1920';
      default: return '1920x1080';
    }
  };

  const selectedSequences = sequences.filter(s => s.selected);

  const handleCloudinaryProcessingComplete = (videoUrl: string) => {
    setProcessedVideoUrl(videoUrl);
    toast({
      title: "Video Processing Complete!",
      description: "Your video has been successfully processed with Cloudinary.",
    });
  };

  if (useCloudinary) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button 
            variant="outline" 
            onClick={() => setUseCloudinary(false)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Template Processing
          </Button>
        </div>
        
        <CloudinaryVideoProcessor 
          onProcessingComplete={handleCloudinaryProcessingComplete}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Choose Processing Method</h3>
        <p className="text-gray-600">Select how you want to process your videos</p>
      </div>

      {/* Processing Method Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Template-Based Processing */}
        <Card className="border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer">
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Settings className="h-8 w-8 text-white" />
            </div>
            <h4 className="text-xl font-bold text-blue-800 mb-2">Template Processing</h4>
            <p className="text-blue-700 mb-4">
              Use selected sequences with customization settings for your {platform} platform
            </p>
            <div className="space-y-2 text-sm text-blue-600 mb-4">
              <div>✅ Platform-optimized ({getAspectRatio()})</div>
              <div>✅ Custom text overlays</div>
              <div>✅ Branding elements</div>
              <div>⚠️ Limited by browser processing</div>
            </div>
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={selectedSequences.length === 0}
            >
              Use Template Processing
            </Button>
            {selectedSequences.length === 0 && (
              <p className="text-xs text-red-600 mt-2">Select videos in step 3</p>
            )}
          </CardContent>
        </Card>

        {/* Cloudinary Processing */}
        <Card className="border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors cursor-pointer">
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-white text-2xl">☁️</span>
            </div>
            <h4 className="text-xl font-bold text-purple-800 mb-2">Cloudinary Processing</h4>
            <p className="text-purple-700 mb-4">
              Professional cloud-based video concatenation with unlimited capabilities
            </p>
            <div className="space-y-2 text-sm text-purple-600 mb-4">
              <div>✅ Unlimited file sizes (GB+)</div>
              <div>✅ Professional quality</div>
              <div>✅ Fast cloud processing</div>
              <div>✅ No browser limitations</div>
            </div>
            <Button 
              onClick={() => setUseCloudinary(true)}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              Use Cloudinary Processing
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Current Settings Summary */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="p-6">
          <h4 className="font-semibold text-lg mb-4">Current Template Settings</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <h5 className="font-medium text-blue-800">Platform</h5>
              <p className="text-lg font-bold text-blue-600 capitalize">{platform}</p>
              <p className="text-sm text-blue-600">{getAspectRatio()}</p>
            </div>
            
            <div className="text-center">
              <h5 className="font-medium text-purple-800">Videos</h5>
              <p className="text-lg font-bold text-purple-600">{selectedSequences.length}</p>
              <p className="text-sm text-purple-600">Selected clips</p>
            </div>
            
            <div className="text-center">
              <h5 className="font-medium text-green-800">Language</h5>
              <p className="text-lg font-bold text-green-600">{language.toUpperCase()}</p>
              <p className="text-sm text-green-600">Text & Audio</p>
            </div>
            
            <div className="text-center">
              <h5 className="font-medium text-orange-800">Quality</h5>
              <p className="text-lg font-bold text-orange-600">HD</p>
              <p className="text-sm text-orange-600">{getResolution()}</p>
            </div>
          </div>

          {selectedSequences.length > 0 && (
            <div>
              <h5 className="font-medium mb-2">Selected Videos:</h5>
              <div className="flex flex-wrap gap-2">
                {selectedSequences.map((seq, index) => (
                  <Badge key={seq.id} variant="outline" className="bg-white">
                    {index + 1}. {seq.name} ({seq.duration}s)
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendation */}
      <Card className="border-2 border-yellow-200 bg-yellow-50">
        <CardContent className="p-4 text-center">
          <h4 className="font-semibold text-yellow-800 mb-2">💡 Recommendation</h4>
          <p className="text-yellow-700 text-sm">
            For large videos or multiple video concatenation, we recommend using <strong>Cloudinary Processing</strong> 
            for professional results without browser limitations.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExportPanel;
