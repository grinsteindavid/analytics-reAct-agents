/**
 * Tests for campaign-lookup-tool
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

jest.mock('../../data-access/mongodb/campaigns', () => ({
  getAllCampaigns: jest.fn(),
}));

import { getAllCampaigns } from '../../data-access/mongodb/campaigns';
import { createCampaignLookupTool } from '../campaign-lookup-tool';
import { DatabaseContext } from '../../types/context';

const mockGetAllCampaigns = getAllCampaigns as jest.MockedFunction<typeof getAllCampaigns>;

describe('CampaignLookupTool', () => {
  let mockContext: DatabaseContext;
  let mockQuery: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create chainable mock query
    mockQuery = {
      populate: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };

    mockGetAllCampaigns.mockReturnValue(mockQuery as any);

    mockContext = {
      mongoose: {} as any,
      mongooseConnection: {} as any,
    };
  });

  describe('Basic Execution', () => {
    it('should lookup campaigns successfully', async () => {
      const mockData = [
        { _id: '123', name: 'Campaign 1', status: 'active', trafficSource: { _id: 'ts1', name: 'Google' } },
        { _id: '456', name: 'Campaign 2', status: 'active', trafficSource: { _id: 'ts2', name: 'Facebook' } },
      ];
      mockQuery.lean.mockResolvedValue(mockData);

      const tool = createCampaignLookupTool(mockContext);

      const input = {
        status: 'active' as const,
        limit: 25,
      };

      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toHaveLength(2);
      expect(parsed.count).toBe(2);
      expect(parsed.entityType).toBe('Campaign');
      expect(mockGetAllCampaigns).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockQuery.lean.mockRejectedValue(new Error('Database connection failed'));

      const tool = createCampaignLookupTool(mockContext);

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

      const tool = createCampaignLookupTool(mockContext);

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

      const tool = createCampaignLookupTool(noMongooseContext);

      const input = {
        status: 'active' as const,
      };

      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Mongoose connection not initialized');
    });
  });

  describe('Status Filters', () => {
    it('should filter by active status', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createCampaignLookupTool(mockContext);

      const input = {
        status: 'active' as const,
      };

      await tool.invoke(input as any);

      expect(mockGetAllCampaigns).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' })
      );
    });

    it('should filter by not_active status', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createCampaignLookupTool(mockContext);

      const input = {
        status: 'not_active' as const,
      };

      await tool.invoke(input as any);

      expect(mockGetAllCampaigns).toHaveBeenCalledWith(
        expect.objectContaining({ status: { $ne: 'active' } })
      );
    });

    it('should not filter by status when "any"', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createCampaignLookupTool(mockContext);

      const input = {
        status: 'any' as const,
      };

      await tool.invoke(input as any);

      const calledFilter = mockGetAllCampaigns.mock.calls[0]?.[0];
      expect(calledFilter?.status).toBeUndefined();
    });
  });

  describe('Traffic Source Filter', () => {
    it('should filter by traffic source IDs', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createCampaignLookupTool(mockContext);

      const input = {
        status: 'any' as const,
        trafficSourceIds: ['ts1', 'ts2', 'ts3'],
      };

      await tool.invoke(input as any);

      expect(mockGetAllCampaigns).toHaveBeenCalledWith(
        expect.objectContaining({
          trafficSource: { $in: ['ts1', 'ts2', 'ts3'] },
        })
      );
    });

    it('should not filter by traffic source when not provided', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createCampaignLookupTool(mockContext);

      const input = {
        status: 'active' as const,
      };

      await tool.invoke(input as any);

      const calledFilter = mockGetAllCampaigns.mock.calls[0]?.[0];
      expect(calledFilter?.trafficSource).toBeUndefined();
    });
  });

  describe('ID Filter', () => {
    it('should filter by specific campaign IDs', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createCampaignLookupTool(mockContext);

      const input = {
        status: 'any' as const,
        ids: ['camp1', 'camp2'],
      };

      await tool.invoke(input as any);

      expect(mockGetAllCampaigns).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $in: ['camp1', 'camp2'] },
        })
      );
    });
  });

  describe('Limit', () => {
    it('should respect limit parameter', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createCampaignLookupTool(mockContext);

      const input = {
        status: 'active' as const,
        limit: 10,
      };

      await tool.invoke(input as any);

      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    it('should use default limit of 25', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createCampaignLookupTool(mockContext);

      const input = {
        status: 'active' as const,
      };

      await tool.invoke(input as any);

      expect(mockQuery.limit).toHaveBeenCalledWith(25);
    });
  });

  describe('Population', () => {
    it('should populate trafficSource reference', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createCampaignLookupTool(mockContext);

      const input = {
        status: 'active' as const,
      };

      await tool.invoke(input as any);

      expect(mockQuery.populate).toHaveBeenCalledWith({
        path: 'trafficSource',
        select: '_id api.name name',
      });
    });
  });

  describe('Sorting', () => {
    it('should sort by created_on descending', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createCampaignLookupTool(mockContext);

      const input = {
        status: 'active' as const,
      };

      await tool.invoke(input as any);

      expect(mockQuery.sort).toHaveBeenCalledWith({ created_on: -1 });
    });
  });

  describe('Combined Filters', () => {
    it('should combine multiple filters', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createCampaignLookupTool(mockContext);

      const input = {
        status: 'active' as const,
        trafficSourceIds: ['ts1'],
        ids: ['camp1', 'camp2'],
        limit: 50,
      };

      await tool.invoke(input as any);

      expect(mockGetAllCampaigns).toHaveBeenCalledWith({
        status: 'active',
        trafficSource: { $in: ['ts1'] },
        _id: { $in: ['camp1', 'camp2'] },
      });
      expect(mockQuery.limit).toHaveBeenCalledWith(50);
    });
  });
});
