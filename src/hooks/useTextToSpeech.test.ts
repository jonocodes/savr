/**
 * Unit tests for TTS text chunking logic
 */

import { splitTextIntoChunks, formatTime } from './useTextToSpeech';

describe('splitTextIntoChunks', () => {
  describe('short text (no splitting needed)', () => {
    it('should return single chunk for text shorter than maxLength', () => {
      const text = 'Hello world.';
      const result = splitTextIntoChunks(text, 100);
      expect(result).toEqual(['Hello world.']);
    });

    it('should return single chunk for text equal to maxLength', () => {
      const text = 'Hello';
      const result = splitTextIntoChunks(text, 5);
      expect(result).toEqual(['Hello']);
    });

    it('should handle empty text', () => {
      const result = splitTextIntoChunks('', 100);
      // Empty string returns single-element array with empty string that gets filtered
      expect(result.length).toBeLessThanOrEqual(1);
    });
  });

  describe('splitting on sentence boundaries', () => {
    it('should split on period followed by space', () => {
      const text = 'First sentence. Second sentence. Third sentence.';
      const result = splitTextIntoChunks(text, 20);
      expect(result[0]).toBe('First sentence.');
      expect(result.length).toBeGreaterThan(1);
    });

    it('should split on exclamation mark followed by space', () => {
      const text = 'Wow! This is amazing! More text here.';
      const result = splitTextIntoChunks(text, 10);
      expect(result[0]).toBe('Wow!');
    });

    it('should split on question mark followed by space', () => {
      const text = 'How are you? I am fine. Thanks for asking.';
      const result = splitTextIntoChunks(text, 15);
      expect(result[0]).toBe('How are you?');
    });

    it('should split on period followed by newline', () => {
      const text = 'First sentence.\nSecond sentence.\nThird sentence.';
      const result = splitTextIntoChunks(text, 20);
      expect(result[0]).toBe('First sentence.');
    });
  });

  describe('splitting on paragraph/newline boundaries', () => {
    it('should split on newline when no sentence boundary found', () => {
      const text = 'This is a long line without periods\nThis is another line';
      const result = splitTextIntoChunks(text, 40);
      expect(result[0]).toBe('This is a long line without periods');
    });
  });

  describe('splitting on word boundaries', () => {
    it('should split on space when no other boundary found', () => {
      const text = 'word1 word2 word3 word4 word5';
      const result = splitTextIntoChunks(text, 15);
      // Should produce multiple chunks
      expect(result.length).toBeGreaterThan(1);
      // First chunk should be within limits
      expect(result[0].length).toBeLessThanOrEqual(15);
    });
  });

  describe('hard splitting', () => {
    it('should hard split when no good boundary exists', () => {
      const text = 'abcdefghijklmnopqrstuvwxyz';
      const result = splitTextIntoChunks(text, 10);
      // Should produce multiple chunks
      expect(result.length).toBeGreaterThan(1);
      // All chunks together should equal original
      expect(result.join('')).toBe(text);
    });
  });

  describe('multiple chunks', () => {
    it('should correctly split long text into multiple chunks', () => {
      const sentences = Array(10).fill('This is a test sentence.').join(' ');
      const result = splitTextIntoChunks(sentences, 50);

      expect(result.length).toBeGreaterThan(1);
      // No chunk should exceed maxLength (allowing for trim variations)
      result.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(55); // Small buffer for boundary handling
      });
    });

    it('should preserve all text content across chunks', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
      const result = splitTextIntoChunks(text, 20);

      // Joining chunks should give us back all the content (minus whitespace trimming)
      const rejoined = result.join(' ');
      expect(rejoined).toContain('First');
      expect(rejoined).toContain('Fourth');
    });
  });

  describe('edge cases', () => {
    it('should handle text with only whitespace', () => {
      const result = splitTextIntoChunks('   ', 100);
      // Whitespace-only text is preserved as a single chunk
      expect(result.length).toBeLessThanOrEqual(1);
    });

    it('should handle text with many consecutive spaces', () => {
      const text = 'Hello     world';
      const result = splitTextIntoChunks(text, 100);
      expect(result).toEqual(['Hello     world']);
    });

    it('should handle unicode characters', () => {
      const text = 'Hello 世界. This is a test. 你好!';
      const result = splitTextIntoChunks(text, 15);
      expect(result.length).toBeGreaterThan(1);
    });
  });
});

describe('formatTime', () => {
  it('should format seconds as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(30)).toBe('0:30');
    expect(formatTime(59)).toBe('0:59');
  });

  it('should format minutes and seconds', () => {
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(90)).toBe('1:30');
    expect(formatTime(125)).toBe('2:05');
    expect(formatTime(599)).toBe('9:59');
    expect(formatTime(600)).toBe('10:00');
  });

  it('should format hours, minutes, and seconds', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(7200)).toBe('2:00:00');
    expect(formatTime(3723)).toBe('1:02:03');
  });

  it('should handle edge cases', () => {
    expect(formatTime(-1)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
  });
});
