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

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `SAFEWAY_API_KEY` | Safeway API key | Yes |
| `NEXTJS_URL` | Chat app URL for callbacks | Yes |
| `LANGCHAIN_TRACING_V2` | Enable LangSmith tracing | No |
| `LANGCHAIN_API_KEY` | LangSmith API key | No |

## Available Graphs

- `supervisor` - Main orchestrator
- `catalog` - Product catalog operations
- `cart_and_checkout` - Cart management
- `payment` - Payment operations
- `deals` - Promotions and deals

## API

LangGraph server exposes standard endpoints:

- `POST /threads` - Create conversation thread
- `POST /threads/{thread_id}/runs/stream` - Stream agent execution
- `GET /health` - Health check

## License

MIT
