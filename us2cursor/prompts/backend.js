// Backend review prompt

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

BACKEND-SPECIFIC RULES:
- Null Reference: Proper null checks, null-conditional operators
- Async/Await: Missing await, unhandled promise rejections, deadlocks
- SQL Injection: Parameterized queries, proper escaping
- Authorization: Missing authorization checks, privilege escalation
- N+1 Queries: Missing includes/joins, inefficient data loading
- Performance: Missing indexes, inefficient algorithms, memory leaks
- API Validation: Input validation, error handling, status codes
- Error Handling: Proper exception handling, error messages, logging

CRITICAL BUGS RULES (avoid false positives):
- Only mark CRITICAL if bug is EVIDENT in visible code
- Do NOT assume external/inherited methods return null
- If method validation is unknown, mark IMPORTANT with "(verify)" note
- Prefer false negatives over false positives for CRITICAL
- Common safe patterns: GetCurrentUser, GetCurrentUserEmail usually throw if null

RULES:
- File column: ONLY filename (e.g. "Query.cs"), NOT full path
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
| CRITICAL | Bugs | Query.cs | 45 | [brief] | [brief] |
| IMPORTANT | Performance | Mutation.cs | 120 | [brief] | [brief] |
| MINOR | CleanCode | Service.cs | 30 | [brief] | [brief] |

### Missing Tests
- Class.Method

### AC Coverage
*(MUST include Description column with 2-5 word summary of each AC)*

| AC | Description | Status | Where |
|----|-------------|--------|-------|
| 1 | User can upload file | Done | Service.Upload |
| 2 | Validate file size | Missing | Not implemented |
| 3 | Show error message | Done | Controller.Handle |

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

BACKEND-SPECIFIC RULES:
- Null Reference: Proper null checks, null-conditional operators
- Async/Await: Missing await, unhandled promise rejections, deadlocks
- SQL Injection: Parameterized queries, proper escaping
- Authorization: Missing authorization checks, privilege escalation
- N+1 Queries: Missing includes/joins, inefficient data loading
- Performance: Missing indexes, inefficient algorithms, memory leaks
- API Validation: Input validation, error handling, status codes
- Error Handling: Proper exception handling, error messages, logging

CRITICAL BUGS RULES (avoid false positives):
- Only mark CRITICAL if bug is EVIDENT in visible code
- Do NOT assume external/inherited methods return null
- If method validation is unknown, mark IMPORTANT with "(verify)" note
- Prefer false negatives over false positives for CRITICAL
- Common safe patterns: GetCurrentUser, GetCurrentUserEmail usually throw if null

RULES:
- File column: ONLY filename (e.g. "Query.cs"), NOT full path
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
| CRITICAL | Bugs | Query.cs | 45 | [brief] | [brief] |
| IMPORTANT | Performance | Mutation.cs | 120 | [brief] | [brief] |
| MINOR | CleanCode | Service.cs | 30 | [brief] | [brief] |

### Missing Tests
- Class.Method

### Verdict
**APPROVE**

---
*prreview*
No US linked`;
