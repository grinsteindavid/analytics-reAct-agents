/**
 * Tests for traffic-source-lookup-tool
 * Following Jest mocking best practices:
 * - Mock ONLY dependencies, NOT the tool itself
 * - Test the REAL tool with mocked dependencies
 */

// Mock dependencies BEFORE imports
jest.mock('../../data-access/redis/cache-helper', () => ({
  CacheHelper: {
    withCache: jest.fn((_key: string, _params: any, fn: () => Promise<any>) => fn().then((result: any) => ({ result, cached: false }))),
  },
}));

jest.mock('../../data-access/mongodb/traffic-sources', () => ({
  getAllTrafficSources: jest.fn(),
}));

import { getAllTrafficSources } from '../../data-access/mongodb/traffic-sources';
import { createTrafficSourceLookupTool } from '../traffic-source-lookup-tool';
import { DatabaseContext } from '../../types/context';

const mockGetAllTrafficSources = getAllTrafficSources as jest.MockedFunction<typeof getAllTrafficSources>;

describe('TrafficSourceLookupTool', () => {
  let mockContext: DatabaseContext;
  let mockQuery: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create chainable mock query
    mockQuery = {
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };

    mockGetAllTrafficSources.mockReturnValue(mockQuery as any);

    mockContext = {
      mongoose: {} as any,
      mongooseConnection: {} as any,
    };
  });

  describe('Basic Execution', () => {
    it('should lookup traffic sources successfully', async () => {
      const mockData = [
        { _id: 'ts1', name: 'Google Ads Account', status: 'active', api: { name: 'GOOGLE' } },
        { _id: 'ts2', name: 'FB Account', status: 'active', api: { name: 'FACEBOOK' } },
      ];
      mockQuery.lean.mockResolvedValue(mockData);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        status: 'active' as const,
        limit: 10,
      };

      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toHaveLength(2);
      expect(parsed.count).toBe(2);
      expect(parsed.entityType).toBe('TrafficSource');
      expect(mockGetAllTrafficSources).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockQuery.lean.mockRejectedValue(new Error('Database connection failed'));

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        status: 'active' as const,
      };

      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Database connection failed');
      expect(parsed.data).toEqual([]);
    });

    it('should handle empty results', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        status: 'active' as const,
      };

      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual([]);
      expect(parsed.count).toBe(0);
    });

    it('should error when mongoose not initialized', async () => {
      const noMongooseContext: DatabaseContext = {
        mongoose: null as any,
        mongooseConnection: null as any,
      };

      const tool = createTrafficSourceLookupTool(noMongooseContext);

      const input = {
        status: 'active' as const,
      };

      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Mongoose connection not initialized');
    });
  });

  describe('API Name Filter (Platform)', () => {
    it('should filter by GOOGLE platform', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        apiName: 'GOOGLE' as const,
        status: 'any' as const,
      };

      await tool.invoke(input as any);

      expect(mockGetAllTrafficSources).toHaveBeenCalledWith(
        expect.objectContaining({ 'api.name': 'GOOGLE' })
      );
    });

    it('should filter by FACEBOOK platform', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        apiName: 'FACEBOOK' as const,
        status: 'any' as const,
      };

      await tool.invoke(input as any);

      expect(mockGetAllTrafficSources).toHaveBeenCalledWith(
        expect.objectContaining({ 'api.name': 'FACEBOOK' })
      );
    });

    it('should filter by TABOOLA platform', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        apiName: 'TABOOLA' as const,
        status: 'any' as const,
      };

      await tool.invoke(input as any);

      expect(mockGetAllTrafficSources).toHaveBeenCalledWith(
        expect.objectContaining({ 'api.name': 'TABOOLA' })
      );
    });

    it('should not filter by platform when not provided', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        status: 'active' as const,
      };

      await tool.invoke(input as any);

      const calledFilter = mockGetAllTrafficSources.mock.calls[0]?.[0];
      expect(calledFilter?.['api.name']).toBeUndefined();
    });
  });

  describe('Status Filters', () => {
    it('should filter by active status', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        status: 'active' as const,
      };

      await tool.invoke(input as any);

      expect(mockGetAllTrafficSources).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' })
      );
    });

    it('should filter by not_active status', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        status: 'not_active' as const,
      };

      await tool.invoke(input as any);

      expect(mockGetAllTrafficSources).toHaveBeenCalledWith(
        expect.objectContaining({ status: { $ne: 'active' } })
      );
    });

    it('should not filter by status when "any"', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        status: 'any' as const,
      };

      await tool.invoke(input as any);

      const calledFilter = mockGetAllTrafficSources.mock.calls[0]?.[0];
      expect(calledFilter?.status).toBeUndefined();
    });
  });

  describe('ID Filter', () => {
    it('should filter by specific traffic source IDs', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        status: 'any' as const,
        ids: ['ts1', 'ts2'],
      };

      await tool.invoke(input as any);

      expect(mockGetAllTrafficSources).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $in: ['ts1', 'ts2'] },
        })
      );
    });
  });

  describe('Limit', () => {
    it('should respect limit parameter', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        status: 'active' as const,
        limit: 5,
      };

      await tool.invoke(input as any);

      expect(mockQuery.limit).toHaveBeenCalledWith(5);
    });

    it('should use default limit of 10', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        status: 'active' as const,
      };

      await tool.invoke(input as any);

      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('Sorting', () => {
    it('should sort by api.name ascending', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        status: 'active' as const,
      };

      await tool.invoke(input as any);

      expect(mockQuery.sort).toHaveBeenCalledWith({ 'api.name': 1 });
    });
  });

  describe('Field Selection', () => {
    it('should select correct fields including api.name', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        status: 'active' as const,
      };

      await tool.invoke(input as any);

      expect(mockQuery.select).toHaveBeenCalledWith(
        '_id name status api.name shortname created_on updated_on'
      );
    });
  });

  describe('Combined Filters', () => {
    it('should combine platform and status filters', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        apiName: 'GOOGLE' as const,
        status: 'active' as const,
        limit: 20,
      };

      await tool.invoke(input as any);

      expect(mockGetAllTrafficSources).toHaveBeenCalledWith({
        'api.name': 'GOOGLE',
        status: 'active',
      });
      expect(mockQuery.limit).toHaveBeenCalledWith(20);
    });

    it('should combine all filters', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createTrafficSourceLookupTool(mockContext);

      const input = {
        apiName: 'MEDIAGO' as const,
        status: 'active' as const,
        ids: ['ts1'],
        limit: 50,
      };

      await tool.invoke(input as any);

      expect(mockGetAllTrafficSources).toHaveBeenCalledWith({
        'api.name': 'MEDIAGO',
        status: 'active',
        _id: { $in: ['ts1'] },
      });
    });
  });
});
