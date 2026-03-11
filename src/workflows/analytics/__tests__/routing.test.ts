import { routeAfterClassify } from '../routing';
import { CampaignAnalysisState } from '../../../types/state';

describe('Workflow Routing', () => {
  const createBaseState = (overrides?: Partial<CampaignAnalysisState>): CampaignAnalysisState => ({
    question: 'test question',
    intent: 'unknown',
    entities: [],
    extractedParams: {},
    currentDateTime: new Date().toISOString(),
    metadata: {
      llmCalls: 0,
      toolCalls: 0,
      startTime: Date.now(),
      timings: [],
    },
    ...overrides,
  } as CampaignAnalysisState);

  describe('routeAfterClassify', () => {
    describe('Analytics intent', () => {
      it('should route analytics to create_plan (Planner)', () => {
        const state = createBaseState({ intent: 'analytics' });
        expect(routeAfterClassify(state)).toBe('create_plan');
      });
    });

    describe('Metadata only intent', () => {
      it('should route metadata_only to create_plan (Planner handles entity resolution)', () => {
        const state = createBaseState({ intent: 'metadata_only' });
        expect(routeAfterClassify(state)).toBe('create_plan');
      });
    });

    describe('Non-analytics intent', () => {
      it('should route non_analytics to generate_summary', () => {
        const state = createBaseState({ intent: 'non_analytics' });
        expect(routeAfterClassify(state)).toBe('generate_summary');
      });
    });
  });
});
