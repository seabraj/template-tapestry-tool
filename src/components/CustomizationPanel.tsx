
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomizationSettings, VideoSequence } from '@/pages/Index';
import { useVideoAssets } from '@/hooks/useVideoAssets';

interface CustomizationPanelProps {
  settings: CustomizationSettings;
  onSettingsChange: (settings: CustomizationSettings) => void;
  sequences: VideoSequence[];
  platform: string;
}

const CustomizationPanel = ({ settings, onSettingsChange, sequences, platform }: CustomizationPanelProps) => {
  const { assets } = useVideoAssets(platform);
  
  const updateSupers = (updates: Partial<typeof settings.supers>) => {
    onSettingsChange({
      ...settings,
      supers: { ...settings.supers, ...updates }
    });
  };

  const updateEndFrame = (updates: Partial<typeof settings.endFrame>) => {
    onSettingsChange({
      ...settings,
      endFrame: { ...settings.endFrame, ...updates }
    });
  };

  const updateCTA = (updates: Partial<typeof settings.cta>) => {
    onSettingsChange({
      ...settings,
      cta: { ...settings.cta, ...updates }
    });
  };

  const getFirstSelectedVideoUrl = () => {
    const selectedSequence = sequences.find(s => s.selected);
    if (!selectedSequence) return null;
    
    const asset = assets.find(asset => asset.id === selectedSequence.id);
    return asset?.file_url || null;
  };

  const getAspectRatioClass = () => {
    switch (platform) {
      case 'youtube': return 'w-80 h-45';
      case 'facebook': return 'w-64 h-64';
      case 'instagram': return 'w-36 h-64';
      default: return 'w-80 h-45';
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2 text-white">Customize Your Video</h3>
        <p className="text-white/60">Add text overlays, end frames, and call-to-actions</p>
      </div>

      <Tabs defaultValue="supers" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-[#111] border border-white/10 rounded-2xl p-1">
          <TabsTrigger 
            value="supers" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-pink-500 data-[state=active]:text-white text-white/60 rounded-xl font-medium transition-all duration-300"
          >
            ✨ Text Overlays
          </TabsTrigger>
          <TabsTrigger 
            value="endframe"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-pink-500 data-[state=active]:text-white text-white/60 rounded-xl font-medium transition-all duration-300"
          >
            🎬 End Frame
          </TabsTrigger>
          <TabsTrigger 
            value="cta"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-pink-500 data-[state=active]:text-white text-white/60 rounded-xl font-medium transition-all duration-300"
          >
            🚀 Call to Action
          </TabsTrigger>
        </TabsList>

        {/* Text Overlays / Supers */}
        <TabsContent value="supers">
          <Card className="bg-[#111] border border-white/10 rounded-3xl">
            <CardContent className="p-8 space-y-8">
              <div>
                <Label htmlFor="supers-text" className="text-lg font-semibold text-white mb-3 block">
                  Overlay Text
                </Label>
                <Input
                  id="supers-text"
                  value={settings.supers.text}
                  onChange={(e) => updateSupers({ text: e.target.value })}
                  placeholder="Enter your overlay text..."
                  className="text-lg bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/40 focus:border-orange-500/50 focus:bg-white/8 transition-all duration-300"
                />
                <p className="text-sm text-white/60 mt-3">
                  This text will appear over your video content
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-lg font-semibold text-white mb-3 block">Position</Label>
                  <Select 
                    value={settings.supers.position} 
                    onValueChange={(value: 'top' | 'center' | 'bottom') => updateSupers({ position: value })}
                  >
                    <SelectTrigger className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-orange-500/50 focus:bg-white/8 transition-all duration-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111] border border-white/20 rounded-2xl">
                      <SelectItem value="top" className="text-white hover:bg-white/10 rounded-xl">Top</SelectItem>
                      <SelectItem value="center" className="text-white hover:bg-white/10 rounded-xl">Center</SelectItem>
                      <SelectItem value="bottom" className="text-white hover:bg-white/10 rounded-xl">Bottom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-lg font-semibold text-white mb-3 block">Style</Label>
                  <Select 
                    value={settings.supers.style} 
                    onValueChange={(value: 'bold' | 'light' | 'outline') => updateSupers({ style: value })}
                  >
                    <SelectTrigger className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-orange-500/50 focus:bg-white/8 transition-all duration-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111] border border-white/20 rounded-2xl">
                      <SelectItem value="bold" className="text-white hover:bg-white/10 rounded-xl">Bold</SelectItem>
                      <SelectItem value="light" className="text-white hover:bg-white/10 rounded-xl">Light</SelectItem>
                      <SelectItem value="outline" className="text-white hover:bg-white/10 rounded-xl">Outline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Video Preview with Overlay */}
              <div className="bg-black/40 rounded-3xl p-6 relative overflow-hidden border border-white/10">
                <div className={`mx-auto bg-black/60 rounded-2xl relative overflow-hidden ${getAspectRatioClass()}`}>
                  {getFirstSelectedVideoUrl() ? (
                    <video 
                      src={getFirstSelectedVideoUrl()!}
                      className="w-full h-full object-cover rounded-2xl"
                      muted
                      autoPlay
                      loop
                    />
                  ) : (
                    <div className="w-full h-full bg-white/5 rounded-2xl flex items-center justify-center">
                      <span className="text-white/40 text-sm">Select a video to preview</span>
                    </div>
                  )}
                  
                  {/* Text overlay preview */}
                  {settings.supers.text && (
                    <div className={`
                      absolute z-10 text-white text-center px-4 w-full
                      ${settings.supers.position === 'top' ? 'top-2' : ''}
                      ${settings.supers.position === 'center' ? 'top-1/2 transform -translate-y-1/2' : ''}
                      ${settings.supers.position === 'bottom' ? 'bottom-2' : ''}
                    `}>
                      <p className={`
                        text-lg md:text-xl lg:text-2xl
                        ${settings.supers.style === 'bold' ? 'font-bold' : ''}
                        ${settings.supers.style === 'light' ? 'font-light' : ''}
                        ${settings.supers.style === 'outline' ? 'font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-300' : ''}
                      `}>
                        {settings.supers.text}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* End Frame */}
        <TabsContent value="endframe">
          <Card className="bg-[#111] border border-white/10 rounded-3xl">
            <CardContent className="p-8 space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-lg font-semibold text-white">Enable End Frame</Label>
                  <p className="text-sm text-white/60 mt-1">Add a closing screen to your video</p>
                </div>
                <Switch
                  checked={settings.endFrame.enabled}
                  onCheckedChange={(enabled) => updateEndFrame({ enabled })}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:to-pink-500"
                />
              </div>

              {settings.endFrame.enabled && (
                <>
                  <div>
                    <Label htmlFor="endframe-text" className="text-lg font-semibold text-white mb-3 block">
                      End Frame Text
                    </Label>
                    <Input
                      id="endframe-text"
                      value={settings.endFrame.text}
                      onChange={(e) => updateEndFrame({ text: e.target.value })}
                      placeholder="Thank you message..."
                      className="text-lg bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/40 focus:border-orange-500/50 focus:bg-white/8 transition-all duration-300"
                    />
                  </div>

                  <div>
                    <Label className="text-lg font-semibold text-white mb-3 block">Logo Position</Label>
                    <Select 
                      value={settings.endFrame.logoPosition} 
                      onValueChange={(value: 'center' | 'corner') => updateEndFrame({ logoPosition: value })}
                    >
                      <SelectTrigger className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-orange-500/50 focus:bg-white/8 transition-all duration-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#111] border border-white/20 rounded-2xl">
                        <SelectItem value="center" className="text-white hover:bg-white/10 rounded-xl">Center</SelectItem>
                        <SelectItem value="corner" className="text-white hover:bg-white/10 rounded-xl">Corner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* End Frame Preview */}
                  <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-3xl p-8 text-center">
                    <div className={`
                      ${settings.endFrame.logoPosition === 'center' ? 'mb-4' : 'absolute top-4 right-4 w-8 h-8 bg-gradient-to-r from-orange-500 to-pink-500 rounded-xl'}
                    `}>
                      {settings.endFrame.logoPosition === 'center' && (
                        <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-pink-500 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                          <span className="text-white font-bold">LOGO</span>
                        </div>
                      )}
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">
                      {settings.endFrame.text || 'Your end frame text'}
                    </h3>
                    <p className="text-white/60">End Frame Preview</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Call to Action */}
        <TabsContent value="cta">
          <Card className="bg-[#111] border border-white/10 rounded-3xl">
            <CardContent className="p-8 space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-lg font-semibold text-white">Enable Call to Action</Label>
                  <p className="text-sm text-white/60 mt-1">Add a CTA to drive engagement</p>
                </div>
                <Switch
                  checked={settings.cta.enabled}
                  onCheckedChange={(enabled) => updateCTA({ enabled })}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:to-pink-500"
                />
              </div>

              {settings.cta.enabled && (
                <>
                  <div>
                    <Label htmlFor="cta-text" className="text-lg font-semibold text-white mb-3 block">
                      CTA Text
                    </Label>
                    <Input
                      id="cta-text"
                      value={settings.cta.text}
                      onChange={(e) => updateCTA({ text: e.target.value })}
                      placeholder="Subscribe Now, Learn More, etc."
                      className="text-lg bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/40 focus:border-orange-500/50 focus:bg-white/8 transition-all duration-300"
                    />
                  </div>

                  <div>
                    <Label className="text-lg font-semibold text-white mb-3 block">CTA Style</Label>
                    <Select 
                      value={settings.cta.style} 
                      onValueChange={(value: 'button' | 'text' | 'animated') => updateCTA({ style: value })}
                    >
                      <SelectTrigger className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-orange-500/50 focus:bg-white/8 transition-all duration-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#111] border border-white/20 rounded-2xl">
                        <SelectItem value="button" className="text-white hover:bg-white/10 rounded-xl">Button</SelectItem>
                        <SelectItem value="text" className="text-white hover:bg-white/10 rounded-xl">Text Only</SelectItem>
                        <SelectItem value="animated" className="text-white hover:bg-white/10 rounded-xl">Animated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* CTA Preview with Video */}
                  <div className="bg-black/40 rounded-3xl p-6 relative overflow-hidden border border-white/10">
                    <div className={`mx-auto bg-black/60 rounded-2xl relative overflow-hidden ${getAspectRatioClass()}`}>
                      {getFirstSelectedVideoUrl() ? (
                        <video 
                          src={getFirstSelectedVideoUrl()!}
                          className="w-full h-full object-cover rounded-2xl"
                          muted
                          autoPlay
                          loop
                        />
                      ) : (
                        <div className="w-full h-full bg-white/5 rounded-2xl flex items-center justify-center">
                          <span className="text-white/40 text-sm">Select a video to preview</span>
                        </div>
                      )}

                      {/* CTA preview */}
                      <div className="absolute bottom-2 left-0 right-0 text-center">
                        {settings.cta.style === 'button' && (
                          <button className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-2xl font-semibold hover:scale-105 transition-transform text-sm">
                            {settings.cta.text || 'Your CTA'}
                          </button>
                        )}
                        {settings.cta.style === 'text' && (
                          <p className="text-white text-lg font-semibold">
                            {settings.cta.text || 'Your CTA'}
                          </p>
                        )}
                        {settings.cta.style === 'animated' && (
                          <div className="animate-pulse">
                            <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-2xl font-bold shadow-lg text-sm">
                              {settings.cta.text || 'Your CTA'} ✨
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CustomizationPanel;
