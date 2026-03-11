/**
 * Chat message types for conversation history
 * Compatible with n8n_chat_histories collection schema
 */

export interface ChatMessageData {
  content: string;
  additional_kwargs?: Record<string, any>;
  response_metadata?: Record<string, any>;
  tool_calls?: any[];
  invalid_tool_calls?: any[];
}

export interface ChatMessage {
  type: 'human' | 'ai';
  data: ChatMessageData;
}

/**
 * Chat session for workflow execution
 */
export interface ChatSession {
  sessionId: string;
  agentType?: string;
  title?: string;
  messages: ChatMessage[];
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * LangSmith tracing options for observability
 */
export interface TracingOptions {
  /** Custom tags for filtering traces in LangSmith */
  tags?: string[];
  /** Additional metadata to attach to traces */
  metadata?: Record<string, any>;
  /** Custom run name (defaults to analytics-{sessionId suffix}) */
  runName?: string;
}

/**
 * Options for workflow execution with chat support
 */
export interface WorkflowExecutionOptions {
  /** Session ID for chat history (optional - if not provided, no history is used) */
  sessionId?: string;
  /** Pre-loaded chat history (optional - if provided, skips loading from DB) */
  chatHistory?: ChatMessage[];
  /** Whether to persist messages to DB (default: true if sessionId provided) */
  persistMessages?: boolean;
  /** User ID for ownership tracking */
  userId?: string;
  /** LangSmith tracing options */
  tracing?: TracingOptions;
}
