// Add this simple test endpoint to diagnose the exact issue
// Call this with a single video to test each step in isolation

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { v2 as cloudinary } from 'npm:cloudinary@^1.41.1';

// Test endpoint: POST /test-video-processing
serve(async (req) => {
  if (req.url.includes('/test-video-processing')) {
    return await testVideoProcessing(req);
  }
  
  // Your existing endpoint logic here...
});

async function testVideoProcessing(req: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { testVideoId, targetDuration = 5 } = await req.json();
    
    if (!testVideoId) {
      throw new Error('testVideoId is required');
    }
    
    console.log('🧪 === DIAGNOSTIC TEST STARTED ===');
    console.log(`Testing with video: ${testVideoId}, target duration: ${targetDuration}s`);
    
    const results = {
      originalVideo: null,
      trimmedVideo: null,
      directTransformation: null,
      concatenationTest: null,
      issues: []
    };
    
    // TEST 1: Check original video metadata
    console.log('🔍 TEST 1: Checking original video metadata...');
    try {
      const originalResource = await cloudinary.api.resource(testVideoId, { 
        resource_type: 'video',
        image_metadata: true 
      });
      
      results.originalVideo = {
        publicId: originalResource.public_id,
        duration: originalResource.duration,
        width: originalResource.width,
        height: originalResource.height,
        hasValidMetadata: !!(originalResource.duration && originalResource.width && originalResource.height),
        status: originalResource.status || 'complete'
      };
      
      console.log('✅ Original video metadata:', results.originalVideo);
      
      if (!results.originalVideo.hasValidMetadata) {
        results.issues.push('Original video has incomplete metadata');
      }
      
    } catch (error) {
      results.issues.push(`Cannot access original video: ${error.message}`);
      console.error('❌ TEST 1 FAILED:', error.message);
    }
    
    // TEST 2: Test direct transformation (no re-upload)
    console.log('🔍 TEST 2: Testing direct transformation...');
    try {
      const directUrl = cloudinary.url(testVideoId, {
        resource_type: 'video',
        transformation: [
          { duration: targetDuration },
          { width: 1280, height: 720, crop: 'pad' },
          { quality: 'auto:good' }
        ],
        format: 'mp4'
      });
      
      const directTest = await fetch(directUrl, { method: 'HEAD' });
      
      results.directTransformation = {
        url: directUrl,
        status: directTest.status,
        works: directTest.ok,
        statusText: directTest.statusText
      };
      
      console.log('📡 Direct transformation test:', results.directTransformation);
      
      if (!directTest.ok) {
        results.issues.push(`Direct transformation failed: ${directTest.status} ${directTest.statusText}`);
      }
      
    } catch (error) {
      results.issues.push(`Direct transformation error: ${error.message}`);
      console.error('❌ TEST 2 FAILED:', error.message);
    }
    
    // TEST 3: Create trimmed video using the problematic method
    console.log('🔍 TEST 3: Testing trimmed video creation...');
    try {
      const trimmedId = `test_trim_${Date.now()}`;
      
      // Use your current method
      const trimmedUrl = cloudinary.url(testVideoId, {
        resource_type: 'video',
        transformation: [
          { duration: targetDuration },
          { quality: 'auto:good' }
        ],
        format: 'mp4'
      });
      
      console.log('📹 Creating trimmed video from URL:', trimmedUrl);
      
      const uploadResult = await cloudinary.uploader.upload(trimmedUrl, {
        resource_type: 'video',
        public_id: trimmedId,
        overwrite: true
      });
      
      console.log('📤 Upload result:', { public_id: uploadResult.public_id, secure_url: uploadResult.secure_url });
      
      // Wait and check metadata
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      let trimmedResource;
      let attempts = 0;
      
      while (attempts < 3) {
        try {
          trimmedResource = await cloudinary.api.resource(trimmedId, { 
            resource_type: 'video',
            image_metadata: true 
          });
          
          if (trimmedResource.duration) break;
          
          console.log(`⏳ Attempt ${attempts + 1}: Waiting for metadata...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (metaError) {
          console.log(`⏳ Attempt ${attempts + 1}: Resource not ready`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        attempts++;
      }
      
      results.trimmedVideo = {
        publicId: trimmedId,
        duration: trimmedResource?.duration,
        width: trimmedResource?.width,
        height: trimmedResource?.height,
        hasValidMetadata: !!(trimmedResource?.duration && trimmedResource?.width && trimmedResource?.height),
        status: trimmedResource?.status || 'unknown',
        uploadSuccess: !!uploadResult.public_id
      };
      
      console.log('✅ Trimmed video result:', results.trimmedVideo);
      
      if (!results.trimmedVideo.hasValidMetadata) {
        results.issues.push('Trimmed video has incomplete metadata - THIS IS THE MAIN ISSUE');
      }
      
      // Clean up
      try {
        await cloudinary.uploader.destroy(trimmedId, { resource_type: 'video' });
        console.log('🧹 Test video cleaned up');
      } catch (cleanupError) {
        console.warn('⚠️ Cleanup warning:', cleanupError.message);
      }
      
    } catch (error) {
      results.issues.push(`Trimmed video creation failed: ${error.message}`);
      console.error('❌ TEST 3 FAILED:', error.message);
    }
    
    // TEST 4: Test simple concatenation syntax
    console.log('🔍 TEST 4: Testing concatenation syntax...');
    try {
      // Test with the same video concatenated with itself
      const videoId = testVideoId.replace(/\//g, ':');
      
      const concatTransformations = [
        'w_1280,h_720,c_pad',
        `l_video:${videoId},w_1280,h_720,c_pad`,
        'fl_splice',
        'q_auto'
      ].join('/');
      
      const concatUrl = `https://res.cloudinary.com/dsxrmo3kt/video/upload/${concatTransformations}/${testVideoId}.mp4`;
      
      const concatTest = await fetch(concatUrl, { method: 'HEAD' });
      
      results.concatenationTest = {
        url: concatUrl,
        transformations: concatTransformations,
        status: concatTest.status,
        works: concatTest.ok,
        statusText: concatTest.statusText
      };
      
      console.log('🔗 Concatenation test:', results.concatenationTest);
      
      if (!concatTest.ok) {
        results.issues.push(`Concatenation syntax failed: ${concatTest.status} ${concatTest.statusText}`);
      }
      
    } catch (error) {
      results.issues.push(`Concatenation test error: ${error.message}`);
      console.error('❌ TEST 4 FAILED:', error.message);
    }
    
    // SUMMARY
    console.log('🏁 === DIAGNOSTIC TEST COMPLETE ===');
    console.log('📋 Issues found:', results.issues);
    
    const summary = {
      mainIssue: results.issues.find(issue => issue.includes('THIS IS THE MAIN ISSUE')),
      recommendedSolution: results.issues.length > 0 ? 
        'Use direct concatenation approach to avoid metadata issues' : 
        'All tests passed - issue may be elsewhere',
      allTestsPassed: results.issues.length === 0
    };
    
    return new Response(
      JSON.stringify({ 
        success: true,
        results,
        summary,
        issues: results.issues
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (error) {
    console.error('❌ DIAGNOSTIC TEST FAILED:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        message: 'Diagnostic test failed'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

/* 
USAGE:
POST to /test-video-processing with:
{
  "testVideoId": "your_test_video_public_id",
  "targetDuration": 5
}

This will test each step and tell you exactly where the problem is.
*/