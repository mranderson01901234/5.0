# Load Test Harness

Autocannon-based load testing for the LLM Gateway.

## Commands

- `pnpm start` - Run load test (60s, 50 concurrent connections)
- `GATEWAY_URL=http://localhost:3000 pnpm start` - Test different endpoint

## Environment Variables

- `GATEWAY_URL` - Gateway endpoint (default: http://localhost:3000)

