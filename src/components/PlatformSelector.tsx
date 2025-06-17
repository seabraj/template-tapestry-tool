
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
      description: 'Landscape format, perfect for desktop viewing',
      frameClass: 'w-40 h-[90px]'
    },
    {
      id: 'facebook' as Platform,
      name: 'Facebook',
      ratio: '1:1',
      description: 'Square format, optimized for feed posts',
      frameClass: 'w-[90px] h-[90px]'
    },
    {
      id: 'instagram' as Platform,
      name: 'Instagram Stories',
      ratio: '9:16',
      description: 'Vertical format, full-screen mobile experience',
      frameClass: 'w-[60px] h-[100px]'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {platforms.map((platform, index) => (
        <Card 
          key={platform.id}
          className={`
            cursor-pointer transition-all duration-500 hover:scale-105 border-0 bg-[#111] gradient-border fade-in-up
            ${selected === platform.id ? 'selected -translate-y-2 shadow-2xl' : 'hover:-translate-y-2 hover:shadow-2xl'}
          `}
          style={{ animationDelay: `${(index + 1) * 0.1}s` }}
          onClick={() => onSelect(platform.id)}
        >
          <CardContent className="p-6 text-center relative">
            <div className="inline-block bg-white/10 text-white px-3 py-1.5 rounded-xl text-xs font-medium uppercase tracking-wider mb-6">
              Video Format
            </div>
            
            <div className="flex justify-center mb-6 h-[120px] items-center">
              <div className={`
                border-2 border-white/30 rounded-2xl bg-white/5 flex items-center justify-center
                text-sm font-semibold text-white/70 transition-all duration-300 relative
                ${platform.frameClass}
                ${selected === platform.id || 'hover:border-white/80 hover:bg-white/10 hover:text-white/90'}
              `}>
                <div className="absolute top-2 left-2 right-2 h-0.5 bg-gradient-to-r from-white/30 to-transparent rounded-full"></div>
                {platform.ratio}
              </div>
            </div>
            
            <h4 className="font-bold text-2xl mb-4 text-white tracking-tight">{platform.name}</h4>
            
            <div className="flex justify-end">
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
