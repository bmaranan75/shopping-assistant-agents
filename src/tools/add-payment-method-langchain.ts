import { StructuredTool, tool } from '@langchain/core/tools';
import { z } from 'zod';
import { withAsyncPaymentAuthorizationLangChain } from "../lib/auth0-ai-langchain";

// Base LangChain tool for adding payment methods
const baseTool = tool(
  async (params: {
    type: "credit_card" | "debit_card" | "bank_account" | "paypal";
    cardNumber?: string;
    expiryDate?: string;
    accountNumber?: string;
    routingNumber?: string;
    email?: string;
    isDefault?: boolean;
  }, config?: any) => {
    const { type, cardNumber, expiryDate, accountNumber, routingNumber, email, isDefault } = params;
    
    // Log the payment method addition attempt
    console.log(
      `[add-payment-langchain] Adding ${type} payment method${isDefault ? ' as default' : ''}`
    );

    // Use the ADD_PAYMENT_URL from environment or fallback to localhost
    const apiUrl = process.env.ADD_PAYMENT_URL || "http://localhost:3000/api/add-payment";
    console.log(`[add-payment-langchain] Using API URL: ${apiUrl}`);
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: "",
    };
    
    const body = { 
      type, 
      cardNumber, 
      expiryDate, 
      accountNumber, 
      routingNumber, 
      email, 
      isDefault 
    };
    console.log("[add-payment-langchain] Request body:", body);

    // Get access token from credentials passed via config
    const credentials = config?.configurable?._credentials;
    const accessToken = credentials?.accessToken;
    
    if (accessToken) {
      headers["Authorization"] = "Bearer " + accessToken;
      console.log(
        "[add-payment-langchain] Access token found, adding Authorization header."
      );
    } else {
      console.log("[add-payment-langchain] No access token found.");
    }

    try {
      // Make the add payment method API call
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      });
      console.log(`[add-payment-langchain] Response status: ${response.status}`);
      console.log(
        `[add-payment-langchain] Response content-type: ${response.headers.get("content-type")}`
      );

      // Check if response is JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await response.text();
        console.log(
          `[add-payment-langchain] Non-JSON response (status: ${response.status}): ${textResponse.substring(0, 500)}...`
        );
        console.log(`[add-payment-langchain] Response headers:`, Object.fromEntries(response.headers.entries()));
        throw new Error(
          `Expected JSON response but got ${contentType || "unknown content type"}. Status: ${response.status}. Response: ${textResponse.substring(0, 200)}`
        );
      }

      const responseData = await response.json() as any;
      console.log("[add-payment-langchain] Response data:", responseData);
      if (!response.ok) {
        throw new Error(
          responseData?.error ||
            `Request failed with status ${response.status}`
        );
      }

      const paymentMethod = responseData?.paymentMethod;
      let successMessage = responseData?.message || "✅ Payment method added successfully";
      
      if (paymentMethod) {
        switch (type) {
          case "credit_card":
          case "debit_card":
            successMessage += ` - ${type.replace('_', ' ')} ending in ${paymentMethod.cardNumber?.slice(-4) || 'XXXX'}`;
            break;
          case "bank_account":
            successMessage += ` - Bank account ending in ${accountNumber?.slice(-4) || 'XXXX'}`;
            break;
          case "paypal":
            successMessage += ` - PayPal account: ${email}`;
            break;
        }
        
        if (paymentMethod.isDefault) {
          successMessage += " (set as default)";
        }
      }
      
      return successMessage;
    } catch (error) {
      console.error(
        "[add-payment-langchain] An error occurred during the API call:",
        error
      );
      throw error;
    }
  },
  {
    name: "add_payment_method",
    description: "Tool to add a new payment method with human-in-the-loop authorization",
    schema: z.object({
      type: z.enum(["credit_card", "debit_card", "bank_account", "paypal"]).describe("Type of payment method"),
      cardNumber: z.string().nullable().optional().describe("Card number (for card types)"),
      expiryDate: z.string().nullable().optional().describe("Expiry date in MM/YY format (for card types)"),
      accountNumber: z.string().nullable().optional().describe("Account number (for bank account)"),
      routingNumber: z.string().nullable().optional().describe("Routing number (for bank account)"),
      email: z.string().nullable().optional().describe("Email address (for PayPal)"),
      isDefault: z.boolean().nullable().optional().describe("Set as default payment method"),
    }),
  }
);

// Wrap the tool with Auth0 authorization
export const addPaymentMethodToolLangChain = withAsyncPaymentAuthorizationLangChain(baseTool);
