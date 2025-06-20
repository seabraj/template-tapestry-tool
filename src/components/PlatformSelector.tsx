import { Card, CardContent } from '@/components/ui/card';
import { Platform } from '@/pages/Index';

interface PlatformSelectorProps {
  selected: Platform;
  onSelect: (platform: Platform) => void;
}

const PlatformSelector = ({ selected, onSelect }: PlatformSelectorProps) => {
  const platforms = [
    {
      id: 'youtube' as Platform,
      name: 'YouTube',
      ratio: '16:9',
      resolution: '1920×1080',
      description: 'Landscape format, perfect for desktop viewing',
      frameClass: 'w-40 h-[90px]',
      bgGradient: 'from-red-500 to-red-600'
    },
    {
      id: 'facebook' as Platform,
      name: 'Facebook',
      ratio: '1:1',
      resolution: '1080×1080',
      description: 'Square format, optimized for feed posts',
      frameClass: 'w-[90px] h-[90px]',
      bgGradient: 'from-blue-500 to-blue-600'
    },
    {
      id: 'instagram' as Platform,
      name: 'Instagram Stories',
      ratio: '9:16',
      resolution: '1080×1920',
      description: 'Vertical format, full-screen mobile experience',
      frameClass: 'w-[60px] h-[100px]',
      bgGradient: 'from-purple-500 to-pink-500'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {platforms.map((platform, index) => (
        <Card 
          key={platform.id}
          className={`
            cursor-pointer transition-all duration-500 hover:scale-105 border-0 bg-[#111] gradient-border fade-in-up rounded-3xl
            ${selected === platform.id ? 'selected -translate-y-2 shadow-2xl' : 'hover:-translate-y-2 hover:shadow-2xl'}
          `}
          style={{ animationDelay: `${(index + 1) * 0.1}s` }}
          onClick={() => onSelect(platform.id)}
        >
          <CardContent className="p-6 text-center relative rounded-3xl">
            <div className="inline-block bg-white/10 text-white px-3 py-1.5 rounded-xl text-xs font-medium uppercase tracking-wider mb-6">
              Video Format
            </div>
            
            <div className="flex justify-center mb-6 h-[120px] items-center">
              <div className={`
                border-2 border-white/30 rounded-2xl bg-gradient-to-br ${platform.bgGradient} bg-opacity-20 flex flex-col items-center justify-center
                text-sm font-semibold text-white transition-all duration-300 relative
                ${platform.frameClass}
                ${selected === platform.id ? 'border-white shadow-lg' : 'hover:border-white/80 hover:shadow-md'}
              `}>
                <div className="absolute top-2 left-2 right-2 h-0.5 bg-gradient-to-r from-white/30 to-transparent rounded-full"></div>
                <div className="text-lg font-bold">{platform.ratio}</div>
                <div className="text-xs text-white/80 mt-1">{platform.resolution}</div>
              </div>
            </div>
            
            <h4 className="font-bold text-2xl mb-2 text-white tracking-tight">{platform.name}</h4>
            <p className="text-sm text-white/70 mb-4">{platform.description}</p>
            
            <div className="flex justify-between items-center">
              <div className="text-left">
                <div className="text-xs text-white/50 uppercase tracking-wider">Resolution</div>
                <div className="text-sm font-semibold text-white">{platform.resolution}</div>
              </div>
              <div className="text-white/60 text-lg transition-colors duration-300">
                →
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default PlatformSelector;