import { formatConversationHistory } from '../format-conversation-history';
import { ConversationTurn } from '../../types/state';

describe('formatConversationHistory', () => {
  describe('empty and null handling', () => {
    it('should return empty string for undefined history', () => {
      expect(formatConversationHistory(undefined)).toBe('');
    });

    it('should return empty string for empty array', () => {
      expect(formatConversationHistory([])).toBe('');
    });
  });

  describe('single turn formatting', () => {
    it('should format single turn with question and summary', () => {
      const history: ConversationTurn[] = [
        {
          question: 'What are my top campaigns?',
          intent: 'analytics',
          summary: 'Your top campaigns are Campaign A and Campaign B.',
          timestamp: Date.now(),
          entities: [],
        },
      ];

      const result = formatConversationHistory(history);

      expect(result).toMatch(/Turn 0 \([^)]+\):/);
      expect(result).toContain('User: What are my top campaigns?');
      expect(result).toContain('Assistant: Your top campaigns are Campaign A and Campaign B.');
    });

    it('should always show entity counts (never full names/IDs)', () => {
      const history: ConversationTurn[] = [
        {
          question: 'Top 3 campaigns',
          intent: 'analytics',
          summary: 'Here are your top 3 campaigns.',
          timestamp: Date.now(),
          entities: [
            { id: '1', type: 'Campaign', name: 'Campaign A' },
            { id: '2', type: 'Campaign', name: 'Campaign B' },
            { id: '3', type: 'Campaign', name: 'Campaign C' },
          ],
        },
      ];

      const result = formatConversationHistory(history);

      // Should show counts, not names
      expect(result).toContain('Entities: [3 Campaign(s)]');
      expect(result).not.toContain('Campaign A');
      expect(result).not.toContain('Campaign:');
    });
  });

  describe('confidence display', () => {
    it('should always show confidence when present', () => {
      const history: ConversationTurn[] = [
        {
          question: 'Query',
          intent: 'analytics',
          summary: 'Results',
          timestamp: Date.now(),
          entities: [],
          confidence: 0.95,
        },
      ];

      const result = formatConversationHistory(history);

      expect(result).toContain('[95%]');
    });

    it('should show uncertainty reason for low confidence', () => {
      const history: ConversationTurn[] = [
        {
          question: 'Query',
          intent: 'analytics',
          summary: 'Results',
          timestamp: Date.now(),
          entities: [],
          confidence: 0.6,
          uncertaintyReasons: ['ambiguous entity reference'],
        },
      ];

      const result = formatConversationHistory(history);

      expect(result).toContain('[60% - ambiguous entity reference]');
    });

    it('should not show reason for high confidence', () => {
      const history: ConversationTurn[] = [
        {
          question: 'Query',
          intent: 'analytics',
          summary: 'Results',
          timestamp: Date.now(),
          entities: [],
          confidence: 0.85,
          uncertaintyReasons: ['some reason'],
        },
      ];

      const result = formatConversationHistory(history);

      expect(result).toContain('[85%]');
      expect(result).not.toContain('some reason');
    });
  });

  describe('summary never truncated', () => {
    it('should show full summary regardless of turn age', () => {
      const longSummary = 'This is a very long summary that would have been truncated in the old implementation but should now be shown in full because the Planner needs complete context to make good decisions about entity sources.';
      const history: ConversationTurn[] = [
        {
          question: 'Old query',
          intent: 'analytics',
          summary: longSummary,
          timestamp: Date.now() - 1000000, // Old turn
          entities: [],
        },
        // Add more turns to make the first one "older"
        ...Array.from({ length: 10 }, (_, i) => ({
          question: `Recent query ${i}`,
          intent: 'analytics',
          summary: `Recent summary ${i}`,
          timestamp: Date.now() - (9 - i) * 1000,
          entities: [],
        })),
      ];

      const result = formatConversationHistory(history);

      // Full summary should be present, not truncated
      expect(result).toContain(longSummary);
      expect(result).not.toContain('...');
    });
  });

  describe('entity counts for all turns', () => {
    const createMockHistory = (numTurns: number): ConversationTurn[] => {
      return Array.from({ length: numTurns }, (_, i) => ({
        question: `Question ${i}`,
        intent: 'analytics',
        summary: `Summary for turn ${i}.`,
        timestamp: Date.now() - (numTurns - i) * 1000,
        entities: [
          { id: `campaign-${i}-1`, type: 'Campaign' as const, name: `Campaign ${i}-A` },
          { id: `campaign-${i}-2`, type: 'Campaign' as const, name: `Campaign ${i}-B` },
          { id: `offer-${i}-1`, type: 'Offer' as const, name: `Offer ${i}-X` },
        ],
      }));
    };

    it('should show all turns', () => {
      const history = createMockHistory(8);
      const result = formatConversationHistory(history);

      expect(result).toMatch(/Turn 0/);
      expect(result).toMatch(/Turn 7/);
    });

    it('should show entity counts for ALL turns (not just older ones)', () => {
      const history = createMockHistory(8);
      const result = formatConversationHistory(history);

      // All turns should have entity counts format
      expect(result).toMatch(/Turn 0[\s\S]*Entities: \[2 Campaign\(s\), 1 Offer\(s\)\]/);
      expect(result).toMatch(/Turn 7[\s\S]*Entities: \[2 Campaign\(s\), 1 Offer\(s\)\]/);

      // Should NOT contain any entity names
      expect(result).not.toContain('Campaign 0-A');
      expect(result).not.toContain('Campaign 7-A');
    });
  });

  describe('entity type grouping', () => {
    it('should group entity counts by type', () => {
      const history: ConversationTurn[] = [
        {
          question: 'Query',
          intent: 'analytics',
          summary: 'Results',
          timestamp: Date.now(),
          entities: [
            { id: '1', type: 'Campaign', name: 'Campaign A' },
            { id: '2', type: 'Campaign', name: 'Campaign B' },
            { id: '3', type: 'Offer', name: 'Offer X' },
            { id: '4', type: 'TrafficSource', name: 'Google' },
            { id: '5', type: 'TrafficSource', name: 'Facebook' },
          ],
        },
      ];

      const result = formatConversationHistory(history);

      expect(result).toContain('Entities: [2 Campaign(s), 1 Offer(s), 2 TrafficSource(s)]');
    });
  });

  describe('dateRange display', () => {
    it('should show dateRange when present', () => {
      const history: ConversationTurn[] = [
        {
          question: 'Top campaigns last 2 weeks',
          intent: 'analytics',
          summary: 'Here are your top campaigns.',
          timestamp: Date.now(),
          entities: [],
          dateRange: { from: '2025-12-25', to: '2026-01-07' },
        },
      ];

      const result = formatConversationHistory(history);

      expect(result).toContain('DateRange: 2025-12-25 to 2026-01-07');
    });

    it('should not show dateRange line when not present', () => {
      const history: ConversationTurn[] = [
        {
          question: 'Which campaigns are active?',
          intent: 'metadata_only',
          summary: 'Here are active campaigns.',
          timestamp: Date.now(),
          entities: [],
        },
      ];

      const result = formatConversationHistory(history);

      expect(result).not.toContain('DateRange:');
    });
  });

  describe('edge cases', () => {
    it('should handle turns without entities', () => {
      const history: ConversationTurn[] = [
        {
          question: 'What can you do?',
          intent: 'non_analytics',
          summary: 'I can help you analyze campaigns.',
          timestamp: Date.now(),
          entities: [],
        },
      ];

      const result = formatConversationHistory(history);

      expect(result).not.toContain('Entities:');
    });

    it('should handle empty entities array', () => {
      const history: ConversationTurn[] = [
        {
          question: 'Query with no results',
          intent: 'analytics',
          summary: 'No data found.',
          timestamp: Date.now(),
          entities: [],
        },
      ];

      const result = formatConversationHistory(history);

      expect(result).not.toContain('Entities:');
    });

    it('should handle missing timestamp', () => {
      const history = [
        {
          question: 'Query',
          intent: 'analytics',
          summary: 'Results',
        },
      ] as ConversationTurn[];

      const result = formatConversationHistory(history);

      expect(result).toContain('Turn 0:');
      expect(result).not.toMatch(/Turn 0 \(/); // No parentheses for time
    });

    it('should handle missing confidence', () => {
      const history: ConversationTurn[] = [
        {
          question: 'Query',
          intent: 'analytics',
          summary: 'Results',
          timestamp: Date.now(),
          entities: [],
        },
      ];

      const result = formatConversationHistory(history);

      expect(result).not.toContain('[');
      expect(result).not.toContain('%');
    });
  });

  describe('realistic multi-turn scenario', () => {
    it('should format conversation with entity counts and confidence', () => {
      const history: ConversationTurn[] = [
        {
          question: 'Top 5 campaigns by ROI',
          intent: 'analytics',
          summary: 'The top 5 campaigns by ROI are Campaign Alpha (45%), Campaign Beta (38%), Campaign Gamma (32%), Campaign Delta (28%), and Campaign Epsilon (25%).',
          timestamp: Date.now() - 60000,
          confidence: 0.92,
          entities: [
            { id: '101', type: 'Campaign', name: 'Campaign Alpha' },
            { id: '102', type: 'Campaign', name: 'Campaign Beta' },
            { id: '103', type: 'Campaign', name: 'Campaign Gamma' },
            { id: '104', type: 'Campaign', name: 'Campaign Delta' },
            { id: '105', type: 'Campaign', name: 'Campaign Epsilon' },
          ],
        },
        {
          question: 'Show their traffic sources',
          intent: 'analytics',
          summary: 'The traffic sources for these campaigns are Google Ads and Facebook.',
          timestamp: Date.now() - 30000,
          confidence: 0.88,
          entities: [
            { id: '201', type: 'TrafficSource', name: 'Google Ads' },
            { id: '202', type: 'TrafficSource', name: 'Facebook' },
          ],
        },
        {
          question: 'What about offers?',
          intent: 'analytics',
          summary: 'The main offers are Rate Compare and Auto Insurance.',
          timestamp: Date.now(),
          confidence: 0.65,
          uncertaintyReasons: ['ambiguous offer reference'],
          entities: [
            { id: '301', type: 'Offer', name: 'Rate Compare' },
            { id: '302', type: 'Offer', name: 'Auto Insurance' },
          ],
        },
      ];

      const result = formatConversationHistory(history);

      // All turns visible
      expect(result).toMatch(/Turn 0/);
      expect(result).toMatch(/Turn 1/);
      expect(result).toMatch(/Turn 2/);

      // Entity counts (not names)
      expect(result).toContain('Entities: [5 Campaign(s)]');
      expect(result).toContain('Entities: [2 TrafficSource(s)]');
      expect(result).toContain('Entities: [2 Offer(s)]');

      // Confidence shown
      expect(result).toContain('[92%]');
      expect(result).toContain('[88%]');
      expect(result).toContain('[65% - ambiguous offer reference]');

      // Full summaries (not truncated)
      expect(result).toContain('Campaign Alpha (45%)');
      expect(result).toContain('Google Ads and Facebook');

      // Entity names NOT in output (only in summary text which is preserved)
      expect(result).not.toContain('Campaign:Campaign Alpha');
      expect(result).not.toContain('TrafficSource:Google Ads');
    });
  });
});
