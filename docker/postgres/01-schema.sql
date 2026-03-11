-- Analytics data schema for drilldown reports
CREATE TABLE IF NOT EXISTS analytics_data (
  id SERIAL PRIMARY KEY,
  report_date DATE NOT NULL,
  campaign_id VARCHAR(50),
  campaign_name VARCHAR(255),
  traffic_source_id VARCHAR(50),
  traffic_source_name VARCHAR(255),
  offer_id VARCHAR(50),
  offer_name VARCHAR(255),
  affiliate_id VARCHAR(50),
  affiliate_name VARCHAR(255),
  country VARCHAR(10),
  device VARCHAR(50),
  os VARCHAR(50),
  browser VARCHAR(50),
  landing_page_id VARCHAR(50),
  landing_page_name VARCHAR(255),
  rotation_id VARCHAR(50),
  rotation_name VARCHAR(255),
  clicks INTEGER DEFAULT 0,
  offer_clicks INTEGER DEFAULT 0,
  offer_views INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue NUMERIC(12, 4) DEFAULT 0,
  spent NUMERIC(12, 4) DEFAULT 0,
  profit NUMERIC(12, 4) DEFAULT 0,
  created_on TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_analytics_date ON analytics_data(report_date);
CREATE INDEX idx_analytics_campaign ON analytics_data(campaign_id);
CREATE INDEX idx_analytics_traffic_source ON analytics_data(traffic_source_id);
CREATE INDEX idx_analytics_offer ON analytics_data(offer_id);
CREATE INDEX idx_analytics_affiliate ON analytics_data(affiliate_id);
