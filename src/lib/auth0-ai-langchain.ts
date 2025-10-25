import { Auth0AI, getAccessTokenForConnection } from '@auth0/ai-langchain';
import { AccessDeniedInterrupt } from '@auth0/ai/interrupts';
import { traceAuthorizationEvent } from './tracing';

// Get the access token for a connection via Auth0
export const getAccessToken = async () => getAccessTokenForConnection();

const auth0AI = new Auth0AI();

// Global state to track authorization status
export let authorizationState: {
  status: 'idle' | 'requested' | 'pending' | 'approved' | 'denied';
  message?: string;
} = { status: 'idle' };

export const getAuthorizationState = () => {
  // Check if tool has marked auth as approved
  try {
    const { getShopAuthState } = require('./tools/checkout-langchain');
    const shopState = getShopAuthState();
    if (shopState?.status === 'approved' && authorizationState.status === 'requested') {
      authorizationState.status = 'approved';
    }
  } catch (e) {
    // Ignore if shop tool not available
  }
  console.log('[auth0-ai] getAuthorizationState returning:', authorizationState.status);
  return authorizationState;
};

export const resetAuthorizationState = () => {
  console.log('[auth0-ai] resetAuthorizationState called - setting status to idle');
  authorizationState = { status: 'idle' };
};

// Function to be called when shop auth state changes to reset main auth state
export const notifyShopAuthReset = () => {
  console.log('[auth0-ai] Resetting authorization state to idle (called by shop tool)');
  authorizationState = { status: 'idle' };
};

// CIBA flow for user confirmation
export const withAsyncAuthorization = auth0AI.withAsyncUserConfirmation({
  userID: async (params, config) => {
    // Try multiple paths to get user ID
    let userId = config?.configurable?._credentials?.user?.sub;
    
    if (!userId && params?.cartData?.userId) {
      // Extract user ID from cart data if available
      userId = params.cartData.userId;
      console.log(`[Auth0] Extracted user ID from cartData: ${userId}`);
    }
    
    if (!userId && params?.userId) {
      // Extract user ID from parameters if available
      userId = params.userId;
      console.log(`[Auth0] Extracted user ID from params: ${userId}`);
    }
    
    if (!userId) {
      console.error('[Auth0] No user ID found in config or params:', { 
        configPath: config?.configurable?._credentials?.user?.sub,
        cartDataUserId: params?.cartData?.userId,
        paramsUserId: params?.userId 
      });
    }
    
    return userId;
  },
  bindingMessage: async (params) => {
    let message: string;
    
    // Handle different parameter formats for different tools
    if (params.product && params.qty) {
      // Individual product checkout
      message = `Do you want to buy ${params.qty} ${params.product}`;
    } else if (params.cartSummary) {
      // Cart checkout - create safe binding message with only allowed characters
      let cartInfo = params.cartSummary;
      try {
        const parsed = typeof params.cartSummary === 'string' ? JSON.parse(params.cartSummary) : params.cartSummary;
        if (parsed.totalValue && parsed.items) {
          const itemCount = Array.isArray(parsed.items) ? parsed.items.length : 'multiple';
          message = `Do you want to checkout cart with ${itemCount} items for ${parsed.totalValue}`;
        } else if (parsed.summary) {
          // Clean the summary to only include allowed characters
          const cleanSummary = parsed.summary.replace(/[^a-zA-Z0-9\s+\-_.,:#]/g, '');
          message = `Do you want to checkout cart: ${cleanSummary}`;
        } else {
          message = `Do you want to checkout your cart`;
        }
      } catch {
        // Clean cart info to only include allowed characters
        const cleanCartInfo = cartInfo.replace(/[^a-zA-Z0-9\s+\-_.,:#]/g, '');
        message = `Do you want to checkout cart: ${cleanCartInfo}`;
      }
    } else {
      // Fallback for other parameters
      message = `Do you want to proceed with this purchase`;
    }
    
    authorizationState = {
      status: 'requested',
      message
    };
    
    // Trace authorization request
    traceAuthorizationEvent('request', undefined, { params, message });
    
    return message;
  },
  scopes: ['openid', 'checkout:buy'],
  audience: process.env['SHOP_API_AUDIENCE']!,

  /**
   * When this callback is provided, the tool will initiate the CIBA request
   * and then call this function with the authorization request and polling promise.
   */
  onAuthorizationRequest: async (authReq, poll) => {
    console.log('[auth0-ai] Authorization request initiated:', authReq);
    console.log('[auth0-ai] Auth request:', JSON.stringify(authReq, null, 2));
    traceAuthorizationEvent('request', undefined, { authReq });
    
    // Update status to pending
    authorizationState.status = 'pending';
    
    // Poll for the result - this should wait for actual user approval
    try {
      console.log('[auth0-ai] Starting to poll for user authorization...');
      const result = await poll;
      console.log('[auth0-ai] Polling completed with result:', result);
      
      if (result) {
        authorizationState.status = 'approved';
        console.log('[auth0-ai] Authorization APPROVED');
        traceAuthorizationEvent('approved', undefined, { result });
      } else {
        authorizationState.status = 'denied';
        console.log('[auth0-ai] Authorization DENIED - no result returned');
        traceAuthorizationEvent('denied', undefined, { reason: 'No result returned' });
      }
    } catch (error) {
      authorizationState.status = 'denied';
      console.error('[auth0-ai] Authorization DENIED - polling error:', error);
      traceAuthorizationEvent('denied', undefined, { error });
      throw error;
    }
  },
  onUnauthorized: async (e: Error) => {
    console.error('Error:', e);
    if (e instanceof AccessDeniedInterrupt) {
      authorizationState = {
        status: 'denied',
        message: 'The user has denied the request'
      };
      traceAuthorizationEvent('denied', undefined, { 
        error: 'AccessDeniedInterrupt',
        message: 'The user has denied the request'
      });
      return 'The user has denied the request';
    }
    authorizationState = {
      status: 'denied',
      message: e.message
    };
    traceAuthorizationEvent('denied', undefined, { 
      error: e.message,
      errorType: e.constructor.name
    });
    return e.message;
  },
});

// Export alias for payment-specific authorization (backward compatibility)
export const withAsyncPaymentAuthorizationLangChain = withAsyncAuthorization;
