import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useVideoAssets } from '@/hooks/useVideoAssets';
import PlatformSelector from '@/components/PlatformSelector';
import LanguageDurationSelector from '@/components/LanguageDurationSelector';
import SequenceManager from '@/components/SequenceManager';
import CustomizationPanel from '@/components/CustomizationPanel';
import ExportPanel from '@/components/ExportPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Play, Settings, Upload, Sparkles } from 'lucide-react';

export type Platform = 'youtube' | 'facebook' | 'instagram';
export type Language = 'en' | 'es' | 'fr' | 'de';

export interface VideoSequence {
  id: string;
  name: string;
  duration: number;
  thumbnail: string;
  file_url?: string;
  selected: boolean;
}

export interface CustomizationSettings {
  overlayText: string;
  overlayPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  supers: {
    text: string;
    position: 'top' | 'center' | 'bottom';
    style: 'bold' | 'light' | 'outline';
  };
  endFrame: {
    enabled: boolean;
    text: string;
    logoPosition: 'center' | 'corner';
  };
  cta: {
    enabled: boolean;
    text: string;
    style: 'button' | 'text' | 'animated';
  };
}

const Index = () => {
  const [platform, setPlatform] = useState<Platform>('youtube');
  const [language, setLanguage] = useState<Language>('en');
  const [duration, setDuration] = useState(30);
  const [currentStep, setCurrentStep] = useState(1);
  const [sequences, setSequences] = useState<VideoSequence[]>([]);
  const [customization, setCustomization] = useState<CustomizationSettings>({
    overlayText: '',
    overlayPosition: 'bottom-right',
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
    fontSize: 24,
    supers: {
      text: '',
      position: 'bottom',
      style: 'bold'
    },
    endFrame: {
      enabled: false,
      text: '',
      logoPosition: 'center'
    },
    cta: {
      enabled: false,
      text: '',
      style: 'button'
    }
  });

  const { toast } = useToast();
  const { assets, loading, error } = useVideoAssets();

  const totalSteps = 5;

  const handleNextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
      toast({
        title: `Step ${currentStep + 1}`,
        description: getStepDescription(currentStep + 1),
      });
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getStepDescription = (step: number) => {
    switch (step) {
      case 1: return 'Choose your target platform';
      case 2: return 'Select language and duration preferences';
      case 3: return 'Choose and arrange your video sequences';
      case 4: return 'Customize your video appearance';
      case 5: return 'Generate and download your final video';
      default: return '';
    }
  };

  const getStepIcon = (step: number) => {
    switch (step) {
      case 1: return Settings;
      case 2: return Settings;
      case 3: return Play;
      case 4: return Sparkles;
      case 5: return Upload;
      default: return Settings;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-400 mx-auto"></div>
          <h2 className="text-xl font-semibold text-white">Loading Video Library...</h2>
          <p className="text-gray-400">Fetching your video assets from Cloudinary</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Card className="bg-gray-900 border-gray-800 max-w-md">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold text-red-400 mb-2">Error Loading Library</h2>
            <p className="text-gray-300 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Play className="text-white h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Video Creator</h1>
                <p className="text-sm text-gray-400">Professional video processing</p>
              </div>
            </div>
            <Button 
              onClick={() => window.open('/admin', '_blank')} 
              variant="outline" 
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              Admin Panel
            </Button>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4, 5].map((step) => {
              const StepIcon = getStepIcon(step);
              const isActive = step === currentStep;
              const isCompleted = step < currentStep;
              
              return (
                <div key={step} className="flex items-center">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                    isActive 
                      ? 'bg-blue-600 border-blue-600 text-white' 
                      : isCompleted 
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'border-gray-600 text-gray-400'
                  }`}>
                    <StepIcon className="h-5 w-5" />
                  </div>
                  {step < 5 && (
                    <div className={`w-16 h-0.5 ml-4 ${
                      step < currentStep ? 'bg-green-600' : 'bg-gray-700'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Step Content */}
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-8">
              {currentStep === 1 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Choose Platform</h2>
                    <p className="text-gray-400">Select your target platform for optimal formatting</p>
                  </div>
                  <PlatformSelector selected={platform} onSelect={setPlatform} />
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Configure Settings</h2>
                    <p className="text-gray-400">Set language and duration preferences</p>
                  </div>
                  <LanguageDurationSelector 
                    language={language} 
                    duration={duration}
                    onLanguageChange={setLanguage}
                    onDurationChange={setDuration}
                  />
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Video Sequences</h2>
                    <p className="text-gray-400">Select and arrange your video clips</p>
                  </div>
                  <SequenceManager
                    platform={platform}
                    sequences={sequences}
                    onSequencesChange={setSequences}
                  />
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Customization</h2>
                    <p className="text-gray-400">Add overlays and styling to your video</p>
                  </div>
                  <CustomizationPanel
                    settings={customization}
                    onSettingsChange={setCustomization}
                    sequences={sequences}
                    platform={platform}
                  />
                </div>
              )}

              {currentStep === 5 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Export & Generate</h2>
                    <p className="text-gray-400">Review your settings and generate your final video</p>
                  </div>
                  <ExportPanel
                    platform={platform}
                    language={language}
                    duration={duration}
                    sequences={sequences}
                    customization={customization}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button
              onClick={handlePrevStep}
              disabled={currentStep === 1}
              variant="outline"
              className="border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
            >
              Previous
            </Button>
            
            <div className="text-center">
              <p className="text-sm text-gray-400">
                Step {currentStep} of {totalSteps}
              </p>
            </div>

            <Button
              onClick={handleNextStep}
              disabled={currentStep === totalSteps}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {currentStep === totalSteps ? 'Complete' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
