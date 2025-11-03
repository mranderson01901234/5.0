import autocannon from 'autocannon';
import { once } from 'events';

const targetUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
const duration = 60;
const connections = 50;

const payload = JSON.stringify({
  messages: [{ role: 'user', content: 'Hello, how are you?' }],
  provider: 'openai',
});

const instance = autocannon(
  {
    url: `${targetUrl}/v1/chat/stream`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'load-test-user',
    },
    body: payload,
    connections,
    duration,
  },
  async (err, result) => {
    if (err) {
      console.error('Load test error:', err);
      process.exit(1);
    }

    const stats = result;
    const ttfbStats = stats.latency;
    const p50 = ttfbStats.p50 || 0;
    const p95 = ttfbStats.p95 || 0;
    const p99 = ttfbStats.p99 || 0;

    // Calculate tokens/sec (rough estimate based on request rate)
    const totalRequests = stats.requests.total;
    const durationSec = duration;
    const requestsPerSec = totalRequests / durationSec;
    // Assume ~10 tokens per response on average
    const estimatedTokensPerSec = requestsPerSec * 10;

    console.log('\n=== Load Test Results ===');
    console.log(`Duration: ${duration}s`);
    console.log(`Connections: ${connections}`);
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Requests/sec: ${requestsPerSec.toFixed(2)}`);
    console.log(`\nTTFB Percentiles:`);
    console.log(`  p50: ${p50}ms`);
    console.log(`  p95: ${p95}ms`);
    console.log(`  p99: ${p99}ms`);
    console.log(`\nEstimated tokens/sec: ${estimatedTokensPerSec.toFixed(2)}`);

    // CI checks
    if (p50 > 300 || p95 > 800) {
      console.error('\n❌ SLO check failed:');
      if (p50 > 300) {
        console.error(`  p50 TTFB ${p50}ms exceeds 300ms threshold`);
      }
      if (p95 > 800) {
        console.error(`  p95 TTFB ${p95}ms exceeds 800ms threshold`);
      }
      process.exit(1);
    } else {
      console.log('\n✅ SLO check passed');
    }
  }
);

// Handle shutdown
process.on('SIGINT', () => {
  instance.stop();
});

await once(instance, 'done');
