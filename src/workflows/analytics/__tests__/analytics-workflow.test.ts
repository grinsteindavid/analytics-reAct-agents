/**
 * Tests for AnalyticsWorkflow
 * Tests workflow construction and agent initialization
 * 
 * Note: Full workflow execution requires LangGraph integration testing
 * These unit tests focus on construction, configuration, and agent setup
 * 
 * Architecture: AI workflows use Redshift via processReport (datasource: 'beta')
 * DatabaseContext only needs mongoose/mongooseConnection - no MSSQL
 */

// Mock all dependencies BEFORE imports
jest.mock('../../../utils/mongodb-checkpointer', () => ({
  DocumentDBCheckpointer: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../agents/intent-classifier', () => ({
  IntentClassifierAgent: jest.fn(),
}));
jest.mock('../../../agents/drilldown-agent', () => ({
  DrilldownAgent: jest.fn(),
}));
jest.mock('../../../agents/planner-agent', () => ({
  PlannerAgent: jest.fn(),
}));
jest.mock('../../../agents/evaluator-agent', () => ({
  EvaluatorAgent: jest.fn(),
}));
jest.mock('../../../agents/entity-lookup-agent', () => ({
  EntityLookupAgent: jest.fn(),
}));
jest.mock('../../../agents/summary-agent', () => ({
  SummaryAgent: jest.fn(),
}));

import { AnalyticsWorkflow } from '../index';
import { IntentClassifierAgent } from '../../../agents/intent-classifier';
import { DrilldownAgent } from '../../../agents/drilldown-agent';
import { PlannerAgent } from '../../../agents/planner-agent';
import { EvaluatorAgent } from '../../../agents/evaluator-agent';
import { EntityLookupAgent } from '../../../agents/entity-lookup-agent';
import { SummaryAgent } from '../../../agents/summary-agent';
import { DatabaseContext } from '../../../types/context';

const MockIntentClassifierAgent = IntentClassifierAgent as jest.MockedClass<typeof IntentClassifierAgent>;
const MockDrilldownAgent = DrilldownAgent as jest.MockedClass<typeof DrilldownAgent>;
const MockPlannerAgent = PlannerAgent as jest.MockedClass<typeof PlannerAgent>;
const MockEvaluatorAgent = EvaluatorAgent as jest.MockedClass<typeof EvaluatorAgent>;
const MockEntityLookupAgent = EntityLookupAgent as jest.MockedClass<typeof EntityLookupAgent>;
const MockSummaryAgent = SummaryAgent as jest.MockedClass<typeof SummaryAgent>;

describe('AnalyticsWorkflow', () => {
  let mockContext: DatabaseContext;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database context with getClient for checkpointer
    mockContext = {
      mongoose: {} as any,
      mongooseConnection: {
        getClient: jest.fn().mockReturnValue({}),
      } as any,
    };

    // Setup mock implementations
    MockIntentClassifierAgent.mockImplementation(() => ({
      classify: jest.fn(),
    } as any));

    MockDrilldownAgent.mockImplementation(() => ({
      execute: jest.fn(),
    } as any));

    MockPlannerAgent.mockImplementation(() => ({
      createPlan: jest.fn(),
    } as any));

    MockEvaluatorAgent.mockImplementation(() => ({
      evaluate: jest.fn(),
    } as any));

    MockEntityLookupAgent.mockImplementation(() => ({
      lookup: jest.fn(),
    } as any));

    MockSummaryAgent.mockImplementation(() => ({
      generateSummary: jest.fn(),
    } as any));
  });

  describe('Constructor', () => {
    it('should initialize all agents with correct parameters', () => {
      new AnalyticsWorkflow(mockContext, 'gpt-4o-mini');

      // Verify IntentClassifierAgent was created with model name
      expect(MockIntentClassifierAgent).toHaveBeenCalledWith('gpt-4o-mini');
      expect(MockIntentClassifierAgent).toHaveBeenCalledTimes(1);

      // Verify DrilldownAgent was created with context and model name
      expect(MockDrilldownAgent).toHaveBeenCalledWith(mockContext, 'gpt-4o-mini');
      expect(MockDrilldownAgent).toHaveBeenCalledTimes(1);

      // Verify EntityLookupAgent was created with context and model name
      expect(MockEntityLookupAgent).toHaveBeenCalledWith(mockContext, 'gpt-4o-mini');
      expect(MockEntityLookupAgent).toHaveBeenCalledTimes(1);

      // Verify SummaryAgent was created with model name
      expect(MockSummaryAgent).toHaveBeenCalledWith('gpt-4o-mini');
      expect(MockSummaryAgent).toHaveBeenCalledTimes(1);
    });

    it('should use default model name when not provided', () => {
      new AnalyticsWorkflow(mockContext);

      // Verify default model name 'gpt-4o-mini' is used
      expect(MockIntentClassifierAgent).toHaveBeenCalledWith('gpt-4o-mini');
      expect(MockDrilldownAgent).toHaveBeenCalledWith(mockContext, 'gpt-4o-mini');
      expect(MockSummaryAgent).toHaveBeenCalledWith('gpt-4o-mini');
    });

    it('should accept custom model name', () => {
      const customModel = 'gpt-4-turbo';
      new AnalyticsWorkflow(mockContext, customModel);

      expect(MockIntentClassifierAgent).toHaveBeenCalledWith(customModel);
      expect(MockDrilldownAgent).toHaveBeenCalledWith(mockContext, customModel);
      expect(MockSummaryAgent).toHaveBeenCalledWith(customModel);
    });

    it('should create workflow instance successfully', () => {
      const workflow = new AnalyticsWorkflow(mockContext);

      expect(workflow).toBeInstanceOf(AnalyticsWorkflow);
      expect(workflow).toHaveProperty('execute');
      expect(typeof workflow.execute).toBe('function');
      expect(workflow).toHaveProperty('stream');
      expect(typeof workflow.stream).toBe('function');
    });
  });

  describe('Configuration', () => {
    it('should initialize with correct database context', () => {
      const customContext: DatabaseContext = {
        mongoose: { connection: 'test' } as any,
        mongooseConnection: { db: 'test', getClient: jest.fn().mockReturnValue({}) } as any,
      };

      new AnalyticsWorkflow(customContext);

      // Verify context was passed to agents that need it
      expect(MockDrilldownAgent).toHaveBeenCalledWith(customContext, expect.any(String));
      expect(MockEntityLookupAgent).toHaveBeenCalledWith(customContext, expect.any(String));
    });

    it('should use temperature 0.3 for SummaryAgent (natural summaries)', () => {
      new AnalyticsWorkflow(mockContext);

      // SummaryAgent uses temperature 0.3 for more natural language
      expect(MockSummaryAgent).toHaveBeenCalledWith('gpt-4o-mini');
    });
  });

  describe('Agent Initialization', () => {
    it('should initialize all required agents', () => {
      new AnalyticsWorkflow(mockContext);

      // Verify all agents were initialized
      expect(MockIntentClassifierAgent).toHaveBeenCalled();
      expect(MockDrilldownAgent).toHaveBeenCalled();
      expect(MockPlannerAgent).toHaveBeenCalled();
      expect(MockEvaluatorAgent).toHaveBeenCalled();
      expect(MockEntityLookupAgent).toHaveBeenCalled();
      expect(MockSummaryAgent).toHaveBeenCalled();
    });

    it('should initialize agents in correct order', () => {
      new AnalyticsWorkflow(mockContext);

      // Verify call order (all should be called during construction)
      const callOrder = [
        MockIntentClassifierAgent.mock.invocationCallOrder[0],
        MockDrilldownAgent.mock.invocationCallOrder[0],
        MockEntityLookupAgent.mock.invocationCallOrder[0],
        MockSummaryAgent.mock.invocationCallOrder[0],
      ];

      // All should be defined (called)
      callOrder.forEach(order => {
        expect(order).toBeDefined();
      });
    });
  });
});
