
import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useCloudinaryProcessor } from '@/hooks/useCloudinaryProcessor';
import { getCloudinaryConfig, formatFileSize } from '@/services/cloudinaryConfig';
import { Upload, Cloud, Download, Play, Check, AlertCircle } from 'lucide-react';

interface CloudinaryVideoProcessorProps {
  onProcessingComplete?: (videoUrl: string) => void;
}

const CloudinaryVideoProcessor = ({ onProcessingComplete }: CloudinaryVideoProcessorProps) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [targetDuration, setTargetDuration] = useState<number | undefined>();
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState('');
  const { toast } = useToast();

  // Helper function to calculate overall progress
  const getOverallProgress = useCallback(() => {
    if (uploadProgress.length === 0) return 0;
    const totalProgress = uploadProgress.reduce((sum, p) => sum + p.progress, 0);
    return Math.round(totalProgress / uploadProgress.length);
  }, [uploadProgress]);

  // Helper function to calculate total file size
  const getTotalSize = useCallback(() => {
    return selectedFiles.reduce((total, file) => total + file.size, 0);
  }, [selectedFiles]);

  // Calculate total duration of selected videos (estimate 10s per video if duration unknown)
  const getTotalDuration = useCallback(() => {
    return selectedFiles.length * 10; // Rough estimate since we don't have duration from File objects
  }, [selectedFiles]);

  try {
    const config = getCloudinaryConfig();
    const { processVideos, isProcessing, uploadProgress } = useCloudinaryProcessor(config);

    const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      const videoFiles = files.filter(file => file.type.startsWith('video/'));
      
      if (videoFiles.length !== files.length) {
        toast({
          title: "Invalid Files Detected",
          description: "Only video files are allowed. Non-video files have been filtered out.",
          variant: "destructive",
        });
      }
      
      setSelectedFiles(videoFiles);
      setProcessedVideoUrl(null);
    }, [toast]);

    const handleProcessVideos = useCallback(async () => {
      if (selectedFiles.length === 0) {
        toast({
          title: "No Videos Selected",
          description: "Please select at least one video file to process.",
          variant: "destructive",
        });
        return;
      }

      try {
        setProcessingStep('Uploading videos to Cloudinary...');
        
        const resultUrl = await processVideos({
          videos: selectedFiles,
          targetDuration, // Pass the target duration
          onProgress: (progress) => {
            const uploadingCount = progress.filter(p => p.status === 'uploading').length;
            const processingCount = progress.filter(p => p.status === 'processing').length;
            
            if (uploadingCount > 0) {
              setProcessingStep(`Uploading ${uploadingCount} video(s) to Cloudinary...`);
            } else if (processingCount > 0) {
              const trimMessage = targetDuration ? ' with proportional trimming' : '';
              setProcessingStep(`Processing and concatenating videos${trimMessage}...`);
            } else {
              setProcessingStep('Finalizing video...');
            }
          },
        });

        setProcessedVideoUrl(resultUrl);
        setProcessingStep('Video processing complete!');
        onProcessingComplete?.(resultUrl);

      } catch (error) {
        console.error('Processing failed:', error);
        setProcessingStep('');
      }
    }, [selectedFiles, targetDuration, processVideos, toast, onProcessingComplete]);

    const handleDownload = useCallback(() => {
      if (processedVideoUrl) {
        const link = document.createElement('a');
        link.href = processedVideoUrl;
        link.download = `concatenated-video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({
          title: "Download Started",
          description: "Your concatenated video download has begun.",
        });
      }
    }, [processedVideoUrl, toast]);

    const handleReset = useCallback(() => {
      setSelectedFiles([]);
      setProcessedVideoUrl(null);
      setProcessingStep('');
    }, []);

    // Calculate total duration of selected videos (estimate 10s per video if duration unknown)
    const getTotalDuration = () => {
      return selectedFiles.length * 10; // Rough estimate since we don't have duration from File objects
    };

    // Success state
    if (processedVideoUrl) {
      return (
        <div className="text-center space-y-6">
          <div className="w-24 h-24 bg-green-600 rounded-full flex items-center justify-center mx-auto">
            <Check className="text-white text-4xl" />
          </div>
          <h3 className="text-2xl font-bold text-green-400">
            Video Processing Complete!
          </h3>
          
          <p className="text-gray-300">
            {selectedFiles.length === 1 
              ? "Your video has been successfully processed using Cloudinary."
              : `${selectedFiles.length} videos have been successfully concatenated using Cloudinary's cloud processing.`
            }
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
              Preview in Browser
            </Button>
            <Button 
              variant="outline" 
              onClick={handleReset}
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Process Another Video
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
            <Cloud className="text-white text-2xl animate-pulse" />
          </div>
          <h3 className="text-2xl font-bold text-white">
            Processing with Cloudinary...
          </h3>
          
          <div className="max-w-md mx-auto space-y-4">
            <Progress value={getOverallProgress()} className="w-full" />
            <p className="text-sm text-gray-300">{getOverallProgress()}% complete</p>
            <p className="text-sm text-blue-400 font-medium">{processingStep}</p>
          </div>
          
          <div className="grid gap-2 max-w-lg mx-auto">
            {uploadProgress.map((progress, index) => (
              <div key={progress.videoId} className="flex items-center justify-between text-sm text-gray-300">
                <span className="truncate">{selectedFiles[index]?.name}</span>
                <div className="flex items-center space-x-2">
                  <Progress value={progress.progress} className="w-20 h-2" />
                  <Badge variant={progress.status === 'complete' ? 'default' : 'secondary'}>
                    {progress.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          
          <p className="text-sm text-gray-400">
            Cloud processing - no browser limitations!
          </p>
        </div>
      );
    }

    // File selection state
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2 text-white">Cloudinary Video Processing</h3>
          <p className="text-gray-300">Professional cloud-powered video concatenation</p>
        </div>

        {/* Cloudinary Features */}
        <Card className="border-blue-800 bg-blue-950/50">
          <CardContent className="p-4">
            <h4 className="font-semibold text-blue-300 mb-2 flex items-center">
              <Cloud className="h-5 w-5 mr-2" />
              Cloudinary Cloud Processing
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm text-blue-400">
              <div>✅ Unlimited file sizes</div>
              <div>✅ Professional quality</div>
              <div>✅ Fast cloud processing</div>
              <div>✅ Proportional trimming</div>
            </div>
          </CardContent>
        </Card>

        {/* File Selection */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center text-white">
              <Upload className="h-5 w-5 mr-2" />
              Select Videos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <input
              type="file"
              multiple
              accept="video/*"
              onChange={handleFileSelect}
              className="w-full p-3 border-2 border-dashed border-gray-600 rounded-lg hover:border-blue-500 transition-colors bg-gray-900 text-gray-300"
            />
            
            {selectedFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                <h5 className="font-medium text-white">Selected Videos:</h5>
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex justify-between items-center text-sm bg-gray-700 p-2 rounded">
                    <span className="truncate text-gray-300">{file.name}</span>
                    <Badge variant="outline" className="border-gray-600 text-gray-300">{formatFileSize(file.size)}</Badge>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-600">
                  <p className="text-sm font-medium text-white">
                    Total: {selectedFiles.length} files ({formatFileSize(getTotalSize())})
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Target Duration Input */}
        {selectedFiles.length > 0 && (
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Duration Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="target-duration" className="text-gray-300">
                  Target Duration (seconds) - Optional
                </Label>
                <Input
                  id="target-duration"
                  type="number"
                  min="1"
                  step="0.1"
                  value={targetDuration || ''}
                  onChange={(e) => setTargetDuration(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="Leave empty to use full duration"
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                />
                <div className="text-sm text-gray-400">
                  <p>Estimated total duration: ~{getTotalDuration()}s</p>
                  {targetDuration && targetDuration < getTotalDuration() && (
                    <p className="text-orange-400 mt-1">
                      ⚠️ Videos will be trimmed proportionally to {targetDuration}s
                    </p>
                  )}
                  {targetDuration && targetDuration >= getTotalDuration() && (
                    <p className="text-green-400 mt-1">
                      ✅ No trimming needed - target duration is sufficient
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Process Button */}
        <div className="text-center">
          <Button 
            onClick={handleProcessVideos}
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-12 py-4 text-lg font-semibold"
            disabled={selectedFiles.length === 0}
          >
            <Cloud className="h-5 w-5 mr-2" />
            {targetDuration && targetDuration < getTotalDuration() 
              ? `Concatenate & Trim to ${targetDuration}s`
              : selectedFiles.length === 1 
                ? 'Process Video' 
                : `Concatenate ${selectedFiles.length} Videos`
            }
          </Button>
          {selectedFiles.length === 0 ? (
            <p className="text-sm text-red-400 mt-2">
              Please select at least one video file
            </p>
          ) : (
            <p className="text-sm text-gray-400 mt-2">
              Process with Cloudinary's cloud infrastructure
              {targetDuration && targetDuration < getTotalDuration() && (
                <span className="text-orange-400"> • Proportional trimming enabled</span>
              )}
            </p>
          )}
        </div>
      </div>
    );

  } catch (error) {
    return (
      <Card className="border-red-800 bg-red-950/50">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-300 mb-2">Configuration Error</h3>
          <p className="text-red-400">
            {error instanceof Error ? error.message : 'Failed to initialize Cloudinary processor'}
          </p>
        </CardContent>
      </Card>
    );
  }
};

export default CloudinaryVideoProcessor;
