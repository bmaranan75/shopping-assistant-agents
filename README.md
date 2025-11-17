# Shopping Assistant Agents

LangGraph agents server for the shopping assistant application.

## Overview

This repository contains all the AI agents, tools, and orchestration logic for the shopping assistant:

- **Supervisor Agent**: Main orchestrator that routes requests
- **Planner Agent**: Intent classification and recommendation
- **Catalog Agent**: Product search and discovery
- **Cart & Checkout Agent**: Shopping cart operations
- **Payment Agent**: Payment method management
- **Deals Agent**: Promotions and discounts

## Quick Start

### Prerequisites

- Node.js 20+
- OpenAI API key
- Safeway API key (or mock data)

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env
```

### Development

```bash
# Start LangGraph server
npm run dev

# Server will start on http://localhost:2024
```

### Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

## Architecture

See [ARCHITECTURE_OVERVIEW.md](../ARCHITECTURE_OVERVIEW.md) for detailed architecture documentation.

## Deployment

### LangGraph Cloud

```bash
npm run deploy:prod
```

### Self-Hosted

```bash
npm run build
# Deploy using your preferred method
```

## Environment Variables

| Variable               | Description                | Required |
| ---------------------- | -------------------------- | -------- |
| `OPENAI_API_KEY`       | OpenAI API key             | Yes      |
| `SAFEWAY_API_KEY`      | Safeway API key            | Yes      |
| `NEXTJS_URL`           | Chat app URL for callbacks | Yes      |
| `LANGCHAIN_TRACING_V2` | Enable LangSmith tracing   | No       |
| `LANGCHAIN_API_KEY`    | LangSmith API key          | No       |

## Available Graphs

- `supervisor` - Main orchestrator
- `catalog` - Product catalog operations
- `cart_and_checkout` - Cart management
- `payment` - Payment operations
- `deals` - Promotions and deals
- `health` - System health monitoring and diagnostics

## API

LangGraph server exposes standard endpoints:

- `POST /runs` - Create and run agent conversations
- `GET /runs/{run_id}/wait` - Get conversation results
- `GET /ok` - Basic health check

### Health Monitoring

The system provides health monitoring through two mechanisms:

#### `/ok` - Simple Health Check

```bash
curl http://localhost:2024/ok
# Response: {"ok": true}
```

#### Health Agent - Comprehensive Health Monitoring

```bash
curl -X POST http://localhost:2024/runs \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "health",
    "input": {
      "messages": [{"type": "human", "content": "Check system health"}]
    }
  }'
# Returns run_id, then poll /runs/{run_id}/wait for results
```

**Health Agent Queries:**

- `"Check system health"` - Overall status
- `"Show system metrics"` - Performance data
- `"Check [agent] agent status"` - Specific agent health
- `"Run comprehensive health check"` - Detailed diagnostics

### Testing Health Monitoring

Use the provided test script to validate health functionality:

```bash
./test-health-fixed.sh
```

## License

MIT
