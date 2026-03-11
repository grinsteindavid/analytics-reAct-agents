/**
 * Singleton factory for AnalyticsWorkflow
 * Avoids graph compilation on every request
 */
import { DatabaseContext } from '../../types/context';
import { AnalyticsWorkflow } from './index';

let workflowInstance: AnalyticsWorkflow | null = null;

/**
 * Get or create singleton AnalyticsWorkflow instance
 * Graph is compiled once on first call, reused thereafter
 */
export function getAnalyticsWorkflow(context: DatabaseContext, modelName: string = 'gpt-4o-mini'): AnalyticsWorkflow {
  if (!workflowInstance) {
    console.log('🔧 Compiling AnalyticsWorkflow graph (singleton)...');
    workflowInstance = new AnalyticsWorkflow(context, modelName);
    console.log('✅ AnalyticsWorkflow singleton ready');
  }
  return workflowInstance;
}

/**
 * Destroy singleton instance (for graceful shutdown or testing)
 */
export function destroyWorkflowInstance(): void {
  workflowInstance = null;
}

/**
 * Check if singleton is initialized
 */
export function isWorkflowInitialized(): boolean {
  return workflowInstance !== null;
}
