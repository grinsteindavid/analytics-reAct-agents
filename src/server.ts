import 'dotenv/config';
import express from 'express';
import { initDataSources } from './data-access';
import { AnalyticsWorkflow, initLLMCache } from './index';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  const app = express();
  app.use(express.json());

  // Initialize data sources
  const dataSources = await initDataSources({
    postgresUrl: process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/analytics',
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/analytics',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  initLLMCache();

  const workflow = new AnalyticsWorkflow(
    { mongoose: dataSources.mongoose, mongooseConnection: dataSources.mongoose.connection },
    process.env.OPENAI_MODEL || 'gpt-4o-mini',
  );

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Chat endpoint
  app.post('/api/chat', async (req, res) => {
    try {
      const { question, sessionId } = req.body;
      if (!question) {
        res.status(400).json({ error: 'question is required' });
        return;
      }

      const result = await workflow.execute(question, {
        sessionId: sessionId || `session_${Date.now()}`,
      });

      res.json({
        success: true,
        intent: result.intent,
        summary: result.result?.summary || '',
        keyInsights: result.result?.keyInsights || [],
        dataIncomplete: result.result?.dataIncomplete || false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Chat] Error:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  app.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    console.log(`[Server] POST /api/chat  { question, sessionId? }`);
    console.log(`[Server] GET  /health`);
  });
}

main().catch((err) => {
  console.error('[Server] Fatal:', err);
  process.exit(1);
});
