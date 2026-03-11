/**
 * Tests for DocumentDBCheckpointer
 * Critical for multi-turn conversation state persistence
 */

import { Checkpoint, CheckpointMetadata } from '@langchain/langgraph-checkpoint';
import { DocumentDBCheckpointer } from '../mongodb-checkpointer';

// Mock mongoose Connection
const mockCollection = {
  createIndex: jest.fn().mockResolvedValue(undefined),
  find: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
  bulkWrite: jest.fn().mockResolvedValue({ acknowledged: true }),
};

const mockConnection = {
  collection: jest.fn().mockReturnValue(mockCollection),
} as any;

describe('DocumentDBCheckpointer', () => {
  let checkpointer: DocumentDBCheckpointer;

  beforeEach(() => {
    jest.clearAllMocks();
    checkpointer = new DocumentDBCheckpointer(mockConnection, 'test_checkpoints');
  });

  describe('constructor', () => {
    it('should create collections with correct names', () => {
      expect(mockConnection.collection).toHaveBeenCalledWith('test_checkpoints');
      expect(mockConnection.collection).toHaveBeenCalledWith('test_checkpoints_writes');
    });

    it('should create indexes', () => {
      expect(mockCollection.createIndex).toHaveBeenCalledTimes(2);
      expect(mockCollection.createIndex).toHaveBeenCalledWith(
        { thread_id: 1, checkpoint_ns: 1, checkpoint_id: 1 },
        { unique: true }
      );
    });
  });

  describe('getTuple', () => {
    it('should return undefined when no thread_id provided', async () => {
      const result = await checkpointer.getTuple({ configurable: {} });
      expect(result).toBeUndefined();
    });

    it('should return undefined when no checkpoint found', async () => {
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await checkpointer.getTuple({
        configurable: { thread_id: 'test-thread' },
      });

      expect(result).toBeUndefined();
    });

    it('should return checkpoint tuple when found', async () => {
      const mockCheckpoint: Checkpoint = {
        v: 1,
        id: 'checkpoint-123',
        ts: '2025-12-12T00:00:00Z',
        channel_values: { question: 'test' },
        channel_versions: {},
        versions_seen: {},
        pending_sends: [],
      };

      const mockMetadata: CheckpointMetadata = {
        source: 'loop',
        step: 1,
        writes: {},
        parents: {},
      };

      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([{
              thread_id: 'test-thread',
              checkpoint_ns: '',
              checkpoint_id: 'checkpoint-123',
              checkpoint: JSON.stringify(mockCheckpoint),
              metadata: JSON.stringify(mockMetadata),
            }]),
          }),
        }),
      });

      const result = await checkpointer.getTuple({
        configurable: { thread_id: 'test-thread' },
      });

      expect(result).toBeDefined();
      expect(result?.checkpoint.id).toBe('checkpoint-123');
      expect(result?.config.configurable?.thread_id).toBe('test-thread');
    });

    it('should include parentConfig when parent_checkpoint_id exists', async () => {
      const mockCheckpoint: Checkpoint = {
        v: 1,
        id: 'checkpoint-456',
        ts: '2025-12-12T00:00:00Z',
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
        pending_sends: [],
      };

      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([{
              thread_id: 'test-thread',
              checkpoint_ns: '',
              checkpoint_id: 'checkpoint-456',
              parent_checkpoint_id: 'checkpoint-123',
              checkpoint: JSON.stringify(mockCheckpoint),
              metadata: JSON.stringify({ source: 'loop', step: 2, writes: {}, parents: {} }),
            }]),
          }),
        }),
      });

      const result = await checkpointer.getTuple({
        configurable: { thread_id: 'test-thread' },
      });

      expect(result?.parentConfig).toBeDefined();
      expect(result?.parentConfig?.configurable?.checkpoint_id).toBe('checkpoint-123');
    });
  });

  describe('put', () => {
    it('should throw error when no thread_id provided', async () => {
      const checkpoint: Checkpoint = {
        v: 1,
        id: 'test-id',
        ts: '2025-12-12T00:00:00Z',
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
        pending_sends: [],
      };

      await expect(
        checkpointer.put({ configurable: {} }, checkpoint, { source: 'loop', step: 1, writes: {}, parents: {} })
      ).rejects.toThrow('thread_id is required');
    });

    it('should save checkpoint and return config', async () => {
      const checkpoint: Checkpoint = {
        v: 1,
        id: 'new-checkpoint',
        ts: '2025-12-12T00:00:00Z',
        channel_values: { question: 'test question' },
        channel_versions: {},
        versions_seen: {},
        pending_sends: [],
      };

      const metadata: CheckpointMetadata = {
        source: 'loop',
        step: 1,
        writes: {},
        parents: {},
      };

      const result = await checkpointer.put(
        { configurable: { thread_id: 'test-thread' } },
        checkpoint,
        metadata
      );

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { thread_id: 'test-thread', checkpoint_ns: '', checkpoint_id: 'new-checkpoint' },
        expect.objectContaining({
          $set: expect.objectContaining({
            thread_id: 'test-thread',
            checkpoint_id: 'new-checkpoint',
          }),
        }),
        { upsert: true }
      );

      expect(result.configurable?.thread_id).toBe('test-thread');
      expect(result.configurable?.checkpoint_id).toBe('new-checkpoint');
    });

    it('should include parent_checkpoint_id when provided', async () => {
      const checkpoint: Checkpoint = {
        v: 1,
        id: 'child-checkpoint',
        ts: '2025-12-12T00:00:00Z',
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
        pending_sends: [],
      };

      await checkpointer.put(
        { configurable: { thread_id: 'test-thread', checkpoint_id: 'parent-checkpoint' } },
        checkpoint,
        { source: 'loop', step: 2, writes: {}, parents: {} }
      );

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({
            parent_checkpoint_id: 'parent-checkpoint',
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('putWrites', () => {
    it('should do nothing when no thread_id', async () => {
      await checkpointer.putWrites(
        { configurable: {} },
        [['channel1', 'value1']],
        'task-1'
      );

      expect(mockCollection.bulkWrite).not.toHaveBeenCalled();
    });

    it('should do nothing when no checkpoint_id', async () => {
      await checkpointer.putWrites(
        { configurable: { thread_id: 'test-thread' } },
        [['channel1', 'value1']],
        'task-1'
      );

      expect(mockCollection.bulkWrite).not.toHaveBeenCalled();
    });

    it('should save writes when valid config', async () => {
      await checkpointer.putWrites(
        { configurable: { thread_id: 'test-thread', checkpoint_id: 'checkpoint-1' } },
        [['channel1', { data: 'value1' }], ['channel2', { data: 'value2' }]],
        'task-1'
      );

      expect(mockCollection.bulkWrite).toHaveBeenCalledWith([
        expect.objectContaining({
          updateOne: expect.objectContaining({
            filter: expect.objectContaining({
              thread_id: 'test-thread',
              checkpoint_id: 'checkpoint-1',
              task_id: 'task-1',
              idx: 0,
            }),
          }),
        }),
        expect.objectContaining({
          updateOne: expect.objectContaining({
            filter: expect.objectContaining({
              idx: 1,
            }),
          }),
        }),
      ]);
    });

    it('should not call bulkWrite for empty writes array', async () => {
      await checkpointer.putWrites(
        { configurable: { thread_id: 'test-thread', checkpoint_id: 'checkpoint-1' } },
        [],
        'task-1'
      );

      expect(mockCollection.bulkWrite).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should yield nothing when no thread_id', async () => {
      const results: any[] = [];
      for await (const tuple of checkpointer.list({ configurable: {} })) {
        results.push(tuple);
      }
      expect(results).toHaveLength(0);
    });

    it('should yield checkpoints in order', async () => {
      const mockCheckpoints = [
        {
          thread_id: 'test-thread',
          checkpoint_ns: '',
          checkpoint_id: 'checkpoint-2',
          checkpoint: JSON.stringify({ v: 1, id: 'checkpoint-2', ts: '', channel_values: {}, channel_versions: {}, versions_seen: {}, pending_sends: [] }),
          metadata: JSON.stringify({ source: 'loop', step: 2, writes: {}, parents: {} }),
        },
        {
          thread_id: 'test-thread',
          checkpoint_ns: '',
          checkpoint_id: 'checkpoint-1',
          checkpoint: JSON.stringify({ v: 1, id: 'checkpoint-1', ts: '', channel_values: {}, channel_versions: {}, versions_seen: {}, pending_sends: [] }),
          metadata: JSON.stringify({ source: 'loop', step: 1, writes: {}, parents: {} }),
        },
      ];

      // Mock async iterator
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            [Symbol.asyncIterator]: async function* () {
              for (const doc of mockCheckpoints) {
                yield doc;
              }
            },
          }),
        }),
      });

      const results: any[] = [];
      for await (const tuple of checkpointer.list({ configurable: { thread_id: 'test-thread' } })) {
        results.push(tuple);
      }

      expect(results).toHaveLength(2);
      expect(results[0].checkpoint.id).toBe('checkpoint-2');
      expect(results[1].checkpoint.id).toBe('checkpoint-1');
    });
  });
});
