# Analytics ReAct Agents

LangGraph-powered ReAct AI agent for natural language Q&A over campaign analytics data. Ask questions in plain English and get structured answers backed by real database queries.

## Architecture

```
User Question
    ↓
Intent Classifier → Planner → Tool Executor → Evaluator → Summary Generator
                                    ↓
                          ┌─────────┴──────────┐
                          │   Tools Available   │
                          ├─────────────────────┤
                          │ Drilldown Report    │ → Postgres
                          │ Trend Analysis      │ → Postgres
                          │ Campaign Lookup     │ → MongoDB
                          │ Traffic Source Lookup│ → MongoDB
                          │ Entity Lookup       │ → MongoDB
                          └─────────────────────┘
```

## Quick Start

### 1. Prerequisites

- Node.js >= 18.16.0
- Docker & Docker Compose
- OpenAI API key

### 2. Setup

```bash
# Clone and install
git clone <repo-url> analytics-reAct-agents
cd analytics-reAct-agents
npm install

# Copy env template
cp .env.example .env
# Edit .env and set your OPENAI_API_KEY

# Start databases
npm run docker:up

# Build
npm run build

# Start server
npm start
```

### 3. Usage

```bash
# Chat endpoint
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What are my top 5 campaigns by revenue this month?"}'

# Health check
curl http://localhost:3000/health
```

## Project Structure

```
src/
├── data-access/          # Database connection modules
│   ├── mongodb/          # Mongoose schemas & queries
│   ├── postgres/         # Drilldown query functions
│   └── redis/            # Cache helper & connection
├── prompts/              # LLM prompt templates
├── tools/                # LangGraph tool definitions
│   └── __tests__/        # Jest tests for each tool
├── types/                # TypeScript type definitions
├── utils/                # Shared utilities
├── workflows/            # LangGraph workflow definitions
│   └── analytics/        # Main analytics workflow
├── constants/            # Drilldown constants & enums
└── server.ts             # Express API entry point

docker/
├── postgres/
│   ├── 01-schema.sql     # Analytics data table
│   ├── 02-functions.sql  # PL/pgSQL drilldown functions
│   └── 03-seed-data.sql  # 30 days of sample data
└── mongo/
    └── init.js           # Entity seed data

examples/
├── tests/                # Individual query test scripts
└── e2e-workflow-test.ts  # End-to-end workflow runner
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run compiled server |
| `npm run dev` | Run server via ts-node (dev) |
| `npm test` | Run Jest test suite |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:coverage` | Jest with coverage report |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run docker:up` | Start Postgres, MongoDB, Redis |
| `npm run docker:down` | Stop containers |
| `npm run docker:reset` | Destroy volumes and recreate |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_URL` | `postgresql://postgres:postgres@localhost:5432/analytics` | Postgres connection |
| `MONGODB_URI` | `mongodb://localhost:27017/analytics` | MongoDB connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `OPENAI_API_KEY` | — | Required for LLM calls |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model to use |
| `PORT` | `3000` | Server port |

## Testing

```bash
# Run all tests
npm test

# Run specific test
npx jest src/tools/__tests__/drilldown-tool.test.ts

# Coverage
npm run test:coverage
```

## How It Works

1. **Intent Classification** — Determines if the question is about performance data, trends, or entity lookups
2. **Planning** — Breaks complex questions into tool calls
3. **Tool Execution** — Runs database queries via typed LangGraph tools
4. **Evaluation** — Checks if the data is sufficient to answer the question
5. **Summary** — Generates a natural language answer with key insights

### State Management

The workflow uses a checkpointer for multi-turn conversations. Each session preserves:
- Conversation history
- Query context (filters, date ranges, group-by dimensions)
- Previous results for follow-up questions

## License

Private — All rights reserved.
