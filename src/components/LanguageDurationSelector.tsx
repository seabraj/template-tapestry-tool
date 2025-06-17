
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
      {/* Language Selection */}
      <Card className="bg-[#111] border-0 rounded-3xl p-10 relative overflow-hidden fade-in-up" style={{ animationDelay: '0.4s' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-amber-500/10 pointer-events-none"></div>
        <div className="absolute inset-0 border border-orange-500/20 rounded-3xl pointer-events-none"></div>
        <CardContent className="p-0 relative z-10">
          <h4 className="font-bold text-2xl mb-6 text-white tracking-tight">Language Selection</h4>
          
          <Select value={language} onValueChange={(value: Language) => onLanguageChange(value)}>
            <SelectTrigger className="w-full h-16 text-lg bg-white/5 border border-white/10 rounded-2xl px-6 text-white hover:border-orange-500/50 hover:bg-white/8 focus:border-orange-500/50 focus:bg-white/8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111] border-white/20 rounded-2xl">
              {languages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code} className="text-lg py-4 text-white hover:bg-white/10 focus:bg-white/10">
                  <div className="flex items-center space-x-3">
                    <span className="text-xl">{lang.flag}</span>
                    <span>{lang.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <p className="text-sm text-white/60 mt-3">
            This affects text overlays, captions, and voice-over language
          </p>
        </CardContent>
      </Card>

      {/* Duration Selection */}
      <Card className="bg-[#111] border-0 rounded-3xl p-10 relative overflow-hidden fade-in-up" style={{ animationDelay: '0.5s' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-purple-500/10 pointer-events-none"></div>
        <div className="absolute inset-0 border border-pink-500/20 rounded-3xl pointer-events-none"></div>
        <CardContent className="p-0 relative z-10">
          <h4 className="font-bold text-2xl mb-6 text-white tracking-tight">Video Duration</h4>
          
          <div className="text-center mb-10">
            <div className="text-7xl font-black gradient-text leading-none mb-2 tracking-tight">
              {getDurationLabel(duration)}
            </div>
            <div className="text-lg text-white/60 italic">
              {getDurationCategory(duration)}
            </div>
          </div>
          
          <div className="space-y-6">
            <Slider
              value={[duration]}
              onValueChange={(value) => onDurationChange(value[0])}
              max={120}
              min={10}
              step={5}
              className="w-full"
            />
            
            <div className="flex justify-between text-xs text-white/40">
              <span>10s</span>
              <span>30s</span>
              <span>60s</span>
              <span>120s</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LanguageDurationSelector;
