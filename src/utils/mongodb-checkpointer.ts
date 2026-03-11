/**
 * Custom MongoDB Checkpointer for LangGraph
 * Uses JSON serialization instead of BSON Binary for DocumentDB compatibility
 */
import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
  SerializerProtocol,
} from '@langchain/langgraph-checkpoint';
import { RunnableConfig } from '@langchain/core/runnables';
import { Connection } from 'mongoose';

interface CheckpointDocument {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  parent_checkpoint_id?: string;
  checkpoint: string; // JSON stringified
  metadata: string; // JSON stringified
  created_at: Date;
}

/**
 * Simple JSON serializer for checkpoint data
 */
class JsonSerializer implements SerializerProtocol {
  stringify(obj: unknown): string {
    return JSON.stringify(obj);
  }

  parse(data: string): unknown {
    return JSON.parse(data);
  }

  dumpsTyped(obj: unknown): [string, Uint8Array] {
    const json = JSON.stringify(obj);
    return ['json', new TextEncoder().encode(json)];
  }

  loadsTyped(type: string, data: Uint8Array): unknown {
    if (type !== 'json') {
      throw new Error(`Unsupported serialization type: ${type}`);
    }
    const json = new TextDecoder().decode(data);
    return JSON.parse(json);
  }
}

/**
 * MongoDB Checkpointer compatible with AWS DocumentDB
 * Stores checkpoint state as JSON strings instead of BSON Binary
 */
export class DocumentDBCheckpointer extends BaseCheckpointSaver {
  private collection: any;
  private writesCollection: any;
  private spiSerializer: JsonSerializer;

  constructor(connection: Connection, collectionName = 'workflow_checkpoints') {
    super();
    this.collection = connection.collection(collectionName);
    this.writesCollection = connection.collection(`${collectionName}_writes`);
    this.spiSerializer = new JsonSerializer();
    
    // Create indexes for efficient queries
    this.ensureIndexes();
  }

  private async ensureIndexes(): Promise<void> {
    try {
      await this.collection.createIndex(
        { thread_id: 1, checkpoint_ns: 1, checkpoint_id: 1 },
        { unique: true }
      );
      await this.collection.createIndex({ thread_id: 1, checkpoint_ns: 1, created_at: -1 });
    } catch {
      // Indexes may already exist
    }
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const checkpointId = config.configurable?.checkpoint_id;

    if (!threadId) {
      return undefined;
    }

    const query: any = { thread_id: threadId, checkpoint_ns: checkpointNs };
    if (checkpointId) {
      query.checkpoint_id = checkpointId;
    }

    const doc = await this.collection
      .find(query)
      .sort({ created_at: -1 })
      .limit(1)
      .toArray();

    if (!doc || doc.length === 0) {
      return undefined;
    }

    const checkpointDoc = doc[0] as CheckpointDocument;
    
    const checkpoint = JSON.parse(checkpointDoc.checkpoint) as Checkpoint;
    const metadata = JSON.parse(checkpointDoc.metadata) as CheckpointMetadata;

    return {
      config: {
        configurable: {
          thread_id: checkpointDoc.thread_id,
          checkpoint_ns: checkpointDoc.checkpoint_ns,
          checkpoint_id: checkpointDoc.checkpoint_id,
        },
      },
      checkpoint,
      metadata,
      parentConfig: checkpointDoc.parent_checkpoint_id
        ? {
            configurable: {
              thread_id: checkpointDoc.thread_id,
              checkpoint_ns: checkpointDoc.checkpoint_ns,
              checkpoint_id: checkpointDoc.parent_checkpoint_id,
            },
          }
        : undefined,
    };
  }

  async *list(
    config: RunnableConfig,
    options?: { limit?: number; before?: RunnableConfig }
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? '';

    if (!threadId) {
      return;
    }

    const query: any = { thread_id: threadId, checkpoint_ns: checkpointNs };
    
    if (options?.before?.configurable?.checkpoint_id) {
      const beforeDoc = await this.collection.findOne({
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: options.before.configurable.checkpoint_id,
      });
      if (beforeDoc) {
        query.created_at = { $lt: beforeDoc.created_at };
      }
    }

    const cursor = this.collection
      .find(query)
      .sort({ created_at: -1 })
      .limit(options?.limit ?? 10);

    for await (const doc of cursor) {
      const checkpointDoc = doc as CheckpointDocument;
      const checkpoint = JSON.parse(checkpointDoc.checkpoint) as Checkpoint;
      const metadata = JSON.parse(checkpointDoc.metadata) as CheckpointMetadata;

      yield {
        config: {
          configurable: {
            thread_id: checkpointDoc.thread_id,
            checkpoint_ns: checkpointDoc.checkpoint_ns,
            checkpoint_id: checkpointDoc.checkpoint_id,
          },
        },
        checkpoint,
        metadata,
        parentConfig: checkpointDoc.parent_checkpoint_id
          ? {
              configurable: {
                thread_id: checkpointDoc.thread_id,
                checkpoint_ns: checkpointDoc.checkpoint_ns,
                checkpoint_id: checkpointDoc.parent_checkpoint_id,
              },
            }
          : undefined,
      };
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const parentCheckpointId = config.configurable?.checkpoint_id;

    if (!threadId) {
      throw new Error('thread_id is required');
    }

    const checkpointId = checkpoint.id;

    const doc: CheckpointDocument = {
      thread_id: threadId,
      checkpoint_ns: checkpointNs,
      checkpoint_id: checkpointId,
      parent_checkpoint_id: parentCheckpointId,
      checkpoint: JSON.stringify(checkpoint),
      metadata: JSON.stringify(metadata),
      created_at: new Date(),
    };

    await this.collection.updateOne(
      { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: checkpointId },
      { $set: doc },
      { upsert: true }
    );

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: [string, unknown][],
    taskId: string
  ): Promise<void> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const checkpointId = config.configurable?.checkpoint_id;

    if (!threadId || !checkpointId) {
      return;
    }

    const operations = writes.map(([channel, value], idx) => ({
      updateOne: {
        filter: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: checkpointId,
          task_id: taskId,
          idx,
        },
        update: {
          $set: {
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: checkpointId,
            task_id: taskId,
            idx,
            channel,
            value: JSON.stringify(value),
            created_at: new Date(),
          },
        },
        upsert: true,
      },
    }));

    if (operations.length > 0) {
      await this.writesCollection.bulkWrite(operations);
    }
  }
}
