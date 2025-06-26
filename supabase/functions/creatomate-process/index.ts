
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  'Access-Control-Max-Age': '86400',
};

// Creatomate API configuration
const CREATOMATE_API_KEY = Deno.env.get('CREATOMATE_API_KEY');

if (!CREATOMATE_API_KEY) {
  throw new Error('Missing CREATOMATE_API_KEY. Please set it in the Supabase edge function secrets.');
}

const CREATOMATE_API_BASE = 'https://api.creatomate.com/v1';

// Simple logging
function debugLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(`[${timestamp}] Data:`, JSON.stringify(data, null, 2));
  }
}

// Platform dimensions configuration
function getPlatformDimensions(platform: string) {
  switch (platform?.toLowerCase()) {
    case 'youtube':
      return { width: 1920, height: 1080 };
    case 'facebook':
      return { width: 1080, height: 1080 };
    case 'instagram':
    case 'instagram_story':
    case 'tiktok':
      return { width: 1080, height: 1920 };
    case 'instagram_post':
      return { width: 1080, height: 1080 };
    default:
      return { width: 1920, height: 1080 };
  }
}

// Create dynamic template for video processing
function createDynamicTemplate(videos: any[], platformConfig: any, customization: any, targetDuration: number) {
  const template = {
    output_format: 'mp4',
    width: platformConfig.width,
    height: platformConfig.height,
    duration: targetDuration,
    frame_rate: 30,
    elements: []
  };

  // Calculate timing for each video segment
  const totalOriginalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
  let currentTime = 0;

  // Add video segments with proportional trimming
  videos.forEach((video, index) => {
    const proportionalDuration = (video.duration / totalOriginalDuration) * targetDuration;
    
    template.elements.push({
      type: 'video',
      source: video.file_url,
      x: '50%',
      y: '50%',
      width: '100%',
      height: '100%',
      time: currentTime,
      duration: proportionalDuration,
      fit: 'cover',
      volume: 1
    });

    currentTime += proportionalDuration;
  });

  // Add text overlay (supers) for first 7 seconds
  if (customization?.supers?.text) {
    const { text, position, style } = customization.supers;
    const fontSize = Math.min(platformConfig.width, platformConfig.height) * 0.06;
    
    let yPosition = '50%';
    if (position === 'top') yPosition = '15%';
    else if (position === 'bottom') yPosition = '85%';
    
    template.elements.push({
      type: 'text',
      text: text,
      x: '50%',
      y: yPosition,
      width: '80%',
      height: 'auto',
      time: 0,
      duration: Math.min(7, targetDuration),
      font_family: 'Arial Black',
      font_size: Math.round(fontSize),
      font_weight: style === 'bold' ? 'bold' : 'normal',
      fill_color: '#ffffff',
      stroke_color: '#000000',
      stroke_width: 2,
      align: 'center',
      vertical_align: 'middle'
    });
  }

  // Add end frame elements for last 3 seconds
  const endFrameStart = Math.max(targetDuration - 3, 0);
  if (customization?.endFrame?.enabled && endFrameStart < targetDuration) {
    const endFrameDuration = targetDuration - endFrameStart;
    
    // Add logo placeholder
    if (customization.endFrame.logoPosition === 'center') {
      template.elements.push({
        type: 'text',
        text: 'LOGO',
        x: '50%',
        y: '40%',
        width: 'auto',
        height: 'auto',
        time: endFrameStart,
        duration: endFrameDuration,
        font_family: 'Arial Black',
        font_size: Math.round(platformConfig.width * 0.08),
        font_weight: 'bold',
        fill_color: '#ffffff',
        stroke_color: '#000000',
        stroke_width: 2,
        align: 'center',
        vertical_align: 'middle'
      });
    }
    
    // Add end frame text
    if (customization.endFrame.text) {
      template.elements.push({
        type: 'text',
        text: customization.endFrame.text,
        x: '50%',
        y: customization.endFrame.logoPosition === 'center' ? '60%' : '50%',
        width: '80%',
        height: 'auto',
        time: endFrameStart,
        duration: endFrameDuration,
        font_family: 'Arial',
        font_size: Math.round(platformConfig.width * 0.05),
        font_weight: 'bold',
        fill_color: '#ffffff',
        stroke_color: '#000000',
        stroke_width: 1,
        align: 'center',
        vertical_align: 'middle'
      });
    }
  }

  // Add CTA for last 3 seconds
  if (customization?.cta?.enabled && customization?.cta?.text && endFrameStart < targetDuration) {
    const endFrameDuration = targetDuration - endFrameStart;
    let ctaText = customization.cta.text;
    
    if (customization.cta.style === 'button') {
      ctaText = `[${customization.cta.text}]`;
    } else if (customization.cta.style === 'animated') {
      ctaText = `✨ ${customization.cta.text} ✨`;
    }
    
    template.elements.push({
      type: 'text',
      text: ctaText,
      x: '50%',
      y: '85%',
      width: '80%',
      height: 'auto',
      time: endFrameStart,
      duration: endFrameDuration,
      font_family: 'Arial',
      font_size: Math.round(platformConfig.width * 0.04),
      font_weight: 'bold',
      fill_color: '#ffffff',
      stroke_color: '#000000',
      stroke_width: 1,
      align: 'center',
      vertical_align: 'middle'
    });
  }

  return template;
}

// Create render using Creatomate API
async function createRender(template: any): Promise<string> {
  try {
    debugLog('Creating render with Creatomate API', { 
      templateWidth: template.width,
      templateHeight: template.height,
      templateDuration: template.duration,
      elementsCount: template.elements.length 
    });
    
    // Use the correct Creatomate API structure
    const requestBody = {
      template_id: null, // We're using a custom template, not a pre-made one
      template: template, // Pass the full template object
      webhook_url: null
    };
    
    debugLog('Sending request to Creatomate', { 
      url: `${CREATOMATE_API_BASE}/renders`,
      bodyKeys: Object.keys(requestBody)
    });
    
    const response = await fetch(`${CREATOMATE_API_BASE}/renders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CREATOMATE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    debugLog(`API Response status: ${response.status}`, { 
      ok: response.ok,
      statusText: response.statusText 
    });

    if (!response.ok) {
      const errorText = await response.text();
      debugLog(`❌ Render creation failed with status ${response.status}`, { 
        error: errorText,
        headers: Object.fromEntries(response.headers.entries())
      });
      throw new Error(`Failed to create render: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    debugLog(`✅ API Response received`, { 
      hasId: !!result.id,
      status: result.status,
      resultKeys: Object.keys(result)
    });
    
    if (!result.id) {
      debugLog('❌ No render ID in response', { fullResponse: result });
      throw new Error('Render creation succeeded but no ID was returned');
    }
    
    debugLog(`✅ Render created successfully with ID: ${result.id}`);
    return result.id;
    
  } catch (error) {
    debugLog(`❌ Render creation failed:`, { 
      message: error.message,
      stack: error.stack 
    });
    throw error;
  }
}

// Poll render status until completion
async function waitForRenderCompletion(renderId: string): Promise<string> {
  const maxAttempts = 60; // 5 minutes max wait time
  const pollInterval = 5000; // 5 seconds

  debugLog(`Starting render polling for ID: ${renderId}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      debugLog(`Polling attempt ${attempt}/${maxAttempts} for render ${renderId}`);
      
      const response = await fetch(`${CREATOMATE_API_BASE}/renders/${renderId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CREATOMATE_API_KEY}`,
          'Content-Type': 'application/json',
        }
      });

      debugLog(`Status check response: ${response.status}`, { 
        ok: response.ok,
        statusText: response.statusText
      });

      if (!response.ok) {
        const errorText = await response.text();
        debugLog(`❌ Status check failed`, { 
          status: response.status,
          error: errorText 
        });
        
        if (response.status === 404) {
          throw new Error(`Render not found (ID: ${renderId}). The render may have expired or been deleted.`);
        }
        
        if (response.status === 401) {
          throw new Error(`Authentication failed. Please check your Creatomate API key.`);
        }
        
        throw new Error(`Failed to check render status: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      debugLog(`Render status update:`, { 
        status: result.status, 
        progress: result.progress,
        hasUrl: !!result.url,
        hasError: !!result.error,
        attempt: `${attempt}/${maxAttempts}`
      });

      if (result.status === 'succeeded') {
        if (!result.url) {
          throw new Error('Render succeeded but no URL was provided');
        }
        debugLog(`✅ Render completed successfully`, { url: result.url });
        return result.url;
      } else if (result.status === 'failed') {
        const errorMsg = result.error || result.failure_reason || 'Unknown render failure';
        debugLog(`❌ Render failed`, { error: errorMsg, renderId });
        throw new Error(`Render failed: ${errorMsg}`);
      } else {
        // Still processing - continue polling
        debugLog(`🔄 Render still processing`, { 
          status: result.status, 
          progress: result.progress || 'unknown'
        });
      }

      // Wait before next poll
      if (attempt < maxAttempts) {
        debugLog(`⏳ Waiting ${pollInterval}ms before next check...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      
    } catch (error) {
      debugLog(`❌ Error during status check attempt ${attempt}:`, { 
        message: error.message,
        isLastAttempt: attempt === maxAttempts 
      });
      
      if (attempt === maxAttempts) {
        throw new Error(`Render status check failed after ${maxAttempts} attempts: ${error.message}`);
      }
      
      // Wait before retrying on error
      debugLog(`⏳ Waiting ${pollInterval}ms before retry due to error...`);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(`Render timed out after ${maxAttempts} attempts (${(maxAttempts * pollInterval / 1000 / 60).toFixed(1)} minutes)`);
}

serve(async (req) => {
  debugLog('🚀 Creatomate edge function called', { method: req.method, url: req.url });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    debugLog('📋 Handling CORS preflight request');
    return new Response('ok', { 
      headers: corsHeaders,
      status: 200
    });
  }

  if (req.method !== 'POST') {
    debugLog('❌ Method not allowed:', req.method);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Method not allowed' 
    }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const requestBody = await req.json();
    debugLog('📨 Request body received', { 
      hasVideos: !!requestBody.videos,
      videoCount: requestBody.videos?.length,
      platform: requestBody.platform,
      targetDuration: requestBody.targetDuration
    });

    const { videos, targetDuration, platform, customization } = requestBody;

    if (!videos?.length || !targetDuration || !platform) {
      const errorMsg = 'Invalid request: `videos`, `targetDuration`, and `platform` are required.';
      debugLog('❌ Validation failed:', errorMsg);
      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMsg 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    debugLog("🚀 PROCESSING START WITH CREATOMATE", { 
      videoCount: videos.length, 
      targetDuration, 
      platform, 
      hasCustomization: !!customization 
    });
    
    const platformConfig = getPlatformDimensions(platform);
    debugLog("📐 Platform configuration", { platform, config: platformConfig });

    // ====================================================================
    // PHASE 1: Create dynamic template
    // ====================================================================
    debugLog("--- PHASE 1: Creating dynamic template ---");
    const template = createDynamicTemplate(videos, platformConfig, customization, targetDuration);
    debugLog("--- PHASE 1 COMPLETE ---", { elementsCount: template.elements.length });

    // ====================================================================
    // PHASE 2: Create render
    // ====================================================================
    debugLog("--- PHASE 2: Creating render ---");
    const renderId = await createRender(template);
    debugLog("--- PHASE 2 COMPLETE ---", { renderId });

    // ====================================================================
    // PHASE 3: Wait for render completion
    // ====================================================================
    debugLog("--- PHASE 3: Waiting for render completion ---");
    const finalVideoUrl = await waitForRenderCompletion(renderId);
    debugLog("--- PHASE 3 COMPLETE ---", { finalVideoUrl });

    // ====================================================================
    // FINAL RESPONSE
    // ====================================================================
    debugLog("🎉 SUCCESS: Returning final response", { finalUrl: finalVideoUrl });
    return new Response(JSON.stringify({ success: true, url: finalVideoUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    debugLog("❌ FATAL ERROR", { 
      message: error.message, 
      stack: error.stack,
      name: error.name 
    });
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      details: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
