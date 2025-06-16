import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Platform, Language, VideoSequence, CustomizationSettings } from '@/pages/Index';
import { useState } from 'react';
import { useVideoAssets } from '@/hooks/useVideoAssets';
import { useToast } from '@/hooks/use-toast';
import { VideoProcessor } from '@/services/videoProcessor';

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
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportComplete, setExportComplete] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState('');
  const { assets, getAssetById, getVideoUrlById } = useVideoAssets(platform);
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setProcessingStep('Preparing videos for processing...');
    
    try {
      // Get selected sequences in their original order
      const selectedSequences = sequences.filter(s => s.selected);
      
      if (selectedSequences.length === 0) {
        throw new Error('No videos selected for processing');
      }

      // Prepare export data with proper file URLs in the exact order selected
      const orderedAssets = selectedSequences.map((seq, index) => {
        const asset = getAssetById ? getAssetById(seq.id) : assets.find(asset => asset.id === seq.id);
        if (!asset || !asset.file_url) {
          console.warn(`Asset not found or missing file_url for sequence ${seq.id}`);
          return null;
        }
        return {
          id: seq.id,
          name: seq.name,
          duration: seq.duration,
          file_url: asset.file_url,
          originalOrder: index // Preserve user selection order
        };
      }).filter((asset): asset is NonNullable<typeof asset> => asset !== null);

      if (orderedAssets.length === 0) {
        throw new Error('No valid video assets found');
      }

      console.log('🎬 Starting server-side video processing with assets in order:', orderedAssets.map((a, i) => `${i+1}. ${a.name}`));

      const processor = new VideoProcessor();
      
      const onProgress = (progress: number) => {
        setExportProgress(progress);
        if (orderedAssets.length === 1) {
          // Single video processing
          if (progress < 20) {
            setProcessingStep('Processing single video...');
          } else if (progress < 80) {
            setProcessingStep('Optimizing video...');
          } else {
            setProcessingStep('Download ready!');
          }
        } else {
          // Multiple video concatenation
          if (progress < 20) {
            setProcessingStep('Server processing: downloading videos...');
          } else if (progress < 60) {
            setProcessingStep('Server processing: concatenating videos in order...');
          } else if (progress < 90) {
            setProcessingStep('Server processing: finalizing concatenated video...');
          } else {
            setProcessingStep('Download ready!');
          }
        }
      };

      const videoBlob = await processor.processVideo({
        sequences: orderedAssets,
        customization,
        platform,
        duration
      }, onProgress);

      // Create download URL
      const url = URL.createObjectURL(videoBlob);
      setDownloadUrl(url);

      setIsExporting(false);
      setExportComplete(true);
      setProcessingStep('Video processing complete!');

      toast({
        title: orderedAssets.length === 1 ? "Video Processing Complete!" : "Video Concatenation Complete!",
        description: orderedAssets.length === 1 
          ? `Your video has been successfully processed using server-side processing.`
          : `Your ${orderedAssets.length} videos have been successfully concatenated in the order you selected using server-side processing.`
      });

    } catch (error) {
      console.error('Video processing failed:', error);
      setIsExporting(false);
      setProcessingStep('');
      setExportProgress(0);
      
      toast({
        title: "Video Processing Failed",
        description: error.message || "There was an error processing your videos. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleDownload = () => {
    if (downloadUrl) {
      const selectedCount = sequences.filter(s => s.selected).length;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = selectedCount === 1 
        ? `processed-video-${platform}-${Date.now()}.mp4`
        : `concatenated-${selectedCount}videos-${platform}-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download Started",
        description: selectedCount === 1 
          ? "Your processed video download has started."
          : "Your concatenated video download has started."
      });
    }
  };

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

  const getFirstSelectedVideoUrl = () => {
    const selectedSequence = sequences.find(s => s.selected);
    if (!selectedSequence) return null;
    
    return getVideoUrlById ? getVideoUrlById(selectedSequence.id) : null;
  };

  const getAspectRatioClass = () => {
    switch (platform) {
      case 'youtube': return 'w-80 h-45';
      case 'facebook': return 'w-64 h-64';
      case 'instagram': return 'w-36 h-64';
      default: return 'w-80 h-45';
    }
  };

  const selectedSequences = sequences.filter(s => s.selected);

  if (exportComplete) {
    return (
      <div className="text-center space-y-6">
        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto">
          <span className="text-white text-4xl">✓</span>
        </div>
        <h3 className="text-2xl font-bold text-green-800">
          {selectedSequences.length === 1 ? 'Video Processing Complete!' : 'Video Concatenation Complete!'}
        </h3>
        <p className="text-gray-600">
          {selectedSequences.length === 1 
            ? `Your video has been successfully processed using server-side processing.`
            : `Your ${selectedSequences.length} videos have been successfully concatenated in the order you selected using server-side processing.`
          }
        </p>
        
        <div className="flex justify-center space-x-4">
          <Button 
            onClick={handleDownload}
            className="bg-green-500 hover:bg-green-600"
          >
            {selectedSequences.length === 1 ? 'Download Processed MP4' : 'Download Concatenated MP4'}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => {
              setExportComplete(false);
              if (downloadUrl) {
                URL.revokeObjectURL(downloadUrl);
              }
              setDownloadUrl(null);
              setExportProgress(0);
              setProcessingStep('');
            }}
          >
            Process Another Video
          </Button>
        </div>
      </div>
    );
  }

  if (isExporting) {
    return (
      <div className="text-center space-y-6">
        <div className="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center mx-auto animate-spin">
          <span className="text-white text-2xl">⚡</span>
        </div>
        <h3 className="text-2xl font-bold">
          {selectedSequences.length === 1 ? 'Processing Your Video...' : 'Concatenating Your Videos...'}
        </h3>
        <div className="max-w-md mx-auto space-y-2">
          <Progress value={exportProgress} className="w-full" />
          <p className="text-sm text-gray-600">{exportProgress}% complete</p>
          <p className="text-sm text-blue-600 font-medium">{processingStep}</p>
        </div>
        <p className="text-sm text-gray-500">
          {selectedSequences.length === 1 
            ? `Processing your video using server-side processing...`
            : `Concatenating ${selectedSequences.length} video clips in your selected order using server-side processing...`
          }
        </p>
        {selectedSequences.length > 1 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-xs text-blue-700 font-medium">
              🎬 Using server-side binary concatenation
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Combining your videos in the exact order you selected!
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">
          {selectedSequences.length === 1 ? 'Ready to Process' : 'Ready to Concatenate'}
        </h3>
        <p className="text-gray-600">
          {selectedSequences.length === 1 
            ? 'Review your settings and process your video'
            : 'Review your settings and concatenate your videos in order'
          }
        </p>
      </div>

      {/* Processing Mode Indicator */}
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardContent className="p-4 text-center">
          <h4 className="font-semibold text-blue-800 mb-2">Processing Method</h4>
          <div className="flex items-center justify-center space-x-2">
            <span className="text-2xl">🌐</span>
            <div>
              <p className="text-lg font-bold text-blue-600">Server-Side</p>
              <p className="text-sm text-blue-600">
                {selectedSequences.length > 1 
                  ? 'Binary concatenation in correct order' 
                  : 'Server video processing'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardContent className="p-4 text-center">
            <h4 className="font-semibold text-blue-800">Platform</h4>
            <p className="text-2xl font-bold text-blue-600 capitalize">{platform}</p>
            <p className="text-sm text-blue-600">{getAspectRatio()}</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-purple-200 bg-purple-50">
          <CardContent className="p-4 text-center">
            <h4 className="font-semibold text-purple-800">Videos</h4>
            <p className="text-2xl font-bold text-purple-600">{selectedSequences.length}</p>
            <p className="text-sm text-purple-600">Selected clips</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-green-200 bg-green-50">
          <CardContent className="p-4 text-center">
            <h4 className="font-semibold text-green-800">Language</h4>
            <p className="text-2xl font-bold text-green-600">{language.toUpperCase()}</p>
            <p className="text-sm text-green-600">Text & Audio</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-orange-200 bg-orange-50">
          <CardContent className="p-4 text-center">
            <h4 className="font-semibold text-orange-800">Quality</h4>
            <p className="text-2xl font-bold text-orange-600">HD</p>
            <p className="text-sm text-orange-600">{getResolution()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Video Preview with Real Content */}
      <Card className="border-2 border-gray-300">
        <CardContent className="p-6">
          <h4 className="font-semibold text-lg mb-4 text-center">📺 Video Preview</h4>
          
          <div className="bg-gray-900 rounded-lg p-4 relative overflow-hidden">
            {/* Platform-specific preview frame with real video */}
            <div className={`mx-auto bg-gray-800 rounded-lg flex items-center justify-center relative overflow-hidden ${getAspectRatioClass()}`}>
              {getFirstSelectedVideoUrl() ? (
                <video 
                  src={getFirstSelectedVideoUrl()!}
                  className="w-full h-full object-cover rounded-lg"
                  muted
                  autoPlay
                  loop
                  onError={(e) => {
                    console.error('Video preview error:', e);
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                  <span className="text-gray-400 text-sm">Select videos to preview</span>
                </div>
              )}

              {/* Text overlay preview */}
              {customization.supers.text && (
                <div className={`
                  absolute z-10 text-white text-center px-4 w-full
                  ${customization.supers.position === 'top' ? 'top-2' : ''}
                  ${customization.supers.position === 'center' ? 'top-1/2 transform -translate-y-1/2' : ''}
                  ${customization.supers.position === 'bottom' ? 'bottom-2' : ''}
                `}>
                  <p className={`
                    text-sm md:text-base lg:text-lg
                    ${customization.supers.style === 'bold' ? 'font-bold' : ''}
                    ${customization.supers.style === 'light' ? 'font-light' : ''}
                    ${customization.supers.style === 'outline' ? 'font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-300' : ''}
                  `}>
                    {customization.supers.text}
                  </p>
                </div>
              )}

              {/* CTA preview */}
              {customization.cta.enabled && (
                <div className="absolute bottom-2 left-0 right-0 text-center">
                  {customization.cta.style === 'button' && (
                    <button className="bg-blue-500 text-white px-3 py-1 rounded text-xs">
                      {customization.cta.text}
                    </button>
                  )}
                  {customization.cta.style === 'text' && (
                    <p className="text-white text-sm font-semibold">
                      {customization.cta.text}
                    </p>
                  )}
                  {customization.cta.style === 'animated' && (
                    <div className="animate-pulse">
                      <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-full font-bold text-xs shadow-lg">
                        {customization.cta.text} ✨
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Video Order Summary - Show exact user selection order */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="p-6">
          <h4 className="font-semibold text-lg mb-4">
            {selectedSequences.length === 1 ? '🎬 Video Processing' : '🎬 Video Concatenation Order'}
          </h4>
          <div className="flex flex-wrap gap-2">
            {selectedSequences.map((seq, index) => (
              <Badge key={seq.id} variant="outline" className="bg-white">
                {selectedSequences.length === 1 ? seq.name : `${index + 1}. ${seq.name}`} ({seq.duration}s)
              </Badge>
            ))}
            {selectedSequences.length === 0 && (
              <p className="text-gray-500 italic">No videos selected</p>
            )}
          </div>
          {selectedSequences.length > 1 && (
            <p className="text-sm text-blue-600 mt-2">
              ✅ Videos will be concatenated using server-side processing in the exact order shown above
            </p>
          )}
        </CardContent>
      </Card>

      {/* Export Button */}
      <div className="text-center">
        <Button 
          onClick={handleExport}
          size="lg"
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-12 py-4 text-lg font-semibold"
          disabled={selectedSequences.length === 0}
        >
          {selectedSequences.length === 1 ? '🎬 Process & Download Video' : '🎬 Concatenate & Download Videos'}
        </Button>
        {selectedSequences.length === 0 ? (
          <p className="text-sm text-red-600 mt-2">
            Please select at least one video clip
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            <p className="text-sm text-gray-600">
              {selectedSequences.length === 1 
                ? 'Ready to process your video'
                : `Ready to concatenate ${selectedSequences.length} videos in your selected order`
              }
            </p>
            <p className="text-xs text-blue-600">
              Server-side processing with proper video ordering!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportPanel;
