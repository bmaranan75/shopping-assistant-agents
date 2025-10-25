import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const planSchema = z.object({
  steps: z
    .array(z.string())
    .describe("A list of steps to research and answer the user's question."),
});

export const planTool = tool(
  (input) => {
    // The input is the plan object, but we don't need to do anything with it here.
    // The presence of this tool call is what we'll use for routing.
  },
  {
    name: "generate_plan",
    description: "Use this to provide a research plan.",
    schema: planSchema,
  }
);

export const responseSchema = z.object({
  answer: z.string().describe("The final answer to the user's question."),
});

export const responseTool = tool(
  (input) => {
    // The input is the response object.
  },
  {
    name: "direct_response",
    description: "Use this to respond directly to the user.",
    schema: responseSchema,
  }
);

export const delegationSchema = z.object({
  agent: z.enum(["catalog", "cart_and_checkout", "deals", "payment", "notification_agent", "supervisor"]).describe("The target specialized agent to handle this request"),
  task: z.string().describe("Brief description of what the agent needs to do"),
  reasoning: z.string().describe("Why this agent is the best choice for this task")
});

export const delegateTool = tool(
  (input) => {
    // The input is the delegation object.
    return `Delegating to ${input.agent}: ${input.task}`;
  },
  {
    name: "delegate_to_agent",
    description: "Delegate a complex task to a specialized agent",
    schema: delegationSchema,
  }
);
