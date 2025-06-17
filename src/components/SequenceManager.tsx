
import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { VideoSequence, Platform } from '@/pages/Index';
import { ArrowUp, ArrowDown, RefreshCw, Play, GripVertical } from 'lucide-react';
import { useVideoAssets } from '@/hooks/useVideoAssets';
import { useToast } from '@/hooks/use-toast';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';

interface SequenceManagerProps {
  sequences: VideoSequence[];
  onSequencesChange: (sequences: VideoSequence[]) => void;
  platform: Platform;
}

const SequenceManager = ({ sequences, onSequencesChange, platform }: SequenceManagerProps) => {
  const { assets, loading, error, refetch, convertToSequences, getVideoUrlById } = useVideoAssets(platform);
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

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const newSequences = [...sequences];
    const [reorderedItem] = newSequences.splice(result.source.index, 1);
    newSequences.splice(result.destination.index, 0, reorderedItem);

    onSequencesChange(newSequences);
    
    toast({
      title: "Sequence reordered",
      description: `Moved "${reorderedItem.name}" to position ${result.destination.index + 1}`,
    });
  };

  const selectedSequences = sequences.filter(s => s.selected);
  const totalDuration = selectedSequences.reduce((sum, seq) => sum + seq.duration, 0);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-400 mx-auto"></div>
        <p className="mt-4 text-white/60">Loading video library...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <Card className="bg-red-900/20 border border-red-500/30 rounded-2xl">
          <CardContent className="p-6">
            <p className="text-red-400 mb-4">Error loading video library: {error}</p>
            <Button 
              onClick={refetch} 
              variant="outline" 
              className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-400 rounded-xl"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (sequences.length === 0) {
    return (
      <div className="text-center py-8">
        <Card className="bg-yellow-900/20 border border-yellow-500/30 rounded-2xl">
          <CardContent className="p-6">
            <h3 className="font-semibold text-yellow-400 mb-2">No Video Assets Found</h3>
            <p className="text-yellow-300/80 mb-4">
              No video assets were found for the {platform} platform. 
              Please upload some videos to the admin panel first.
            </p>
            <div className="space-y-2">
              <Button 
                onClick={() => window.open('/admin', '_blank')} 
                className="mr-2 bg-yellow-600 hover:bg-yellow-700 rounded-xl"
              >
                Open Admin Panel
              </Button>
              <Button 
                onClick={handleRefreshLibrary} 
                variant="outline"
                className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-400 rounded-xl"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Library
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2 text-white">Select & Arrange Sequences</h3>
        <p className="text-white/60">Choose which video clips to include and drag to reorder them</p>
        <Button 
          onClick={handleRefreshLibrary} 
          variant="outline" 
          size="sm" 
          className="mt-2 border-white/20 text-white hover:bg-white/5 hover:border-white/40 rounded-xl"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Library
        </Button>
      </div>

      {/* Summary */}
      <Card className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-2xl">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div>
              <span className="font-semibold text-green-400">
                {selectedSequences.length} clips selected
              </span>
              <span className="text-green-300/80 ml-2">
                • Total duration: {totalDuration}s
              </span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="border-green-500/30 text-green-400 hover:bg-green-500/10 hover:border-green-400 rounded-xl"
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

      {/* Drag and Drop Sequence List */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="sequences">
          {(provided, snapshot) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className={`space-y-3 ${snapshot.isDraggingOver ? 'bg-blue-500/5 rounded-2xl p-2' : ''}`}
            >
              {sequences.map((sequence, index) => {
                const videoUrl = getVideoUrlById(sequence.id);
                return (
                  <Draggable key={sequence.id} draggableId={sequence.id} index={index}>
                    {(provided, snapshot) => (
                      <Card 
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`
                          transition-all duration-200 border-2 rounded-2xl
                          ${sequence.selected 
                            ? 'border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/20' 
                            : 'border-white/10 bg-[#111]'
                          }
                          ${snapshot.isDragging ? 'shadow-2xl rotate-1 scale-105 bg-[#222]' : ''}
                        `}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center space-x-4">
                            {/* Drag Handle */}
                            <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                              <GripVertical className="h-5 w-5 text-white/40 hover:text-white/60" />
                            </div>

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
                                : 'bg-white/10 text-white/50'
                              }
                            `}>
                              {index + 1}
                            </div>

                            {/* Video Preview */}
                            <div className="w-20 h-14 bg-white/5 rounded-2xl flex items-center justify-center overflow-hidden relative group">
                              {videoUrl ? (
                                <>
                                  <video 
                                    src={videoUrl}
                                    className="w-full h-full object-cover rounded-2xl"
                                    preload="metadata"
                                    muted
                                    onError={(e) => {
                                      console.error('Video preview error:', e);
                                      (e.target as HTMLVideoElement).style.display = 'none';
                                    }}
                                  />
                                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center rounded-2xl">
                                    <Play className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                                  </div>
                                </>
                              ) : (
                                <span className="text-xs text-white/60">CLIP</span>
                              )}
                            </div>

                            {/* Details */}
                            <div className="flex-1">
                              <h4 className="font-semibold text-white">{sequence.name}</h4>
                              <p className="text-sm text-white/60">{sequence.duration}s duration</p>
                            </div>

                            {/* Preview Button */}
                            {videoUrl && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(videoUrl, '_blank')}
                                className="h-8 w-8 p-0 border-white/20 text-white hover:bg-white/5 hover:border-white/40 rounded-xl"
                              >
                                <Play className="h-3 w-3" />
                              </Button>
                            )}

                            {/* Legacy Move Controls (kept for backup) */}
                            <div className="flex flex-col space-y-1 opacity-30">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => moveSequence(sequence.id, 'up')}
                                disabled={index === 0}
                                className="h-6 w-8 p-0 border-white/20 text-white hover:bg-white/5 rounded-lg"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => moveSequence(sequence.id, 'down')}
                                disabled={index === sequences.length - 1}
                                className="h-6 w-8 p-0 border-white/20 text-white hover:bg-white/5 rounded-lg"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Preview Timeline */}
      <Card className="border-2 border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl">
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3 text-white flex items-center">
            <span className="mr-2">📺</span>
            Video Timeline Preview
          </h4>
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {selectedSequences.map((seq, index) => (
              <div
                key={seq.id}
                className="flex-shrink-0 bg-white/5 border-2 border-purple-500/30 rounded-2xl p-3 min-w-32"
              >
                <div className="text-xs font-semibold text-purple-300">
                  {index + 1}. {seq.name}
                </div>
                <div className="text-xs text-purple-400/80 mt-1">
                  {seq.duration}s
                </div>
              </div>
            ))}
            {selectedSequences.length === 0 && (
              <div className="text-white/50 italic">
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
