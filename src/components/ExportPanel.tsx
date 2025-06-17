
import { Card, CardContent } from '@/components/ui/card';
import { Platform, Language, VideoSequence, CustomizationSettings } from '@/pages/Index';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import CloudinaryVideoProcessor from './CloudinaryVideoProcessor';
import { ArrowLeft } from 'lucide-react';

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

  const handleCloudinaryProcessingComplete = (videoUrl: string) => {
    setProcessedVideoUrl(videoUrl);
    toast({
      title: "Video Processing Complete!",
      description: "Your video has been successfully processed with Cloudinary.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2 text-white">Professional Video Processing</h3>
        <p className="text-gray-300">Cloud-powered video concatenation with Cloudinary</p>
      </div>

      <CloudinaryVideoProcessor 
        onProcessingComplete={handleCloudinaryProcessingComplete}
      />

      {/* Current Settings Summary */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6">
          <h4 className="font-semibold text-lg mb-4 text-white">Platform Settings</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <h5 className="font-medium text-blue-300">Platform</h5>
              <p className="text-lg font-bold text-blue-400 capitalize">{platform}</p>
              <p className="text-sm text-blue-300">{getAspectRatio()}</p>
            </div>
            
            <div className="text-center">
              <h5 className="font-medium text-purple-300">Language</h5>
              <p className="text-lg font-bold text-purple-400">{language.toUpperCase()}</p>
              <p className="text-sm text-purple-300">Text & Audio</p>
            </div>
            
            <div className="text-center">
              <h5 className="font-medium text-green-300">Quality</h5>
              <p className="text-lg font-bold text-green-400">HD</p>
              <p className="text-sm text-green-300">{getResolution()}</p>
            </div>

            <div className="text-center">
              <h5 className="font-medium text-orange-300">Processing</h5>
              <p className="text-lg font-bold text-orange-400">Cloud</p>
              <p className="text-sm text-orange-300">Cloudinary</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExportPanel;
