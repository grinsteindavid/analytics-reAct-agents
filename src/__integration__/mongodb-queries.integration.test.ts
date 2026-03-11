import mongoose from 'mongoose';
import { connectMongo, getMongoose } from '../data-access/mongodb/connection';
import { getAllCampaigns } from '../data-access/mongodb/campaigns';
import { getAllTrafficSources } from '../data-access/mongodb/traffic-sources';
import { Model } from '../data-access/mongodb/constants';

const MONGO_URI = 'mongodb://localhost:27017/analytics';

describe('Integration: MongoDB Queries', () => {
  beforeAll(async () => {
    await connectMongo(MONGO_URI);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  describe('getAllCampaigns', () => {
    it('should return seeded campaigns excluding deleted', async () => {
      const campaigns = await getAllCampaigns({}).lean();
      expect(campaigns.length).toBeGreaterThanOrEqual(10);
      campaigns.forEach((c: any) => {
        expect(c.status).not.toBe('deleted');
        expect(c.name).toBeDefined();
        expect(c._id).toBeDefined();
      });
    });

    it('should filter campaigns by status', async () => {
      const active = await getAllCampaigns({ status: 'active' }).lean();
      active.forEach((c: any) => {
        expect(c.status).toBe('active');
      });
    });
  });

  describe('getAllTrafficSources', () => {
    it('should return seeded traffic sources excluding deleted', async () => {
      const sources = await getAllTrafficSources({}).lean();
      expect(sources.length).toBeGreaterThanOrEqual(5);
      sources.forEach((s: any) => {
        expect(s.status).not.toBe('deleted');
        expect(s.name).toBeDefined();
      });
    });
  });

  describe('Generic entity queries via Mongoose models', () => {
    it('should query Offers', async () => {
      const m = getMongoose();
      const model = m.models[Model.OFFERS]!;
      const offers = await model.find({ status: 'active' }).lean();
      expect(offers.length).toBeGreaterThanOrEqual(5);
    });

    it('should query Affiliates', async () => {
      const m = getMongoose();
      const model = m.models[Model.AFFILIATES]!;
      const affiliates = await model.find({ status: 'active' }).lean();
      expect(affiliates.length).toBeGreaterThanOrEqual(3);
    });

    it('should query LandingPages', async () => {
      const m = getMongoose();
      const model = m.models[Model.LANDINGPAGES]!;
      const pages = await model.find({ status: 'active' }).lean();
      expect(pages.length).toBeGreaterThanOrEqual(3);
    });

    it('should query Rotations', async () => {
      const m = getMongoose();
      const model = m.models[Model.ROTATIONS]!;
      const rotations = await model.find({ status: 'on' }).lean();
      expect(rotations.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by name regex', async () => {
      const m = getMongoose();
      const model = m.models[Model.CAMPAIGNS]!;
      const results = await model.find({ name: { $regex: 'Summer', $options: 'i' } }).lean();
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect((results[0] as any).name).toContain('Summer');
    });

    it('should filter by specific IDs', async () => {
      const m = getMongoose();
      const model = m.models[Model.OFFERS]!;
      const targetId = 'ccc000000000000000000001';
      const results = await model.find({ _id: { $in: [targetId] } }).lean();
      expect(results.length).toBe(1);
      expect((results[0] as any).name).toBe('Premium Subscription');
    });
  });
});
