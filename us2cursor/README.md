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
# 1. Navigate to the tool folder
cd C:\Tools\us2cursor

# 2. Install dependencies
npm install

# 3. Link commands globally
npm link
```

After installation, you'll have 4 global commands available:
- `us2b` - Backend specs
- `us2f` - Frontend specs
- `us2check` - Check/validate User Stories
- `prfix` - Fix PR comments

---

## Configuration

### Create `.env` file

Create a `.env` file in `C:\Tools\us2cursor` with your credentials:

```env
# Azure DevOps Configuration
AZURE_ORG=your-organization
AZURE_PROJECT=your-project
AZURE_PAT=your-personal-access-token

# Groq Configuration (free LLM)
GROQ_API_KEY=your-groq-api-key

# Optional: Default repository for prfix
AZURE_REPO=your-repository-name
```

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
     - ✅ **Code**: Read (required for `prfix`)
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

---

### us2b - Backend Spec

Generates an optimized backend specification for HotChocolate GraphQL (.NET).

#### What it does

1. Fetches User Story from Azure DevOps
2. Extracts only backend-relevant requirements
3. Filters out UI/frontend details
4. Generates minimal prompt with:
   - Mutation name and signature
   - Input/Output record types
   - Business rules
   - Acceptance Criteria coverage

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

#### Token Usage

~50-60 tokens (vs 800+ without optimization)

---

### us2f - Frontend Spec

Generates an optimized frontend specification for UI components.

#### What it does

1. Fetches User Story from Azure DevOps
2. Extracts only frontend-relevant requirements
3. Filters out backend/database details
4. Generates minimal prompt with:
   - Component name and type
   - UI elements
   - States (loading, empty, error)
   - User interactions
   - Styling requirements

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
- Action buttons (Mark all, Clear all)

States:
- Loading: spinner while fetching
- Empty: "No notifications" message
- Error: retry button

Interactions:
- Click bell → open modal
- Click notification → mark as read, navigate
- Click "Mark all" → clear unread count

Styling:
- Match Figma design specifications

AC: 1, 2, 4, 6, 8
```

#### Token Usage

~70-80 tokens (vs 800+ without optimization)

---

### us2check - Check User Story

Analyzes a User Story to determine if it's complete for development.

#### What it does

1. Fetches User Story from Azure DevOps
2. Optionally accepts Figma/screen context
3. Analyzes completeness:
   - Description clarity
   - Acceptance Criteria coverage
   - Missing edge cases
   - Validation rules
   - Permission requirements
4. Generates report with:
   - Completeness status
   - Missing ACs suggestions
   - Questions for Product Owner

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

#### Output

```
## Status: INCOMPLETE

## Description
- ✅ Clear objective: notification panel feature
- ✅ User roles defined
- ❌ Missing error handling behavior
- ❌ No loading states specified

## Acceptance Criteria
- ✅ Covered: display notifications, mark as read, tabs
- ❌ NOT covered: empty state, error state, pagination

## Suggested ACs to add
1. AC#9: When no notifications exist, display "No notifications" message
2. AC#10: When API fails, display error with retry option
3. AC#11: When more than 50 notifications, implement infinite scroll

## Missing validations
- Maximum notifications to load at once
- Notification text length limit

## Edge cases not covered
- User loses connection while marking as read
- Notification deleted by another session
- Concurrent updates from multiple tabs

## Questions for Product Owner
1. What happens when user has 1000+ notifications?
2. Do notifications expire after a certain time?
3. Should notifications sync in real-time?

## Summary
User Story needs 3 additional ACs to cover empty/error states and pagination. 
Priority: MEDIUM - recommend adding before development.
```

#### Use Cases

- Before starting development
- During sprint planning
- When reviewing User Stories
- Comparing against Figma designs

---

### prfix - Fix PR Comments

Generates an optimized prompt from pending Pull Request comments.

#### What it does

1. Fetches PR from Azure DevOps
2. Extracts all pending (unresolved) comments
3. Ignores system comments and resolved threads
4. Generates minimal fix prompt with:
   - File and line references
   - Concrete actions
   - Ready for Cursor

#### Usage

```bash
# With repository name
prfix <pr-id> <repo-name>

# Using default repo from .env
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
- In Modal.tsx line 156: wrap handler in useCallback
Code only, no explanations
```

#### Token Usage

~40-60 tokens (vs 500+ copying comments manually)

#### Requirements

- PAT must have **Code > Read** permission
- Repository name must match exactly (case-insensitive)

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

#### Basic Actions
| Trigger | Description | Output |
|---------|-------------|--------|
| `qa` | Add something | `Add: ...` |
| `qf` | Fix bug | `Fix: ...` |
| `qc` | Change something | `Change: X → Y` |
| `qr` | Remove something | `Remove: ...` |

#### Validation & Errors
| Trigger | Description | Output |
|---------|-------------|--------|
| `qv` | Add validation | `Add validation: ...` |
| `qe` | Error handling | `Add error handling: try-catch` |
| `qnull` | Null check | `Fix: null check in variable` |
| `qg` | Guard clause | `Add guard clause: condition → return` |

#### Refactoring
| Trigger | Description | Output |
|---------|-------------|--------|
| `qref` | Refactor | `Refactor: readability` |
| `qex` | Extract | `Extract to function: ...` |
| `qrn` | Rename | `Rename: old → new` |

#### Testing
| Trigger | Description | Output |
|---------|-------------|--------|
| `qtest` | Generate test | `Generate test for: ...` |
| `qtac` | Test for AC | `Generate test for AC#1` |
| `qmock` | Create mock | `Create mock for: ...` |

#### Build & Verification
| Trigger | Description | Output |
|---------|-------------|--------|
| `qbuild` | Compile | `Compile application and show errors` |
| `qrun` | Run tests | `Run tests and show results` |
| `qva` | Full verify | `Build + run all tests + show summary` |
| `qfixbuild` | Fix build | `Fix compilation errors` |
| `qfixtests` | Fix tests | `Fix failing tests` |

#### Code Review
| Trigger | Description | Output |
|---------|-------------|--------|
| `qrev` | Quick review | `Review pending changes` |
| `qrevfull` | Full review | `Complete review: security, performance, clean code` |
| `qrevsec` | Security | `Security review of pending changes` |
| `qrevperf` | Performance | `Performance review of pending changes` |
| `qrevfix` | Apply fixes | `Apply suggested review fixes` |

#### GraphQL / HotChocolate
| Trigger | Description | Output |
|---------|-------------|--------|
| `qmut` | Add mutation | `Add mutation: ...` |
| `qquery` | Add query | `Add query: ...` |
| `qres` | Add resolver | `Add resolver for: ...` |
| `qinput` | Input type | `Create input record: ...` |
| `qoutput` | Output type | `Create output record: ...` |

---

## Complete Workflow

### Daily Development Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT WORKFLOW                      │
└─────────────────────────────────────────────────────────────┘

1. CHECK USER STORY
   ┌──────────────────┐
   │ us2check 123     │ → Verify US is complete
   └──────────────────┘
           │
           ▼
2. GENERATE BACKEND SPEC
   ┌──────────────────┐
   │ us2b 123         │ → Get optimized backend prompt
   └──────────────────┘
           │
           ▼
3. PASTE IN CURSOR
   ┌──────────────────┐
   │ Ctrl+V + Enter   │ → Cursor generates code
   └──────────────────┘
           │
           ▼
4. FOLLOW-UP PROMPTS (snippets)
   ┌──────────────────┐
   │ qa, qf, qv, etc  │ → Quick adjustments (~5 tokens each)
   └──────────────────┘
           │
           ▼
5. VERIFY
   ┌──────────────────┐
   │ qva              │ → Build + run tests
   └──────────────────┘
           │
           ▼
6. CODE REVIEW
   ┌──────────────────┐
   │ qrev / qrevfull  │ → Self-review before PR
   └──────────────────┘
           │
           ▼
7. CREATE PR
   ┌──────────────────┐
   │ Push + Create PR │ → Submit for review
   └──────────────────┘
           │
           ▼
8. FIX PR COMMENTS
   ┌──────────────────┐
   │ prfix 456        │ → Get fixes prompt
   └──────────────────┘
           │
           ▼
9. DONE ✅
```

### Example Session

```bash
# 1. Check if User Story is ready
us2check 199339

# 2. Generate backend spec
us2b 199339
# → Ctrl+V in Cursor

# 3. Cursor generates code, then refine:
qa add logging                    # Add logging
qv validate NotificationId        # Add validation
qf null check line 45             # Fix bug

# 4. Verify everything works
qva                               # Build + tests

# 5. Self code review
qrevfull                          # Full review

# 6. After PR feedback
prfix 64050 AP.AlixVault.API
# → Ctrl+V in Cursor to fix comments
```

---

## Token Savings

| Scenario | Without US2CURSOR | With US2CURSOR | Savings |
|----------|-------------------|----------------|---------|
| Initial prompt | 800-1500 tokens | 50-80 tokens | **~94%** |
| Follow-up | 100-200 tokens | 5-10 tokens | **~95%** |
| PR comments | 300-500 tokens | 40-60 tokens | **~88%** |
| **Total per feature** | ~2000-3000 | ~200-300 | **~90%** |

### Cost Impact

If using paid Cursor/API:
- Without optimization: ~$0.10-0.15 per feature
- With US2CURSOR: ~$0.01-0.02 per feature
- **Savings: ~$0.10+ per feature**

---

## Troubleshooting

### Error 401 (Unauthorized)

**Cause**: PAT is invalid, expired, or missing permissions.

**Solution**:
1. Go to Azure DevOps → User Settings → Personal Access Tokens
2. Regenerate token with correct permissions:
   - Work Items: Read
   - Code: Read (for prfix)
3. Update `.env` with new token

### Error 404 (Not Found)

**Cause**: Work Item or PR doesn't exist, or wrong repository.

**Solution**:
- Verify the ID exists in Azure DevOps
- For `prfix`: check repository name matches exactly
- List available repos: run `prfix 1` to see error with repo list

### Output Truncated

**Cause**: Response exceeded token limit.

**Solution**:
- Script automatically retries once
- If persists, User Story may be too large
- Try breaking into smaller stories

### Groq API Error

**Cause**: Invalid API key or rate limit.

**Solution**:
- Verify API key in `.env`
- Check Groq console for rate limits
- Wait a moment and retry

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
├── 📄 .env                    ← Credentials (DO NOT SHARE)
├── 📄 .gitignore              ← Ignores .env and node_modules
├── 📄 package.json            ← npm configuration
├── 📄 README.md               ← This documentation
├── 📄 snippets.code-snippets  ← Cursor snippets
├── 📄 us2b.js                 ← Backend command
├── 📄 us2f.js                 ← Frontend command
├── 📄 us2check.js             ← Check/validate command
├── 📄 prfix.js                ← PR fix command
└── 📁 node_modules/           ← Dependencies
```

---

## Version History

| Version | Changes |
|---------|---------|
| 1.0.0 | Initial release with us2b |
| 1.1.0 | Added us2f (frontend) |
| 1.2.0 | Added us2validate |
| 1.3.0 | Added us2pr, English output, improved prompts |
| 1.4.0 | Renamed commands: us2validate → us2check, us2pr → prfix |

---

## License

MIT

---

## Contributing

Feel free to submit issues and pull requests to improve the tool.

---

Made with ❤️ to save tokens and boost productivity.
