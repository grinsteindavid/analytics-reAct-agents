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
│   └── __tests__/        # Unit tests for each tool
├── __integration__/      # Integration tests (real DB connections)
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
│   └── 03-seed-data.sql  # 365 days of sample data
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
| `npm test` | Run unit test suite |
| `npm run test:integration` | Run integration tests (requires Docker) |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:coverage` | Jest with coverage report |
| `npm run test:e2e` | Run E2E workflow tests with debug logging enabled |
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

### Unit Tests

Unit tests use mocked DB connections and a network blocker. No Docker required.

```bash
npm test
npx jest src/tools/__tests__/drilldown-tool.test.ts
npm run test:coverage
```

### Integration Tests

Integration tests connect to real Redis, MongoDB, and Postgres via Docker. They use a separate Jest config (`jest.integration.config.js`) with no network blocker.

```bash
# Start databases first
npm run docker:up

# Run integration tests
npm run test:integration
```

Coverage:
- **Redis** — cache miss/hit, TTL expiry, independent key isolation
- **MongoDB** — campaigns, traffic sources, offers, affiliates, landing pages, rotations, name regex, ID filtering
- **Postgres `fn_drilldown_report`** — all group_by dimensions, all sort metrics, filters, conditions (HAVING), limit
- **Postgres `fn_multi_dimension_drilldown`** — time × entity combos, sort/direction, filters, conditions
- **Trend tool remapping** — dimension1/dimension2 → named columns, per-period entity limiting

### E2E Tests

End-to-end tests run 12 multi-turn scenarios against live databases and the OpenAI API. Debug logging is enabled by default.

```bash
# Start databases first
npm run docker:up

# Run all E2E tests
npm run test:e2e

# Run a single test by number
npm run test:e2e -- 5
```

E2E tests cover:
- **Drilldown** with traffic source filters, conditions, and multi-dimension queries
- **Follow-up** questions with context inheritance (CPC, status checks)
- **Trend analysis** with EPC and time-series data
- **Entity lookups** for rotations, campaigns, and landing pages
- **Off-topic** rejection and intent classification
- **Complex comparisons** (May vs last 7 days)
- **Debug log** file generation and verification

## Stored Procedures

Two PL/pgSQL functions in `docker/postgres/02-functions.sql`:

| Function | Purpose |
|---|---|
| `fn_drilldown_report` | Single-dimension aggregated report (ID, Name, 12 metrics) |
| `fn_multi_dimension_drilldown` | Two-dimension report for trend analysis (dimension1, dimension2, 12 metrics) |

Both accept a JSONB query and support:
- **group_by** — Campaign, TrafficSource, Offer, Affiliate, Country, CountryCode, CountryName, Device, DeviceType, OS, Browser, LandingPage, Rotation, Date, Month, Year, Hour
- **filters** — WHERE clauses on entity IDs (Campaign, TrafficSource, Country, etc.)
- **conditions** — HAVING clauses on aggregated metrics (Clicks > N, ROI% > 0, etc.)
- **sort / direction** — ORDER BY any metric column, ASC or DESC
- **limit** — Row cap (drilldown: exact; multi-dimension: multiplied by 31 for time coverage)

Helper functions: `_build_filter_clauses`, `_build_having_clauses`, `_map_sort_column`.

## How It Works

1. **Intent Classification** — Determines if the question is analytics, metadata-only, or non-analytics (structured output with Zod schema)
2. **Planning** — Breaks complex questions into parallel/sequential tool calls (structured output with Zod schema)
3. **Tool Execution** — Runs database queries via typed LangGraph tools with Zod-validated inputs
4. **Evaluation** — Checks data sufficiency, triggers replanning if needed (structured output with Zod schema)
5. **Summary** — Generates a natural language answer with key insights (structured output with Zod schema)

All LLM calls use OpenAI structured outputs via `withStructuredOutput(zodSchema)` for type-safe, validated responses.

### Structured Output & Zod Schemas

All Zod schemas use `.nullable().default(null)` instead of `.optional()` to comply with the OpenAI structured outputs API requirement that all fields must be present in the JSON schema. This ensures:
- Fields are always in the `required` set (OpenAI requirement)
- `null` is an allowed value for optional data
- No SDK warnings or future breaking changes

### Confidence Tracking

Every turn tracks confidence (0–1) and uncertainty reasons:
- **High confidence (≥ 0.9)** — Sufficient data returned, plan fully executed
- **Medium confidence (0.5–0.9)** — Partial data, some queries returned empty
- **Low confidence (< 0.5)** — Schema errors, missing data, or tool failures

Confidence and `dataIncomplete` flags propagate through the evaluator → summary → final state → conversation history.

### State Picker & Entity Resolution

The planner never embeds entity IDs in instructions. Instead, each plan step declares **where** to get entities from via `entitySources` — a declarative data-dependency system that the executor resolves at runtime.

#### The Problem

A complex query like *"Top offers per country + device"* requires multiple cycles:
1. **Cycle 1:** Fetch top offers (returns Offer entity IDs)
2. **Cycle 2:** Fetch countries and devices *filtered by those offer IDs*

The planner can't hardcode IDs because they don't exist yet at planning time. And different steps may need entities from different sources — a step might need Campaign IDs from conversation turn 0 but TrafficSource IDs from accumulated step 1.

#### The Solution: `entitySources`

Each `PlanStep` includes an optional `entitySources` array that declares where to pull entities from:

```typescript
interface EntitySource {
  type: 'step' | 'turn';       // Where: accumulatedData or conversationHistory
  index: number;                // Which item (required, explicit)
  entityTypes?: EntityType[];   // Filter: only pick certain entity types
}
```

Two source types:
- **`step`** — Entities from `accumulatedData[index]` (same turn, previous cycle). Used for chained queries within a single turn.
- **`turn`** — Entities from `conversationHistory[index]` (previous turns). Used for follow-up questions like *"What about their CPC?"*.

#### How It Works

The executor's `resolveEntities()` function runs before each step:

1. Reads `step.entitySources` from the plan
2. For each source, looks up entities from the specified location
3. Optionally filters by `entityTypes` (e.g., only `Campaign` from a step that also has `TrafficSource`)
4. Deduplicates by `type+id`
5. Injects the resolved entities into `modifiedState.entities`
6. The agent converts them to query filters via `entitiesToFilters()`

```
Planner Output (Cycle 2):
┌─────────────────────────────────────────────────────────┐
│ step: "Countries by ROI for the last 3 days"            │
│ entitySources: [{type: "step", index: 0,                │
│                  entityTypes: ["Offer"]}]                │
└────────────────────────┬────────────────────────────────┘
                         │
            resolveEntities()
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ accumulatedData[0].entities:                            │
│   [{type: "Offer", id: "ccc...003", name: "E-Book"}    │
│    {type: "Offer", id: "ccc...005", name: "App"}]      │
└────────────────────────┬────────────────────────────────┘
                         │
              entitiesToFilters()
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ SQL WHERE: offer_id IN ('ccc...003', 'ccc...005')       │
│ GROUP BY: country                                       │
└─────────────────────────────────────────────────────────┘
```

#### Example: Multi-Cycle Query

*"Top offers per country + device, also identify underperforming combinations"*

**Cycle 1** — Planner fetches both perspectives in parallel:
```json
{
  "plan": [
    {"type": "drilldown", "instruction": "Top offers by ROI descending", "reason": "Best offers"},
    {"type": "drilldown", "instruction": "Offers by ROI ascending", "reason": "Worst offers"}
  ]
}
```

**Evaluator** — Detects missing dimensions, triggers replan.

**Cycle 2** — Planner references cycle 1 results via `entitySources`:
```json
{
  "plan": [
    {
      "type": "drilldown",
      "instruction": "Countries by ROI for the last 3 days",
      "reason": "Country breakdown for top offers",
      "entitySources": [{"type": "step", "index": 0, "entityTypes": ["Offer"]}]
    },
    {
      "type": "drilldown",
      "instruction": "Devices by ROI for the last 3 days",
      "reason": "Device breakdown for top offers",
      "entitySources": [{"type": "step", "index": 0, "entityTypes": ["Offer"]}]
    },
    {
      "type": "drilldown",
      "instruction": "Countries by ROI ascending",
      "reason": "Find underperforming countries",
      "entitySources": [{"type": "step", "index": 1, "entityTypes": ["Offer"]}]
    }
  ]
}
```

Key details:
- `index: 0` = best offers from cycle 1, `index: 1` = worst offers from cycle 1
- Each step runs in parallel within the cycle
- The instruction names the *dimension to group by* (Countries, Devices) — the entity filter is injected automatically from `entitySources`

#### Example: Cross-Turn Follow-Up

*Turn 0:* "Top 3 campaigns from Google by ROI" → returns 3 Campaign entities
*Turn 1:* "What about their CPC?"

```json
{
  "plan": [
    {
      "type": "drilldown",
      "instruction": "Get CPC for campaigns for 2026-02-09 to 2026-03-11",
      "reason": "CPC not in previous metrics, inherit date range",
      "entitySources": [{"type": "turn", "index": 0, "entityTypes": ["Campaign"]}]
    }
  ]
}
```

The planner inherits the date range in the instruction text and references turn 0's Campaign entities via `entitySources` — no IDs are ever embedded in the instruction string.

### State Management

The workflow uses a checkpointer for multi-turn conversations. Each session preserves:
- Conversation history with confidence scores and extracted entities
- Query context (filters, date ranges, group-by dimensions)
- Previous results for follow-up questions

### Debug Logging

When `DEBUG=true`, each turn writes structured JSON files to `.debug-logs/sessions/<sessionId>/`:

```
turn_001/
├── 00_state_initial.json    # Input state
├── 01_intent.json           # Classification result + confidence
├── 02_planner.json          # Execution plan
├── 03_drilldown.json        # Tool input/query/response with row data
├── 04_evaluate.json         # Sufficiency decision + reasoning
├── 05_summary-input.json    # Full payload sent to summary LLM
├── 06_summary.json          # Summary + confidence + uncertaintyReasons
├── 07_state_after_tools.json
├── 08_state_final.json      # Persisted state with conversation history
└── turn.json                # Turn overview: steps, result, metadata
```

The session root contains `session.json` with all turns, durations, and context metadata.

### Sample Debug Output

**Planner** — breaks a complex multi-dimension question into parallel tool calls:

```json
{
  "type": "planner",
  "cycleCount": 1,
  "planStepCount": 2,
  "plan": [
    {
      "type": "drilldown",
      "instruction": "Top offers by ROI descending for the last 3 days",
      "reason": "Get best performing offers for the last 3 days."
    },
    {
      "type": "drilldown",
      "instruction": "Offers by ROI ascending for the last 3 days",
      "reason": "Identify underperforming offers with negative ROI."
    }
  ],
  "reasoning": "Cycle 1: Get both best (desc) and worst (asc) offers for the last 3 days. Cycle 2 will get country/device for each."
}
```

**Evaluator (replan)** — detects missing data and requests additional queries:

```json
{
  "type": "evaluate",
  "cycleCount": 1,
  "decision": "replan",
  "confidence": 0.4,
  "reasoning": "Have offers data but missing country and device breakdowns filtered by those offers to identify combinations with negative ROI.",
  "missingData": [
    { "type": "drilldown", "reason": "Need country breakdown filtered by offer IDs from previous query" },
    { "type": "drilldown", "reason": "Need device breakdown filtered by offer IDs from previous query" },
    { "type": "drilldown", "reason": "Need countries with negative ROI to identify underperformers" }
  ]
}
```

**Evaluator (summarize)** — confirms data is sufficient after cycle 2:

```json
{
  "type": "evaluate",
  "cycleCount": 2,
  "decision": "summarize",
  "confidence": 0.85,
  "reasoning": "Have data on top offers, countries, and devices, including those with negative ROI. This allows for a comprehensive view of performance and underperforming combinations.",
  "missingData": null
}
```

**Summary** — final structured answer with key insights:

```json
{
  "type": "summary",
  "summary": "In the last three days, the top-performing offers included 'E-Book Download' with a 77.17% ROI, 'App Install' at 73.05%, and 'Webinar Registration' at 49.42%. However, the 'Mobile' device showed only a 6.27% ROI, indicating underperformance, while the 'BR' country also had negative ROI at -19.13%.",
  "keyInsights": [
    "Top offers: 'E-Book Download' (77.17% ROI), 'App Install' (73.05% ROI), 'Webinar Registration' (49.42% ROI)",
    "Underperforming: 'Mobile' device with 6.27% ROI",
    "Negative performance: 'BR' country at -19.13% ROI"
  ],
  "confidence": 0.9,
  "dataIncomplete": false
}
```

## License

Private — All rights reserved.
