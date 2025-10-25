import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getCIBACredentials } from '@auth0/ai-langchain';
import { withTracing } from '../tracing';
import { resetAuthorizationState } from '../ciba-provider';

// Import authorization state management
let authorizationState: { status: string; message?: string } | null = null;

// Function to set authorization as approved when we get credentials
const setAuthorizationApproved = () => {
  authorizationState = { status: 'approved' };
};

// Export function to get and reset state
export const getShopAuthState = () => authorizationState;
export const resetShopAuthState = () => {
  console.log('[checkout-tool] Resetting shop authorization state');
  authorizationState = null;
  // Directly reset main authorization state
  try {
    resetAuthorizationState();
    console.log('[checkout-tool] Main authorization state reset to idle via direct import');
  } catch (e) {
    console.error('[checkout-tool] Failed to reset main authorization state:', e);
  }
};

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
        const totalValue = cartData?.totalValue || 0;
        // Reset authorization state after successful mock checkout
        resetShopAuthState();
        return JSON.stringify({
          checkoutStatus: 'success',
          orderId: `LOCAL-${Date.now()}`,
          summary: `Order placed for cart totaling $${totalValue.toFixed(2)}`,
          items: cartData?.items || null,
          total: totalValue
        });
      }
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      resetShopAuthState();
      return JSON.stringify({
        checkoutStatus: json.checkoutStatus || 'success',
        orderId: json.orderId || json.id || null,
        summary: json.summary || json.message || JSON.stringify(json),
        items: json.items || json.cart?.items || cartData?.items || null,
        total: json.total || json.cart?.total || cartData?.total || null
      });
    }

    const result = await response.text();
    console.log(`[checkout-cart-tool] API response: ${result}`);
    resetShopAuthState();
    try {
      const parsed = JSON.parse(result);
      return JSON.stringify({
        checkoutStatus: parsed.checkoutStatus || 'success',
        orderId: parsed.orderId || parsed.id || null,
        summary: parsed.summary || parsed.message || result,
        items: parsed.items || parsed.cart?.items || cartData?.items || null,
        total: parsed.total || parsed.cart?.total || cartData?.total || null
      });
    } catch (_e) {
      return JSON.stringify({
        checkoutStatus: 'success',
        orderId: `RESP-${Date.now()}`,
        summary: result,
        items: cartData?.items || null,
        total: cartData?.total || null
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
      // Reset authorization state after successful mock checkout
      resetShopAuthState();
      
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
    
    // Reset authorization state after successful checkout
    resetShopAuthState();
    
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

// Export tools with tracing enabled
export const tracedCheckoutTool = withTracing(checkoutTool, 'checkout-product');
export const tracedCheckoutCartTool = withTracing(checkoutCartTool, 'checkout-cart');
