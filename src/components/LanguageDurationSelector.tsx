
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Language } from '@/pages/Index';

interface LanguageDurationSelectorProps {
  language: Language;
  duration: number;
  onLanguageChange: (language: Language) => void;
  onDurationChange: (duration: number) => void;
}

const LanguageDurationSelector = ({ 
  language, 
  duration, 
  onLanguageChange, 
  onDurationChange 
}: LanguageDurationSelectorProps) => {
  const languages = [
    { code: 'en' as Language, name: 'English', flag: '🇺🇸' },
    { code: 'es' as Language, name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr' as Language, name: 'French', flag: '🇫🇷' },
    { code: 'de' as Language, name: 'German', flag: '🇩🇪' },
    { code: 'pt' as Language, name: 'Portuguese', flag: '🇵🇹' },
  ];

  const getDurationLabel = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };

  const getDurationCategory = (seconds: number) => {
    if (seconds <= 15) return 'Short & Snappy';
    if (seconds <= 30) return 'Quick Story';
    if (seconds <= 60) return 'Detailed Content';
    return 'Long Form';
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Configure Your Video</h3>
        <p className="text-gray-600">Set the language and duration for your template</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Language Selection */}
        <Card className="border-2 border-gray-200">
          <CardContent className="p-6">
            <h4 className="font-semibold text-lg mb-4 flex items-center">
              🌐 Language Selection
            </h4>
            
            <Select value={language} onValueChange={(value: Language) => onLanguageChange(value)}>
              <SelectTrigger className="w-full h-12 text-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code} className="text-lg py-3">
                    <div className="flex items-center space-x-3">
                      <span className="text-xl">{lang.flag}</span>
                      <span>{lang.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <p className="text-sm text-gray-600 mt-3">
              This affects text overlays, captions, and voice-over language
            </p>
          </CardContent>
        </Card>

        {/* Duration Selection */}
        <Card className="border-2 border-gray-200">
          <CardContent className="p-6">
            <h4 className="font-semibold text-lg mb-4 flex items-center">
              ⏱️ Video Duration
            </h4>
            
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-1">
                  {getDurationLabel(duration)}
                </div>
                <div className="text-sm text-gray-500">
                  {getDurationCategory(duration)}
                </div>
              </div>
              
              <Slider
                value={[duration]}
                onValueChange={(value) => onDurationChange(value[0])}
                max={120}
                min={10}
                step={5}
                className="w-full"
              />
              
              <div className="flex justify-between text-xs text-gray-500">
                <span>10s</span>
                <span>30s</span>
                <span>60s</span>
                <span>120s</span>
              </div>
            </div>
            
            <p className="text-sm text-gray-600 mt-3">
              Longer videos allow for more detailed storytelling
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Presets */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="p-6">
          <h4 className="font-semibold mb-4">⚡ Quick Presets</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { duration: 15, label: 'Quick Ad', desc: 'Perfect for ads' },
              { duration: 30, label: 'Social Post', desc: 'Ideal for feeds' },
              { duration: 60, label: 'Tutorial', desc: 'How-to content' },
              { duration: 90, label: 'Story', desc: 'Detailed narrative' },
            ].map((preset) => (
              <button
                key={preset.duration}
                onClick={() => onDurationChange(preset.duration)}
                className={`
                  p-3 rounded-lg border-2 transition-all text-left
                  ${duration === preset.duration 
                    ? 'border-blue-500 bg-blue-100' 
                    : 'border-gray-200 bg-white hover:border-gray-300'
                  }
                `}
              >
                <div className="font-medium text-sm">{preset.label}</div>
                <div className="text-xs text-gray-600">{preset.desc}</div>
                <div className="text-xs font-medium text-blue-600 mt-1">
                  {getDurationLabel(preset.duration)}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LanguageDurationSelector;
