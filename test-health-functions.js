/**
 * Quick test to verify health check functionality
 */

import {
  performHealthCheck,
  simpleHealthCheck,
  fastMCPHealthCheck,
} from '../src/lib/health-check';

async function testHealthChecks() {
  console.log('🏥 Testing Health Check Functions');
  console.log('================================');

  try {
    // Test simple health check
    console.log('\n1. Simple Health Check:');
    const simpleResult = simpleHealthCheck();
    console.log(
      '✅ Simple check passed:',
      JSON.stringify(simpleResult, null, 2),
    );

    // Test comprehensive health check
    console.log('\n2. Comprehensive Health Check:');
    const fullResult = await performHealthCheck();
    console.log('✅ Full check passed - Status:', fullResult.status);
    console.log(
      '   Agents checked:',
      fullResult.agents.map(a => `${a.name}: ${a.status}`).join(', '),
    );
    console.log('   OpenAI status:', fullResult.dependencies.openai.status);

    // Test FastMCP health check
    console.log('\n3. FastMCP Health Check:');
    const fastMCPResult = await fastMCPHealthCheck();
    console.log('✅ FastMCP check passed - Status:', fastMCPResult.status);
    console.log('   Service:', fastMCPResult.service);
    console.log(
      '   Dependencies:',
      Object.keys(fastMCPResult.dependencies).length,
    );

    console.log('\n🎉 All health check functions working correctly!');
  } catch (error) {
    console.error('❌ Health check test failed:', error);
    process.exit(1);
  }
}

// Run the test
testHealthChecks().catch(console.error);
