// MongoDB seed data for entity lookup tools
// Collections match Mongoose schemas registered in connection.ts

db = db.getSiblingDB('analytics');

// Traffic Sources
db.trafficsources.insertMany([
  { _id: ObjectId('aaa000000000000000000001'), name: 'Google Ads', status: 'active', shortname: 'google', api: { name: 'GOOGLE' }, created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('aaa000000000000000000002'), name: 'Facebook Ads', status: 'active', shortname: 'facebook', api: { name: 'FACEBOOK' }, created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('aaa000000000000000000003'), name: 'Taboola Native', status: 'active', shortname: 'taboola', api: { name: 'TABOOLA' }, created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('aaa000000000000000000004'), name: 'TikTok Ads', status: 'active', shortname: 'tiktok', api: { name: 'TIKTOK' }, created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('aaa000000000000000000005'), name: 'Outbrain Discovery', status: 'active', shortname: 'outbrain', api: { name: 'OUTBRAIN' }, created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('aaa000000000000000000006'), name: 'Old Search Network', status: 'not_active', shortname: 'oldsearch', api: { name: 'GOOGLE' }, created_on: new Date(), updated_on: new Date() },
]);

// Campaigns
db.campaigns.insertMany([
  { _id: ObjectId('bbb000000000000000000001'), name: 'Summer Promo', status: 'active', trafficSource: ObjectId('aaa000000000000000000001'), created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('bbb000000000000000000002'), name: 'Holiday Sale', status: 'active', trafficSource: ObjectId('aaa000000000000000000002'), created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('bbb000000000000000000003'), name: 'Brand Awareness Q1', status: 'active', trafficSource: ObjectId('aaa000000000000000000003'), created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('bbb000000000000000000004'), name: 'Retargeting US', status: 'active', trafficSource: ObjectId('aaa000000000000000000001'), created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('bbb000000000000000000005'), name: 'Lead Gen EU', status: 'active', trafficSource: ObjectId('aaa000000000000000000002'), created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('bbb000000000000000000006'), name: 'Mobile Push', status: 'active', trafficSource: ObjectId('aaa000000000000000000004'), created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('bbb000000000000000000007'), name: 'Native Content', status: 'active', trafficSource: ObjectId('aaa000000000000000000003'), created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('bbb000000000000000000008'), name: 'Video Engagement', status: 'active', trafficSource: ObjectId('aaa000000000000000000004'), created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('bbb000000000000000000009'), name: 'Search Intent', status: 'active', trafficSource: ObjectId('aaa000000000000000000001'), created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('bbb000000000000000000010'), name: 'Social Discovery', status: 'active', trafficSource: ObjectId('aaa000000000000000000005'), created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('bbb000000000000000000011'), name: 'Old Campaign', status: 'paused', trafficSource: ObjectId('aaa000000000000000000006'), created_on: new Date(), updated_on: new Date() },
]);

// Offers
db.offers.insertMany([
  { _id: ObjectId('ccc000000000000000000001'), name: 'Premium Subscription', status: 'active', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('ccc000000000000000000002'), name: 'Free Trial Signup', status: 'active', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('ccc000000000000000000003'), name: 'E-Book Download', status: 'active', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('ccc000000000000000000004'), name: 'Webinar Registration', status: 'active', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('ccc000000000000000000005'), name: 'App Install', status: 'active', created_on: new Date(), updated_on: new Date() },
]);

// Affiliates
db.affiliates.insertMany([
  { _id: ObjectId('ddd000000000000000000001'), name: 'Performance Partners', status: 'active', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('ddd000000000000000000002'), name: 'Digital Media Co', status: 'active', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('ddd000000000000000000003'), name: 'Growth Network', status: 'active', created_on: new Date(), updated_on: new Date() },
]);

// Landing Pages
db.landingpages.insertMany([
  { _id: ObjectId('eee000000000000000000001'), name: 'Main LP v1', status: 'active', url: 'https://example.com/lp1', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('eee000000000000000000002'), name: 'Main LP v2', status: 'active', url: 'https://example.com/lp2', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('eee000000000000000000003'), name: 'Mobile LP', status: 'active', url: 'https://example.com/mobile', created_on: new Date(), updated_on: new Date() },
]);

// Rotations
db.rotations.insertMany([
  { _id: ObjectId('fff000000000000000000001'), name: 'US Desktop Rotation', status: 'on', archiveStatus: 'active', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('fff000000000000000000002'), name: 'EU Mobile Rotation', status: 'on', archiveStatus: 'active', created_on: new Date(), updated_on: new Date() },
]);

// Groups
db.groups.insertMany([
  { _id: ObjectId('aab000000000000000000001'), name: 'High Performers', status: 'active', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('aab000000000000000000002'), name: 'Testing Group', status: 'active', created_on: new Date(), updated_on: new Date() },
]);

// Tags
db.tags.insertMany([
  { _id: ObjectId('aac000000000000000000001'), name: 'Priority', created_on: new Date() },
  { _id: ObjectId('aac000000000000000000002'), name: 'Seasonal', created_on: new Date() },
]);

// Users
db.users.insertMany([
  { _id: ObjectId('aad000000000000000000001'), name: 'Admin User', email: 'admin@example.com', status: 'active', created_on: new Date() },
  { _id: ObjectId('aad000000000000000000002'), name: 'Analyst User', email: 'analyst@example.com', status: 'active', created_on: new Date() },
]);

// Offer Categories
db.offercategories.insertMany([
  { _id: ObjectId('aae000000000000000000001'), name: 'Subscriptions', status: 'active', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('aae000000000000000000002'), name: 'Lead Generation', status: 'active', created_on: new Date(), updated_on: new Date() },
]);

// Offer Groups
db.offersgroups.insertMany([
  { _id: ObjectId('aaf000000000000000000001'), name: 'Top Offers', status: 'active', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('aaf000000000000000000002'), name: 'Testing Offers', status: 'active', created_on: new Date(), updated_on: new Date() },
]);

// Landing Page Groups
db.landingpagegroups.insertMany([
  { _id: ObjectId('aa0000000000000000000001'), name: 'Desktop LPs', status: 'active', created_on: new Date(), updated_on: new Date() },
  { _id: ObjectId('aa0000000000000000000002'), name: 'Mobile LPs', status: 'active', created_on: new Date(), updated_on: new Date() },
]);

// Workflow Checkpoints (empty — populated at runtime)
db.createCollection('workflow_checkpoints');

print('MongoDB seed data loaded successfully');
