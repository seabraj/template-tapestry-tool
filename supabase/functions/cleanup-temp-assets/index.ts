
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configure Cloudinary with proper error handling
function configureCloudinary() {
  const cloudName = 'dsxrmo3kt';
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

  if (!apiKey || !apiSecret) {
    throw new Error('Missing Cloudinary credentials');
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  console.log('✅ Cloudinary configured successfully');
}

function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(`[${timestamp}] Data:`, JSON.stringify(data, null, 2));
  }
}

async function findTemporaryAssets(): Promise<{ videos: string[], manifests: string[] }> {
  try {
    log('🔍 Searching for temporary assets...');
    
    // Search for video assets with temporary naming pattern
    const videoResults = await cloudinary.search
      .expression('public_id:p1_trimmed_* OR public_id:p2_final_video_*')
      .resource_type('video')
      .max_results(500)
      .execute();
    
    // Search for manifest assets (raw files)
    const manifestResults = await cloudinary.search
      .expression('public_id:p2_manifest_*')
      .resource_type('raw')
      .max_results(500)
      .execute();
    
    // Filter for temporary assets only (exclude final videos that should be kept)
    const videoIds = videoResults.resources
      .filter(asset => {
        // Only delete trimmed videos, not final videos
        return asset.public_id.startsWith('p1_trimmed_');
      })
      .map(asset => asset.public_id);
    
    const manifestIds = manifestResults.resources
      .filter(asset => asset.public_id.startsWith('p2_manifest_'))
      .map(asset => asset.public_id);
    
    log(`Found ${videoIds.length} temporary video assets and ${manifestIds.length} manifest assets`);
    return { videos: videoIds, manifests: manifestIds };
  } catch (error) {
    log('Error finding temporary assets:', error);
    throw error;
  }
}

async function deleteAssetsSafely(assetIds: string[], resourceType: 'video' | 'raw'): Promise<{
  deleted: string[],
  failed: string[],
  details: any[]
}> {
  const deleted: string[] = [];
  const failed: string[] = [];
  const details: any[] = [];
  
  if (assetIds.length === 0) {
    log(`No ${resourceType} assets to delete`);
    return { deleted, failed, details };
  }

  for (const assetId of assetIds) {
    let attempts = 0;
    const maxAttempts = 3;
    let success = false;

    while (attempts < maxAttempts && !success) {
      attempts++;
      
      try {
        log(`Attempting to delete ${resourceType} asset: ${assetId} (attempt ${attempts}/${maxAttempts})`);
        
        const result = await cloudinary.api.delete_resources([assetId], { 
          resource_type: resourceType,
          invalidate: true
        });
        
        if (result.deleted && result.deleted[assetId] === 'deleted') {
          deleted.push(assetId);
          success = true;
          log(`✅ Successfully deleted: ${assetId}`);
        } else if (result.deleted && result.deleted[assetId] === 'not_found') {
          log(`⚠️ Asset not found (already deleted?): ${assetId}`);
          deleted.push(assetId);
          success = true;
        } else {
          log(`❌ Deletion failed for ${assetId}:`, result);
          if (attempts === maxAttempts) {
            failed.push(assetId);
          }
        }
        
        details.push({ assetId, attempt: attempts, result });
        
      } catch (error) {
        log(`❌ Error deleting ${assetId} (attempt ${attempts}):`, error.message);
        
        if (attempts === maxAttempts) {
          failed.push(assetId);
          details.push({ assetId, attempt: attempts, error: error.message });
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    }
    
    // Small delay between assets to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return { deleted, failed, details };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }
  
  try {
    log('🧹 Starting cleanup of temporary Cloudinary assets...');
    
    // Configure Cloudinary
    configureCloudinary();
    
    // Find all temporary assets
    const { videos, manifests } = await findTemporaryAssets();
    
    if (videos.length === 0 && manifests.length === 0) {
      log('No temporary assets found to clean up');
      return new Response(JSON.stringify({
        success: true,
        message: 'No temporary assets found to clean up',
        stats: {
          totalProcessed: 0,
          totalDeleted: 0,
          totalFailed: 0,
          successRate: '100%'
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }
    
    // Delete video assets
    log(`🎬 Deleting ${videos.length} temporary video assets...`);
    const videoResults = await deleteAssetsSafely(videos, 'video');
    
    // Delete manifest assets
    log(`📄 Deleting ${manifests.length} manifest assets...`);
    const manifestResults = await deleteAssetsSafely(manifests, 'raw');
    
    const totalDeleted = videoResults.deleted.length + manifestResults.deleted.length;
    const totalFailed = videoResults.failed.length + manifestResults.failed.length;
    const totalProcessed = videos.length + manifests.length;
    
    const successRate = totalProcessed > 0 ? ((totalDeleted / totalProcessed) * 100).toFixed(1) : '100';
    
    log(`🎉 Cleanup completed:`, {
      totalProcessed,
      totalDeleted,
      totalFailed,
      successRate: `${successRate}%`
    });
    
    return new Response(JSON.stringify({
      success: true,
      message: `Cleanup completed: ${totalDeleted}/${totalProcessed} assets deleted`,
      stats: {
        totalProcessed,
        totalDeleted,
        totalFailed,
        successRate: `${successRate}%`
      },
      deleted: {
        videos: videoResults.deleted,
        manifests: manifestResults.deleted
      },
      failed: {
        videos: videoResults.failed,
        manifests: manifestResults.failed
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
    
  } catch (error) {
    log('❌ Cleanup failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
