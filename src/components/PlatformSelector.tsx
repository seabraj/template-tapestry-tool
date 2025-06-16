
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
      color: 'from-red-500 to-red-600',
      dimensions: 'w-32 h-18'
    },
    {
      id: 'facebook' as Platform,
      name: 'Facebook',
      ratio: '1:1',
      description: 'Square format, optimized for feed posts',
      color: 'from-blue-500 to-blue-600',
      dimensions: 'w-24 h-24'
    },
    {
      id: 'instagram' as Platform,
      name: 'Instagram Stories',
      ratio: '9:16',
      description: 'Vertical format, full-screen mobile experience',
      color: 'from-purple-500 to-pink-500',
      dimensions: 'w-16 h-28'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Choose Your Platform</h3>
        <p className="text-gray-600">Select where you'll be sharing your video to optimize the format</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {platforms.map((platform) => (
          <Card 
            key={platform.id}
            className={`
              cursor-pointer transition-all duration-300 hover:scale-105 border-2
              ${selected === platform.id 
                ? 'border-blue-500 bg-blue-50 shadow-lg' 
                : 'border-gray-200 hover:border-gray-300'
              }
            `}
            onClick={() => onSelect(platform.id)}
          >
            <CardContent className="p-6 text-center">
              <div className="flex justify-center mb-4">
                <div className={`
                  bg-gradient-to-br ${platform.color} ${platform.dimensions} 
                  rounded-lg shadow-md flex items-center justify-center
                `}>
                  <span className="text-white font-bold text-sm">{platform.ratio}</span>
                </div>
              </div>
              
              <h4 className="font-semibold text-lg mb-2">{platform.name}</h4>
              <p className="text-sm text-gray-600 mb-3">{platform.description}</p>
              
              <div className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-3 py-1 inline-block">
                {platform.ratio} Aspect Ratio
              </div>
              
              {selected === platform.id && (
                <div className="mt-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mx-auto animate-pulse"></div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">💡 Pro Tip</h4>
        <p className="text-sm text-blue-800">
          Each platform has different optimal dimensions. We'll automatically crop and adjust your content 
          to look perfect on your chosen platform.
        </p>
      </div>
    </div>
  );
};

export default PlatformSelector;
