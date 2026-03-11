-- Seed realistic analytics data spanning last 90 days
-- IDs match MongoDB ObjectId strings for cross-database entity correlation
--
-- Performance tiers create detectable patterns for AI summaries:
--   Campaign tiers: Stars (+15-40% ROI), Steady (+0-10%), Struggling (-5-20%)
--   Traffic source quality: Premium > Mid-tier > Budget
--   Temporal trend: performance improves over the 90-day window
--   Country tiers: High-value (US,UK,CA,AU) > Mid (DE,FR,JP) > Emerging (BR,IN,MX)
--   Device patterns: Desktop high-conversion, Mobile high-volume, Tablet mid

DO $$
DECLARE
  d DATE;
  day_offset INT;
  day_factor NUMERIC;

  -- Campaign IDs match MongoDB init.js ObjectIds (bbb prefix)
  camp_ids TEXT[] := ARRAY[
    'bbb000000000000000000001','bbb000000000000000000002','bbb000000000000000000003',
    'bbb000000000000000000004','bbb000000000000000000005','bbb000000000000000000006',
    'bbb000000000000000000007','bbb000000000000000000008','bbb000000000000000000009',
    'bbb000000000000000000010'
  ];
  camp_names TEXT[] := ARRAY[
    'Summer Promo','Holiday Sale','Brand Awareness Q1','Retargeting US','Lead Gen EU',
    'Mobile Push','Native Content','Video Engagement','Search Intent','Social Discovery'
  ];
  -- Campaign revenue multipliers (Stars > Steady > Struggling)
  camp_rev_mult NUMERIC[] := ARRAY[
    1.8, 1.0, 0.6, 1.6, 1.0,
    0.7, 1.05, 0.55, 1.5, 0.75
  ];
  -- Campaign spend efficiency (lower = more efficient)
  camp_spend_mult NUMERIC[] := ARRAY[
    0.7, 0.95, 1.3, 0.75, 0.92,
    1.2, 0.90, 1.25, 0.72, 1.15
  ];

  -- Traffic Source IDs match MongoDB init.js ObjectIds (aaa prefix)
  ts_ids TEXT[] := ARRAY[
    'aaa000000000000000000001','aaa000000000000000000002',
    'aaa000000000000000000003','aaa000000000000000000004',
    'aaa000000000000000000005'
  ];
  ts_names TEXT[] := ARRAY[
    'Google Ads','Facebook Ads','Taboola Native','TikTok Ads','Outbrain Discovery'
  ];
  -- Traffic source click volume multipliers
  ts_click_mult NUMERIC[] := ARRAY[1.2, 1.3, 0.9, 1.1, 0.8];
  -- Traffic source conversion quality multipliers
  ts_conv_mult NUMERIC[] := ARRAY[1.3, 1.2, 0.9, 0.95, 0.7];

  -- Offer IDs match MongoDB init.js ObjectIds (ccc prefix)
  offer_ids TEXT[] := ARRAY[
    'ccc000000000000000000001','ccc000000000000000000002',
    'ccc000000000000000000003','ccc000000000000000000004',
    'ccc000000000000000000005'
  ];
  offer_names TEXT[] := ARRAY[
    'Premium Subscription','Free Trial Signup','E-Book Download',
    'Webinar Registration','App Install'
  ];
  -- Affiliate IDs match MongoDB init.js ObjectIds (ddd prefix)
  aff_ids TEXT[] := ARRAY[
    'ddd000000000000000000001','ddd000000000000000000002',
    'ddd000000000000000000003'
  ];
  aff_names TEXT[] := ARRAY[
    'Performance Partners','Digital Media Co','Growth Network'
  ];

  countries TEXT[] := ARRAY['US','UK','CA','DE','FR','AU','BR','IN','JP','MX'];
  -- Country revenue multipliers: High-value > Mid > Emerging
  country_rev_mult NUMERIC[] := ARRAY[1.3, 1.25, 1.2, 1.0, 1.0, 1.15, 0.7, 0.65, 1.05, 0.7];

  devices TEXT[] := ARRAY['Desktop','Mobile','Tablet'];
  -- Device click multiplier / conversion multiplier
  dev_click_mult NUMERIC[] := ARRAY[1.0, 1.4, 0.6];
  dev_conv_mult NUMERIC[] := ARRAY[1.2, 0.8, 1.0];

  os_types TEXT[] := ARRAY['Windows','macOS','iOS','Android','Linux'];
  browsers TEXT[] := ARRAY['Chrome','Safari','Firefox','Edge','Samsung Internet'];
  -- Landing Page IDs match MongoDB init.js ObjectIds (eee prefix)
  lp_ids TEXT[] := ARRAY[
    'eee000000000000000000001','eee000000000000000000002',
    'eee000000000000000000003'
  ];
  lp_names TEXT[] := ARRAY['Main LP v1','Main LP v2','Mobile LP'];
  -- Rotation IDs match MongoDB init.js ObjectIds (fff prefix)
  rot_ids TEXT[] := ARRAY[
    'fff000000000000000000001','fff000000000000000000002'
  ];
  rot_names TEXT[] := ARRAY['US Desktop Rotation','EU Mobile Rotation'];

  i INT;
  j INT;
  c_idx INT;
  d_idx INT;
  o_idx INT;
  b_idx INT;
  off_idx INT;
  aff_idx INT;
  lp_idx INT;
  rot_idx INT;
  raw_clicks INT;
  raw_rev NUMERIC;
  raw_spent NUMERIC;
  final_clicks INT;
  final_rev NUMERIC;
  final_spent NUMERIC;
  noise NUMERIC;
BEGIN
  FOR d IN SELECT generate_series(
    CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE, '1 day'
  )::DATE LOOP
    -- day_offset: 0 = oldest, 90 = today
    day_offset := EXTRACT(DAY FROM (d - (CURRENT_DATE - INTERVAL '90 days')))::INT;
    -- Temporal trend: performance improves over time (0.7 → 1.3)
    day_factor := 0.7 + (day_offset::NUMERIC / 90.0) * 0.6;

    FOR i IN 1..array_length(camp_ids, 1) LOOP
      FOR j IN 1..array_length(ts_ids, 1) LOOP
        -- Random entity assignments for country, device, os, browser, etc.
        c_idx := floor(random() * 10 + 1)::INT;
        d_idx := floor(random() * 3 + 1)::INT;
        o_idx := floor(random() * 5 + 1)::INT;
        b_idx := floor(random() * 5 + 1)::INT;
        off_idx := floor(random() * 5 + 1)::INT;
        aff_idx := floor(random() * 3 + 1)::INT;
        lp_idx := floor(random() * 3 + 1)::INT;
        rot_idx := floor(random() * 2 + 1)::INT;

        -- Base clicks: 100-400, shaped by traffic source and device
        raw_clicks := (200 + random() * 200)::INT;
        final_clicks := greatest(10, (
          raw_clicks
          * ts_click_mult[j]
          * dev_click_mult[d_idx]
          * day_factor
          * (0.85 + random() * 0.30)  -- ±15% noise
        )::INT);

        -- Revenue: shaped by campaign tier, traffic quality, country, temporal trend
        raw_rev := 80 + random() * 60;
        noise := 0.85 + random() * 0.30;
        final_rev := round(greatest(0.01, (
          raw_rev
          * camp_rev_mult[i]
          * ts_conv_mult[j]
          * country_rev_mult[c_idx]
          * dev_conv_mult[d_idx]
          * day_factor
          * noise
        )::NUMERIC), 4);

        -- Spent: shaped by campaign spend efficiency, traffic source cost
        raw_spent := 60 + random() * 50;
        noise := 0.85 + random() * 0.30;
        final_spent := round(greatest(0.01, (
          raw_spent
          * camp_spend_mult[i]
          * (ts_click_mult[j] * 0.9)
          * day_factor
          * noise
        )::NUMERIC), 4);

        INSERT INTO analytics_data (
          report_date, campaign_id, campaign_name,
          traffic_source_id, traffic_source_name,
          offer_id, offer_name,
          affiliate_id, affiliate_name,
          country, device, os, browser,
          landing_page_id, landing_page_name,
          rotation_id, rotation_name,
          clicks, offer_clicks, offer_views, conversions,
          revenue, spent, profit
        ) VALUES (
          d, camp_ids[i], camp_names[i],
          ts_ids[j], ts_names[j],
          offer_ids[off_idx], offer_names[off_idx],
          aff_ids[aff_idx], aff_names[aff_idx],
          countries[c_idx],
          devices[d_idx],
          os_types[o_idx],
          browsers[b_idx],
          lp_ids[lp_idx], lp_names[lp_idx],
          rot_ids[rot_idx], rot_names[rot_idx],
          final_clicks,
          (final_clicks * (0.6 + random() * 0.2))::INT,
          (final_clicks * (1.0 + random() * 0.4))::INT,
          greatest(1, (final_clicks * (0.03 + random() * 0.04))::INT),
          final_rev, final_spent,
          final_rev - final_spent
        );
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
