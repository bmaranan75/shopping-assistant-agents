# FastMCP Integration Guide

This document describes how the Shopping Assistant Agents system integrates with FastMCP for enhanced monitoring and management.

## Overview

The Shopping Assistant Agents system provides health monitoring capabilities designed to work with FastMCP (Fast Model Context Protocol) integration tools. Due to LangGraph CLI architecture limitations, health monitoring is provided through the LangGraph API rather than custom HTTP endpoints.

## Important Architecture Note

**LangGraph CLI Limitations**: The LangGraph CLI server only exposes:

- `/ok` - Basic health endpoint
- Standard LangGraph API endpoints (`/runs`, `/runs/{id}/wait`, etc.)
- It does NOT support custom HTTP endpoints like `/health` or `/health/fastmcp`

**Solution**: We provide comprehensive health monitoring through a dedicated `health` agent that can be invoked via the standard LangGraph API.

## Health Endpoints

### 1. Basic Health Check - `/ok`

The only HTTP health endpoint available in LangGraph CLI:

```bash
GET http://localhost:2024/ok
```

**Response:**

```json
{
  "ok": true
}
```

**Use Case:** Basic uptime monitoring, load balancer health checks

### 2. Comprehensive Health Monitoring - Health Agent Graph

Detailed health information via the LangGraph API using the `health` agent:

```bash
POST http://localhost:2024/runs
Content-Type: application/json

{
  "assistant_id": "health",
  "input": {
    "messages": [
      {
        "type": "human",
        "content": "Check system health"
      }
    ]
  }
}
```

**Response:**

```json
{
  "run_id": "12345-abcde",
  "thread_id": "thread-abc",
  "status": "pending",
  "assistant_id": "health-assistant-id"
}
```

To get the health check results, poll the run:

```bash
GET http://localhost:2024/runs/{run_id}/wait
```

**Available Health Queries:**

- `"Check system health"` - Overall system status
- `"Show system metrics"` - Performance metrics
- `"Check [agent] agent status"` - Specific agent health
- `"Run comprehensive health check"` - Detailed diagnostics

## Health Agent Graph

Interactive health monitoring through the LangGraph API:

```bash
POST http://localhost:2024/runs
Content-Type: application/json

{
  "assistant_id": "health",
  "input": {
    "messages": [
      {
        "type": "human",
        "content": "Check system health"
      }
    ]
  }
}
```

**Available Commands:**

- `"Check system health"` - Overall system status
- `"Check supervisor agent status"` - Specific agent health
- `"Show system metrics"` - Performance metrics
- `"Run comprehensive health check"` - Detailed diagnostics

**Getting Results:**

```bash
# Get run result (replace {run_id} with actual run ID)
GET http://localhost:2024/runs/{run_id}/wait
```

## Health Status Definitions

### System Status

- **healthy**: All components are functioning normally
- **degraded**: Some non-critical issues detected, system still functional
- **unhealthy**: Critical issues detected, system may not function properly

### Agent Status

- **healthy**: Agent is loaded and ready to handle requests
- **degraded**: Agent has minor issues but can still process requests
- **unhealthy**: Agent failed to load or has critical errors

### Dependency Status

- **healthy**: Dependency is available and responding
- **unhealthy**: Dependency is unavailable or misconfigured

## FastMCP Integration

### Recommended Integration Approach

Since LangGraph CLI has architectural limitations, FastMCP integration should:

1. **Basic Monitoring**: Use `/ok` endpoint for uptime monitoring
2. **Detailed Health**: Use LangGraph API with `health` agent for comprehensive monitoring
3. **Custom Server**: For full HTTP endpoint support, implement a custom server (see alternatives below)

### Monitoring Integration Examples

#### Basic Uptime Monitoring

```yaml
# FastMCP configuration for basic monitoring
services:
  shopping-assistant-agents:
    url: 'http://localhost:2024'
    health_endpoint: '/ok'
    check_interval: 30s
    timeout: 10s
    expected_response: '{"ok": true}'
```

#### Advanced Monitoring via LangGraph API

```python
# Python example for advanced health monitoring
import requests
import time

def check_agent_health():
    # Create health check run
    response = requests.post("http://localhost:2024/runs", json={
        "assistant_id": "health",
        "input": {
            "messages": [{"type": "human", "content": "Check system health"}]
        }
    })

    if response.status_code == 200:
        run_id = response.json()["run_id"]

        # Wait for completion
        time.sleep(2)

        # Get result
        result = requests.get(f"http://localhost:2024/runs/{run_id}/wait")
        return result.json()

    return None
```

### Alternative: Custom Server Implementation

For full FastMCP HTTP endpoint compatibility, you can create a custom server:

```typescript
// custom-health-server.ts
import express from 'express';
import {healthHandlers} from './src/lib/health-middleware';

const app = express();

// Basic health endpoint (compatible with LangGraph)
app.get('/ok', async (req, res) => {
  res.json({ok: true});
});

// FastMCP compatible endpoints
app.get('/health', async (req, res) => {
  const result = await healthHandlers.health();
  res.status(result.status).set(result.headers).send(result.body);
});

app.get('/health/fastmcp', async (req, res) => {
  const result = await healthHandlers.fastmcp();
  res.status(result.status).set(result.headers).send(result.body);
});

// Proxy to LangGraph server for agent requests
app.use('/runs', (req, res) => {
  // Proxy to http://localhost:2024/runs
  // Implementation depends on your proxy library
});

app.listen(3000, () => {
  console.log('Custom FastMCP health server running on port 3000');
});
```

### Dependency Tracking

The health agent provides detailed dependency information:

- **OpenAI API**: Validates API key and connectivity
- **Node.js Runtime**: Version and memory usage
- **Individual Agents**: Load status and error information
- **System Resources**: Memory usage and uptime

## Error Handling

### Common Error Responses

**Service Unavailable (503):**

```json
{
  "status": "unhealthy",
  "timestamp": 1699123456789,
  "error": "OpenAI API key not configured",
  "service": "shopping-assistant-agents"
}
```

**Internal Error (500):**

```json
{
  "status": "unhealthy",
  "timestamp": 1699123456789,
  "error": "Failed to load agent: supervisor",
  "service": "shopping-assistant-agents"
}
```

### Troubleshooting

1. **OpenAI Connectivity Issues**:
   - Check `OPENAI_API_KEY` environment variable
   - Verify API key has proper permissions
   - Check network connectivity to OpenAI

2. **Agent Load Failures**:
   - Review server logs for import errors
   - Ensure all dependencies are installed
   - Check file permissions and paths

3. **Memory Issues**:
   - Monitor memory usage in health response
   - Consider increasing Node.js memory limits
   - Check for memory leaks in long-running processes

## Testing

Use the provided test script to validate FastMCP integration:

```bash
# Run comprehensive health tests
./test-health.sh

# Test specific endpoint
curl -v http://localhost:2024/health/fastmcp
```

## Security Considerations

1. **Authentication**: Health endpoints are currently unauthenticated
2. **Rate Limiting**: Consider implementing rate limiting for health checks
3. **Information Disclosure**: Health responses may contain sensitive system information
4. **Network Access**: Ensure health endpoints are only accessible from monitoring systems

## Best Practices

1. **Monitoring Frequency**: Poll health endpoints every 30-60 seconds
2. **Alerting Thresholds**: Alert on `unhealthy` status or consecutive failures
3. **Graceful Degradation**: Use `degraded` status for non-critical issues
4. **Caching**: Health responses include `Cache-Control: no-cache` headers
5. **Timeout Handling**: Set appropriate timeouts for health check calls

## Integration Examples

### Prometheus Monitoring

```yaml
scrape_configs:
  - job_name: 'shopping-agents-health'
    static_configs:
      - targets: ['localhost:2024']
    metrics_path: '/health/fastmcp'
    scrape_interval: 30s
```

### Docker Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:2024/ok || exit 1
```

### Kubernetes Readiness Probe

```yaml
readinessProbe:
  httpGet:
    path: /health/fastmcp
    port: 2024
  initialDelaySeconds: 30
  periodSeconds: 10
```

---

For more information about the Shopping Assistant Agents system, see the main [README.md](./README.md).
