
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
  const [processingError, setProcessingError] = useState<string | null>(null);
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
    console.log('🎬 Generate Video button clicked');
    
    // Clear any previous errors
    setProcessingError(null);
    
    // Validate sequences
    if (selectedSequences.length === 0) {
      const errorMsg = 'No sequences selected';
      console.error('❌', errorMsg);
      toast({
        title: "No Sequences Selected",
        description: "Please go back and select at least one video sequence.",
        variant: "destructive",
      });
      return;
    }

    console.log('📋 Processing request with:', {
      selectedSequences: selectedSequences.length,
      platform,
      language,
      duration,
      totalDuration,
      sequences: selectedSequences.map(s => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
        hasFileUrl: !!s.file_url
      }))
    });

    try {
      setIsProcessing(true);
      setProgress(0);
      
      console.log('🚀 Creating VideoProcessor instance...');
      const videoProcessor = new VideoProcessor();
      console.log('✅ VideoProcessor created successfully');
      
      console.log('🎯 Starting video processing...');
      const videoBlob = await videoProcessor.processVideo({
        sequences: selectedSequences.map(seq => ({
          id: seq.id,
          name: seq.name,
          duration: seq.duration,
          file_url: seq.file_url || ''
        })),
        customization,
        platform,
        duration: duration
      }, (progress) => {
        console.log('📊 Progress update:', progress + '%');
        setProgress(progress);
      });

      console.log('✅ Video processing completed, creating download URL...');
      
      // Create download URL
      const url = URL.createObjectURL(videoBlob);
      setProcessedVideoUrl(url);
      setProgress(100);

      console.log('🎉 Video generation successful!');
      toast({
        title: "Video Generated Successfully!",
        description: `Your video has been processed and ${duration < totalDuration ? 'trimmed ' : ''}is ready for download.`,
      });

    } catch (error) {
      console.error('❌ Video processing failed:', error);
      
      // Store error for display
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setProcessingError(errorMessage);
      
      toast({
        title: "Processing Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      console.log('🏁 Video processing attempt completed');
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

  // Error state
  if (processingError) {
    return (
      <div className="text-center space-y-6">
        <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="text-white text-4xl" />
        </div>
        <h3 className="text-2xl font-bold text-red-400">
          Processing Failed
        </h3>
        
        <div className="bg-red-950/50 border border-red-600 rounded-lg p-4 max-w-2xl mx-auto">
          <h4 className="font-semibold text-red-400 mb-2">Error Details:</h4>
          <p className="text-red-300 text-sm break-words">{processingError}</p>
        </div>
        
        <div className="space-y-2">
          <p className="text-gray-300">
            Please check the browser console for detailed logs and try again.
          </p>
          <Button 
            onClick={() => {
              setProcessingError(null);
              setProgress(0);
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

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
    <div className="space-y-8">
      {/* Project Summary */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-3xl p-8">
        <h4 className="font-semibold text-xl mb-6 text-white flex items-center">
          <Video className="h-6 w-6 mr-3" />
          Video Summary
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <h5 className="font-medium text-blue-300 mb-2">Platform</h5>
            <p className="text-2xl font-bold text-blue-400 capitalize mb-1">{platform}</p>
            <p className="text-sm text-blue-300/80">{getAspectRatio()}</p>
          </div>
          
          <div className="text-center">
            <h5 className="font-medium text-purple-300 mb-2">Language</h5>
            <p className="text-2xl font-bold text-purple-400 mb-1">{language.toUpperCase()}</p>
            <p className="text-sm text-purple-300/80">Text & Audio</p>
          </div>
          
          <div className="text-center">
            <h5 className="font-medium text-green-300 mb-2">Quality</h5>
            <p className="text-2xl font-bold text-green-400 mb-1">HD</p>
            <p className="text-sm text-green-300/80">{getResolution()}</p>
          </div>

          <div className="text-center">
            <h5 className="font-medium text-orange-300 mb-2">Duration</h5>
            <p className="text-2xl font-bold text-orange-400 mb-1">{duration}s</p>
            <p className="text-sm text-orange-300/80">
              {selectedSequences.length} clips
              {duration < totalDuration && (
                <span className="block text-yellow-400 text-xs mt-1">
                  (trimmed from {totalDuration}s)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Duration Warning */}
      {duration < totalDuration && (
        <div className="border border-yellow-600/50 bg-yellow-950/30 rounded-3xl p-6">
          <div className="flex items-center space-x-3 text-yellow-400">
            <AlertCircle className="h-6 w-6 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-lg">Proportional Trimming Enabled</h4>
              <p className="text-sm text-yellow-300/90 mt-1">
                Videos will be trimmed proportionally from {totalDuration}s to {duration}s 
                ({Math.round((duration / totalDuration) * 100)}% of original duration)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Selected Sequences Preview */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-3xl p-8">
        <h4 className="font-semibold text-xl mb-6 text-white">Selected Video Sequences</h4>
        
        {selectedSequences.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-6" />
            <p className="text-red-400 font-semibold text-lg mb-2">No sequences selected</p>
            <p className="text-white/60 text-base">
              Please go back to step 3 and select at least one video sequence.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {selectedSequences.map((sequence, index) => (
              <div 
                key={sequence.id}
                className="flex items-center space-x-4 bg-[#0f0f23] border border-white/10 p-4 rounded-2xl hover:bg-[#16162e] transition-colors"
              >
                <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <h5 className="font-semibold text-white text-lg">{sequence.name}</h5>
                  <p className="text-white/60">
                    {sequence.duration}s duration
                    {duration < totalDuration && (
                      <span className="text-yellow-400 ml-2">
                        → {((sequence.duration / totalDuration) * duration).toFixed(1)}s trimmed
                      </span>
                    )}
                  </p>
                </div>
                <Badge 
                  variant="secondary" 
                  className="bg-white/10 text-white border-white/20 px-3 py-1 text-sm font-medium rounded-xl"
                >
                  {sequence.duration}s
                </Badge>
              </div>
            ))}
            <div className="border-t border-white/10 pt-4 mt-6">
              <div className="flex justify-between items-center">
                <span className="font-medium text-white text-lg">
                  {duration < totalDuration ? 'Target' : 'Total'} Duration:
                </span>
                <Badge 
                  className={`${duration < totalDuration ? "bg-yellow-600 hover:bg-yellow-700" : "bg-green-600 hover:bg-green-700"} text-white px-4 py-2 text-sm font-semibold rounded-xl`}
                >
                  {duration}s
                </Badge>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Customization Summary */}
      {(customization.supers.text || customization.endFrame.enabled || customization.cta.enabled) && (
        <div className="bg-[#1a1a2e] border border-white/10 rounded-3xl p-6">
          <h4 className="font-semibold text-lg mb-4 text-white">Applied Customizations</h4>
          <div className="space-y-3">
            {customization.supers.text && (
              <div className="flex justify-between items-center">
                <span className="text-white/80">Text Overlay:</span>
                <Badge variant="outline" className="border-white/20 text-white/90 rounded-xl">
                  {customization.supers.text}
                </Badge>
              </div>
            )}
            {customization.endFrame.enabled && (
              <div className="flex justify-between items-center">
                <span className="text-white/80">End Frame:</span>
                <Badge variant="outline" className="border-white/20 text-white/90 rounded-xl">
                  Enabled
                </Badge>
              </div>
            )}
            {customization.cta.enabled && (
              <div className="flex justify-between items-center">
                <span className="text-white/80">Call to Action:</span>
                <Badge variant="outline" className="border-white/20 text-white/90 rounded-xl">
                  {customization.cta.text || 'Enabled'}
                </Badge>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generate Button */}
      <div className="text-center">
        <Button 
          onClick={handleGenerateVideo}
          size="lg"
          className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white px-12 py-4 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
          disabled={selectedSequences.length === 0}
        >
          <Video className="h-5 w-5 mr-2" />
          {duration < totalDuration 
            ? `Generate & Trim to ${duration}s`
            : 'Generate Video'
          }
        </Button>
        {selectedSequences.length === 0 ? (
          <p className="text-sm text-red-400 mt-3">
            Please select at least one video sequence in step 3
          </p>
        ) : (
          <p className="text-sm text-white/60 mt-3">
            Generate your final video with {selectedSequences.length} sequence(s)
            {duration < totalDuration && (
              <span className="text-yellow-400"> • Proportional trimming will be applied</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
};

export default ExportPanel;
