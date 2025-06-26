
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
import { Play, Sparkles, Upload, Settings, Video } from 'lucide-react';
import { getFullVersionString } from '@/utils/version';

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
      case 3: return Video;
      case 4: return Sparkles;
      case 5: return Upload;
      default: return Settings;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-400 mx-auto"></div>
          <h2 className="text-xl font-semibold text-white">Loading Video Library...</h2>
          <p className="text-white/60">Fetching your video assets from Cloudinary</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Card className="bg-[#111] border-white/20 max-w-md rounded-3xl">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold text-red-400 mb-2">Error Loading Library</h2>
            <p className="text-white/80 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} className="bg-orange-600 hover:bg-orange-700 rounded-xl">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-20">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 logo-gradient rounded-2xl flex items-center justify-center text-white font-bold text-xl">
              ▶
            </div>
            <div className="text-white text-lg font-medium">
              <a 
                href="https://www.itmatters.studio" 
                target="_blank" 
                rel="noopener noreferrer"
                className="no-underline hover:no-underline"
              >
                <span className="font-bold">itMatters</span>
              </a> Content Creator
            </div>
          </div>
          <Button 
            onClick={() => window.open('/admin', '_blank')} 
            variant="outline" 
            className="border-white/20 text-white hover:bg-white/5 hover:border-white/40 rounded-xl px-6 py-3 font-medium transition-all duration-300"
          >
            <span className="mr-2">⚙</span>
            Admin Panel
          </Button>
        </div>

        {/* Progress Steps */}
        <div className="mb-20">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            {[1, 2, 3, 4, 5].map((step) => {
              const StepIcon = getStepIcon(step);
              const isActive = step === currentStep;
              const isCompleted = step < currentStep;
              
              return (
                <div key={step} className="flex items-center">
                  <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-300 ${
                    isActive 
                      ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/50' 
                      : isCompleted 
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-white/20 text-white/40'
                  }`}>
                    <StepIcon className="h-5 w-5" />
                  </div>
                  {step < 5 && (
                    <div className={`w-16 h-0.5 ml-4 transition-all duration-300 ${
                      step < currentStep ? 'bg-green-500' : 'bg-white/20'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-20">
          {/* Step Content */}
          <div className="">
            {currentStep === 1 && (
              <div className="space-y-12">
                <div className="text-center">
                  <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">Choose Platform</h2>
                  <p className="text-white/60 text-lg">Select your target platform for optimal formatting</p>
                </div>
                <PlatformSelector selected={platform} onSelect={setPlatform} />
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-12">
                <div className="text-center">
                  <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">Configure Settings</h2>
                  <p className="text-white/60 text-lg">Set language and duration preferences</p>
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
              <div className="space-y-12">
                <div className="text-center">
                  <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">Video Sequences</h2>
                  <p className="text-white/60 text-lg">Select and arrange your video clips</p>
                </div>
                <div className="bg-[#111] border border-white/10 rounded-3xl p-8">
                  <SequenceManager
                    platform={platform}
                    sequences={sequences}
                    onSequencesChange={setSequences}
                  />
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-12">
                <div className="text-center">
                  <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">Customization</h2>
                  <p className="text-white/60 text-lg">Add overlays and styling to your video</p>
                </div>
                <div className="bg-[#111] border border-white/10 rounded-3xl p-8">
                  <CustomizationPanel
                    settings={customization}
                    onSettingsChange={setCustomization}
                    sequences={sequences}
                    platform={platform}
                  />
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-12">
                <div className="text-center">
                  <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">Export & Generate</h2>
                  <p className="text-white/60 text-lg">Review your settings and generate your final video</p>
                </div>
                <div className="bg-[#111] border border-white/10 rounded-3xl p-8">
                  <ExportPanel
                    platform={platform}
                    language={language}
                    duration={duration}
                    sequences={sequences}
                    customization={customization}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <Button
              onClick={handlePrevStep}
              disabled={currentStep === 1}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/5 hover:border-white/40 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-white/20 rounded-xl px-8 py-3 font-medium transition-all duration-300"
            >
              Previous
            </Button>
            
            <div className="text-center">
              <p className="text-sm text-white/40">
                Step {currentStep} of {totalSteps}
              </p>
            </div>

            <Button
              onClick={handleNextStep}
              disabled={currentStep === totalSteps}
              className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 disabled:opacity-30 disabled:hover:from-orange-500 disabled:hover:to-pink-500 rounded-xl px-8 py-3 font-medium transition-all duration-300 shadow-lg"
            >
              {currentStep === totalSteps ? 'Complete' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Version Footer */}
      <footer className="text-center py-6 border-t border-white/10 mt-12">
        <p className="text-sm text-white/40">
          {getFullVersionString()}
        </p>
      </footer>
    </div>
  );
};

export default Index;
