/**
 * Tests for date-range-parser utility
 * Fast unit tests - no external dependencies
 */

import dayjs from 'dayjs';
import { DateRangePreset, parseDateRange, parseDateRangeFromTo, getDateRangePresets } from '../date-range-parser';

describe('DateRangeParser', () => {
  describe('parseDateRange', () => {
    it('should parse TODAY preset', () => {
      const result = parseDateRange(DateRangePreset.TODAY);
      const today = dayjs().startOf('day');
      
      expect(result.from).toBe(today.format('YYYY-MM-DD HH:mm:ss'));
      expect(result.to).toBe(dayjs().endOf('day').format('YYYY-MM-DD HH:mm:ss'));
    });

    it('should parse YESTERDAY preset', () => {
      const result = parseDateRange(DateRangePreset.YESTERDAY);
      const yesterday = dayjs().add(-1, 'd').startOf('day');
      
      expect(result.from).toBe(yesterday.format('YYYY-MM-DD HH:mm:ss'));
      expect(result.to).toBe(yesterday.endOf('day').format('YYYY-MM-DD HH:mm:ss'));
    });

    it('should parse LAST_7_DAYS preset', () => {
      const result = parseDateRange(DateRangePreset.LAST_7_DAYS);
      const startDate = dayjs().add(-7, 'd').startOf('day');
      const endDate = dayjs().endOf('day');
      
      expect(result.from).toBe(startDate.format('YYYY-MM-DD HH:mm:ss'));
      expect(result.to).toBe(endDate.format('YYYY-MM-DD HH:mm:ss'));
    });

    it('should parse LAST_30_DAYS preset', () => {
      const result = parseDateRange(DateRangePreset.LAST_30_DAYS);
      const startDate = dayjs().add(-30, 'd').startOf('day');
      const endDate = dayjs().endOf('day');
      
      expect(result.from).toBe(startDate.format('YYYY-MM-DD HH:mm:ss'));
      expect(result.to).toBe(endDate.format('YYYY-MM-DD HH:mm:ss'));
    });

    it('should parse THIS_WEEK preset', () => {
      const result = parseDateRange(DateRangePreset.THIS_WEEK);
      const startOfWeek = dayjs().startOf('week');
      const endOfWeek = dayjs().endOf('week');
      
      expect(result.from).toBe(startOfWeek.format('YYYY-MM-DD HH:mm:ss'));
      expect(result.to).toBe(endOfWeek.format('YYYY-MM-DD HH:mm:ss'));
    });

    it('should parse LAST_WEEK preset', () => {
      const result = parseDateRange(DateRangePreset.LAST_WEEK);
      const startOfLastWeek = dayjs().add(-1, 'w').startOf('week');
      const endOfLastWeek = dayjs().add(-1, 'w').endOf('week');
      
      expect(result.from).toBe(startOfLastWeek.format('YYYY-MM-DD HH:mm:ss'));
      expect(result.to).toBe(endOfLastWeek.format('YYYY-MM-DD HH:mm:ss'));
    });

    it('should parse THIS_MONTH preset', () => {
      const result = parseDateRange(DateRangePreset.THIS_MONTH);
      const startOfMonth = dayjs().startOf('month');
      const endOfMonth = dayjs().endOf('month');
      
      expect(result.from).toBe(startOfMonth.format('YYYY-MM-DD HH:mm:ss'));
      expect(result.to).toBe(endOfMonth.format('YYYY-MM-DD HH:mm:ss'));
    });

    it('should parse LAST_MONTH preset', () => {
      const result = parseDateRange(DateRangePreset.LAST_MONTH);
      const startOfLastMonth = dayjs().add(-1, 'M').startOf('month');
      const endOfLastMonth = dayjs().add(-1, 'M').endOf('month');
      
      expect(result.from).toBe(startOfLastMonth.format('YYYY-MM-DD HH:mm:ss'));
      expect(result.to).toBe(endOfLastMonth.format('YYYY-MM-DD HH:mm:ss'));
    });

    it('should parse THIS_YEAR preset', () => {
      const result = parseDateRange(DateRangePreset.THIS_YEAR);
      const startOfYear = dayjs().startOf('year');
      const endOfYear = dayjs().endOf('year');
      
      expect(result.from).toBe(startOfYear.format('YYYY-MM-DD HH:mm:ss'));
      expect(result.to).toBe(endOfYear.format('YYYY-MM-DD HH:mm:ss'));
    });

    it('should parse LAST_YEAR preset', () => {
      const result = parseDateRange(DateRangePreset.LAST_YEAR);
      const startOfLastYear = dayjs().add(-1, 'y').startOf('year');
      const endOfLastYear = dayjs().add(-1, 'y').endOf('year');
      
      expect(result.from).toBe(startOfLastYear.format('YYYY-MM-DD HH:mm:ss'));
      expect(result.to).toBe(endOfLastYear.format('YYYY-MM-DD HH:mm:ss'));
    });


    it('should support YYYY-MM-DD format', () => {
      const result = parseDateRange(DateRangePreset.TODAY, 'YYYY-MM-DD');
      const today = dayjs();
      
      expect(result.from).toBe(today.format('YYYY-MM-DD'));
      expect(result.to).toBe(today.endOf('day').format('YYYY-MM-DD'));
    });

    it('should parse custom date string', () => {
      const result = parseDateRange('2024-10-15');
      const expectedDate = dayjs('2024-10-15');
      
      expect(result.from).toBe(expectedDate.format('YYYY-MM-DD HH:mm:ss'));
      expect(result.to).toBe(expectedDate.endOf('day').format('YYYY-MM-DD HH:mm:ss'));
    });

    it('should throw error for invalid date string', () => {
      expect(() => parseDateRange('invalid-date')).toThrow('Invalid date range: invalid-date');
    });
  });

  describe('parseDateRangeFromTo', () => {
    it('should use preset range when only from is provided', () => {
      const result = parseDateRangeFromTo(DateRangePreset.LAST_7_DAYS);
      
      // parseDateRangeFromTo uses MM/DD/YYYY format by default
      expect(result.from).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(result.to).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it('should parse separate from and to dates', () => {
      const result = parseDateRangeFromTo('2024-10-01', '2024-10-31');
      
      expect(result.from).toBe(dayjs('2024-10-01').format('MM/DD/YYYY'));
      expect(result.to).toBe(dayjs('2024-10-31').format('MM/DD/YYYY'));
    });

    it('should use today as default to date when not provided', () => {
      const result = parseDateRangeFromTo('2024-10-01');
      const today = dayjs().endOf('day');
      
      expect(result.from).toBe(dayjs('2024-10-01').format('MM/DD/YYYY'));
      expect(result.to).toBe(today.format('MM/DD/YYYY'));
    });

    it('should support YYYY-MM-DD format', () => {
      const result = parseDateRangeFromTo('2024-10-01', '2024-10-31', 'YYYY-MM-DD');
      
      expect(result.from).toBe('2024-10-01');
      expect(result.to).toBe('2024-10-31');
    });

    it('should throw error for invalid from date', () => {
      expect(() => parseDateRangeFromTo('invalid', '2024-10-31')).toThrow("Invalid 'from' date: invalid");
    });

    it('should throw error for invalid to date', () => {
      expect(() => parseDateRangeFromTo('2024-10-01', 'invalid')).toThrow("Invalid 'to' date: invalid");
    });
  });

  describe('getDateRangePresets', () => {
    it('should return all preset values', () => {
      const presets = getDateRangePresets();
      
      expect(presets).toContain('today');
      expect(presets).toContain('yesterday');
      expect(presets).toContain('this_week');
      expect(presets).toContain('last_week');
      expect(presets).toContain('last_7_days');
      expect(presets).toContain('last_30_days');
      expect(presets).toContain('this_month');
      expect(presets).toContain('last_month');
      expect(presets).toContain('this_year');
      expect(presets).toContain('last_year');
      expect(presets).toHaveLength(10);
    });
  });

  describe('DateRangePreset enum', () => {
    it('should have correct enum values', () => {
      expect(DateRangePreset.TODAY).toBe('today');
      expect(DateRangePreset.YESTERDAY).toBe('yesterday');
      expect(DateRangePreset.THIS_WEEK).toBe('this_week');
      expect(DateRangePreset.LAST_WEEK).toBe('last_week');
      expect(DateRangePreset.LAST_7_DAYS).toBe('last_7_days');
      expect(DateRangePreset.LAST_30_DAYS).toBe('last_30_days');
      expect(DateRangePreset.THIS_MONTH).toBe('this_month');
      expect(DateRangePreset.LAST_MONTH).toBe('last_month');
      expect(DateRangePreset.THIS_YEAR).toBe('this_year');
      expect(DateRangePreset.LAST_YEAR).toBe('last_year');
    });
  });
});
