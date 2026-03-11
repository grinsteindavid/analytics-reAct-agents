/**
 * Tests for generic-entity-lookup-tool
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

import { createGenericEntityLookupTool } from '../generic-entity-lookup-tool';
import { DatabaseContext } from '../../types/context';

describe('GenericEntityLookupTool', () => {
  let mockContext: DatabaseContext;
  let mockModel: any;
  let mockQuery: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create chainable mock query
    mockQuery = {
      find: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };

    mockModel = {
      find: jest.fn(() => mockQuery),
    };

    mockContext = {
      mongoose: {
        models: {
          Affiliate: mockModel,
          Offer: mockModel,
          LandingPage: mockModel,
          Rotation: mockModel,
          User: mockModel,
          Group: mockModel,
          Tag: mockModel,
          OfferCategory: mockModel,
          OffersGroup: mockModel,
          LandingPagesGroup: mockModel,
        },
      } as any,
      mongooseConnection: {} as any,
    };
  });

  describe('Basic Execution', () => {
    it('should lookup entities successfully', async () => {
      const mockData = [
        { _id: '123', name: 'Test Affiliate', status: 'active', created_on: new Date() },
        { _id: '456', name: 'Another Affiliate', status: 'active', created_on: new Date() },
      ];
      mockQuery.lean.mockResolvedValue(mockData);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Affiliate' as const,
        filter: { status: 'active' as const },
        limit: 25,
      };

      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toHaveLength(2);
      expect(parsed.count).toBe(2);
      expect(parsed.entityType).toBe('Affiliate');
      expect(mockModel.find).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockQuery.lean.mockRejectedValue(new Error('Database connection failed'));

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Affiliate' as const,
        filter: {},
      };

      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Database connection failed');
      expect(parsed.data).toEqual([]);
    });

    it('should handle empty results', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Offer' as const,
        filter: { status: 'active' as const },
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

      const tool = createGenericEntityLookupTool(noMongooseContext);

      const input = {
        entityType: 'Affiliate' as const,
        filter: {},
      };

      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Mongoose connection not initialized');
    });
  });

  describe('Status Filters', () => {
    it('should filter by active status', async () => {
      mockQuery.lean.mockResolvedValue([{ _id: '1', status: 'active' }]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Offer' as const,
        filter: { status: 'active' as const },
      };

      await tool.invoke(input as any);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' })
      );
    });

    it('should filter by not_active status', async () => {
      mockQuery.lean.mockResolvedValue([{ _id: '1', status: 'inactive' }]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Offer' as const,
        filter: { status: 'not_active' as const },
      };

      await tool.invoke(input as any);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: { $ne: 'active' } })
      );
    });

    it('should not filter by status when "any"', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Offer' as const,
        filter: { status: 'any' as const },
      };

      await tool.invoke(input as any);

      const calledFilter = mockModel.find.mock.calls[0][0];
      expect(calledFilter.status).toBeUndefined();
    });
  });

  describe('Rotation Status Filter (Special Case)', () => {
    it('should use special status filter for active Rotations', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Rotation' as const,
        filter: { status: 'active' as const },
      };

      await tool.invoke(input as any);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [{ status: 'on' }, { status: true }],
          archiveStatus: 'active',
        })
      );
    });

    it('should use special status filter for not_active Rotations', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Rotation' as const,
        filter: { status: 'not_active' as const },
      };

      await tool.invoke(input as any);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { status: { $in: ['off', false] } },
            { archiveStatus: { $ne: 'active' } },
          ],
        })
      );
    });
  });

  describe('Name Filter', () => {
    it('should filter by name with case-insensitive regex', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Offer' as const,
        filter: { name: 'test offer' },
      };

      await tool.invoke(input as any);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          name: { $regex: 'test offer', $options: 'i' },
        })
      );
    });
  });

  describe('ID Filter', () => {
    it('should filter by specific IDs', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'LandingPage' as const,
        filter: { ids: ['id1', 'id2', 'id3'] },
      };

      await tool.invoke(input as any);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $in: ['id1', 'id2', 'id3'] },
        })
      );
    });
  });

  describe('Extra Fields', () => {
    it('should include extra fields beyond minimum', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Offer' as const,
        filter: {},
        extraFields: ['url', 'payout', 'category'],
      };

      await tool.invoke(input as any);

      expect(mockQuery.select).toHaveBeenCalledWith(
        expect.stringContaining('url')
      );
      expect(mockQuery.select).toHaveBeenCalledWith(
        expect.stringContaining('payout')
      );
    });

    it('should not duplicate minimum fields in extraFields', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Offer' as const,
        filter: {},
        extraFields: ['_id', 'name', 'custom_field'], // _id and name are already minimum
      };

      await tool.invoke(input as any);

      const selectArg = mockQuery.select.mock.calls[0][0];
      // Should not have duplicates
      const fields = selectArg.split(' ');
      const uniqueFields = [...new Set(fields)];
      expect(fields.length).toBe(uniqueFields.length);
    });
  });

  describe('Limit', () => {
    it('should respect limit parameter', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Affiliate' as const,
        filter: {},
        limit: 10,
      };

      await tool.invoke(input as any);

      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    it('should use default limit of 25', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Affiliate' as const,
        filter: {},
      };

      await tool.invoke(input as any);

      expect(mockQuery.limit).toHaveBeenCalledWith(25);
    });
  });

  describe('Entity Types', () => {
    it.each([
      'Affiliate',
      'Offer',
      'LandingPage',
      'Rotation',
      'User',
      'Group',
      'Tag',
      'OfferCategory',
      'OffersGroup',
      'LandingPagesGroup',
    ] as const)('should support %s entity type', async (entityType) => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType,
        filter: {},
      };

      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.entityType).toBe(entityType);
    });

    it('should return error for unknown model', async () => {
      const contextWithMissingModel: DatabaseContext = {
        mongoose: {
          models: {}, // No models
        } as any,
        mongooseConnection: {} as any,
      };

      const tool = createGenericEntityLookupTool(contextWithMissingModel);

      const input = {
        entityType: 'Affiliate' as const,
        filter: {},
      };

      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Model not found: Affiliate');
    });
  });

  describe('Sorting', () => {
    it('should sort by created_on descending', async () => {
      mockQuery.lean.mockResolvedValue([]);

      const tool = createGenericEntityLookupTool(mockContext);

      const input = {
        entityType: 'Offer' as const,
        filter: {},
      };

      await tool.invoke(input as any);

      expect(mockQuery.sort).toHaveBeenCalledWith({ created_on: -1 });
    });
  });
});
