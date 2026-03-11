-- Seed realistic analytics data spanning last 30 days
-- IDs match MongoDB ObjectId strings for cross-database entity correlation

DO $$
DECLARE
  d DATE;
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
  -- Traffic Source IDs match MongoDB init.js ObjectIds (aaa prefix)
  ts_ids TEXT[] := ARRAY[
    'aaa000000000000000000001','aaa000000000000000000002',
    'aaa000000000000000000003','aaa000000000000000000004',
    'aaa000000000000000000005'
  ];
  ts_names TEXT[] := ARRAY[
    'Google Ads','Facebook Ads','Taboola Native','TikTok Ads','Outbrain Discovery'
  ];
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
  devices TEXT[] := ARRAY['Desktop','Mobile','Tablet'];
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
  base_clicks INT;
  base_rev NUMERIC;
  base_spent NUMERIC;
BEGIN
  FOR d IN SELECT generate_series(
    CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, '1 day'
  )::DATE LOOP
    FOR i IN 1..array_length(camp_ids, 1) LOOP
      FOR j IN 1..array_length(ts_ids, 1) LOOP
        base_clicks := (random() * 500 + 50)::INT;
        base_rev := round((random() * 200 + 10)::NUMERIC, 4);
        base_spent := round((random() * 150 + 5)::NUMERIC, 4);

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
          offer_ids[((i - 1) % 5) + 1], offer_names[((i - 1) % 5) + 1],
          aff_ids[((j - 1) % 3) + 1], aff_names[((j - 1) % 3) + 1],
          countries[((i + j) % 10) + 1],
          devices[((i + j) % 3) + 1],
          os_types[((i + j) % 5) + 1],
          browsers[((i + j + 1) % 5) + 1],
          lp_ids[((i + j) % 3) + 1], lp_names[((i + j) % 3) + 1],
          rot_ids[((i + j) % 2) + 1], rot_names[((i + j) % 2) + 1],
          base_clicks,
          (base_clicks * 0.7)::INT,
          (base_clicks * 1.2)::INT,
          (base_clicks * 0.05)::INT,
          base_rev, base_spent, base_rev - base_spent
        );
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
