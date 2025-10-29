/**
 * Simple test client to debug message format issues
 */
const { HumanMessage } = require('@langchain/core/messages');

async function testSupervisorClient() {
  try {
    // Test what format the LangGraph client expects
    const response = await fetch('http://localhost:2024/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistant_id: 'supervisor',
        input: {
          messages: [new HumanMessage("Hello, test message")],
          userId: 'test-user',
          conversationId: 'test-conv'
        },
        config: {
          configurable: {
            thread_id: 'test-thread'
          }
        }
      })
    });

    console.log('Response status:', response.status);
    const result = await response.text();
    console.log('Response:', result);
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Run test if server is available
testSupervisorClient();