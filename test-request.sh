#!/bin/bash

# Simple test to send a message to the LangGraph server
curl -X POST http://localhost:2024/runs \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "supervisor",
    "input": {
      "messages": [
        {
          "type": "human",
          "content": "Hello, can you help me find apples?"
        }
      ]
    },
    "config": {
      "configurable": {
        "thread_id": "test-thread-123"
      }
    }
  }'