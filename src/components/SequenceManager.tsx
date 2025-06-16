
import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { VideoSequence, Platform } from '@/pages/Index';
import { ArrowUp, ArrowDown, RefreshCw, Play } from 'lucide-react';
import { useVideoAssets } from '@/hooks/useVideoAssets';
import { useToast } from '@/hooks/use-toast';

interface SequenceManagerProps {
  sequences: VideoSequence[];
  onSequencesChange: (sequences: VideoSequence[]) => void;
  platform: Platform;
}

const SequenceManager = ({ sequences, onSequencesChange, platform }: SequenceManagerProps) => {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const { assets, loading, error, refetch, convertToSequences } = useVideoAssets(platform);
  const { toast } = useToast();

  // Load sequences from Supabase when component mounts or platform changes
  useEffect(() => {
    if (assets.length > 0 && sequences.length === 0) {
      const videoSequences = convertToSequences();
      onSequencesChange(videoSequences);
    }
  }, [assets, platform]);

  const handleRefreshLibrary = async () => {
    await refetch();
    const videoSequences = convertToSequences();
    onSequencesChange(videoSequences);
    toast({
      title: "Library refreshed",
      description: "Video library has been updated with the latest assets."
    });
  };

  const toggleSequence = (id: string) => {
    const updated = sequences.map(seq => 
      seq.id === id ? { ...seq, selected: !seq.selected } : seq
    );
    onSequencesChange(updated);
  };

  const moveSequence = (id: string, direction: 'up' | 'down') => {
    const currentIndex = sequences.findIndex(seq => seq.id === id);
    if (
      (direction === 'up' && currentIndex === 0) || 
      (direction === 'down' && currentIndex === sequences.length - 1)
    ) {
      return;
    }

    const newSequences = [...sequences];
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    [newSequences[currentIndex], newSequences[targetIndex]] = 
    [newSequences[targetIndex], newSequences[currentIndex]];
    
    onSequencesChange(newSequences);
  };

  const getVideoUrl = (sequenceId: string) => {
    const asset = assets.find(asset => asset.id === sequenceId);
    return asset?.file_url;
  };

  const selectedSequences = sequences.filter(s => s.selected);
  const totalDuration = selectedSequences.reduce((sum, seq) => sum + seq.duration, 0);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading video library...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading video library: {error}</p>
          <Button onClick={refetch} className="mt-2" variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (sequences.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="font-semibold text-yellow-800 mb-2">No Video Assets Found</h3>
          <p className="text-yellow-700 mb-4">
            No video assets were found for the {platform} platform. 
            Please upload some videos to the admin panel first.
          </p>
          <div className="space-y-2">
            <Button onClick={() => window.open('/admin', '_blank')} className="mr-2">
              Open Admin Panel
            </Button>
            <Button onClick={handleRefreshLibrary} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Library
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Select & Arrange Sequences</h3>
        <p className="text-gray-600">Choose which video clips to include and arrange them in order</p>
        <Button 
          onClick={handleRefreshLibrary} 
          variant="outline" 
          size="sm" 
          className="mt-2"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Library
        </Button>
      </div>

      {/* Summary */}
      <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div>
              <span className="font-semibold text-green-800">
                {selectedSequences.length} clips selected
              </span>
              <span className="text-green-600 ml-2">
                • Total duration: {totalDuration}s
              </span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                const allSelected = sequences.every(s => s.selected);
                const updated = sequences.map(s => ({ ...s, selected: !allSelected }));
                onSequencesChange(updated);
              }}
            >
              {sequences.every(s => s.selected) ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sequence List */}
      <div className="space-y-3">
        {sequences.map((sequence, index) => {
          const videoUrl = getVideoUrl(sequence.id);
          return (
            <Card 
              key={sequence.id}
              className={`
                transition-all duration-200 border-2
                ${sequence.selected 
                  ? 'border-blue-500 bg-blue-50 shadow-md' 
                  : 'border-gray-200 bg-white'
                }
                ${draggedItem === sequence.id ? 'opacity-50' : ''}
              `}
            >
              <CardContent className="p-4">
                <div className="flex items-center space-x-4">
                  {/* Checkbox */}
                  <Checkbox
                    checked={sequence.selected}
                    onCheckedChange={() => toggleSequence(sequence.id)}
                  />

                  {/* Order Number */}
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                    ${sequence.selected 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-200 text-gray-500'
                    }
                  `}>
                    {index + 1}
                  </div>

                  {/* Video Preview */}
                  <div className="w-20 h-14 bg-gray-300 rounded-lg flex items-center justify-center overflow-hidden relative group">
                    {videoUrl ? (
                      <>
                        <video 
                          src={videoUrl}
                          className="w-full h-full object-cover rounded-lg"
                          preload="metadata"
                          muted
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center">
                          <Play className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-gray-600">CLIP</span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{sequence.name}</h4>
                    <p className="text-sm text-gray-600">{sequence.duration}s duration</p>
                  </div>

                  {/* Preview Button */}
                  {videoUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(videoUrl, '_blank')}
                      className="h-8 w-8 p-0"
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                  )}

                  {/* Move Controls */}
                  <div className="flex flex-col space-y-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveSequence(sequence.id, 'up')}
                      disabled={index === 0}
                      className="h-6 w-8 p-0"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveSequence(sequence.id, 'down')}
                      disabled={index === sequences.length - 1}
                      className="h-6 w-8 p-0"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Preview Timeline */}
      <Card className="border-2 border-purple-200 bg-purple-50">
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3">📺 Video Timeline Preview</h4>
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {selectedSequences.map((seq, index) => (
              <div
                key={seq.id}
                className="flex-shrink-0 bg-white border-2 border-purple-300 rounded-lg p-3 min-w-32"
              >
                <div className="text-xs font-semibold text-purple-800">
                  {index + 1}. {seq.name}
                </div>
                <div className="text-xs text-purple-600 mt-1">
                  {seq.duration}s
                </div>
              </div>
            ))}
            {selectedSequences.length === 0 && (
              <div className="text-gray-500 italic">
                Select clips to see timeline preview
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SequenceManager;
