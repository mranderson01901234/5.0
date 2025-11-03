# LLM Gateway

Fastify-based high-speed chat backend with SSE streaming.

## Commands

- `pnpm dev` - Start development server
- `pnpm build` - Build TypeScript
- `pnpm start` - Run production server
- `pnpm test` - Run tests
- `pnpm load:mock` - Run server with mock provider mode

## Environment Variables

- `PORT` - Server port (default: 3000)
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `GOOGLE_API_KEY` - Google API key
- `NEWSDATA_API_KEY` - NewsData.io API key
- `BRAVE_API_KEY` - Brave Search API key
- `GATEWAY_MOCK` - Enable mock provider mode (set to "1")
- `DB_PATH` - SQLite database path (default: ./gateway.db)
