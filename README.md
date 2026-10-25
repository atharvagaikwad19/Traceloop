# TraceLoop (`traceloop`)

A production-grade, token-efficient AI Code Review, Debugging, and Explanation web application built in GitHub Dark IDE style.

## Project Purpose
Automate and streamline code reviews, crash diagnoses, and educational code explanations using a combination of fast local static analyzers, isolated sandboxed execution, and Google Gemini models.

## Features
- **3 Analysis Modes**:
  - **Review**: Demonstrable bugs, security flaws (SQLi, command injection, credentials), performance, and style.
  - **Debug**: Runtime exception and traceback diagnosis, ranked hypotheses, and root-cause cards.
  - **Explain**: Algorithmic complexity (Big-O time/space), architecture breakdown, and walkthroughs.
- **Monaco Editor Integration**: Line numbers, severity gutter glyphs, wavy underlines, and click-to-highlight line navigation.
- **Three Learner Levels**: Beginner, Intermediate, Expert explanations.
- **Fix & Patch System**: Live Monaco DiffEditor ("View Fix"), one-click "Apply Fix", and stale-code protections.
- **Token Efficiency & Bundled Demo**: Includes instant sample code with zero-quota cached analysis.
- **Safe Sandboxed Verification**: Optional reproduction harness with Docker and strict non-execution defaults.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (GitHub Dark theme)
- **Editor**: Monaco Editor (`@monaco-editor/react`)
- **Schema & Validation**: Zod
- **AI**: Google Generative AI SDK (`@google/generative-ai`)
- **Testing**: Vitest

## Folder Structure
```
├── app/
│   ├── api/analyze/route.ts  # Validation, static tools, Gemini, caching, merging
│   ├── globals.css           # GitHub dark theme & Monaco squiggly underlines
│   ├── layout.tsx            # App shell and metadata
│   └── page.tsx              # Main IDE screen and state coordinator
├── components/
│   ├── ActivityRail.tsx      # Review / Debug / Explain mode switch
│   ├── BottomPanel.tsx       # Vertically resizable panel (Output, Fix Diff, Error Input)
│   ├── EditorPanel.tsx       # Monaco Editor, file open, drag-drop, sample loader
│   ├── FindingsPanel.tsx     # Severity metrics, quality score, filters, findings
│   ├── StatusBar.tsx         # Ln/Col, model name, and engine status
│   └── TopToolbar.tsx        # App brand, language dropdown, Quick/Deep toggle
├── lib/
│   ├── ai/                   # Gemini client & 6-section structured prompts
│   ├── analysis/             # Scoring, merging, in-memory cache, patching, static analyzers
│   ├── config.ts             # Central display application name config
│   ├── schema/               # Shared Zod schemas and TypeScript types
│   └── verification/         # Isolated sandbox runner & Docker fallback
└── tests/
    └── core.test.ts          # Pure function unit tests
```

## Installation
```bash
git clone <repo-url>
cd 4A
npm install
```

## Environment Variables
Create a `.env.local` file based on `.env.example`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
# Optional: GEMINI_MODEL_QUICK=gemini-3.1-flash-lite
# Optional: GEMINI_MODEL_DEEP=gemini-3.5-flash
```

## Run Command
```bash
# Start development server
npm run dev

# Run unit tests
npm test

# Production build
npm run build
npm start
```

## Quick vs. Deep Mode
- **Quick**: Combines local static linters (Ruff, Bandit, ESLint) and Gemini for instant, non-executing code analysis.
- **Deep**: Prompts for isolated reproduction triggers. Only executes code in a sandbox when the explicit "Allow running code to verify findings" checkbox is checked.

## Static Analysis
Subprocess integration with Ruff, Bandit, and ESLint. If tools are not installed on the host, the application continues gracefully in "LLM only" mode without crashing.

## Verification Safety
- Strict opt-in: Never executes user code silently.
- Prefers Docker with `--network none` and strict resource caps.
- Safe subprocess fallback with hard 2.5s timeouts in temporary directories.

## Limitations
- Input code is capped at 300 lines for token and server safety.
- Python execution fallback requires local Python binary if Docker daemon is not active.
