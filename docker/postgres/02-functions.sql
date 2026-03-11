-- PL/pgSQL stored functions for analytics drilldown reports
-- Accept JSON queries, parse filters, and return aggregated metrics

-- Helper: build WHERE clause fragments from filters array
CREATE OR REPLACE FUNCTION _build_filter_clauses(query_json JSONB)
RETURNS TEXT AS $$
DECLARE
  filter_clause TEXT := '';
  f JSONB;
  filter_type TEXT;
  filter_ids JSONB;
  id_list TEXT;
BEGIN
  IF query_json->'filters' IS NULL THEN
    RETURN '';
  END IF;

  FOR f IN SELECT jsonb_array_elements(query_json->'filters') LOOP
    filter_type := f->>'type';
    filter_ids := f->'ids';

    -- Skip filters with empty or missing ids
    IF filter_ids IS NULL OR jsonb_array_length(filter_ids) = 0 THEN
      CONTINUE;
    END IF;

    -- Build comma-separated quoted id list
    SELECT string_agg(quote_literal(val), ',')
    INTO id_list
    FROM jsonb_array_elements_text(filter_ids) AS val;

    CASE filter_type
      WHEN 'Campaign' THEN
        filter_clause := filter_clause || format(' AND campaign_id IN (%s)', id_list);
      WHEN 'TrafficSource' THEN
        filter_clause := filter_clause || format(' AND traffic_source_id IN (%s)', id_list);
      WHEN 'Offer' THEN
        filter_clause := filter_clause || format(' AND offer_id IN (%s)', id_list);
      WHEN 'Affiliate' THEN
        filter_clause := filter_clause || format(' AND affiliate_id IN (%s)', id_list);
      WHEN 'LandingPage' THEN
        filter_clause := filter_clause || format(' AND landing_page_id IN (%s)', id_list);
      WHEN 'Rotation' THEN
        filter_clause := filter_clause || format(' AND rotation_id IN (%s)', id_list);
      WHEN 'Country', 'CountryCode', 'CountryName' THEN
        filter_clause := filter_clause || format(' AND country IN (%s)', id_list);
      WHEN 'Device', 'DeviceType' THEN
        filter_clause := filter_clause || format(' AND device IN (%s)', id_list);
      WHEN 'OS' THEN
        filter_clause := filter_clause || format(' AND os IN (%s)', id_list);
      WHEN 'Browser' THEN
        filter_clause := filter_clause || format(' AND browser IN (%s)', id_list);
      ELSE
        NULL; -- Ignore unknown filter types
    END CASE;
  END LOOP;

  RETURN filter_clause;
END;
$$ LANGUAGE plpgsql;


-- Helper: build HAVING clause from options.conditions array
-- Conditions apply to aggregated metric values (post-GROUP BY)
CREATE OR REPLACE FUNCTION _build_having_clauses(query_json JSONB)
RETURNS TEXT AS $$
DECLARE
  having_clause TEXT := '';
  c JSONB;
  cond_metric TEXT;
  cond_type TEXT;
  cond_value NUMERIC;
  metric_expr TEXT;
  op TEXT;
BEGIN
  IF query_json->'options'->'conditions' IS NULL THEN
    RETURN '';
  END IF;

  FOR c IN SELECT jsonb_array_elements(query_json->'options'->'conditions') LOOP
    cond_metric := c->>'metric';
    cond_type := c->>'type';
    cond_value := (c->>'value')::NUMERIC;

    -- Map metric name to aggregate SQL expression
    CASE cond_metric
      WHEN 'Clicks' THEN metric_expr := 'SUM(clicks)';
      WHEN 'Revenue' THEN metric_expr := 'SUM(revenue)';
      WHEN 'Spent' THEN metric_expr := 'SUM(spent)';
      WHEN 'Profit' THEN metric_expr := 'SUM(revenue - spent)';
      WHEN 'ROI%' THEN metric_expr := 'CASE WHEN SUM(spent) > 0 THEN ((SUM(revenue) - SUM(spent)) / SUM(spent)) * 100 ELSE 0 END';
      WHEN 'CPC' THEN metric_expr := 'CASE WHEN SUM(clicks) > 0 THEN SUM(spent) / SUM(clicks) ELSE 0 END';
      WHEN 'EPC' THEN metric_expr := 'CASE WHEN SUM(clicks) > 0 THEN SUM(revenue) / SUM(clicks) ELSE 0 END';
      WHEN 'CVRs' THEN metric_expr := 'SUM(conversions)';
      WHEN 'CR%' THEN metric_expr := 'CASE WHEN SUM(clicks) > 0 THEN (SUM(conversions)::NUMERIC / SUM(clicks)) * 100 ELSE 0 END';
      WHEN 'CTR%' THEN metric_expr := 'CASE WHEN SUM(offer_views) > 0 THEN (SUM(offer_clicks)::NUMERIC / SUM(offer_views)) * 100 ELSE 0 END';
      WHEN 'OfferClicks' THEN metric_expr := 'SUM(offer_clicks)';
      WHEN 'OfferViews' THEN metric_expr := 'SUM(offer_views)';
      ELSE CONTINUE; -- Skip unknown metrics
    END CASE;

    -- Map condition type to SQL operator
    CASE cond_type
      WHEN 'Is Greater Than' THEN op := '>';
      WHEN 'Is Less Than' THEN op := '<';
      WHEN 'Equal To' THEN op := '=';
      WHEN 'Not Equal To' THEN op := '!=';
      WHEN 'Greater Than or Equal To' THEN op := '>=';
      WHEN 'Less Than or Equal To' THEN op := '<=';
      ELSE CONTINUE; -- Skip unsupported operators (Is Between, Contains, etc.)
    END CASE;

    IF having_clause = '' THEN
      having_clause := format(' HAVING %s %s %s', metric_expr, op, cond_value);
    ELSE
      having_clause := having_clause || format(' AND %s %s %s', metric_expr, op, cond_value);
    END IF;
  END LOOP;

  RETURN having_clause;
END;
$$ LANGUAGE plpgsql;


-- Helper: map sort metric name to SQL column alias (unquoted for use with %I)
CREATE OR REPLACE FUNCTION _map_sort_column(sort_metric TEXT)
RETURNS TEXT AS $$
BEGIN
  CASE sort_metric
    WHEN 'ROI%' THEN RETURN 'ROI%';
    WHEN 'Revenue' THEN RETURN 'Revenue';
    WHEN 'Spent' THEN RETURN 'Spent';
    WHEN 'Clicks' THEN RETURN 'Clicks';
    WHEN 'Profit' THEN RETURN 'Profit';
    WHEN 'CPC' THEN RETURN 'CPC';
    WHEN 'EPC' THEN RETURN 'EPC';
    WHEN 'CVRs' THEN RETURN 'CVRs';
    WHEN 'CR%' THEN RETURN 'CR%';
    WHEN 'CTR%' THEN RETURN 'CTR%';
    WHEN 'OfferClicks' THEN RETURN 'OfferClicks';
    WHEN 'OfferViews' THEN RETURN 'OfferViews';
    WHEN 'Name' THEN RETURN 'Name';
    ELSE RETURN 'Profit';
  END CASE;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION fn_drilldown_report(query_json JSONB)
RETURNS TABLE (
  "ID" VARCHAR,
  "Name" VARCHAR,
  "Clicks" BIGINT,
  "Revenue" NUMERIC,
  "Spent" NUMERIC,
  "Profit" NUMERIC,
  "ROI%" NUMERIC,
  "CPC" NUMERIC,
  "EPC" NUMERIC,
  "CVRs" BIGINT,
  "CR%" NUMERIC,
  "CTR%" NUMERIC,
  "OfferClicks" BIGINT,
  "OfferViews" BIGINT
) AS $$
DECLARE
  group_by_col TEXT;
  id_col TEXT;
  name_col TEXT;
  date_from DATE;
  date_to DATE;
  sort_col TEXT;
  sort_dir TEXT;
  row_limit INT;
  filter_clause TEXT;
BEGIN
  -- Extract query parameters
  group_by_col := query_json->'options'->'group_by'->>0;
  date_from := (query_json->'dates'->>'from')::DATE;
  date_to := (query_json->'dates'->>'to')::DATE;
  sort_col := COALESCE(query_json->'options'->>'sort', 'ROI%');
  sort_dir := COALESCE(query_json->'options'->>'direction', 'desc');
  row_limit := COALESCE((query_json->'options'->>'limit')::INT, 25);

  -- Build filter WHERE clauses from filters array
  filter_clause := _build_filter_clauses(query_json);

  -- Map group_by dimension to table columns (includes aliases)
  CASE group_by_col
    WHEN 'Campaign' THEN id_col := 'campaign_id'; name_col := 'campaign_name';
    WHEN 'TrafficSource' THEN id_col := 'traffic_source_id'; name_col := 'traffic_source_name';
    WHEN 'Offer' THEN id_col := 'offer_id'; name_col := 'offer_name';
    WHEN 'Affiliate' THEN id_col := 'affiliate_id'; name_col := 'affiliate_name';
    WHEN 'Country' THEN id_col := 'country'; name_col := 'country';
    WHEN 'CountryCode' THEN id_col := 'country'; name_col := 'country';
    WHEN 'CountryName' THEN id_col := 'country'; name_col := 'country';
    WHEN 'Device' THEN id_col := 'device'; name_col := 'device';
    WHEN 'DeviceType' THEN id_col := 'device'; name_col := 'device';
    WHEN 'OS' THEN id_col := 'os'; name_col := 'os';
    WHEN 'Browser' THEN id_col := 'browser'; name_col := 'browser';
    WHEN 'LandingPage' THEN id_col := 'landing_page_id'; name_col := 'landing_page_name';
    WHEN 'Rotation' THEN id_col := 'rotation_id'; name_col := 'rotation_name';
    ELSE id_col := 'campaign_id'; name_col := 'campaign_name';
  END CASE;

  -- Build HAVING clause from conditions
  DECLARE having_clause TEXT;
  BEGIN
  having_clause := _build_having_clauses(query_json);

  RETURN QUERY EXECUTE format(
    'SELECT
      %I::VARCHAR AS "ID",
      %I::VARCHAR AS "Name",
      SUM(clicks)::BIGINT AS "Clicks",
      SUM(revenue)::NUMERIC AS "Revenue",
      SUM(spent)::NUMERIC AS "Spent",
      SUM(revenue - spent)::NUMERIC AS "Profit",
      CASE WHEN SUM(spent) > 0
        THEN ROUND(((SUM(revenue) - SUM(spent)) / SUM(spent)) * 100, 2)
        ELSE 0 END::NUMERIC AS "ROI%%",
      CASE WHEN SUM(clicks) > 0
        THEN ROUND(SUM(spent) / SUM(clicks), 4)
        ELSE 0 END::NUMERIC AS "CPC",
      CASE WHEN SUM(clicks) > 0
        THEN ROUND(SUM(revenue) / SUM(clicks), 4)
        ELSE 0 END::NUMERIC AS "EPC",
      SUM(conversions)::BIGINT AS "CVRs",
      CASE WHEN SUM(clicks) > 0
        THEN ROUND((SUM(conversions)::NUMERIC / SUM(clicks)) * 100, 2)
        ELSE 0 END::NUMERIC AS "CR%%",
      CASE WHEN SUM(offer_views) > 0
        THEN ROUND((SUM(offer_clicks)::NUMERIC / SUM(offer_views)) * 100, 2)
        ELSE 0 END::NUMERIC AS "CTR%%",
      SUM(offer_clicks)::BIGINT AS "OfferClicks",
      SUM(offer_views)::BIGINT AS "OfferViews"
    FROM analytics_data
    WHERE report_date BETWEEN %L AND %L %s
    GROUP BY %I, %I
    %s
    ORDER BY %I %s
    LIMIT %s',
    id_col, name_col,
    date_from, date_to, filter_clause,
    id_col, name_col,
    having_clause,
    _map_sort_column(sort_col),
    CASE WHEN sort_dir = 'asc' THEN 'ASC' ELSE 'DESC' END,
    row_limit
  );
  END;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION fn_multi_dimension_drilldown(query_json JSONB)
RETURNS TABLE (
  dimension1 VARCHAR,
  dimension2 VARCHAR,
  "Clicks" BIGINT,
  "Revenue" NUMERIC,
  "Spent" NUMERIC,
  "Profit" NUMERIC,
  "ROI%" NUMERIC,
  "CPC" NUMERIC,
  "EPC" NUMERIC,
  "CVRs" BIGINT,
  "CR%" NUMERIC,
  "CTR%" NUMERIC,
  "OfferClicks" BIGINT,
  "OfferViews" BIGINT
) AS $$
DECLARE
  dim1 TEXT;
  dim2 TEXT;
  col1 TEXT;
  col2 TEXT;
  date_from DATE;
  date_to DATE;
  sort_col TEXT;
  sort_dir TEXT;
  row_limit INT;
  filter_clause TEXT;
BEGIN
  dim1 := query_json->'options'->'group_by'->>0;
  dim2 := query_json->'options'->'group_by'->>1;
  date_from := (query_json->'dates'->>'from')::DATE;
  date_to := (query_json->'dates'->>'to')::DATE;
  sort_col := COALESCE(query_json->'options'->>'sort', 'ROI%');
  sort_dir := COALESCE(query_json->'options'->>'direction', 'desc');
  row_limit := COALESCE((query_json->'options'->>'limit')::INT, 25);

  -- Build filter WHERE clauses
  filter_clause := _build_filter_clauses(query_json);

  -- Map dim1 to column expression
  CASE dim1
    WHEN 'Date' THEN col1 := 'report_date::VARCHAR';
    WHEN 'Month' THEN col1 := 'to_char(report_date, ''YYYY-MM'')';
    WHEN 'Year' THEN col1 := 'to_char(report_date, ''YYYY'')';
    WHEN 'Hour' THEN col1 := 'to_char(report_date, ''HH24'')';
    WHEN 'Campaign' THEN col1 := 'campaign_name';
    WHEN 'TrafficSource' THEN col1 := 'traffic_source_name';
    WHEN 'Offer' THEN col1 := 'offer_name';
    WHEN 'Affiliate' THEN col1 := 'affiliate_name';
    ELSE col1 := 'report_date::VARCHAR';
  END CASE;

  -- Map dim2 to column expression (all entity dimensions supported)
  CASE dim2
    WHEN 'Campaign' THEN col2 := 'campaign_name';
    WHEN 'TrafficSource' THEN col2 := 'traffic_source_name';
    WHEN 'Offer' THEN col2 := 'offer_name';
    WHEN 'Affiliate' THEN col2 := 'affiliate_name';
    WHEN 'Country', 'CountryCode', 'CountryName' THEN col2 := 'country';
    WHEN 'Device', 'DeviceType' THEN col2 := 'device';
    WHEN 'OS' THEN col2 := 'os';
    WHEN 'Browser' THEN col2 := 'browser';
    WHEN 'LandingPage' THEN col2 := 'landing_page_name';
    WHEN 'Rotation' THEN col2 := 'rotation_name';
    WHEN 'Date' THEN col2 := 'report_date::VARCHAR';
    ELSE col2 := 'campaign_name';
  END CASE;

  -- Build HAVING clause from conditions
  DECLARE having_clause TEXT;
  BEGIN
  having_clause := _build_having_clauses(query_json);

  RETURN QUERY EXECUTE format(
    'SELECT
      (%s)::VARCHAR AS dimension1,
      (%s)::VARCHAR AS dimension2,
      SUM(clicks)::BIGINT AS "Clicks",
      SUM(revenue)::NUMERIC AS "Revenue",
      SUM(spent)::NUMERIC AS "Spent",
      SUM(revenue - spent)::NUMERIC AS "Profit",
      CASE WHEN SUM(spent) > 0
        THEN ROUND(((SUM(revenue) - SUM(spent)) / SUM(spent)) * 100, 2)
        ELSE 0 END::NUMERIC AS "ROI%%",
      CASE WHEN SUM(clicks) > 0
        THEN ROUND(SUM(spent) / SUM(clicks), 4)
        ELSE 0 END::NUMERIC AS "CPC",
      CASE WHEN SUM(clicks) > 0
        THEN ROUND(SUM(revenue) / SUM(clicks), 4)
        ELSE 0 END::NUMERIC AS "EPC",
      SUM(conversions)::BIGINT AS "CVRs",
      CASE WHEN SUM(clicks) > 0
        THEN ROUND((SUM(conversions)::NUMERIC / SUM(clicks)) * 100, 2)
        ELSE 0 END::NUMERIC AS "CR%%",
      CASE WHEN SUM(offer_views) > 0
        THEN ROUND((SUM(offer_clicks)::NUMERIC / SUM(offer_views)) * 100, 2)
        ELSE 0 END::NUMERIC AS "CTR%%",
      SUM(offer_clicks)::BIGINT AS "OfferClicks",
      SUM(offer_views)::BIGINT AS "OfferViews"
    FROM analytics_data
    WHERE report_date BETWEEN %L AND %L %s
    GROUP BY 1, 2
    %s
    ORDER BY 1 ASC, %I %s
    LIMIT %s',
    col1, col2,
    date_from, date_to, filter_clause,
    having_clause,
    _map_sort_column(sort_col),
    CASE WHEN sort_dir = 'asc' THEN 'ASC' ELSE 'DESC' END,
    row_limit * 31  -- Allow enough rows for time x entity combinations
  );
  END;
END;
$$ LANGUAGE plpgsql;
