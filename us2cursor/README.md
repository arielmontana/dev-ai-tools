# US2CURSOR

> Convert Azure DevOps User Stories into optimized prompts for Cursor AI.
> **Save ~90% tokens** when working with Cursor.

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Configuration](#configuration)
- [Commands](#commands)
  - [us2b - Backend Spec](#us2b---backend-spec)
  - [us2f - Frontend Spec](#us2f---frontend-spec)
  - [us2check - Check User Story](#us2check---check-user-story)
  - [prfix - Fix PR Comments](#prfix---fix-pr-comments)
  - [prreview - AI Code Review](#prreview---ai-code-review)
- [Snippets](#snippets)
- [Complete Workflow](#complete-workflow)
- [Token Savings](#token-savings)
- [Troubleshooting](#troubleshooting)
- [Tech Stack](#tech-stack)

---

## Overview

**US2CURSOR** is a CLI tool that transforms Azure DevOps User Stories into minimal, optimized prompts for Cursor AI. Instead of copying entire User Stories (which wastes tokens), this tool extracts only the essential technical requirements.

### The Problem

When you paste a full User Story into Cursor:
- ❌ Wastes 800-1500 tokens
- ❌ Includes irrelevant business narrative
- ❌ Mixes frontend/backend requirements
- ❌ Contains UI details in backend prompts

### The Solution

US2CURSOR generates focused prompts:
- ✅ Uses only 50-80 tokens
- ✅ Technical language only
- ✅ Separated backend/frontend specs
- ✅ Clean, actionable format

---

## Installation

### Prerequisites

- Node.js 18 or higher
- Azure DevOps account with PAT
- Groq account (free)

### Steps

```bash
# 1. Clone or download to your tools folder
cd C:\Tools\us2cursor

# 2. Install dependencies
npm install

# 3. Configure environment (see Configuration section)
cp .env .env.local
# Edit .env.local with your credentials

# 4. Link commands globally
npm link
```

After installation, you'll have 5 global commands available:
- `us2b` - Backend specs
- `us2f` - Frontend specs
- `us2check` - Check/validate User Stories
- `prfix` - Fix PR comments
- `prreview` - AI code review for PRs

---

## Configuration

### Environment Files

The tool uses two environment files:

| File | Purpose | Git |
|------|---------|-----|
| `.env` | Template with empty values | ✅ Committed |
| `.env.local` | Your actual credentials | ❌ Ignored |

### Setup

```bash
# 1. Copy template to local config
cp .env .env.local

# 2. Edit with your credentials
notepad .env.local   # Windows
nano .env.local      # Linux/Mac
```

### `.env.local` Configuration

```env
# Azure DevOps Configuration
AZURE_ORG=your-organization
AZURE_PROJECT=your-project
AZURE_PAT=your-personal-access-token
AZURE_REPO=your-default-repository

# AI Configuration (free)
GROQ_API_KEY=your-groq-api-key
```

### Priority

The tool loads configuration in this order:
1. `.env` (template/defaults)
2. `.env.local` (your values) - **overrides .env**

### Get Your Credentials

#### Azure DevOps PAT

1. Go to Azure DevOps → User Settings (top right icon)
2. Click **Personal Access Tokens**
3. Click **+ New Token**
4. Configure:
   - Name: `us2cursor`
   - Expiration: 90 days or more
   - Scopes:
     - ✅ **Work Items**: Read
     - ✅ **Code**: Read & Write (required for `prfix` and `prreview`)
5. Click **Create** and copy the token

#### Groq API Key (Free)

1. Go to https://console.groq.com
2. Create an account
3. Go to **API Keys** → **Create API Key**
4. Copy the key

---

## Commands

| Command | Description | Output |
|---------|-------------|--------|
| `us2b <id>` | Backend spec (HotChocolate/GraphQL) | ~50-60 tokens |
| `us2f <id>` | Frontend spec (Components/UI) | ~70-80 tokens |
| `us2check <id>` | Check User Story completeness | Suggestions report |
| `prfix <pr-id> [repo]` | Fix PR comments | ~40-60 tokens |
| `prreview <pr-id> [repo]` | AI code review for PR | Full review + publish option |

---

### us2b - Backend Spec

Generates an optimized backend specification for HotChocolate GraphQL (.NET).

#### Usage

```bash
us2b <work-item-id>
```

#### Example

```bash
us2b 199339
```

#### Output

```
Mutation:
- Name: MarkNotificationAsRead
- Input: record NotificationInput(Guid NotificationId, Guid UserId)
- Returns: record NotificationResult(bool Success, int UnreadCount)

Behavior:
- Update notification read status in database
- Decrement unread counter for user

Rules:
- User must own the notification
- Notification must exist

AC: 1, 3, 5
```

---

### us2f - Frontend Spec

Generates an optimized frontend specification for UI components.

#### Usage

```bash
us2f <work-item-id>
```

#### Example

```bash
us2f 199339
```

#### Output

```
Component:
- Name: NotificationPanelComponent
- Type: modal
- Location: header navbar

UI Elements:
- Bell icon with counter badge
- Tab bar: "UNREAD" / "ALL"
- Scrollable notification list

States:
- Loading: spinner while fetching
- Empty: "No notifications" message
- Error: retry button

AC: 1, 2, 4, 6, 8
```

---

### us2check - Check User Story

Analyzes a User Story to determine if it's complete for development.

#### Usage

```bash
us2check <work-item-id>
```

#### Example

```bash
us2check 199339
```

The tool will prompt for optional Figma context:

```
📐 FIGMA CONTEXT (optional)

You can provide:
  - Figma link
  - Screen description
  - Visible elements (buttons, fields, etc.)

(Press Enter to skip)

Figma/Screen: Modal with tabs UNREAD/ALL, notification list, Mark all button
```

---

### prfix - Fix PR Comments

Generates an optimized prompt from pending Pull Request comments.

#### Usage

```bash
# With repository name
prfix <pr-id> <repo-name>

# Using default repo from .env.local
prfix <pr-id>
```

#### Example

```bash
prfix 64050 AP.AlixVault.API
```

#### Output

```
Fix PR comments:
- In NotificationService.cs line 45: add null check for user
- In NotificationService.cs line 78: use Include to avoid N+1 query
- In NotificationRepository.cs line 23: add async/await
Code only, no explanations
```

---

### prreview - AI Code Review

Generates an AI-powered code review for a Pull Request with optional publishing.

#### Features

- ✅ Reviews **only changed code** (diff), not entire files
- ✅ Validates against linked **User Story** and **Acceptance Criteria**
- ✅ Classifies issues by severity (Critical, Important, Minor)
- ✅ **Table format** for clear issue visualization
- ✅ Posts **general comment** + **line-specific comments**
- ✅ Copies review to clipboard

#### Usage

```bash
# With repository name
prreview <pr-id> <repo-name>

# Using default repo from .env.local
prreview <pr-id>
```

#### Example

```bash
prreview 64050 AP.AlixVault.API
```

#### Output Format

```
## Code Review

### ✅ Good
- Well-structured code with proper naming conventions
- Correct use of async/await

### 📋 Issues

| Severity | Category | File | Line | Issue | Fix |
|----------|----------|------|------|-------|-----|
| 🔴 CRITICAL | Bugs | Service.cs | 45 | Null reference possible | Add null check |
| 🟡 IMPORTANT | Performance | Query.cs | 120 | N+1 query in loop | Use Include() |
| 🔵 MINOR | CleanCode | Helper.cs | 30 | Method too long | Extract methods |

### 🧪 Missing Tests
- Service.ProcessNotification
- Query.GetUserData

### 📋 AC Coverage

| AC | Status | Where |
|----|--------|-------|
| 1 | ✅ | Service.Process() |
| 2 | ❌ | Not implemented |

### 📝 Verdict
**APPROVE WITH COMMENTS**

---
*prreview*
```

#### Severity Classification

| Severity | Categories | Verdict Impact |
|----------|------------|----------------|
| 🔴 CRITICAL | Bugs, Security | REQUEST CHANGES |
| 🟡 IMPORTANT | Performance, CleanCode | APPROVE WITH COMMENTS |
| 🔵 MINOR | BestPractices | APPROVE |

#### Publishing

After displaying the review:

```
✅ Review copied to clipboard!

📤 Publish to PR? (y/n): y

📤 Publishing...
📝 Posting general review...
📍 Posting 3 line comments...
   ✓ Service.cs:45
   ✓ Query.cs:120
   ✓ Helper.cs:30

✅ Review published!
🔗 https://dev.azure.com/org/project/_git/repo/pullrequest/64050
```

When published:
1. **General comment** with full review appears in PR comments
2. **Line comments** appear directly on the code at each issue location

---

## Snippets

Install `snippets.code-snippets` in Cursor for quick follow-up prompts.

### Installation

1. Press `Ctrl+Shift+P` in Cursor
2. Type: `Snippets: Configure User Snippets`
3. Select `global.code-snippets`
4. Paste the contents of `snippets.code-snippets`
5. Save

### Available Snippets

| Trigger | Description | Output |
|---------|-------------|--------|
| `qa` | Add something | `Add: ...` |
| `qf` | Fix bug | `Fix: ...` |
| `qc` | Change something | `Change: X → Y` |
| `qv` | Add validation | `Add validation: ...` |
| `qtest` | Generate test | `Generate test for: ...` |
| `qbuild` | Compile | `Compile and show errors` |
| `qrev` | Quick review | `Review pending changes` |
| `qmut` | Add mutation | `Add mutation: ...` |

---

## Complete Workflow

```
1. CHECK USER STORY
   └─→ us2check 123        → Verify US is complete

2. GENERATE SPEC
   └─→ us2b 123            → Backend prompt
   └─→ us2f 123            → Frontend prompt

3. PASTE IN CURSOR
   └─→ Ctrl+V + Enter      → Cursor generates code

4. FOLLOW-UP (snippets)
   └─→ qa, qf, qv          → Quick adjustments

5. VERIFY
   └─→ qva                 → Build + tests

6. CREATE PR
   └─→ Push + Create PR

7. REVIEW OTHERS' PRs
   └─→ prreview 456        → AI review + publish

8. FIX YOUR PR COMMENTS
   └─→ prfix 456           → Get fixes prompt
```

---

## Token Savings

| Scenario | Without US2CURSOR | With US2CURSOR | Savings |
|----------|-------------------|----------------|---------|
| Initial prompt | 800-1500 tokens | 50-80 tokens | **~94%** |
| Follow-up | 100-200 tokens | 5-10 tokens | **~95%** |
| PR comments | 300-500 tokens | 40-60 tokens | **~88%** |
| **Total per feature** | ~2000-3000 | ~200-300 | **~90%** |

---

## Troubleshooting

### Error: Missing config

```
❌ Missing config. Create .env.local with: AZURE_ORG, AZURE_PROJECT, AZURE_PAT, GROQ_API_KEY
```

**Solution**: Create `.env.local` with your credentials (see Configuration section).

### Error 401 (Unauthorized)

**Cause**: PAT is invalid, expired, or missing permissions.

**Solution**:
1. Regenerate PAT with correct permissions:
   - Work Items: Read
   - Code: Read & Write
2. Update `.env.local` with new token

### Error 404 (Not Found)

**Cause**: Work Item or PR doesn't exist, or wrong repository.

**Solution**:
- Verify the ID exists in Azure DevOps
- Check repository name matches exactly

### Error 403 when publishing review

**Cause**: PAT doesn't have write permissions.

**Solution**: Regenerate PAT with **Code: Read & Write** scope.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ |
| LLM | Groq (llama-3.3-70b-versatile) |
| Backend Target | HotChocolate GraphQL (C#/.NET) |
| Frontend Target | React/Angular/Vue |
| Source | Azure DevOps |
| Cost | **Free** (Groq has generous free tier) |

---

## Project Structure

```
📁 us2cursor/
├── 📄 .env                    ← Template (committed)
├── 📄 .env.local              ← Your credentials (ignored)
├── 📄 .gitignore              ← Ignores .env.local and node_modules
├── 📄 package.json            ← npm configuration
├── 📄 README.md               ← This documentation
├── 📄 snippets.code-snippets  ← Cursor snippets
├── 📄 us2b.js                 ← Backend spec command
├── 📄 us2f.js                 ← Frontend spec command
├── 📄 us2check.js             ← Check/validate US command
├── 📄 prfix.js                ← Fix PR comments command
├── 📄 prreview.js             ← AI code review command
└── 📁 node_modules/           ← Dependencies (ignored)
```

---

## Version History

| Version | Changes |
|---------|---------|
| 1.0.0 | Initial release with us2b |
| 1.1.0 | Added us2f (frontend) |
| 1.2.0 | Added us2validate |
| 1.3.0 | Added us2pr, English output, improved prompts |
| 1.4.0 | Renamed: us2validate → us2check, us2pr → prfix |
| 1.5.0 | Added prreview (AI code review with publish option) |
| 1.6.0 | prreview: table format, line comments, diff-only review |
| 1.7.0 | Environment: .env + .env.local support |

---

## License

MIT

---

## Contributing

Feel free to submit issues and pull requests to improve the tool.

---

Made with ❤️ to save tokens and boost productivity.
