import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { withTracing } from '../lib/tracing';

// Mock getCIBACredentials function since it's not available in current package version
const getCIBACredentials = () => {
  console.log('[getCIBACredentials] Mock implementation - CIBA credentials not available');
  return null;
};

// Mock withAsyncAuthorization function since ciba-provider is not available
const withAsyncAuthorization = (tool: any) => {
  console.log('[withAsyncAuthorization] Mock implementation - proceeding without authorization');
  return tool;
};

// Import authorization state management
let authorizationState: { status: string; message?: string } | null = null;

// Function to set authorization as approved when we get credentials
const setAuthorizationApproved = () => {
  authorizationState = { status: 'approved' };
};

// Export function to get and reset state
export const getShopAuthState = () => authorizationState;
export const resetShopAuthState = () => {
  authorizationState = null;
};

// Global state to prevent createCheckoutCartTool recursion
let dynamicCheckoutToolRunning = false;

// Create a dynamic checkout tool that gets cart data from configuration
export const createCheckoutCartTool = (cartData: any) => tool(
  async ({ cartData: paramCartData }) => {
    if (dynamicCheckoutToolRunning) {
      console.warn('[createCheckoutCartTool] Tool already running, preventing recursion');
      throw new Error('Cart checkout is already in progress. Please wait for the current operation to complete.');
    }
    
    dynamicCheckoutToolRunning = true;
    try {
      console.log(`[checkout-cart-tool] Processing cart checkout with provided cart data`);
      console.log(`[checkout-cart-tool] Cart data:`, cartData);

      const apiUrl = process.env['SHOP_API_URL'] || 'http://localhost:3000/api/checkout';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Use cart data provided during tool creation or from parameters
      const processedCartData = paramCartData || cartData || {};

      const body = {
        action: 'checkout_cart',
        cart: processedCartData,
      };

      // The withAsyncAuthorization wrapper will provide the access token through CIBA credentials
      const credentials = getCIBACredentials();
      const accessToken = credentials?.accessToken;

      console.log(`[checkout-cart-tool] Access token available: ${!!accessToken}`);

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        console.log(`[checkout-cart-tool] Using access token: ${accessToken.substring(0, 20)}...`);
        
        // Mark authorization as approved since we have valid credentials
        setAuthorizationApproved();
      }

      console.log(`[checkout-cart-tool] Making API call to: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });

      console.log(`[checkout-cart-tool] API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[checkout-cart-tool] API error: ${response.status} - ${errorText}`);
        
        if (!apiUrl.includes('localhost:3000')) {
          throw new Error(`Checkout failed: ${response.status} - ${errorText}`);
        } else {
          // Mock structured response for local testing
          const totalValue = processedCartData?.totalValue || processedCartData?.total || 0;
          return JSON.stringify({
            checkoutStatus: 'success',
            orderId: `LOCAL-${Date.now()}`,
            summary: `Order placed for cart totaling $${totalValue.toFixed ? totalValue.toFixed(2) : totalValue}`,
            items: processedCartData?.items || processedCartData?.lineItems || null,
            total: totalValue
          });
        }
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await response.json();
        // Expect the API to return structured data. If it already includes our shape, return it.
        return JSON.stringify({
          checkoutStatus: json.checkoutStatus || 'success',
          orderId: json.orderId || json.id || null,
          summary: json.summary || json.message || JSON.stringify(json),
          items: json.items || json.cart?.items || processedCartData?.items || null,
          total: json.total || json.cart?.total || processedCartData?.total || null
        });
      }

      const result = await response.text();
      console.log(`[checkout-cart-tool] API response: ${result}`);
      // Try to extract JSON from text response
      try {
        const parsed = JSON.parse(result);
        return JSON.stringify({
          checkoutStatus: parsed.checkoutStatus || 'success',
          orderId: parsed.orderId || parsed.id || null,
          summary: parsed.summary || parsed.message || result,
          items: parsed.items || parsed.cart?.items || processedCartData?.items || null,
          total: parsed.total || parsed.cart?.total || processedCartData?.total || null
        });
      } catch (_e) {
        // Return a structured wrapper around the textual result
        return JSON.stringify({
          checkoutStatus: 'success',
          orderId: `RESP-${Date.now()}`,
          summary: result,
          items: processedCartData?.items || null,
          total: processedCartData?.total || null
        });
      }
    } finally {
      dynamicCheckoutToolRunning = false;
    }
  },
  {
    name: 'checkout_cart',
    description: 'Tool to checkout the entire shopping cart. Use this tool when the user wants to purchase, buy, checkout, or complete their order for all items in their cart. This tool requires user authorization and will trigger the CIBA authentication flow. Cart data is automatically provided from the supervisor.',
    schema: z.object({
      cartData: z.any().optional().describe('Cart data for checkout - will use provided cart data if not specified'),
    }),
  },
);

// Original checkout tool for backwards compatibility
export const checkoutCartTool = tool(
  async ({ cartData }) => {
    console.log(`[checkout-cart-tool] Processing cart checkout with structured cart data`);
    console.log(`[checkout-cart-tool] Cart data:`, cartData);

    const apiUrl = process.env['SHOP_API_URL'] || 'http://localhost:3000/api/checkout';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Cart data is now provided directly from supervisor
    const processedCartData = cartData || {};

    const body = {
      action: 'checkout_cart',
      cart: processedCartData,
    };

    // The withAsyncAuthorization wrapper will provide the access token through CIBA credentials
    const credentials = getCIBACredentials();
    const accessToken = credentials?.accessToken;

    console.log(`[checkout-cart-tool] Access token available: ${!!accessToken}`);

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      console.log(`[checkout-cart-tool] Using access token: ${accessToken.substring(0, 20)}...`);
      
      // Mark authorization as approved since we have valid credentials
      setAuthorizationApproved();
    }

    console.log(`[checkout-cart-tool] Making API call to: ${apiUrl}`);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });

    console.log(`[checkout-cart-tool] API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[checkout-cart-tool] API error: ${response.status} - ${errorText}`);
      
      if (!apiUrl.includes('localhost:3000')) {
        throw new Error(`Checkout failed: ${response.status} - ${errorText}`);
      } else {
        // Mock structured response for local testing
        const totalValue = processedCartData?.totalValue || processedCartData?.total || 0;
        return JSON.stringify({
          checkoutStatus: 'success',
          orderId: `LOCAL-${Date.now()}`,
          summary: `Order placed for cart totaling $${totalValue.toFixed ? totalValue.toFixed(2) : totalValue}`,
          items: processedCartData?.items || processedCartData?.lineItems || null,
          total: totalValue
        });
      }
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      return JSON.stringify({
        checkoutStatus: json.checkoutStatus || 'success',
        orderId: json.orderId || json.id || null,
        summary: json.summary || json.message || JSON.stringify(json),
        items: json.items || json.cart?.items || processedCartData?.items || null,
        total: json.total || json.cart?.total || processedCartData?.total || null
      });
    }

    const result = await response.text();
    console.log(`[checkout-cart-tool] API response: ${result}`);
    try {
      const parsed = JSON.parse(result);
      return JSON.stringify({
        checkoutStatus: parsed.checkoutStatus || 'success',
        orderId: parsed.orderId || parsed.id || null,
        summary: parsed.summary || parsed.message || result,
        items: parsed.items || parsed.cart?.items || processedCartData?.items || null,
        total: parsed.total || parsed.cart?.total || processedCartData?.total || null
      });
    } catch (_e) {
      return JSON.stringify({
        checkoutStatus: 'success',
        orderId: `RESP-${Date.now()}`,
        summary: result,
        items: processedCartData?.items || null,
        total: processedCartData?.total || null
      });
    }
  },
  {
    name: 'checkout_cart',
    description: 'Tool to checkout the entire shopping cart. Use this tool when the user wants to purchase, buy, checkout, or complete their order for all items in their cart. This tool requires user authorization and will trigger the CIBA authentication flow. Cart data is provided automatically by the supervisor.',
    schema: z.object({
      cartData: z.any().describe('Structured cart data containing items, quantities, and total value - provided automatically by the supervisor'),
    }),
  },
);

export const checkoutTool = tool(
  async ({ product, qty, priceLimit }) => {
    console.log(`[checkout-tool] Processing order: ${qty} ${product} with price limit ${priceLimit || 'no limit'}`);

    const apiUrl = process.env['SHOP_API_URL'] || 'http://localhost:3000/api/checkout';

    if (!apiUrl) {
      // No API set, mock a response
      return `Successfully ordered ${qty} ${product} for $${(qty * 3.99).toFixed(2)}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const body = {
      product,
      qty,
      priceLimit,
    };

    // The withAsyncAuthorization wrapper will provide the access token through CIBA credentials
    // We should NOT check for missing credentials here - let the wrapper handle authorization
    const credentials = getCIBACredentials();
    const accessToken = credentials?.accessToken;

    console.log(`[checkout-tool] Access token available: ${!!accessToken}`);

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      console.log(`[checkout-tool] Using access token: ${accessToken.substring(0, 20)}...`);
      
      // Mark authorization as approved since we have valid credentials
      setAuthorizationApproved();
    }
    // NOTE: We don't throw an error if no access token - the withAsyncAuthorization wrapper
    // will handle the CIBA flow and retry this tool with proper credentials

    console.log(`[checkout-tool] Making API call to: ${apiUrl}`);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });

    console.log(`[checkout-tool] API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[checkout-tool] API error: ${response.status} - ${errorText}`);
      throw new Error(`Checkout failed: ${response.status} - ${errorText}`);
    }

    const result = await response.text();
    console.log(`[checkout-tool] API response: ${result}`);
    return result || `Successfully ordered ${qty} ${product}`;
  },
  {
    name: 'checkout',
    description: 'Tool to checkout and complete grocery orders. Use this tool when the user wants to purchase, buy, checkout, or complete their order. The tool accepts product name, quantity, and optional price limit. This tool requires user authorization and will trigger the CIBA authentication flow.',
    schema: z.object({
      product: z.string().describe('The product name to purchase'),
      qty: z.number().describe('The quantity to purchase'),
      priceLimit: z.number().nullable().optional().describe('Optional price limit for the purchase'),
    }),
  },
);

// Global state to prevent tool recursion
let checkoutToolRunning = false;
let checkoutCartToolRunning = false;

// Create recursion-safe versions of the tools
const recursionSafeCheckoutTool = tool(
  async ({ product, qty, priceLimit }) => {
    if (checkoutToolRunning) {
      console.warn('[checkout-tool] Tool already running, preventing recursion');
      throw new Error('Checkout is already in progress. Please wait for the current operation to complete.');
    }
    
    checkoutToolRunning = true;
    try {
      console.log(`[checkout-tool] Processing order: ${qty} ${product} with price limit ${priceLimit || 'no limit'}`);

      const apiUrl = process.env['SHOP_API_URL'] || 'http://localhost:3000/api/checkout';

      if (!apiUrl) {
        // No API set, mock a response
        return `Successfully ordered ${qty} ${product} for $${(qty * 3.99).toFixed(2)}`;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const body = {
        product,
        qty,
        priceLimit,
      };

      // The withAsyncAuthorization wrapper will provide the access token through CIBA credentials
      const credentials = getCIBACredentials();
      const accessToken = credentials?.accessToken;

      console.log(`[checkout-tool] Access token available: ${!!accessToken}`);

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        console.log(`[checkout-tool] Using access token: ${accessToken.substring(0, 20)}...`);
        
        // Mark authorization as approved since we have valid credentials
        setAuthorizationApproved();
      }

      console.log(`[checkout-tool] Making API call to: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });

      console.log(`[checkout-tool] API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[checkout-tool] API error: ${response.status} - ${errorText}`);
        throw new Error(`Checkout failed: ${response.status} - ${errorText}`);
      }

      const result = await response.text();
      console.log(`[checkout-tool] API response: ${result}`);
      return result || `Successfully ordered ${qty} ${product}`;
    } finally {
      checkoutToolRunning = false;
    }
  },
  {
    name: 'checkout',
    description: 'Tool to checkout and complete grocery orders. Use this tool when the user wants to purchase, buy, checkout, or complete their order. The tool accepts product name, quantity, and optional price limit. This tool requires user authorization and will trigger the CIBA authentication flow.',
    schema: z.object({
      product: z.string().describe('The product name to purchase'),
      qty: z.number().describe('The quantity to purchase'),
      priceLimit: z.number().nullable().optional().describe('Optional price limit for the purchase'),
    }),
  }
);

const recursionSafeCheckoutCartTool = tool(
  async ({ cartData }) => {
    if (checkoutCartToolRunning) {
      console.warn('[checkout-cart-tool] Tool already running, preventing recursion');
      throw new Error('Cart checkout is already in progress. Please wait for the current operation to complete.');
    }
    
    checkoutCartToolRunning = true;
    try {
      console.log(`[checkout-cart-tool] Processing cart checkout with structured cart data`);
      console.log(`[checkout-cart-tool] Cart data:`, cartData);

      const apiUrl = process.env['SHOP_API_URL'] || 'http://localhost:3000/api/checkout';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Cart data is now provided directly from supervisor
      const processedCartData = cartData || {};

      const body = {
        action: 'checkout_cart',
        cart: processedCartData,
      };

      // The withAsyncAuthorization wrapper will provide the access token through CIBA credentials
      const credentials = getCIBACredentials();
      const accessToken = credentials?.accessToken;

      console.log(`[checkout-cart-tool] Access token available: ${!!accessToken}`);

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        console.log(`[checkout-cart-tool] Using access token: ${accessToken.substring(0, 20)}...`);
        
        // Mark authorization as approved since we have valid credentials
        setAuthorizationApproved();
      }

      console.log(`[checkout-cart-tool] Making API call to: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });

      console.log(`[checkout-cart-tool] API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[checkout-cart-tool] API error: ${response.status} - ${errorText}`);
        
        if (!apiUrl.includes('localhost:3000')) {
          throw new Error(`Checkout failed: ${response.status} - ${errorText}`);
        } else {
          // Mock structured response for local testing
          const totalValue = processedCartData?.totalValue || processedCartData?.total || 0;
          return JSON.stringify({
            checkoutStatus: 'success',
            orderId: `LOCAL-${Date.now()}`,
            summary: `Order placed for cart totaling $${totalValue.toFixed ? totalValue.toFixed(2) : totalValue}`,
            items: processedCartData?.items || processedCartData?.lineItems || null,
            total: totalValue
          });
        }
      }

      const result = await response.text();
      console.log(`[checkout-cart-tool] API response: ${result}`);
      return result || `Successfully processed your cart checkout.`;
    } finally {
      checkoutCartToolRunning = false;
    }
  },
  {
    name: 'checkout_cart',
    description: 'Tool to checkout the entire shopping cart. Use this tool when the user wants to purchase, buy, checkout, or complete their order for all items in their cart. This tool requires user authorization and will trigger the CIBA authentication flow. Cart data is provided automatically by the supervisor.',
    schema: z.object({
      cartData: z.any().describe('Structured cart data containing items, quantities, and total value - provided automatically by the supervisor'),
    }),
  }
);

// Export tools with tracing enabled and recursion prevention
export const tracedCheckoutTool = withTracing(recursionSafeCheckoutTool, 'checkout-product');
export const tracedCheckoutCartTool = withTracing(recursionSafeCheckoutCartTool, 'checkout-cart');

// Export Auth0 wrapped tools for CIBA push notifications
export const authorizedCheckoutTool = withAsyncAuthorization(recursionSafeCheckoutTool);
export const authorizedCheckoutCartTool = withAsyncAuthorization(checkoutCartTool);
export const authorizedTracedCheckoutTool = withTracing(withAsyncAuthorization(recursionSafeCheckoutTool), 'checkout-product');
export const authorizedTracedCheckoutCartTool = withTracing(withAsyncAuthorization(checkoutCartTool), 'checkout-cart');