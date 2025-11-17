#!/bin/bash

# Health Check Test Script for Shopping Assistant Agents
# Tests all health endpoints for FastMCP integration

SERVER_URL="http://localhost:2024"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🏥 Shopping Assistant Agents - Health Check Test"
echo "=============================================="
echo

# Function to test an endpoint
test_endpoint() {
    local endpoint=$1
    local expected_status=$2
    local description=$3
    
    echo -n "Testing $description ($endpoint)... "
    
    response=$(curl -s -w "%{http_code}" -o /tmp/health_response "$SERVER_URL$endpoint" 2>/dev/null)
    http_code="${response: -3}"
    
    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
        if [ -f /tmp/health_response ]; then
            echo "Response preview:"
            head -3 /tmp/health_response | sed 's/^/  /'
            echo
        fi
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $http_code, expected $expected_status)"
        if [ -f /tmp/health_response ]; then
            echo "Error response:"
            cat /tmp/health_response | sed 's/^/  /'
            echo
        fi
    fi
}

# Function to test health agent graph
test_health_graph() {
    echo -n "Testing Health Agent Graph... "
    
    response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{
            "input": {
                "messages": [{"type": "human", "content": "Check system health"}]
            },
            "config": {
                "configurable": {"thread_id": "health-test-123"}
            }
        }' \
        -o /tmp/health_graph_response \
        "$SERVER_URL/health/invoke" 2>/dev/null)
    
    http_code="${response: -3}"
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
        echo "Health agent response preview:"
        if [ -f /tmp/health_graph_response ]; then
            cat /tmp/health_graph_response | grep -o '"content":"[^"]*"' | head -1 | sed 's/^/  /'
        fi
        echo
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $http_code)"
        if [ -f /tmp/health_graph_response ]; then
            echo "Error response:"
            cat /tmp/health_graph_response | sed 's/^/  /'
            echo
        fi
    fi
}

# Check if server is running
echo "🔍 Checking if LangGraph server is running..."
if ! curl -s "$SERVER_URL/ok" > /dev/null 2>&1; then
    echo -e "${RED}❌ Server is not running at $SERVER_URL${NC}"
    echo "Please start the server with: npm run dev"
    exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"
echo

# Test legacy health endpoint
echo "📊 Testing Legacy Health Endpoints:"
test_endpoint "/ok" "200" "Legacy /ok endpoint"

# Test comprehensive health endpoints  
echo "📋 Testing Comprehensive Health Endpoints:"
test_endpoint "/health" "200" "Standard /health endpoint"

# Test FastMCP health endpoints
echo "🚀 Testing FastMCP Integration Endpoints:"
test_endpoint "/health/fastmcp" "200" "FastMCP health endpoint"

# Test health agent graph
echo "🤖 Testing Health Agent Graph:"
test_health_graph

# Test specific agent health via graph
echo "🔧 Testing Specific Agent Health Checks:"
for agent in supervisor catalog cart_and_checkout deals payment; do
    echo -n "  Checking $agent agent... "
    
    response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "{
            \"input\": {
                \"messages\": [{\"type\": \"human\", \"content\": \"Check status of $agent agent\"}]
            },
            \"config\": {
                \"configurable\": {\"thread_id\": \"agent-check-$agent-123\"}
            }
        }" \
        -o /tmp/agent_health_response \
        "$SERVER_URL/health/invoke" 2>/dev/null)
    
    http_code="${response: -3}"
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ (HTTP $http_code)${NC}"
    fi
done

echo
echo "🎯 FastMCP Integration Summary:"
echo "==============================="
echo "• Health endpoints are available for monitoring"
echo "• Use /health for comprehensive system status"
echo "• Use /health/fastmcp for FastMCP-compatible format"
echo "• Use /health agent graph for interactive health monitoring"
echo "• Legacy /ok endpoint maintained for backward compatibility"
echo

# Cleanup
rm -f /tmp/health_response /tmp/health_graph_response /tmp/agent_health_response

echo -e "${GREEN}🎉 Health check testing complete!${NC}"