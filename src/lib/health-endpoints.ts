/**
 * Health endpoint implementation for LangGraph server
 * 
 * Provides both simple /ok endpoint for basic monitoring
 * and comprehensive /health endpoint for FastMCP integration
 */

import { performHealthCheck, simpleHealthCheck, fastMCPHealthCheck } from '../lib/health-check';

// Simple health endpoint handler
export async function handleOkEndpoint(): Promise<Response> {
  const healthData = simpleHealthCheck();
  
  return new Response(JSON.stringify(healthData), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
}

// Comprehensive health endpoint handler
export async function handleHealthEndpoint(): Promise<Response> {
  try {
    const healthData = await performHealthCheck();
    
    // Determine HTTP status code based on health status
    let statusCode = 200;
    if (healthData.status === 'degraded') {
      statusCode = 200; // Still responding, but with warnings
    } else if (healthData.status === 'unhealthy') {
      statusCode = 503; // Service unavailable
    }
    
    return new Response(JSON.stringify(healthData, null, 2), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    const errorResponse = {
      status: 'unhealthy',
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : 'Unknown error',
      service: 'shopping-assistant-agents',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  }
}

// FastMCP-compatible health endpoint handler
export async function handleFastMCPHealthEndpoint(): Promise<Response> {
  try {
    const healthData = await fastMCPHealthCheck();
    
    // Determine HTTP status code based on health status
    let statusCode = 200;
    if (healthData.status === 'degraded') {
      statusCode = 200;
    } else if (healthData.status === 'unhealthy') {
      statusCode = 503;
    }
    
    return new Response(JSON.stringify(healthData, null, 2), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Service-Name': 'shopping-assistant-agents',
        'X-Health-Check-Version': '1.0.0',
      },
    });
  } catch (error) {
    const errorResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      service: 'shopping-assistant-agents',
      version: '1.0.0',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  }
}

// Export handlers for different health check formats
export const healthEndpoints = {
  ok: handleOkEndpoint,
  health: handleHealthEndpoint,
  fastmcp: handleFastMCPHealthEndpoint,
};