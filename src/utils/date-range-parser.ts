import dayjs from 'dayjs';

/**
 * Standard date range options matching admin-ui date picker
 */
export enum DateRangePreset {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  THIS_WEEK = 'this_week',
  LAST_WEEK = 'last_week',
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  THIS_YEAR = 'this_year',
  LAST_YEAR = 'last_year',
}

/**
 * Parse date range preset or custom date string to actual date strings
 * Returns dates in specified format (default: YYYY-MM-DD HH:mm:ss for drilldown)
 */
export function parseDateRange(
  input: DateRangePreset | string,
  format: 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'YYYY-MM-DD HH:mm:ss' = 'YYYY-MM-DD HH:mm:ss'
): { from: string; to: string } {
  let startDate: dayjs.Dayjs;
  let endDate: dayjs.Dayjs;

  // Check if input is a preset enum value
  switch (input) {
    case DateRangePreset.TODAY:
      startDate = dayjs().startOf('day');
      endDate = dayjs().endOf('day');
      break;

    case DateRangePreset.YESTERDAY:
      startDate = dayjs().add(-1, 'd').startOf('day');
      endDate = dayjs().add(-1, 'd').endOf('day');
      break;

    case DateRangePreset.THIS_WEEK:
      startDate = dayjs().startOf('week');
      endDate = dayjs().endOf('week');
      break;

    case DateRangePreset.LAST_WEEK:
      startDate = dayjs().add(-1, 'w').startOf('week');
      endDate = dayjs().add(-1, 'w').endOf('week');
      break;

    case DateRangePreset.LAST_7_DAYS:
      startDate = dayjs().add(-7, 'd').startOf('day');
      endDate = dayjs().endOf('day');
      break;

    case DateRangePreset.LAST_30_DAYS:
      startDate = dayjs().add(-30, 'd').startOf('day');
      endDate = dayjs().endOf('day');
      break;

    case DateRangePreset.THIS_MONTH:
      startDate = dayjs().startOf('month');
      endDate = dayjs().endOf('month');
      break;

    case DateRangePreset.LAST_MONTH:
      startDate = dayjs().add(-1, 'M').startOf('month');
      endDate = dayjs().add(-1, 'M').endOf('month');
      break;

    case DateRangePreset.THIS_YEAR:
      startDate = dayjs().startOf('year');
      endDate = dayjs().endOf('year');
      break;

    case DateRangePreset.LAST_YEAR:
      startDate = dayjs().add(-1, 'y').startOf('year');
      endDate = dayjs().add(-1, 'y').endOf('year');
      break;

    default:
      // Try to parse as custom date string
      const parsed = dayjs(input);
      if (!parsed.isValid()) {
        throw new Error(`Invalid date range: ${input}`);
      }
      startDate = parsed;
      endDate = parsed.endOf('day');
  }

  return {
    from: startDate.format(format),
    to: endDate.format(format),
  };
}

/**
 * Parse date range with separate from/to values
 * Handles both preset enums and custom date strings
 */
export function parseDateRangeFromTo(
  from: DateRangePreset | string,
  to?: DateRangePreset | string,
  format: 'MM/DD/YYYY' | 'YYYY-MM-DD' = 'MM/DD/YYYY'
): { from: string; to: string } {
  // If only 'from' is provided and it's a preset, use the preset's range
  if (!to && Object.values(DateRangePreset).includes(from as DateRangePreset)) {
    return parseDateRange(from as DateRangePreset, format);
  }

  // Parse individual dates
  const fromDate = dayjs(from);
  const toDate = to ? dayjs(to) : dayjs().endOf('day');

  if (!fromDate.isValid()) {
    throw new Error(`Invalid 'from' date: ${from}`);
  }
  if (!toDate.isValid()) {
    throw new Error(`Invalid 'to' date: ${to}`);
  }

  return {
    from: fromDate.format(format),
    to: toDate.format(format),
  };
}

/**
 * Get list of all available date range presets for LLM prompts
 */
export function getDateRangePresets(): string[] {
  return Object.values(DateRangePreset);
}
