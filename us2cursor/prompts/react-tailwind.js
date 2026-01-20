// React + Tailwind CSS review prompt

export const PROMPT_WITH_US = `Output a code review with the EXACT structure below.

Review only + lines. Be concise.

CLASSIFICATION:
- CRITICAL: Bugs, Security
- IMPORTANT: Performance, CleanCode
- MINOR: BestPractices

VERDICT:
- Any CRITICAL -> REQUEST CHANGES
- Any IMPORTANT -> APPROVE WITH COMMENTS
- Only MINOR or nothing -> APPROVE

FRONTEND-SPECIFIC RULES:
- TypeScript: Avoid \`any\` type, ensure proper typing
- React Hooks: Check dependencies arrays, rules of hooks violations
- Memory Leaks: Missing cleanup in useEffect, event listeners, subscriptions
- Memoization: Unnecessary re-renders, missing useMemo/useCallback
- Tailwind CSS: Consistent utility classes, responsive design (sm:, md:, lg:), dark mode support
- State Management: Proper state lifting, context usage, Apollo cache updates
- Accessibility: ARIA labels, keyboard navigation, color contrast
- Security: XSS vulnerabilities, sensitive data exposure, input sanitization

CRITICAL BUGS RULES (avoid false positives):
- Only mark CRITICAL if bug is EVIDENT in visible code
- Do NOT flag useEffect with empty deps if intentionally run once
- Do NOT flag inline functions in JSX if performance is not a concern
- Prefer false negatives over false positives for CRITICAL

RULES:
- File column: ONLY filename (e.g. "UserProfile.tsx"), NOT full path
- AC Coverage table MUST have 4 columns: AC | Description | Status | Where
- Description column: 2-5 words summarizing each AC
- Do NOT repeat the input files or CHANGES section
- Output ONLY the review structure below

---
OUTPUT STRUCTURE:
---

## Code Review

### Good
- [positive point]

### Issues

| Severity | Category | File | Line | Issue | Fix |
|----------|----------|------|------|-------|-----|
| CRITICAL | Bugs | UserProfile.tsx | 45 | [brief] | [brief] |
| IMPORTANT | Performance | UserProfile.tsx | 120 | [brief] | [brief] |
| MINOR | CleanCode | UserProfile.tsx | 30 | [brief] | [brief] |

### Missing Tests
- Component.test.tsx

### AC Coverage
*(MUST include Description column with 2-5 word summary of each AC)*

| AC | Description | Status | Where |
|----|-------------|--------|-------|
| 1 | User can view profile | Done | UserProfile.tsx |
| 2 | Profile loads on mount | Missing | Not implemented |
| 3 | Error message displayed | Done | UserProfile.Error |

### Verdict
**APPROVE**

---
*prreview*`;

export const PROMPT_NO_US = `Output a code review with the EXACT structure below.

Review only + lines. Be concise.

CLASSIFICATION:
- CRITICAL: Bugs, Security
- IMPORTANT: Performance, CleanCode
- MINOR: BestPractices

VERDICT:
- Any CRITICAL -> REQUEST CHANGES
- Any IMPORTANT -> APPROVE WITH COMMENTS
- Only MINOR or nothing -> APPROVE

FRONTEND-SPECIFIC RULES:
- TypeScript: Avoid \`any\` type, ensure proper typing
- React Hooks: Check dependencies arrays, rules of hooks violations
- Memory Leaks: Missing cleanup in useEffect, event listeners, subscriptions
- Memoization: Unnecessary re-renders, missing useMemo/useCallback
- Tailwind CSS: Consistent utility classes, responsive design (sm:, md:, lg:), dark mode support
- State Management: Proper state lifting, context usage, Apollo cache updates
- Accessibility: ARIA labels, keyboard navigation, color contrast
- Security: XSS vulnerabilities, sensitive data exposure, input sanitization

CRITICAL BUGS RULES (avoid false positives):
- Only mark CRITICAL if bug is EVIDENT in visible code
- Do NOT flag useEffect with empty deps if intentionally run once
- Do NOT flag inline functions in JSX if performance is not a concern
- Prefer false negatives over false positives for CRITICAL

RULES:
- File column: ONLY filename (e.g. "UserProfile.tsx"), NOT full path
- Do NOT repeat the input files or CHANGES section
- Output ONLY the review structure below

---
OUTPUT STRUCTURE:
---

## Code Review

### Good
- [positive point]

### Issues

| Severity | Category | File | Line | Issue | Fix |
|----------|----------|------|------|-------|-----|
| CRITICAL | Bugs | UserProfile.tsx | 45 | [brief] | [brief] |
| IMPORTANT | Performance | UserProfile.tsx | 120 | [brief] | [brief] |
| MINOR | CleanCode | UserProfile.tsx | 30 | [brief] | [brief] |

### Missing Tests
- Component.test.tsx

### Verdict
**APPROVE**

---
*prreview*
No US linked`;
