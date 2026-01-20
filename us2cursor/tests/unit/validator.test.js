import { describe, it, expect } from 'vitest';
import { validateBackendOutput, validateFrontendOutput, validateOutput } from '../../lib/validator.js';

describe('validateBackendOutput', () => {
  it('validates complete spec as valid', () => {
    const spec = `Mutation:
- Name: CreateUser
- Input: record CreateUserInput(string Name)
- Returns: record CreateUserResult(Guid Id)

Behavior:
- Creates user in database

Rules:
- Name must be unique

AC: 1, 2`;

    const result = validateBackendOutput(spec);
    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects missing Mutation section', () => {
    const spec = `- Name: Test
- Input: x
- Returns: y
Behavior:
- Does something
Rules:
- Rule
AC: 1`;
    const result = validateBackendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues).toContain('Missing "Mutation:" section');
  });

  it('detects missing Name in Mutation', () => {
    const spec = `Mutation:
- Input: record Test(string X)
- Returns: record TestResult(bool Ok)
Behavior:
- Test
Rules:
- Rule
AC: 1`;
    const result = validateBackendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues).toContain('Missing "- Name:" in Mutation');
  });

  it('detects missing Input in Mutation', () => {
    const spec = `Mutation:
- Name: Test
- Returns: record TestResult(bool Ok)
Behavior:
- Test
Rules:
- Rule
AC: 1`;
    const result = validateBackendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues).toContain('Missing "- Input:" in Mutation');
  });

  it('detects missing Returns in Mutation', () => {
    const spec = `Mutation:
- Name: Test
- Input: record TestInput(string X)
Behavior:
- Test
Rules:
- Rule
AC: 1`;
    const result = validateBackendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues).toContain('Missing "- Returns:" in Mutation');
  });

  it('detects missing Behavior section', () => {
    const spec = `Mutation:
- Name: Test
- Input: x
- Returns: y
Rules:
- Rule
AC: 1`;
    const result = validateBackendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues).toContain('Missing "Behavior:" section');
  });

  it('detects missing Rules section', () => {
    const spec = `Mutation:
- Name: Test
- Input: x
- Returns: y
Behavior:
- Test
AC: 1`;
    const result = validateBackendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues).toContain('Missing "Rules:" section');
  });

  it('detects missing AC section', () => {
    const spec = `Mutation:
- Name: Test
- Input: x
- Returns: y
Behavior:
- Test
Rules:
- Rule`;
    const result = validateBackendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues).toContain('Missing "AC:" section');
  });

  it('detects truncation ending with hyphen', () => {
    const spec = `Mutation:
- Name: Test
- Input: x
- Returns: y
Behavior:
- Test
Rules:
-`;
    const result = validateBackendOutput(spec);

    expect(result.issues).toContain('Output appears to be truncated');
  });

  it('detects truncation ending with colon', () => {
    const spec = `Mutation:
- Name: Test
- Input: x
- Returns: y
Behavior:`;
    const result = validateBackendOutput(spec);

    expect(result.issues).toContain('Output appears to be truncated');
  });

  it('detects truncation ending with comma', () => {
    const spec = `Mutation:
- Name: Test
- Input: record Test(string A,`;
    const result = validateBackendOutput(spec);

    expect(result.issues).toContain('Output appears to be truncated');
  });

  it('detects incomplete record syntax', () => {
    const spec = `Mutation:
- Name: Test
- Input: record TestInput(string Name`;
    const result = validateBackendOutput(spec);

    expect(result.issues).toContain('Incomplete record (missing closing parenthesis)');
  });

  it('returns multiple issues when present', () => {
    const spec = 'Behavior:\n- Test';
    const result = validateBackendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(1);
  });
});

describe('validateFrontendOutput', () => {
  it('validates complete spec as valid', () => {
    const spec = `Component:
- Name: LoginFormComponent
- Type: form
- Location: Auth page

UI Elements:
- Username input
- Password input
- Submit button

States:
- Loading
- Error

Interactions:
- Click submit → validate

AC: 1, 2`;

    const result = validateFrontendOutput(spec);
    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects missing Component section', () => {
    const spec = `- Name: Test
UI Elements:
- Button
Behavior:
- Click
AC: 1`;
    const result = validateFrontendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues).toContain('Missing "Component:" section');
  });

  it('detects missing Name in Component', () => {
    const spec = `Component:
- Type: modal
UI Elements:
- Button
Behavior:
- Click
AC: 1`;
    const result = validateFrontendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues).toContain('Missing "- Name:" in Component');
  });

  it('detects missing UI Elements section', () => {
    const spec = `Component:
- Name: Test
Behavior:
- Click
AC: 1`;
    const result = validateFrontendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues).toContain('Missing "UI Elements:" section');
  });

  it('accepts Elements: as alternative to UI Elements:', () => {
    const spec = `Component:
- Name: Test
Elements:
- Button
Behavior:
- Click
AC: 1`;
    const result = validateFrontendOutput(spec);

    expect(result.issues).not.toContain('Missing "UI Elements:" section');
  });

  it('detects missing Behavior/Interactions section', () => {
    const spec = `Component:
- Name: Test
UI Elements:
- Button
AC: 1`;
    const result = validateFrontendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues).toContain('Missing "Behavior:" or "Interactions:" section');
  });

  it('accepts Interactions: as alternative to Behavior:', () => {
    const spec = `Component:
- Name: Test
UI Elements:
- Button
Interactions:
- Click → action
AC: 1`;
    const result = validateFrontendOutput(spec);

    expect(result.issues).not.toContain('Missing "Behavior:" or "Interactions:" section');
  });

  it('detects missing AC section', () => {
    const spec = `Component:
- Name: Test
UI Elements:
- Button
Behavior:
- Click`;
    const result = validateFrontendOutput(spec);

    expect(result.isValid).toBe(false);
    expect(result.issues).toContain('Missing "AC:" section');
  });

  it('detects truncation', () => {
    const spec = `Component:
- Name: Test
- Type:`;
    const result = validateFrontendOutput(spec);

    expect(result.issues).toContain('Output appears to be truncated');
  });
});

describe('validateOutput (alias)', () => {
  it('is an alias for validateBackendOutput', () => {
    expect(validateOutput).toBe(validateBackendOutput);
  });
});
