
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    
    const cloudName = 'dsxrmo3kt';
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

    if (!apiKey || !apiSecret) {
      throw new Error('Missing Cloudinary credentials');
    }

    // Use Cloudinary's search API via REST
    const searchUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/search`;
    
    // Search for video assets
    const videoResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${apiKey}:${apiSecret}`)}`
      },
      body: JSON.stringify({
        expression: 'public_id:p1_trimmed_* OR public_id:p2_manifest_*',
        resource_type: 'video',
        max_results: 500
      })
    });

    if (!videoResponse.ok) {
      throw new Error(`Cloudinary search failed: ${videoResponse.statusText}`);
    }

    const videoResults = await videoResponse.json();
    
    // Filter for temporary assets only
    const videoIds = videoResults.resources
      .filter((asset: any) => asset.public_id.startsWith('p1_trimmed_'))
      .map((asset: any) => asset.public_id);
    
    // Search for raw/manifest assets
    const manifestResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${apiKey}:${apiSecret}`)}`
      },
      body: JSON.stringify({
        expression: 'public_id:p2_manifest_*',
        resource_type: 'raw',
        max_results: 500
      })
    });

    let manifestIds: string[] = [];
    if (manifestResponse.ok) {
      const manifestResults = await manifestResponse.json();
      manifestIds = manifestResults.resources
        .filter((asset: any) => asset.public_id.startsWith('p2_manifest_'))
        .map((asset: any) => asset.public_id);
    }
    
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

  const cloudName = 'dsxrmo3kt';
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

  if (!apiKey || !apiSecret) {
    throw new Error('Missing Cloudinary credentials for deletion');
  }

  for (const assetId of assetIds) {
    let attempts = 0;
    const maxAttempts = 3;
    let success = false;

    while (attempts < maxAttempts && !success) {
      attempts++;
      
      try {
        log(`Attempting to delete ${resourceType} asset: ${assetId} (attempt ${attempts}/${maxAttempts})`);
        
        // Use Cloudinary's destroy API directly
        const deleteUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`;
        
        const formData = new FormData();
        formData.append('public_id', assetId);
        formData.append('api_key', apiKey);
        
        // Generate signature for the request
        const timestamp = Math.round(Date.now() / 1000);
        const stringToSign = `public_id=${assetId}&timestamp=${timestamp}${apiSecret}`;
        
        // Simple signature generation (for production, use proper crypto)
        const encoder = new TextEncoder();
        const data = encoder.encode(stringToSign);
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        formData.append('timestamp', timestamp.toString());
        formData.append('signature', signature);
        
        const response = await fetch(deleteUrl, {
          method: 'POST',
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.result === 'ok' || result.result === 'not found') {
            deleted.push(assetId);
            success = true;
            log(`✅ Successfully deleted: ${assetId}`);
          } else {
            log(`❌ Deletion failed for ${assetId}:`, result);
            if (attempts === maxAttempts) {
              failed.push(assetId);
            }
          }
          details.push({ assetId, attempt: attempts, result });
        } else {
          const errorText = await response.text();
          log(`❌ HTTP error deleting ${assetId}:`, errorText);
          if (attempts === maxAttempts) {
            failed.push(assetId);
            details.push({ assetId, attempt: attempts, error: errorText });
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
          }
        }
        
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
