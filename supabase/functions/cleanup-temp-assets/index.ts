// Add this component to your admin panel or settings page
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Loader2 } from 'lucide-react';

interface CleanupResult {
  success: boolean;
  message: string;
  stats?: {
    totalProcessed: number;
    totalDeleted: number;
    totalFailed: number;
    successRate: string;
  };
  deleted?: {
    videos: string[];
    manifests: string[];
  };
  failed?: {
    videos: string[];
    manifests: string[];
  };
}

const ManualCleanupButton: React.FC = () => {
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [lastCleanupResult, setLastCleanupResult] = useState<CleanupResult | null>(null);
  const { toast } = useToast();

  const handleManualCleanup = async () => {
    setIsCleaningUp(true);
    setLastCleanupResult(null);

    try {
      console.log('🧹 Starting manual cleanup...');
      
      const { data, error } = await supabase.functions.invoke('cleanup-temp-assets', {
        body: {}
      });

      if (error) {
        throw new Error(`Cleanup function failed: ${error.message}`);
      }

      setLastCleanupResult(data);

      if (data.success) {
        toast({
          title: "Cleanup Completed",
          description: data.message,
          variant: data.stats?.totalFailed === 0 ? "default" : "destructive",
        });
      } else {
        throw new Error(data.error || 'Cleanup failed');
      }

    } catch (error) {
      console.error('❌ Manual cleanup failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setLastCleanupResult({
        success: false,
        message: `Cleanup failed: ${errorMessage}`
      });
      
      toast({
        title: "Cleanup Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsCleaningUp(false);
    }
  };

  return (
    <div className="p-6 border border-gray-300 rounded-lg bg-white">
      <h3 className="text-lg font-semibold mb-4">🧹 Cloudinary Cleanup</h3>
      
      <p className="text-gray-600 mb-4">
        Clean up temporary video assets (p1_trimmed_*, p2_final_video_*, p2_manifest_*) 
        that may not have been automatically deleted.
      </p>

      <div className="space-y-4">
        <Button 
          onClick={handleManualCleanup}
          disabled={isCleaningUp}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {isCleaningUp ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Cleaning up...
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Clean Up Temporary Assets
            </>
          )}
        </Button>

        {lastCleanupResult && (
          <div className={`p-4 rounded-lg ${
            lastCleanupResult.success 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            <h4 className={`font-semibold mb-2 ${
              lastCleanupResult.success ? 'text-green-800' : 'text-red-800'
            }`}>
              {lastCleanupResult.success ? '✅ Cleanup Results' : '❌ Cleanup Failed'}
            </h4>
            
            <p className={lastCleanupResult.success ? 'text-green-700' : 'text-red-700'}>
              {lastCleanupResult.message}
            </p>

            {lastCleanupResult.stats && (
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Total Processed:</span> {lastCleanupResult.stats.totalProcessed}
                </div>
                <div>
                  <span className="font-medium">Successfully Deleted:</span> {lastCleanupResult.stats.totalDeleted}
                </div>
                <div>
                  <span className="font-medium">Failed:</span> {lastCleanupResult.stats.totalFailed}
                </div>
                <div>
                  <span className="font-medium">Success Rate:</span> {lastCleanupResult.stats.successRate}
                </div>
              </div>
            )}

            {lastCleanupResult.deleted && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-green-700">
                  Show deleted assets ({lastCleanupResult.deleted.videos.length + lastCleanupResult.deleted.manifests.length})
                </summary>
                <div className="mt-2 text-xs text-green-600 space-y-1">
                  {lastCleanupResult.deleted.videos.length > 0 && (
                    <div>
                      <strong>Videos:</strong> {lastCleanupResult.deleted.videos.join(', ')}
                    </div>
                  )}
                  {lastCleanupResult.deleted.manifests.length > 0 && (
                    <div>
                      <strong>Manifests:</strong> {lastCleanupResult.deleted.manifests.join(', ')}
                    </div>
                  )}
                </div>
              </details>
            )}

            {lastCleanupResult.failed && (lastCleanupResult.failed.videos.length > 0 || lastCleanupResult.failed.manifests.length > 0) && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-red-700">
                  Show failed deletions ({lastCleanupResult.failed.videos.length + lastCleanupResult.failed.manifests.length})
                </summary>
                <div className="mt-2 text-xs text-red-600 space-y-1">
                  {lastCleanupResult.failed.videos.length > 0 && (
                    <div>
                      <strong>Videos:</strong> {lastCleanupResult.failed.videos.join(', ')}
                    </div>
                  )}
                  {lastCleanupResult.failed.manifests.length > 0 && (
                    <div>
                      <strong>Manifests:</strong> {lastCleanupResult.failed.manifests.join(', ')}
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManualCleanupButton;