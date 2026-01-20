import { describe, it, expect } from 'vitest';
import { parseReviewIssues, findFileInfo, extractChangedLines, extractPendingComments } from '../../lib/review.js';

describe('parseReviewIssues', () => {
  it('parses table rows into issues array', () => {
    const review = `
## Code Review
| Severity | Category | File | Line | Issue | Fix |
|----------|----------|------|------|-------|-----|
| 🔴 CRITICAL | Bugs | Query.cs | 45 | null check missing | add null check |
| 🟡 IMPORTANT | Performance | Service.cs | 120 | N+1 query | use Include |
`;

    const issues = parseReviewIssues(review);

    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({
      severity: '🔴 CRITICAL',
      category: 'Bugs',
      fileName: 'Query.cs',
      line: 45,
      issue: 'null check missing',
      fix: 'add null check'
    });
    expect(issues[1]).toEqual({
      severity: '🟡 IMPORTANT',
      category: 'Performance',
      fileName: 'Service.cs',
      line: 120,
      issue: 'N+1 query',
      fix: 'use Include'
    });
  });

  it('parses MINOR severity', () => {
    const review = `| 🔵 MINOR | CleanCode | Utils.ts | 10 | unused var | remove it |`;
    const issues = parseReviewIssues(review);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('🔵 MINOR');
    expect(issues[0].fileName).toBe('Utils.ts');
  });

  it('handles TypeScript/JavaScript file extensions', () => {
    const review = `
| 🔴 CRITICAL | Bugs | Component.tsx | 1 | issue | fix |
| 🔴 CRITICAL | Bugs | Service.ts | 2 | issue | fix |
| 🔴 CRITICAL | Bugs | Utils.js | 3 | issue | fix |
| 🔴 CRITICAL | Bugs | Hook.jsx | 4 | issue | fix |
`;
    const issues = parseReviewIssues(review);

    expect(issues).toHaveLength(4);
    expect(issues.map(i => i.fileName)).toEqual(['Component.tsx', 'Service.ts', 'Utils.js', 'Hook.jsx']);
  });

  it('handles Python and Java files', () => {
    const review = `
| 🔴 CRITICAL | Bugs | main.py | 1 | issue | fix |
| 🔴 CRITICAL | Bugs | Main.java | 2 | issue | fix |
`;
    const issues = parseReviewIssues(review);

    expect(issues).toHaveLength(2);
    expect(issues[0].fileName).toBe('main.py');
    expect(issues[1].fileName).toBe('Main.java');
  });

  it('handles Go files', () => {
    const review = `| 🔴 CRITICAL | Bugs | main.go | 1 | issue | fix |`;
    const issues = parseReviewIssues(review);

    expect(issues).toHaveLength(1);
    expect(issues[0].fileName).toBe('main.go');
  });

  it('returns empty array for review with no issues', () => {
    const review = `## Code Review
### ✅ Good
- Nice code!

### 📋 Issues
(none)

### 📝 Verdict
**APPROVE**`;
    expect(parseReviewIssues(review)).toHaveLength(0);
  });

  it('returns empty array for empty string', () => {
    expect(parseReviewIssues('')).toHaveLength(0);
  });

  it('parses line numbers correctly', () => {
    const review = `| 🔴 CRITICAL | Bugs | File.cs | 999 | issue | fix |`;
    const issues = parseReviewIssues(review);

    expect(issues[0].line).toBe(999);
    expect(typeof issues[0].line).toBe('number');
  });
});

describe('findFileInfo', () => {
  const changes = [
    { item: { path: '/src/services/UserService.cs' }, changeTrackingId: 1 },
    { item: { path: '/src/components/Modal.tsx' }, changeTrackingId: 2 },
    { item: { path: '/tests/UserService.test.cs' }, changeTrackingId: 3 }
  ];

  it('finds file by exact filename', () => {
    const result = findFileInfo(changes, 'UserService.cs');

    expect(result).not.toBeNull();
    expect(result.path).toBe('/src/services/UserService.cs');
    expect(result.changeTrackingId).toBe(1);
  });

  it('finds file by partial path', () => {
    const result = findFileInfo(changes, 'components/Modal.tsx');

    expect(result).not.toBeNull();
    expect(result.path).toBe('/src/components/Modal.tsx');
  });

  it('returns first match when filename appears multiple times', () => {
    const result = findFileInfo(changes, 'UserService');

    expect(result).not.toBeNull();
    expect(result.path).toBe('/src/services/UserService.cs');
  });

  it('returns null when file not found', () => {
    const result = findFileInfo(changes, 'NotFound.cs');
    expect(result).toBeNull();
  });

  it('handles empty changes array', () => {
    const result = findFileInfo([], 'File.cs');
    expect(result).toBeNull();
  });

  it('handles changes with missing item property', () => {
    const changesWithMissing = [
      { changeTrackingId: 1 },
      { item: { path: '/src/File.cs' }, changeTrackingId: 2 }
    ];

    const result = findFileInfo(changesWithMissing, 'File.cs');
    expect(result).not.toBeNull();
    expect(result.path).toBe('/src/File.cs');
  });
});

describe('extractChangedLines', () => {
  it('shows all lines for new file (null oldContent)', () => {
    const newContent = 'line 1\nline 2\nline 3';
    const result = extractChangedLines(null, newContent);

    expect(result).toContain('+1|line 1');
    expect(result).toContain('+2|line 2');
    expect(result).toContain('+3|line 3');
  });

  it('limits new file to 150 lines', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
    const newContent = lines.join('\n');
    const result = extractChangedLines(null, newContent);

    expect(result).toContain('+150|line 150');
    expect(result).not.toContain('+151|');
  });

  it('shows changed lines with context', () => {
    const oldContent = 'a\nb\nc\nd\ne';
    const newContent = 'a\nb\nCHANGED\nd\ne';
    const result = extractChangedLines(oldContent, newContent, 1);

    expect(result).toContain('b');
    expect(result).toContain('+3|CHANGED');
    expect(result).toContain('d');
  });

  it('marks changed lines with + prefix', () => {
    const oldContent = 'old';
    const newContent = 'new';
    const result = extractChangedLines(oldContent, newContent);

    expect(result).toContain('+1|new');
  });

  it('marks context lines with space prefix', () => {
    const oldContent = 'context\nold\ncontext';
    const newContent = 'context\nnew\ncontext';
    const result = extractChangedLines(oldContent, newContent, 1);

    expect(result).toContain(' 1|context');
    expect(result).toContain('+2|new');
    expect(result).toContain(' 3|context');
  });

  it('adds ... separator for non-contiguous changes', () => {
    const oldContent = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj';
    const newContent = 'A\nb\nc\nd\ne\nf\ng\nh\ni\nJ';
    const result = extractChangedLines(oldContent, newContent, 1);

    expect(result).toContain('...');
  });

  it('limits output to 100 lines', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line${i}`);
    const oldContent = lines.join('\n');
    const newContent = lines.map(l => l + '_changed').join('\n');
    const result = extractChangedLines(oldContent, newContent, 0);

    const lineCount = result.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(100);
  });

  it('handles empty new content', () => {
    const oldContent = 'old content';
    const newContent = '';
    const result = extractChangedLines(oldContent, newContent);

    expect(result).toBeDefined();
  });
});

describe('extractPendingComments', () => {
  it('extracts active thread comments', () => {
    const threads = [
      {
        status: 'active',
        threadContext: { filePath: '/src/File.cs', rightFileStart: { line: 10 } },
        comments: [{ content: 'Please fix this', commentType: 'text' }]
      }
    ];

    const result = extractPendingComments(threads);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      file: '/src/File.cs',
      line: 10,
      comment: 'Please fix this'
    });
  });

  it('extracts comments with status code 1 (active)', () => {
    const threads = [
      {
        status: 1,
        threadContext: { filePath: '/src/File.cs' },
        comments: [{ content: 'Comment', commentType: 'text' }]
      }
    ];

    const result = extractPendingComments(threads);
    expect(result).toHaveLength(1);
  });

  it('skips deleted threads', () => {
    const threads = [
      {
        isDeleted: true,
        status: 'active',
        comments: [{ content: 'Deleted', commentType: 'text' }]
      }
    ];

    const result = extractPendingComments(threads);
    expect(result).toHaveLength(0);
  });

  it('skips non-active threads', () => {
    const threads = [
      {
        status: 'closed',
        comments: [{ content: 'Closed', commentType: 'text' }]
      },
      {
        status: 'fixed',
        comments: [{ content: 'Fixed', commentType: 'text' }]
      }
    ];

    const result = extractPendingComments(threads);
    expect(result).toHaveLength(0);
  });

  it('skips system comments', () => {
    const threads = [
      {
        status: 'active',
        comments: [
          { content: 'System message', commentType: 'system' },
          { content: 'User comment', commentType: 'text' }
        ]
      }
    ];

    const result = extractPendingComments(threads);
    expect(result).toHaveLength(1);
    expect(result[0].comment).toBe('User comment');
  });

  it('skips comments with no content', () => {
    const threads = [
      {
        status: 'active',
        comments: [
          { content: '', commentType: 'text' },
          { content: null, commentType: 'text' },
          { commentType: 'text' }
        ]
      }
    ];

    const result = extractPendingComments(threads);
    expect(result).toHaveLength(0);
  });

  it('handles threads without threadContext', () => {
    const threads = [
      {
        status: 'active',
        comments: [{ content: 'General comment', commentType: 'text' }]
      }
    ];

    const result = extractPendingComments(threads);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBeNull();
    expect(result[0].line).toBeNull();
  });

  it('uses leftFileStart line when rightFileStart not available', () => {
    const threads = [
      {
        status: 'active',
        threadContext: { filePath: '/src/File.cs', leftFileStart: { line: 5 } },
        comments: [{ content: 'Comment', commentType: 'text' }]
      }
    ];

    const result = extractPendingComments(threads);
    expect(result[0].line).toBe(5);
  });

  it('normalizes newlines in comments', () => {
    const threads = [
      {
        status: 'active',
        comments: [{ content: 'Line 1\nLine 2\nLine 3', commentType: 'text' }]
      }
    ];

    const result = extractPendingComments(threads);
    expect(result[0].comment).toBe('Line 1 Line 2 Line 3');
  });

  it('handles empty threads array', () => {
    const result = extractPendingComments([]);
    expect(result).toHaveLength(0);
  });
});
