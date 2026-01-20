import { describe, it, expect } from 'vitest';
import { extractFields, extractUS, createAuthHeader, buildBaseUrl } from '../../lib/azure.js';

describe('createAuthHeader', () => {
  it('creates Basic auth header from PAT', () => {
    const pat = 'test-pat-token';
    const header = createAuthHeader(pat);

    expect(header.Authorization).toBeDefined();
    expect(header.Authorization.startsWith('Basic ')).toBe(true);

    // Verify the base64 encoding is correct
    const encoded = header.Authorization.replace('Basic ', '');
    const decoded = Buffer.from(encoded, 'base64').toString();
    expect(decoded).toBe(':test-pat-token');
  });

  it('handles empty PAT', () => {
    const header = createAuthHeader('');
    const encoded = header.Authorization.replace('Basic ', '');
    const decoded = Buffer.from(encoded, 'base64').toString();
    expect(decoded).toBe(':');
  });
});

describe('buildBaseUrl', () => {
  it('builds correct base URL', () => {
    const url = buildBaseUrl('myorg', 'myproject');
    expect(url).toBe('https://dev.azure.com/myorg/myproject/_apis');
  });

  it('encodes project names with special characters', () => {
    const url = buildBaseUrl('myorg', 'My Project');
    expect(url).toBe('https://dev.azure.com/myorg/My%20Project/_apis');
  });

  it('handles special characters in project name', () => {
    const url = buildBaseUrl('myorg', 'project/test');
    expect(url).toContain('project%2Ftest');
  });
});

describe('extractFields', () => {
  it('extracts title, description, and AC from work item', () => {
    const workItem = {
      id: 12345,
      fields: {
        'System.Title': 'Add login feature',
        'System.Description': '<p>User should be able to login</p>',
        'Microsoft.VSTS.Common.AcceptanceCriteria': '<div>1. User sees form</div>'
      }
    };

    const result = extractFields(workItem);

    expect(result.id).toBe(12345);
    expect(result.title).toBe('Add login feature');
    expect(result.description).toBe('User should be able to login');
    expect(result.acceptanceCriteria).toBe('1. User sees form');
  });

  it('handles missing fields gracefully', () => {
    const workItem = { id: 1, fields: {} };
    const result = extractFields(workItem);

    expect(result.id).toBe(1);
    expect(result.title).toBe('');
    expect(result.description).toBe('');
    expect(result.acceptanceCriteria).toBe('');
  });

  it('handles undefined fields object', () => {
    const workItem = { id: 1 };
    const result = extractFields(workItem);

    expect(result.id).toBe(1);
    expect(result.title).toBe('');
    expect(result.description).toBe('');
    expect(result.acceptanceCriteria).toBe('');
  });

  it('strips HTML tags from description', () => {
    const workItem = {
      id: 1,
      fields: {
        'System.Description': '<b>Bold</b> and <i>italic</i> text'
      }
    };

    const result = extractFields(workItem);
    expect(result.description).toBe('Bold and italic text');
  });

  it('normalizes whitespace in description', () => {
    const workItem = {
      id: 1,
      fields: {
        'System.Description': '<p>Line 1</p>   <p>Line 2</p>'
      }
    };

    const result = extractFields(workItem);
    expect(result.description).toBe('Line 1 Line 2');
  });

  it('converts HTML tags to newlines in acceptance criteria', () => {
    const workItem = {
      id: 1,
      fields: {
        'Microsoft.VSTS.Common.AcceptanceCriteria': '<div>AC 1</div><div>AC 2</div>'
      }
    };

    const result = extractFields(workItem);
    expect(result.acceptanceCriteria).toBe('AC 1\nAC 2');
  });

  it('handles complex HTML in description', () => {
    const workItem = {
      id: 1,
      fields: {
        'System.Description': '<div><ul><li>Item 1</li><li>Item 2</li></ul></div>'
      }
    };

    const result = extractFields(workItem);
    expect(result.description).toBe('Item 1 Item 2');
    expect(result.description).not.toContain('<');
    expect(result.description).not.toContain('>');
  });
});

describe('extractUS', () => {
  it('extracts id, title, and ac from work item', () => {
    const workItem = {
      id: 123,
      fields: {
        'System.Title': 'User Story Title',
        'Microsoft.VSTS.Common.AcceptanceCriteria': '<div>AC content</div>'
      }
    };

    const result = extractUS(workItem);

    expect(result.id).toBe(123);
    expect(result.title).toBe('User Story Title');
    expect(result.ac).toBe('AC content');
  });

  it('handles missing fields', () => {
    const workItem = { id: 1, fields: {} };
    const result = extractUS(workItem);

    expect(result.id).toBe(1);
    expect(result.title).toBe('');
    expect(result.ac).toBe('');
  });
});
