
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Platform, Language, VideoSequence, CustomizationSettings } from '@/pages/Index';
import { useState } from 'react';

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

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    
    // Simulate export process
    const steps = [
      { label: 'Preparing video clips...', duration: 1000 },
      { label: 'Applying platform optimization...', duration: 1500 },
      { label: 'Adding text overlays...', duration: 1000 },
      { label: 'Rendering final video...', duration: 2000 },
      { label: 'Finalizing export...', duration: 500 },
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, steps[i].duration));
      setExportProgress((i + 1) * 20);
    }

    setIsExporting(false);
    setExportComplete(true);
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

  if (exportComplete) {
    return (
      <div className="text-center space-y-6">
        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto">
          <span className="text-white text-4xl">✓</span>
        </div>
        <h3 className="text-2xl font-bold text-green-800">Export Complete!</h3>
        <p className="text-gray-600">Your video has been successfully generated.</p>
        
        <div className="flex justify-center space-x-4">
          <Button className="bg-green-500 hover:bg-green-600">
            Download MP4
          </Button>
          <Button variant="outline" onClick={() => setExportComplete(false)}>
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
        <h3 className="text-2xl font-bold">Generating Your Video...</h3>
        <div className="max-w-md mx-auto space-y-2">
          <Progress value={exportProgress} className="w-full" />
          <p className="text-sm text-gray-600">{exportProgress}% complete</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Ready to Export</h3>
        <p className="text-gray-600">Review your settings and generate your video</p>
      </div>

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
            <h4 className="font-semibold text-purple-800">Duration</h4>
            <p className="text-2xl font-bold text-purple-600">{duration}s</p>
            <p className="text-sm text-purple-600">{sequences.length} clips</p>
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

      {/* Video Preview */}
      <Card className="border-2 border-gray-300">
        <CardContent className="p-6">
          <h4 className="font-semibold text-lg mb-4 text-center">📺 Video Preview</h4>
          
          <div className="bg-gray-900 rounded-lg p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20"></div>
            
            {/* Platform-specific preview frame */}
            <div className={`
              mx-auto bg-gray-800 rounded-lg flex items-center justify-center relative
              ${platform === 'youtube' ? 'w-80 h-45' : ''}
              ${platform === 'facebook' ? 'w-64 h-64' : ''}
              ${platform === 'instagram' ? 'w-36 h-64' : ''}
            `}>
              {/* Text overlay preview */}
              {customization.supers.text && (
                <div className={`
                  absolute z-10 text-white text-center px-4
                  ${customization.supers.position === 'top' ? 'top-2' : ''}
                  ${customization.supers.position === 'center' ? 'top-1/2 transform -translate-y-1/2' : ''}
                  ${customization.supers.position === 'bottom' ? 'bottom-2' : ''}
                `}>
                  <p className={`
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
                </div>
              )}

              <span className="text-gray-400 text-sm">Video Content</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customization Summary */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="p-6">
          <h4 className="font-semibold text-lg mb-4">🎨 Customizations Applied</h4>
          <div className="flex flex-wrap gap-2">
            {customization.supers.text && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                Text Overlay: "{customization.supers.text}"
              </Badge>
            )}
            {customization.endFrame.enabled && (
              <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                End Frame Enabled
              </Badge>
            )}
            {customization.cta.enabled && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                CTA: "{customization.cta.text}"
              </Badge>
            )}
            {sequences.map(seq => (
              <Badge key={seq.id} variant="outline" className="bg-white">
                {seq.name} ({seq.duration}s)
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Export Button */}
      <div className="text-center">
        <Button 
          onClick={handleExport}
          size="lg"
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-12 py-4 text-lg font-semibold"
        >
          🚀 Generate MP4 Video
        </Button>
        <p className="text-sm text-gray-600 mt-2">
          Export will take approximately 30-60 seconds
        </p>
      </div>
    </div>
  );
};

export default ExportPanel;
