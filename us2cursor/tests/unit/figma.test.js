import { describe, it, expect } from 'vitest';
import { parseFigmaUrl, isFigmaUrl, extractFigmaSummary } from '../../lib/figma.js';

describe('parseFigmaUrl', () => {
  it('parses file URL', () => {
    const url = 'https://www.figma.com/file/ABC123/MyDesign';
    const result = parseFigmaUrl(url);

    expect(result.fileId).toBe('ABC123');
    expect(result.nodeId).toBeNull();
  });

  it('parses design URL', () => {
    const url = 'https://www.figma.com/design/XYZ789/MyDesign';
    const result = parseFigmaUrl(url);

    expect(result.fileId).toBe('XYZ789');
    expect(result.nodeId).toBeNull();
  });

  it('parses URL with node-id', () => {
    const url = 'https://www.figma.com/design/XYZ789/Name?node-id=123%3A456';
    const result = parseFigmaUrl(url);

    expect(result.fileId).toBe('XYZ789');
    expect(result.nodeId).toBe('123-456');
  });

  it('parses URL with node-id containing hyphen', () => {
    const url = 'https://www.figma.com/file/ABC/Name?node-id=123-456';
    const result = parseFigmaUrl(url);

    expect(result.fileId).toBe('ABC');
    expect(result.nodeId).toBe('123-456');
  });

  it('returns null for invalid URL', () => {
    expect(parseFigmaUrl('https://google.com')).toBeNull();
    expect(parseFigmaUrl('not a url')).toBeNull();
    expect(parseFigmaUrl('')).toBeNull();
  });

  it('handles URL with additional query params', () => {
    const url = 'https://www.figma.com/file/ABC123/Name?node-id=1%3A2&mode=dev';
    const result = parseFigmaUrl(url);

    expect(result.fileId).toBe('ABC123');
    expect(result.nodeId).toBe('1-2');
  });
});

describe('isFigmaUrl', () => {
  it('identifies Figma file URLs', () => {
    expect(isFigmaUrl('https://figma.com/file/123')).toBe(true);
    expect(isFigmaUrl('https://www.figma.com/file/abc')).toBe(true);
  });

  it('identifies Figma design URLs', () => {
    expect(isFigmaUrl('https://www.figma.com/design/abc')).toBe(true);
  });

  it('returns false for non-Figma URLs', () => {
    expect(isFigmaUrl('https://google.com')).toBe(false);
    expect(isFigmaUrl('https://figma.io/file/123')).toBe(false);
    expect(isFigmaUrl('figma.com')).toBe(false);
  });
});

describe('extractFigmaSummary', () => {
  it('extracts file name from data', () => {
    const data = {
      name: 'MyDesign',
      document: { children: [] }
    };

    const summary = extractFigmaSummary(data, null);
    expect(summary).toContain('File: MyDesign');
  });

  it('extracts component names', () => {
    const data = {
      name: 'MyDesign',
      document: {
        children: [
          { type: 'COMPONENT', name: 'Button' },
          { type: 'COMPONENT', name: 'Input' }
        ]
      }
    };

    const summary = extractFigmaSummary(data, null);
    expect(summary).toContain('Button');
    expect(summary).toContain('Input');
  });

  it('extracts text content', () => {
    const data = {
      name: 'MyDesign',
      document: {
        children: [
          { type: 'TEXT', name: 'Label', characters: 'Submit' }
        ]
      }
    };

    const summary = extractFigmaSummary(data, null);
    expect(summary).toContain('Submit');
  });

  it('extracts frame names at depth <= 2', () => {
    const data = {
      name: 'MyDesign',
      document: {
        children: [
          { type: 'FRAME', name: 'LoginModal', children: [] }
        ]
      }
    };

    const summary = extractFigmaSummary(data, null);
    expect(summary).toContain('Frame: LoginModal');
  });

  it('handles node-specific responses', () => {
    const nodeId = '123-456';
    const data = {
      nodes: {
        '123:456': {
          document: {
            type: 'FRAME',
            name: 'LoginModal',
            children: []
          }
        }
      }
    };

    const summary = extractFigmaSummary(data, nodeId);
    expect(summary).toContain('LoginModal');
  });

  it('returns fallback message for empty data', () => {
    const data = {};
    const summary = extractFigmaSummary(data, null);
    expect(summary).toBe('Could not extract Figma content');
  });

  it('limits depth traversal to 5 levels', () => {
    // Create deeply nested structure
    const data = {
      name: 'Deep',
      document: {
        children: [{
          type: 'FRAME', name: 'L1', children: [{
            type: 'FRAME', name: 'L2', children: [{
              type: 'FRAME', name: 'L3', children: [{
                type: 'FRAME', name: 'L4', children: [{
                  type: 'FRAME', name: 'L5', children: [{
                    type: 'COMPONENT', name: 'TooDeep'
                  }]
                }]
              }]
            }]
          }]
        }]
      }
    };

    const summary = extractFigmaSummary(data, null);
    // TooDeep is at depth 6, should not be extracted
    expect(summary).not.toContain('TooDeep');
  });

  it('truncates long text content', () => {
    const longText = 'A'.repeat(100);
    const data = {
      name: 'Test',
      document: {
        children: [
          { type: 'TEXT', name: 'LongLabel', characters: longText }
        ]
      }
    };

    const summary = extractFigmaSummary(data, null);
    // Should be truncated to 50 chars
    expect(summary).toContain('A'.repeat(50));
    expect(summary).not.toContain('A'.repeat(51));
  });
});
