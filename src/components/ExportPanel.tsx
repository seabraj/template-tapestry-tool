
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Platform, Language, VideoSequence, CustomizationSettings } from '@/pages/Index';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { VideoProcessor } from '@/services/videoProcessor';
import { ArrowLeft, Play, Download, Check, AlertCircle, Video } from 'lucide-react';

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
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
  const totalDuration = selectedSequences.reduce((sum, seq) => sum + seq.duration, 0);

  const handleGenerateVideo = async () => {
    if (selectedSequences.length === 0) {
      toast({
        title: "No Sequences Selected",
        description: "Please go back and select at least one video sequence.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsProcessing(true);
      setProgress(0);

      const videoProcessor = new VideoProcessor();
      
      const videoBlob = await videoProcessor.processVideo({
        sequences: selectedSequences.map(seq => ({
          id: seq.id,
          name: seq.name,
          duration: seq.duration,
          file_url: seq.file_url || ''
        })),
        customization,
        platform,
        duration: totalDuration
      }, (progress) => {
        setProgress(progress);
      });

      // Create download URL
      const url = URL.createObjectURL(videoBlob);
      setProcessedVideoUrl(url);
      setProgress(100);

      toast({
        title: "Video Generated Successfully!",
        description: "Your video has been processed and is ready for download.",
      });

    } catch (error) {
      console.error('Video processing failed:', error);
      toast({
        title: "Processing Failed",
        description: error.message || "Failed to generate video. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (processedVideoUrl) {
      const link = document.createElement('a');
      link.href = processedVideoUrl;
      link.download = `video-${platform}-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download Started",
        description: "Your video download has begun.",
      });
    }
  };

  const handleReset = () => {
    if (processedVideoUrl) {
      URL.revokeObjectURL(processedVideoUrl);
    }
    setProcessedVideoUrl(null);
    setProgress(0);
  };

  // Success state
  if (processedVideoUrl) {
    return (
      <div className="text-center space-y-6">
        <div className="w-24 h-24 bg-green-600 rounded-full flex items-center justify-center mx-auto">
          <Check className="text-white text-4xl" />
        </div>
        <h3 className="text-2xl font-bold text-green-400">
          Video Generated Successfully!
        </h3>
        
        <p className="text-gray-300">
          Your {selectedSequences.length} sequence(s) have been successfully processed and combined.
        </p>
        
        <div className="flex justify-center space-x-4">
          <Button 
            onClick={handleDownload}
            className="bg-green-600 hover:bg-green-700"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Video
          </Button>
          <Button 
            variant="outline" 
            onClick={() => window.open(processedVideoUrl, '_blank')}
            className="border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            <Play className="h-4 w-4 mr-2" />
            Preview Video
          </Button>
          <Button 
            variant="outline" 
            onClick={handleReset}
            className="border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            Generate Another
          </Button>
        </div>
      </div>
    );
  }

  // Processing state
  if (isProcessing) {
    return (
      <div className="text-center space-y-6">
        <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center mx-auto">
          <Video className="text-white text-2xl animate-pulse" />
        </div>
        <h3 className="text-2xl font-bold text-white">
          Generating Your Video...
        </h3>
        
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-300" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-300">{progress}% complete</p>
          <p className="text-sm text-blue-400 font-medium">
            Processing {selectedSequences.length} video sequence(s)...
          </p>
        </div>
        
        <p className="text-sm text-gray-400">
          Please wait while we generate your video
        </p>
      </div>
    );
  }

  // Review and generate state
  return (
    <div className="space-y-6">
      {/* Project Summary */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6">
          <h4 className="font-semibold text-lg mb-4 text-white flex items-center">
            <Video className="h-5 w-5 mr-2" />
            Video Summary
          </h4>
          
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
              <h5 className="font-medium text-orange-300">Duration</h5>
              <p className="text-lg font-bold text-orange-400">{totalDuration}s</p>
              <p className="text-sm text-orange-300">{selectedSequences.length} clips</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selected Sequences Preview */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6">
          <h4 className="font-semibold text-lg mb-4 text-white">Selected Video Sequences</h4>
          
          {selectedSequences.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-400 font-medium">No sequences selected</p>
              <p className="text-gray-400 text-sm mt-2">
                Please go back to step 3 and select at least one video sequence.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedSequences.map((sequence, index) => (
                <div 
                  key={sequence.id}
                  className="flex items-center space-x-4 bg-gray-700 p-3 rounded-lg"
                >
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h5 className="font-medium text-white">{sequence.name}</h5>
                    <p className="text-sm text-gray-400">{sequence.duration}s duration</p>
                  </div>
                  <Badge variant="secondary">{sequence.duration}s</Badge>
                </div>
              ))}
              <div className="border-t border-gray-600 pt-3 mt-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-white">Total Duration:</span>
                  <Badge className="bg-green-600">{totalDuration}s</Badge>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customization Summary */}
      {(customization.supers.text || customization.endFrame.enabled || customization.cta.enabled) && (
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-6">
            <h4 className="font-semibold text-lg mb-4 text-white">Applied Customizations</h4>
            <div className="space-y-2">
              {customization.supers.text && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Text Overlay:</span>
                  <Badge variant="outline">{customization.supers.text}</Badge>
                </div>
              )}
              {customization.endFrame.enabled && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">End Frame:</span>
                  <Badge variant="outline">Enabled</Badge>
                </div>
              )}
              {customization.cta.enabled && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Call to Action:</span>
                  <Badge variant="outline">{customization.cta.text || 'Enabled'}</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generate Button */}
      <div className="text-center">
        <Button 
          onClick={handleGenerateVideo}
          size="lg"
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-12 py-4 text-lg font-semibold"
          disabled={selectedSequences.length === 0}
        >
          <Video className="h-5 w-5 mr-2" />
          Generate Video
        </Button>
        {selectedSequences.length === 0 ? (
          <p className="text-sm text-red-400 mt-2">
            Please select at least one video sequence in step 3
          </p>
        ) : (
          <p className="text-sm text-gray-400 mt-2">
            Generate your final video with {selectedSequences.length} sequence(s)
          </p>
        )}
      </div>
    </div>
  );
};

export default ExportPanel;
