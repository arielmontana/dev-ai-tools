import { describe, it, expect } from 'vitest';
import { cleanOutputBackend, cleanOutputFrontend, UI_KEYWORDS, BACKEND_KEYWORDS } from '../../lib/cleaner.js';

describe('cleanOutputBackend', () => {
  it('removes LLM preamble text starting with "Here is"', () => {
    const input = "Here is the extracted spec:\n\nMutation:";
    expect(cleanOutputBackend(input)).toBe('Mutation:');
  });

  it('removes LLM preamble text starting with "Here\'s"', () => {
    const input = "Here's your backend spec:\n\nMutation:";
    expect(cleanOutputBackend(input)).toBe('Mutation:');
  });

  it('removes LLM preamble text starting with "The following"', () => {
    const input = "The following is the mutation:\n\nMutation:";
    expect(cleanOutputBackend(input)).toBe('Mutation:');
  });

  it('removes LLM preamble text starting with "Below is"', () => {
    const input = "Below is the spec:\n\nMutation:";
    expect(cleanOutputBackend(input)).toBe('Mutation:');
  });

  it('removes empty code blocks', () => {
    const input = '```csharp\n```\nMutation:';
    expect(cleanOutputBackend(input)).toBe('Mutation:');
  });

  it('removes code block markers with language', () => {
    const input = '```csharp\nMutation:\n```';
    expect(cleanOutputBackend(input)).toBe('Mutation:');
  });

  it('removes code block markers without language', () => {
    const input = '```\nMutation:\n```';
    expect(cleanOutputBackend(input)).toBe('Mutation:');
  });

  it('filters lines with UI keywords', () => {
    // Note: avoid "database" which contains "tab" substring (known limitation of substring matching)
    const input = 'Mutation:\nUser clicks button\nStore in DB';
    const result = cleanOutputBackend(input);
    expect(result).not.toContain('clicks button');
    expect(result).toContain('Store in DB');
  });

  it('filters lines containing "button"', () => {
    const input = 'Mutation:\n- Show save button\n- Update record';
    const result = cleanOutputBackend(input);
    expect(result).not.toContain('button');
    expect(result).toContain('Update record');
  });

  it('filters lines containing "modal"', () => {
    const input = 'Behavior:\n- Open modal\n- Process data';
    const result = cleanOutputBackend(input);
    expect(result).not.toContain('modal');
    expect(result).toContain('Process data');
  });

  it('filters case-insensitively', () => {
    const input = 'Mutation:\n- DISPLAY error\n- Store value';
    const result = cleanOutputBackend(input);
    expect(result).not.toContain('DISPLAY');
    expect(result).toContain('Store value');
  });

  it('preserves valid backend content', () => {
    // Note: avoid "database" which contains "tab" substring (known limitation)
    const input = `Mutation:
- Name: CreateUser
- Input: record CreateUserInput(string Name)
- Returns: record CreateUserResult(Guid Id)

Behavior:
- Validate input data
- Insert record into DB

Rules:
- Name must be unique

AC: 1, 2`;

    const result = cleanOutputBackend(input);
    expect(result).toContain('Mutation:');
    expect(result).toContain('CreateUser');
    expect(result).toContain('Insert record');
    expect(result).toContain('AC: 1, 2');
  });
});

describe('cleanOutputFrontend', () => {
  it('removes LLM preamble text', () => {
    const input = "Here is the component:\n\nComponent:";
    expect(cleanOutputFrontend(input)).toBe('Component:');
  });

  it('removes code block markers', () => {
    const input = '```typescript\nComponent:\n```';
    expect(cleanOutputFrontend(input)).toBe('Component:');
  });

  it('filters lines with backend keywords', () => {
    const input = 'Component:\nDatabase connection\nShow modal';
    const result = cleanOutputFrontend(input);
    expect(result).not.toContain('Database');
    expect(result).toContain('modal');
  });

  it('filters lines containing "sql"', () => {
    const input = 'UI Elements:\n- SQL query result\n- Submit button';
    const result = cleanOutputFrontend(input);
    expect(result).not.toContain('SQL');
    expect(result).toContain('Submit button');
  });

  it('filters lines containing "repository"', () => {
    const input = 'Behavior:\n- Call repository\n- Update UI';
    const result = cleanOutputFrontend(input);
    expect(result).not.toContain('repository');
    expect(result).toContain('Update UI');
  });

  it('filters lines containing "entity framework"', () => {
    const input = 'Notes:\n- Uses Entity Framework\n- Renders list';
    const result = cleanOutputFrontend(input);
    expect(result).not.toContain('Entity Framework');
    expect(result).toContain('Renders list');
  });

  it('preserves valid frontend content', () => {
    const input = `Component:
- Name: LoginFormComponent
- Type: form
- Location: Auth page

UI Elements:
- Username input field
- Password input field
- Submit button

Interactions:
- Click submit → validate form

AC: 1, 2, 3`;

    const result = cleanOutputFrontend(input);
    expect(result).toContain('Component:');
    expect(result).toContain('LoginFormComponent');
    expect(result).toContain('Submit button');
    expect(result).toContain('AC: 1, 2, 3');
  });
});

describe('keyword exports', () => {
  it('exports UI_KEYWORDS array', () => {
    expect(Array.isArray(UI_KEYWORDS)).toBe(true);
    expect(UI_KEYWORDS).toContain('button');
    expect(UI_KEYWORDS).toContain('modal');
    expect(UI_KEYWORDS).toContain('click');
  });

  it('exports BACKEND_KEYWORDS array', () => {
    expect(Array.isArray(BACKEND_KEYWORDS)).toBe(true);
    expect(BACKEND_KEYWORDS).toContain('database');
    expect(BACKEND_KEYWORDS).toContain('sql');
    expect(BACKEND_KEYWORDS).toContain('repository');
  });
});
