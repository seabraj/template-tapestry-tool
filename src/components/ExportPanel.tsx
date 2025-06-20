import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Platform, Language, VideoSequence, CustomizationSettings } from '@/pages/Index';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { VideoProcessor } from '@/services/videoProcessor';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Play, Download, Check, AlertCircle, Video, Scissors, Monitor } from 'lucide-react';

interface ExportPanelProps {
  platform: Platform;
  language: Language;
  duration: number;
  sequences: VideoSequence[];
  customization: CustomizationSettings;
}

interface ProgressState {
  progress: number;
  phase: string;
  message: string;
  details?: any;
  timestamp?: string;
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
  const [progressState, setProgressState] = useState<ProgressState>({
    progress: 0,
    phase: 'idle',
    message: 'Ready to process videos'
  });
  const [processingError, setProcessingError] = useState<string | null>(null);
  const { toast } = useToast();

  // FIXED: Platform specifications with correct resolutions
  const getPlatformSpecs = () => {
    switch (platform) {
      case 'youtube':
        return {
          ratio: '16:9',
          resolution: '1920×1080',
          description: 'HD Landscape',
          icon: '📺',
          color: 'red'
        };
      case 'facebook':
        return {
          ratio: '1:1',
          resolution: '1080×1080',
          description: 'Square HD',
          icon: '📱',
          color: 'blue'
        };
      case 'instagram':
        return {
          ratio: '9:16',
          resolution: '1080×1920', // FIXED: Was 1980×1920
          description: 'Vertical HD',
          icon: '📲',
          color: 'purple'
        };
      default:
        return {
          ratio: '16:9',
          resolution: '1920×1080',
          description: 'HD Landscape',
          icon: '📺',
          color: 'red'
        };
    }
  };

  const platformSpecs = getPlatformSpecs();

  const getPhaseDescription = (phase: string) => {
    const phaseDescriptions: Record<string, string> = {
      'idle': 'Ready to begin',
      'starting': 'Initializing video processor',
      'initialization': 'Setting up platform-specific processing environment',
      'validation': 'Validating video sequences for platform processing',
      'duration_detection': 'Analyzing video files and detecting exact durations',
      'platform_processing': `Applying ${platform} transformations (${platformSpecs.resolution})`,
      'platform_complete': `${platform} formatting completed successfully`,
      'trimming': 'Creating trimmed video segments from original files',
      'asset_verification': 'Verifying all processed assets are ready',
      'concatenation': `Combining video segments for ${platform} format`,
      'cleanup': 'Removing temporary files and optimizing storage',
      'download': `Preparing final ${platform} video for download`,
      'complete': `${platform} video processing completed successfully`,
      'error': 'An error occurred during processing'
    };
    return phaseDescriptions[phase] || 'Processing...';
  };

  const getProgressBarColor = () => {
    if (progressState.progress < 0) return 'bg-red-600';
    if (progressState.progress === 100) return 'bg-green-600';
    if (progressState.phase === 'platform_processing') return 'bg-purple-600';
    if (progressState.phase === 'concatenation') return 'bg-blue-600';
    return `bg-${platformSpecs.color}-600`;
  };

  const selectedSequences = sequences.filter(s => s.selected);
  const totalDuration = selectedSequences.reduce((sum, seq) => sum + seq.duration, 0);

  const cleanupTemporaryAssets = async () => {
    try {
      console.log('🧹 Starting cleanup of temporary Cloudinary assets...');
      
      const { data, error } = await supabase.functions.invoke('cleanup-temp-assets', {
        body: {}
      });

      if (error) {
        console.warn('⚠️ Cleanup function returned an error:', error);
        return;
      }
      
      if (data?.success) {
        console.log('✅ Cleanup completed successfully:', data.stats);
        toast({
          title: "Cleanup Complete",
          description: `${data.stats.totalDeleted} temporary files cleaned up`,
        });
      } else {
        console.warn('⚠️ Cleanup completed with warnings:', data);
      }
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
    }
  };

  const handleGenerateVideo = async () => {
    console.log(`🎬 Generate ${platform} Video button clicked`);
    
    setProcessingError(null);
    
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

    console.log(`📋 Processing request for ${platform} with:`, {
      selectedSequences: selectedSequences.length,
      platform,
      platformSpecs,
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
      setProgressState({
        progress: 0,
        phase: 'starting',
        message: `Initializing ${platform} video processing...`
      });
      
      console.log(`🚀 Creating VideoProcessor instance for ${platform}...`);
      const videoProcessor = new VideoProcessor();
      console.log('✅ VideoProcessor created successfully');
      
      console.log(`🎯 Starting ${platform} video processing...`);
      const videoBlob = await videoProcessor.processVideo({
        sequences: selectedSequences.map(seq => ({
          id: seq.id,
          name: seq.name,
          duration: seq.duration,
          file_url: seq.file_url || ''
        })),
        customization,
        platform, // Critical: Platform passed to processor
        duration: duration,
        enableProgress: true
      }, (progress: number, details?: any) => {
        console.log(`📊 ${platform} Progress update:`, progress + '%', details);
        
        setProgress(progress);
        
        setProgressState({
          progress: Math.max(0, Math.min(100, progress)),
          phase: details?.phase || 'processing',
          message: getPhaseDescription(details?.phase || 'processing'),
          details: details?.details,
          timestamp: details?.timestamp
        });
      });

      console.log(`✅ ${platform} video processing completed, creating download URL...`);
      
      const url = URL.createObjectURL(videoBlob);
      setProcessedVideoUrl(url);
      setProgress(100);
      setProgressState({
        progress: 100,
        phase: 'complete',
        message: `${platform} video processing completed successfully!`
      });

      console.log(`🎉 ${platform} video generation successful!`);
      toast({
        title: `${platform} Video Generated Successfully!`,
        description: `Your video has been processed for ${platform} (${platformSpecs.resolution}) and ${duration < totalDuration ? 'trimmed ' : ''}is ready for download.`,
      });

      console.log('🧹 Starting background cleanup of temporary assets...');
      setTimeout(() => {
        cleanupTemporaryAssets();
      }, 2000);

    } catch (error) {
      console.error(`❌ ${platform} video processing failed:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setProcessingError(errorMessage);
      setProgressState({
        progress: -1,
        phase: 'error',
        message: `Error: ${errorMessage}`
      });
      
      toast({
        title: `${platform} Processing Failed`,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      console.log(`🏁 ${platform} video processing attempt completed`);
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
        description: `Your ${platform} video download has begun.`,
      });
    }
  };

  const handleReset = () => {
    if (processedVideoUrl) {
      URL.revokeObjectURL(processedVideoUrl);
    }
    setProcessedVideoUrl(null);
    setProgress(0);
    setProgressState({
      progress: 0,
      phase: 'idle',
      message: 'Ready to process videos'
    });
  };

  // Error state
  if (processingError) {
    return (
      <div className="text-center space-y-6">
        <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="text-white text-4xl" />
        </div>
        <h3 className="text-2xl font-bold text-red-400">
          {platform} Processing Failed
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
              setProgressState({
                progress: 0,
                phase: 'idle',
                message: 'Ready to process videos'
              });
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
          {platform} Video Generated Successfully!
        </h3>
        
        <div className="bg-green-950/30 border border-green-600/50 rounded-xl p-6 max-w-2xl mx-auto">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <span className="text-2xl">{platformSpecs.icon}</span>
            <div>
              <h4 className="font-semibold text-green-300">Platform: {platform}</h4>
              <p className="text-green-200 text-sm">
                Resolution: {platformSpecs.resolution} ({platformSpecs.ratio})
              </p>
            </div>
          </div>
          <p className="text-green-200">
            Your {selectedSequences.length} sequence(s) have been successfully processed and formatted for {platform}.
          </p>
        </div>
        
        <div className="flex justify-center space-x-4">
          <Button 
            onClick={handleDownload}
            className="bg-green-600 hover:bg-green-700"
          >
            <Download className="h-4 w-4 mr-2" />
            Download {platform} Video
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

  // Processing state with enhanced platform-specific progress tracking
  if (isProcessing) {
    return (
      <div className="text-center space-y-8">
        <div className={`w-24 h-24 bg-${platformSpecs.color}-600 rounded-full flex items-center justify-center mx-auto`}>
          <Video className="text-white text-2xl animate-pulse" />
        </div>
        <h3 className="text-2xl font-bold text-white">
          Generating Your {platform} Video...
        </h3>
        
        <div className="max-w-md mx-auto space-y-6">
          {/* Enhanced Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div 
              className={`h-4 rounded-full transition-all duration-300 ${getProgressBarColor()}`}
              style={{ width: `${Math.max(0, Math.min(100, progressState.progress))}%` }}
            ></div>
          </div>
          
          {/* Platform-specific Progress Details */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">
                {platform} Processing:
              </span>
              <span className="text-sm font-medium text-gray-300">
                {progressState.progress >= 0 ? `${progressState.progress.toFixed(1)}%` : 'Error'}
              </span>
            </div>
            
            <div className={`bg-${platformSpecs.color}-950/30 rounded-xl p-4`}>
              <h5 className={`text-sm font-semibold text-${platformSpecs.color}-300 mb-2 capitalize flex items-center`}>
                <span className="mr-2">{platformSpecs.icon}</span>
                {progressState.phase.replace('_', ' ')}
              </h5>
              <p className={`text-sm text-${platformSpecs.color}-200`}>
                {progressState.message}
              </p>
              
              {/* Platform specs display */}
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="flex justify-between text-xs">
                  <span className="text-white/60">Target:</span>
                  <span className="text-white">{platformSpecs.resolution}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/60">Format:</span>
                  <span className="text-white">{platformSpecs.ratio} {platformSpecs.description}</span>
                </div>
              </div>
            </div>
            
            {progressState.timestamp && (
              <p className="text-xs text-gray-400 text-center">
                Last update: {new Date(progressState.timestamp).toLocaleTimeString()}
              </p>
            )}
          </div>
          
          {/* Processing Stats */}
          <p className={`text-sm text-${platformSpecs.color}-400 font-medium`}>
            Processing {selectedSequences.length} video sequence(s) for {platform}...
          </p>
        </div>
        
        <p className="text-sm text-gray-400">
          Platform-specific transformations being applied: cropping and resizing to {platformSpecs.resolution}
        </p>
      </div>
    );
  }

  // Review and generate state
  return (
    <div className="space-y-8">
      {/* Enhanced Project Summary with Platform Info */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-3xl p-8">
        <h4 className="font-semibold text-xl mb-6 text-white flex items-center">
          <Video className="h-6 w-6 mr-3" />
          {platform} Video Summary
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <h5 className={`font-medium text-${platformSpecs.color}-300 mb-2`}>Platform</h5>
            <p className={`text-2xl font-bold text-${platformSpecs.color}-400 capitalize mb-1 flex items-center justify-center`}>
              <span className="mr-2">{platformSpecs.icon}</span>
              {platform}
            </p>
            <p className={`text-sm text-${platformSpecs.color}-300/80`}>{platformSpecs.ratio}</p>
          </div>
          
          <div className="text-center">
            <h5 className="font-medium text-purple-300 mb-2">Language</h5>
            <p className="text-2xl font-bold text-purple-400 mb-1">{language.toUpperCase()}</p>
            <p className="text-sm text-purple-300/80">Text & Audio</p>
          </div>
          
          <div className="text-center">
            <h5 className="font-medium text-green-300 mb-2">Quality</h5>
            <p className="text-2xl font-bold text-green-400 mb-1">HD</p>
            <p className="text-sm text-green-300/80">{platformSpecs.resolution}</p>
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

      {/* Platform Processing Info */}
      <div className={`border border-${platformSpecs.color}-600/50 bg-${platformSpecs.color}-950/30 rounded-3xl p-6`}>
        <div className="flex items-center space-x-3 mb-4">
          <Monitor className={`h-6 w-6 flex-shrink-0 text-${platformSpecs.color}-400`} />
          <div>
            <h4 className={`font-semibold text-lg text-${platformSpecs.color}-400`}>
              Platform-Specific Processing Enabled
            </h4>
            <p className={`text-sm text-${platformSpecs.color}-300/90 mt-1`}>
              Videos will be automatically resized and cropped to {platformSpecs.resolution} ({platformSpecs.ratio}) with intelligent auto-gravity cropping
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-white/60">Crop Mode:</span>
            <span className="text-white font-medium ml-2 block">Fill + Auto Gravity</span>
          </div>
          <div>
            <span className="text-white/60">Target Size:</span>
            <span className="text-white font-medium ml-2 block">{platformSpecs.resolution}</span>
          </div>
          <div>
            <span className="text-white/60">Aspect Ratio:</span>
            <span className="text-white font-medium ml-2 block">{platformSpecs.ratio}</span>
          </div>
          <div>
            <span className="text-white/60">Quality:</span>
            <span className="text-white font-medium ml-2 block">Auto Good</span>
          </div>
        </div>
      </div>

      {/* Duration Warning */}
      {duration < totalDuration && (
        <div className="border border-yellow-600/50 bg-yellow-950/30 rounded-3xl p-6">
          <div className="flex items-center space-x-3 text-yellow-400">
            <Scissors className="h-6 w-6 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-lg">Proportional Trimming Enabled</h4>
              <p className="text-sm text-yellow-300/90 mt-1">
                Videos will be trimmed proportionally from {totalDuration}s to {duration}s 
                ({Math.round((duration / totalDuration) * 100)}% of original duration), then formatted for {platform}
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

      {/* Generate Button */}
      <div className="text-center">
        <Button 
          onClick={handleGenerateVideo}
          size="lg"
          className={`bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white px-12 py-4 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300`}
          disabled={selectedSequences.length === 0}
        >
          <Video className="h-5 w-5 mr-2" />
          {duration < totalDuration 
            ? `Generate ${platform} Video (Trim to ${duration}s)`
            : `Generate ${platform} Video`
          }
        </Button>
        {selectedSequences.length === 0 ? (
          <p className="text-sm text-red-400 mt-3">
            Please select at least one video sequence in step 3
          </p>
        ) : (
          <p className="text-sm text-white/60 mt-3">
            Generate your final video optimized for {platform} ({platformSpecs.resolution})
            {duration < totalDuration && (
              <span className="text-yellow-400"> • Proportional trimming + platform formatting will be applied</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
};

export default ExportPanel;