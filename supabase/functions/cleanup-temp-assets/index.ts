// Clean cleanup utility for Supabase Edge Function
// Save this as: supabase/functions/cleanup-temp-assets/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

cloudinary.config({
  cloud_name: 'dsxrmo3kt',
  api_key: Deno.env.get('CLOUDINARY_API_KEY'),
  api_secret: Deno.env.get('CLOUDINARY_API_SECRET'),
  secure: true,
});

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
    
    const videoIds = videoResults.resources
      .filter(asset => asset.public_id.startsWith('p1_trimmed_') || asset.public_id.startsWith('p2_final_video_'))
      .map(asset => asset.public_id);
    
    const manifestIds = manifestResults.resources
      .filter(asset => asset.public_id.startsWith('p2_manifest_'))
      .map(asset => asset.public_id);
    
    log(`Found ${videoIds.length} video assets and ${manifestIds.length} manifest assets`);
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
  
  for (const assetId of assetIds) {
    try {
      log(`Attempting to delete ${resourceType} asset: ${assetId}`);
      
      const result = await cloudinary.api.delete_resources([assetId], { 
        resource_type: resourceType,
        invalidate: true
      });
      
      if (result.deleted && result.deleted[assetId] === 'deleted') {
        deleted.push(assetId);
        log(`✅ Successfully deleted: ${assetId}`);
      } else if (result.deleted && result.deleted[assetId] === 'not_found') {
        log(`⚠️ Asset not found (already deleted?): ${assetId}`);
        deleted.push(assetId);
      } else {
        failed.push(assetId);
        log(`❌ Failed to delete: ${assetId}`, result);
      }
      
      details.push({ assetId, result });
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      failed.push(assetId);
      log(`❌ Error deleting ${assetId}:`, error.message);
      details.push({ assetId, error: error.message });
    }
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
    log('🧹 Starting manual cleanup of temporary Cloudinary assets...');
    
    // Find all temporary assets
    const { videos, manifests } = await findTemporaryAssets();
    
    if (videos.length === 0 && manifests.length === 0) {
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
    log(`🎬 Deleting ${videos.length} video assets...`);
    const videoResults = await deleteAssetsSafely(videos, 'video');
    
    // Delete manifest assets
    log(`📄 Deleting ${manifests.length} manifest assets...`);
    const manifestResults = await deleteAssetsSafely(manifests, 'raw');
    
    const totalDeleted = videoResults.deleted.length + manifestResults.deleted.length;
    const totalFailed = videoResults.failed.length + manifestResults.failed.length;
    const totalProcessed = videos.length + manifests.length;
    
    log(`🎉 Cleanup completed:`, {
      totalProcessed,
      totalDeleted,
      totalFailed,
      successRate: `${((totalDeleted / totalProcessed) * 100).toFixed(1)}%`
    });
    
    return new Response(JSON.stringify({
      success: true,
      message: `Cleanup completed: ${totalDeleted}/${totalProcessed} assets deleted`,
      stats: {
        totalProcessed,
        totalDeleted,
        totalFailed,
        successRate: `${((totalDeleted / totalProcessed) * 100).toFixed(1)}%`
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