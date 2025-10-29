# Testing Guide - Agents Repository

This guide will help you test the newly created agents repository.

## ⚠️ Prerequisites

You'll need to complete these steps before the agents server can run:

### 1. Install Node.js and npm

If not already installed, you need Node.js 20+ and npm. Check with:
```bash
node --version  # Should show v20.x.x or higher
npm --version   # Should show 10.x.x or higher
```

If not installed, download from: https://nodejs.org/

---

## 🔧 Setup Steps

### Step 1: Configure Environment Variables (2 minutes)

Edit the `.env` file in this directory:

```bash
# Open .env in your editor
nano .env
# or
code .env
# or
vim .env
```

**Required values:**

```bash
# OpenAI API Key (REQUIRED)
OPENAI_API_KEY=sk-proj-your-actual-openai-key-here

# Safeway API Key (can use mock data for testing)
SAFEWAY_API_KEY=mock-key-for-testing

# Next.js API URL (for tool callbacks)
NEXTJS_URL=http://localhost:3000

# Optional: LangSmith Tracing
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_your_langsmith_key_if_you_have_one
LANGCHAIN_PROJECT=shopping-assistant-agents-test

# Server Configuration
PORT=2024
HOST=0.0.0.0
```

**Important Notes:**
- You MUST have a valid `OPENAI_API_KEY` for the agents to work
- `SAFEWAY_API_KEY` can be a mock value for testing
- `NEXTJS_URL` will be used by tools to make HTTP callbacks (not needed for basic testing)

---

### Step 2: Install Dependencies (5 minutes)

```bash
cd /Users/bmara00/GithubPersonal/shopping-assistant-agents

# Install all dependencies
npm install
```

This will install:
- `@langchain/langgraph` - Agent orchestration
- `@langchain/openai` - OpenAI integration
- `@langchain/core` - LangChain core
- `@auth0/ai-langchain` - Auth0 AI tools
- And other dependencies

**Expected output:**
```
added 150+ packages in 30s
```

---

### Step 3: Start the LangGraph Server (1 minute)

```bash
npm run dev
```

**What this does:**
- Starts the LangGraph development server
- Exposes all 5 graphs defined in `langgraph.json`
- Listens on port 2024

**Expected output:**
```
🚀 LangGraph Studio is running at http://localhost:2024
Available graphs:
  - supervisor
  - catalog
  - cart_and_checkout
  - payment
  - deals
```

---

## ✅ Verification Tests

### Test 1: Check Server Health

```bash
# In a new terminal
curl http://localhost:2024/ok

# Expected response:
# {"ok": true}
```

### Test 2: List Available Graphs

```bash
curl http://localhost:2024/threads

# Should return an empty list initially
# []
```

### Test 3: Test Simple Graph Invocation

Let's test the catalog agent directly:

```bash
curl -X POST http://localhost:2024/threads \
  -H "Content-Type: application/json" \
  -d '{}'
```

This creates a thread. Save the thread_id from the response.

Then invoke the catalog agent:

```bash
curl -X POST "http://localhost:2024/threads/{thread_id}/runs/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "catalog",
    "input": {
      "messages": [{
        "type": "human",
        "content": "Show me bananas"
      }]
    }
  }'
```

**Expected behavior:**
- Should start processing
- May fail with tool errors (because NEXTJS_URL tools need the chat app running)
- But should show the agent is working and trying to call tools

---

## 🧪 Testing Without Chat App

Since the tools need the Next.js app for callbacks, you have two testing options:

### Option A: Test Graphs Structure (No API Keys Needed)

```bash
# Just verify the graphs are configured correctly
npx @langchain/langgraph-cli validate

# Expected output:
# ✓ Configuration valid
# ✓ All graphs defined correctly
```

### Option B: Test with Mock Tools

You can temporarily comment out tool calls in the agents to test basic flow:

```typescript
// In src/agents/catalog-agent.ts
// Comment out the tools temporarily
const tools = []; // Remove actual tools for testing
```

---

## 🔄 Full Integration Test (With Chat App)

For a complete test, you need BOTH services running:

### Terminal 1: Start Agents Server
```bash
cd /Users/bmara00/GithubPersonal/shopping-assistant-agents
npm run dev
# Running on http://localhost:2024
```

### Terminal 2: Start Chat App (Original Repo)
```bash
cd /Users/bmara00/GithubPersonal/auth0-genai-nextjs-langchain
# First, install dependencies if not already done
npm install
# Then start the dev server
npm run dev
# Running on http://localhost:3000
```

### Terminal 3: Test the Integration
```bash
# Test catalog search via chat app
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Show me bananas"
  }'
```

---

## 📊 What Each Test Validates

| Test | What It Checks | Requires |
|------|---------------|----------|
| Server Health | LangGraph server is running | npm install |
| List Graphs | Configuration is valid | npm install |
| Graph Invocation | Agents can process messages | OpenAI key |
| Tool Execution | Tools can callback to Next.js | Both services |
| Full Flow | Complete end-to-end | Both services + Auth |

---

## ❌ Common Issues

### Issue 1: "npm: command not found"
**Solution:** Install Node.js from https://nodejs.org/

### Issue 2: "OpenAI API key not valid"
**Solution:** Check your `.env` file has the correct key starting with `sk-proj-` or `sk-`

### Issue 3: "Port 2024 already in use"
**Solution:** 
```bash
# Find what's using the port
lsof -i :2024
# Kill the process
kill -9 <PID>
```

### Issue 4: "Tool failed to execute"
**Solution:** This is expected if chat app isn't running. Tools need `NEXTJS_URL` to be accessible.

### Issue 5: "Cannot find module"
**Solution:** Re-run `npm install` to ensure all dependencies are installed

---

## 🎯 Quick Test Checklist

- [ ] Node.js and npm installed
- [ ] `.env` file configured with OpenAI key
- [ ] Dependencies installed (`npm install`)
- [ ] Server starts successfully (`npm run dev`)
- [ ] Server health check passes (`curl http://localhost:2024/ok`)
- [ ] Can list graphs
- [ ] Optional: Chat app running for full test

---

## 📝 Next Steps After Testing

Once testing is successful:

1. **Phase 2:** Clean up the chat repository
   ```bash
   cd /Users/bmara00/GithubPersonal/auth0-genai-nextjs-langchain
   ./scripts/cleanup-chat-repo.sh
   ```

2. **Phase 3:** Update chat code to use SDK
   - Update `src/lib/multi-agent.ts`
   - Update `src/app/api/mcp/agents/*/route.ts` files

3. **Phase 4:** Validate the full migration
   ```bash
   ./scripts/validate-migration.sh
   ```

---

## 🆘 Need Help?

If you encounter issues:

1. Check the error messages carefully
2. Verify `.env` has correct values
3. Ensure port 2024 is available
4. Check that OpenAI API key is valid
5. Review `MIGRATION_COMPLETED.md` for detailed setup

---

**Ready to test?** Start with Step 1 above! 🚀
