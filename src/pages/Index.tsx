
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PlatformSelector from '@/components/PlatformSelector';
import LanguageDurationSelector from '@/components/LanguageDurationSelector';
import SequenceManager from '@/components/SequenceManager';
import CustomizationPanel from '@/components/CustomizationPanel';
import ExportPanel from '@/components/ExportPanel';
import { ArrowRight } from 'lucide-react';

export type Platform = 'facebook' | 'instagram' | 'youtube';
export type Language = 'en' | 'es' | 'fr' | 'de' | 'pt';

export interface VideoSequence {
  id: string;
  name: string;
  duration: number;
  thumbnail: string;
  selected: boolean;
}

export interface CustomizationSettings {
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
  const [step, setStep] = useState(1);
  const [platform, setPlatform] = useState<Platform>('youtube');
  const [language, setLanguage] = useState<Language>('en');
  const [duration, setDuration] = useState(30);
  const [sequences, setSequences] = useState<VideoSequence[]>([
    { id: '1', name: 'Opening Hook', duration: 5, thumbnail: '/placeholder.svg', selected: true },
    { id: '2', name: 'Main Content', duration: 20, thumbnail: '/placeholder.svg', selected: true },
    { id: '3', name: 'Call to Action', duration: 5, thumbnail: '/placeholder.svg', selected: false },
    { id: '4', name: 'Brand Outro', duration: 3, thumbnail: '/placeholder.svg', selected: true },
  ]);
  const [customization, setCustomization] = useState<CustomizationSettings>({
    supers: { text: 'Amazing Content', position: 'center', style: 'bold' },
    endFrame: { enabled: true, text: 'Thank You for Watching!', logoPosition: 'center' },
    cta: { enabled: true, text: 'Subscribe Now', style: 'button' }
  });

  const steps = [
    { number: 1, title: 'Platform', description: 'Choose your target platform' },
    { number: 2, title: 'Settings', description: 'Select language & duration' },
    { number: 3, title: 'Sequences', description: 'Select and reorder clips' },
    { number: 4, title: 'Customize', description: 'Add text and CTAs' },
    { number: 5, title: 'Export', description: 'Generate your video' },
  ];

  const nextStep = () => {
    if (step < 5) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">VT</span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Video Template Generator</h1>
            </div>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              Step {step} of 5
            </Badge>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {steps.map((stepItem, index) => (
              <div key={stepItem.number} className="flex items-center">
                <div className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}>
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                    ${stepItem.number <= step 
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white' 
                      : 'bg-gray-200 text-gray-600'
                    }
                  `}>
                    {stepItem.number}
                  </div>
                  <div className="ml-3">
                    <p className={`text-sm font-medium ${stepItem.number <= step ? 'text-gray-900' : 'text-gray-500'}`}>
                      {stepItem.title}
                    </p>
                    <p className="text-xs text-gray-500">{stepItem.description}</p>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`
                    hidden sm:block w-20 h-0.5 mx-4
                    ${stepItem.number < step ? 'bg-gradient-to-r from-blue-600 to-purple-600' : 'bg-gray-200'}
                  `} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Panel */}
          <div className="lg:col-span-3">
            <Card className="shadow-lg border-0 bg-white">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-t-lg">
                <CardTitle className="text-2xl font-bold text-gray-900">
                  {steps[step - 1].title}
                </CardTitle>
                <p className="text-gray-600">{steps[step - 1].description}</p>
              </CardHeader>
              <CardContent className="p-8">
                {step === 1 && (
                  <PlatformSelector 
                    selected={platform} 
                    onSelect={setPlatform} 
                  />
                )}
                {step === 2 && (
                  <LanguageDurationSelector
                    language={language}
                    duration={duration}
                    onLanguageChange={setLanguage}
                    onDurationChange={setDuration}
                  />
                )}
                {step === 3 && (
                  <SequenceManager
                    sequences={sequences}
                    onSequencesChange={setSequences}
                  />
                )}
                {step === 4 && (
                  <CustomizationPanel
                    settings={customization}
                    onSettingsChange={setCustomization}
                  />
                )}
                {step === 5 && (
                  <ExportPanel
                    platform={platform}
                    language={language}
                    duration={duration}
                    sequences={sequences.filter(s => s.selected)}
                    customization={customization}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card className="shadow-lg border-0 bg-white mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Preview Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Platform</label>
                    <p className="text-lg font-semibold capitalize text-blue-600">{platform}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Language</label>
                    <p className="text-lg font-semibold text-purple-600">{language.toUpperCase()}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Duration</label>
                    <p className="text-lg font-semibold text-green-600">{duration}s</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Selected Clips</label>
                    <p className="text-lg font-semibold text-orange-600">
                      {sequences.filter(s => s.selected).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex flex-col space-y-3">
              {step > 1 && (
                <Button 
                  variant="outline" 
                  onClick={prevStep}
                  className="w-full"
                >
                  Previous Step
                </Button>
              )}
              {step < 5 && (
                <Button 
                  onClick={nextStep}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  Next Step
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
