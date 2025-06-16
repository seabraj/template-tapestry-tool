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
  const [processingMode, setProcessingMode] = useState<'client' | 'server'>('server');
  const { assets, getAssetById, getVideoUrlById } = useVideoAssets(platform);
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setProcessingStep('Preparing videos for concatenation...');
    
    try {
      // Get selected sequences in their original order
      const selectedSequences = sequences.filter(s => s.selected);
      
      if (selectedSequences.length === 0) {
        throw new Error('No videos selected for concatenation');
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

      console.log('Starting video concatenation with assets in order:', orderedAssets.map((a, i) => `${i+1}. ${a.name}`));

      const processor = new VideoProcessor();
      const mode = processor.getProcessingMode();
      setProcessingMode(mode);
      
      const onProgress = (progress: number) => {
        setExportProgress(progress);
        if (mode === 'server') {
          if (progress < 20) {
            setProcessingStep('Downloading videos in selected order...');
          } else if (progress < 40) {
            setProcessingStep('Preparing video concatenation...');
          } else if (progress < 80) {
            setProcessingStep('Concatenating videos in order...');
          } else if (progress < 95) {
            setProcessingStep('Finalizing concatenated video...');
          } else {
            setProcessingStep('Download ready!');
          }
        } else {
          if (progress < 10) {
            setProcessingStep('Initializing FFmpeg in browser...');
          } else if (progress < 15) {
            setProcessingStep('FFmpeg ready, starting concatenation...');
          } else if (progress < 40) {
            setProcessingStep('Downloading videos in order...');
          } else if (progress < 60) {
            setProcessingStep('Preparing video concatenation...');
          } else if (progress < 90) {
            setProcessingStep('Concatenating videos...');
          } else {
            setProcessingStep('Finalizing export...');
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
      setProcessingStep('Concatenation complete!');

      toast({
        title: "Video Concatenation Complete!",
        description: `Your ${orderedAssets.length} videos have been successfully concatenated in order using ${mode === 'server' ? 'server-side' : 'client-side'} processing.`
      });

    } catch (error) {
      console.error('Concatenation failed:', error);
      setIsExporting(false);
      setProcessingStep('');
      setExportProgress(0);
      
      toast({
        title: "Concatenation Failed",
        description: error.message || "There was an error concatenating your videos. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleDownload = () => {
    if (downloadUrl) {
      const selectedCount = sequences.filter(s => s.selected).length;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `concatenated-${selectedCount}videos-${platform}-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download Started",
        description: "Your concatenated video download has started."
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
        <h3 className="text-2xl font-bold text-green-800">Video Concatenation Complete!</h3>
        <p className="text-gray-600">
          Your {selectedSequences.length} videos have been successfully concatenated in the order you selected using {processingMode === 'server' ? 'server-side' : 'client-side'} processing.
        </p>
        
        <div className="flex justify-center space-x-4">
          <Button 
            onClick={handleDownload}
            className="bg-green-500 hover:bg-green-600"
          >
            Download Concatenated MP4
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
            Create Another Video
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
        <h3 className="text-2xl font-bold">Concatenating Your Videos...</h3>
        <div className="max-w-md mx-auto space-y-2">
          <Progress value={exportProgress} className="w-full" />
          <p className="text-sm text-gray-600">{exportProgress}% complete</p>
          <p className="text-sm text-blue-600 font-medium">{processingStep}</p>
        </div>
        <p className="text-sm text-gray-500">
          Concatenating {selectedSequences.length} video clips in your selected order using {processingMode === 'server' ? 'server-side' : 'client-side'} processing...
        </p>
        {processingMode === 'server' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-xs text-green-700 font-medium">
              🚀 Using server-side video concatenation
            </p>
            <p className="text-xs text-green-600 mt-1">
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
        <h3 className="text-lg font-semibold mb-2">Ready to Concatenate</h3>
        <p className="text-gray-600">Review your settings and concatenate your videos in order</p>
      </div>

      {/* Processing Mode Indicator */}
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardContent className="p-4 text-center">
          <h4 className="font-semibold text-blue-800 mb-2">Processing Method</h4>
          <div className="flex items-center justify-center space-x-2">
            <span className="text-2xl">
              {processingMode === 'server' ? '🌐' : '💻'}
            </span>
            <div>
              <p className="text-lg font-bold text-blue-600 capitalize">
                {processingMode === 'server' ? 'Server-Side' : 'Client-Side'}
              </p>
              <p className="text-sm text-blue-600">
                {processingMode === 'server' 
                  ? 'Server concatenation preserving video order' 
                  : 'In-browser video concatenation'
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
          <h4 className="font-semibold text-lg mb-4">🎬 Video Concatenation Order</h4>
          <div className="flex flex-wrap gap-2">
            {selectedSequences.map((seq, index) => (
              <Badge key={seq.id} variant="outline" className="bg-white">
                {index + 1}. {seq.name} ({seq.duration}s)
              </Badge>
            ))}
            {selectedSequences.length === 0 && (
              <p className="text-gray-500 italic">No videos selected for concatenation</p>
            )}
          </div>
          {selectedSequences.length > 1 && (
            <p className="text-sm text-blue-600 mt-2">
              ✅ Videos will be concatenated in the exact order shown above
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
          🎬 Concatenate & Download Videos
        </Button>
        {selectedSequences.length === 0 ? (
          <p className="text-sm text-red-600 mt-2">
            Please select at least one video clip to concatenate
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            <p className="text-sm text-gray-600">
              Ready to concatenate {selectedSequences.length} videos in your selected order
            </p>
            <p className="text-xs text-blue-600">
              {processingMode === 'server' 
                ? 'Server-side processing will combine your videos in the exact order selected!' 
                : 'Advanced browser-based concatenation for supported devices'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportPanel;
