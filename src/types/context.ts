import type { Mongoose, Connection } from 'mongoose';

/**
 * Database connections context passed from app initialization
 * Connections are initialized once and passed through context
 */
export interface DatabaseContext {
  mongoose?: Mongoose;
  mongooseConnection?: Connection;
}

/**
 * AI workflow execution context
 */
export interface WorkflowContext extends DatabaseContext {
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}
