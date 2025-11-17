/**
 * HTTP Handler for Health Endpoints
 * 
 * This module provides HTTP request handlers for health endpoints
 * that can be used with any HTTP server framework.
 * 
 * Note: LangGraph CLI server may not support custom middleware.
 * This is provided as a reference for custom server implementations.
 */

import { healthEndpoints } from './health-endpoints';

// Generic HTTP request/response interfaces
interface HTTPRequest {
  method: string;
  url: string;
  path?: string;
}

interface HTTPResponse {
  status(code: number): HTTPResponse;
  setHeader(name: string, value: string): HTTPResponse;
  send(data: string): void;
  json(data: any): void;
}

/**
 * Health endpoint handler for generic HTTP servers
 */
export async function handleHealthRequest(req: HTTPRequest, res: HTTPResponse): Promise<boolean> {
  const path = req.path || new URL(req.url, 'http://localhost').pathname;
  const { method } = req;

  // Only handle GET requests for health endpoints
  if (method !== 'GET') {
    return false; // Not handled
  }

  try {
    let response: Response | undefined;

    switch (path) {
      case '/ok':
        response = await healthEndpoints.ok();
        break;
      case '/health':
        response = await healthEndpoints.health();
        break;
      case '/health/fastmcp':
        response = await healthEndpoints.fastmcp();
        break;
      default:
        return false; // Not a health endpoint
    }

    if (response) {
      // Convert our Response object to generic HTTP response
      const body = await response.text();
      const headers = Object.fromEntries(response.headers.entries());
      
      res.status(response.status);
      
      // Set headers
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      
      res.send(body);
      return true; // Handled
    }
  } catch (error) {
    console.error('Health endpoint error:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : 'Unknown error',
      service: 'shopping-assistant-agents',
    });
    return true; // Handled (even if with error)
  }

  return false; // Not handled
}

/**
 * Individual health endpoint handlers
 */
export const healthHandlers = {
  /**
   * GET /ok - Simple health check
   */
  async ok(): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    try {
      const response = await healthEndpoints.ok();
      const body = await response.text();
      const headers = Object.fromEntries(response.headers.entries());
      
      return {
        status: response.status,
        headers,
        body
      };
    } catch (error) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: error instanceof Error ? error.message : 'Health check failed'
        })
      };
    }
  },

  /**
   * GET /health - Comprehensive health check
   */
  async health(): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    try {
      const response = await healthEndpoints.health();
      const body = await response.text();
      const headers = Object.fromEntries(response.headers.entries());
      
      return {
        status: response.status,
        headers,
        body
      };
    } catch (error) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: error instanceof Error ? error.message : 'Health check failed'
        })
      };
    }
  },

  /**
   * GET /health/fastmcp - FastMCP compatible health check
   */
  async fastmcp(): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    try {
      const response = await healthEndpoints.fastmcp();
      const body = await response.text();
      const headers = Object.fromEntries(response.headers.entries());
      
      return {
        status: response.status,
        headers,
        body
      };
    } catch (error) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: error instanceof Error ? error.message : 'Health check failed'
        })
      };
    }
  },
};

/**
 * Example usage with Node.js HTTP server:
 * 
 * import http from 'http';
 * import { handleHealthRequest } from './health-middleware';
 * 
 * const server = http.createServer(async (req, res) => {
 *   const handled = await handleHealthRequest(req, res);
 *   
 *   if (!handled) {
 *     // Handle other routes
 *     res.status(404).json({ error: 'Not found' });
 *   }
 * });
 * 
 * server.listen(3000, () => {
 *   console.log('Server with health endpoints running on port 3000');
 * });
 */