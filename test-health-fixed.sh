#!/bin/bash

# Updated Health Check Test Script for Shopping Assistant Agents
# Tests health endpoints that actually exist in LangGraph server

SERVER_URL="http://localhost:2024"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🏥 Shopping Assistant Agents - Health Check Test (Updated)"
echo "=========================================================="
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

# Function to test health agent graph via LangGraph API
test_health_graph() {
    echo -n "Testing Health Agent Graph via LangGraph API... "
    
    response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{
            "assistant_id": "health",
            "input": {
                "messages": [{"type": "human", "content": "Check system health"}]
            }
        }' \
        -o /tmp/health_graph_response \
        "$SERVER_URL/runs" 2>/dev/null)
    
    http_code="${response: -3}"
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
        echo "Health agent created run successfully"
        if [ -f /tmp/health_graph_response ]; then
            run_id=$(cat /tmp/health_graph_response | grep -o '"run_id":"[^"]*"' | cut -d'"' -f4)
            if [ -n "$run_id" ]; then
                echo "  Run ID: $run_id"
                # Wait a moment for processing
                sleep 2
                # Try to get the result
                curl -s "$SERVER_URL/runs/$run_id/wait" > /tmp/health_result 2>/dev/null
                if [ $? -eq 0 ]; then
                    echo "  Result available in /tmp/health_result"
                fi
            fi
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

# Function to test individual agent graphs
test_agent_graph() {
    local agent_name=$1
    echo -n "  Testing $agent_name graph... "
    
    response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "{
            \"assistant_id\": \"$agent_name\",
            \"input\": {
                \"messages\": [{\"type\": \"human\", \"content\": \"Hello, are you working?\"}]
            }
        }" \
        -o /tmp/agent_response \
        "$SERVER_URL/runs" 2>/dev/null)
    
    http_code="${response: -3}"
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ (HTTP $http_code)${NC}"
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

# Test the only HTTP endpoint that works
echo "📊 Testing Available HTTP Endpoints:"
test_endpoint "/ok" "200" "Basic health endpoint"

# Test health agent graph via LangGraph API
echo "🤖 Testing Health Agent via LangGraph API:"
test_health_graph

# Test all agent graphs to verify they're working
echo "🔧 Testing All Agent Graphs:"
for agent in supervisor catalog cart_and_checkout deals payment health; do
    test_agent_graph "$agent"
done

# Test health agent with different queries
echo
echo "💬 Testing Health Agent with Different Queries:"
queries=("Check system health" "Show system metrics" "Check supervisor agent status" "Run comprehensive health check")

for query in "${queries[@]}"; do
    echo -n "  Query: '$query'... "
    
    response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "{
            \"assistant_id\": \"health\",
            \"input\": {
                \"messages\": [{\"type\": \"human\", \"content\": \"$query\"}]
            }
        }" \
        -o /tmp/query_response \
        "$SERVER_URL/runs" 2>/dev/null)
    
    http_code="${response: -3}"
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ (HTTP $http_code)${NC}"
    fi
done

echo
echo "🎯 LangGraph Health Monitoring Summary:"
echo "======================================"
echo "• Use /ok for basic health check (HTTP endpoint)"
echo "• Use 'health' graph for comprehensive health monitoring (LangGraph API)"
echo "• Health agent supports natural language queries about system status"
echo "• All agent graphs are available via LangGraph API at /runs endpoint"
echo
echo "📝 Example Health Query:"
echo "curl -X POST http://localhost:2024/runs \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{"
echo "    \"assistant_id\": \"health\","
echo "    \"input\": {"
echo "      \"messages\": [{\"type\": \"human\", \"content\": \"Check system health\"}]"
echo "    }"
echo "  }'"
echo

# Cleanup
rm -f /tmp/health_response /tmp/health_graph_response /tmp/agent_response /tmp/query_response

echo -e "${GREEN}🎉 Health check testing complete!${NC}"
echo
echo "Note: LangGraph CLI only exposes /ok as HTTP endpoint."
echo "For comprehensive health monitoring, use the 'health' graph via LangGraph API."