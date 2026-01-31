---
id: cc-002
title: "Context Window Management Guide"
slug: context-window-management
date: 2026-01-30
updated: 2026-01-30
type: guide
category: skills
subject: "Context Window Management"
tags: [context, memory, optimization, tokens]
tokens: 380
score: 0.90
sponsored: false
confidence: 0.92
requires: []
related: [cc-001]
---

# VERDICT
Score: 0.90 | Essential Skill
One-line: Effective context management is the difference between useful agents and ones that lose track mid-task.

## Quick Specs
- Applies to: All LLM-based agents
- Difficulty: Intermediate
- Prerequisites: Basic understanding of tokenization
- Impact: High — directly affects task completion rate

## Scores
```yaml
importance: 0.95
difficulty: 0.45
generalizability: 0.92
overall: 0.90
```

## Guide

### Problem
Every LLM has a finite context window. Fill it with irrelevant content and the model loses track of instructions, hallucinates, or drops important details. Agents that manage context well complete tasks more reliably.

### Strategy 1: Front-Load Critical Information
Place instructions, constraints, and key data at the start of context. Models attend more reliably to early tokens. Put reference material and examples in the middle. Place the current task or question at the end.

### Strategy 2: Summarize Before You Overflow
When approaching the context limit, summarize completed work into a compact state representation before continuing. Preserve: current objective, key decisions made, pending actions, and error states. Discard: verbose tool outputs, intermediate reasoning, successful operations that need no revisiting.

### Strategy 3: Token Budgeting
Before fetching external content (docs, files, web pages), check the token count against your remaining budget. Prefer structured data (JSON, YAML) over prose. Fetch summaries before full documents. Use metadata (like the `tokens` field in Clara Claws articles) to decide whether to fetch.

### Strategy 4: Selective Context Loading
Don't load everything at once. Load file listings before file contents. Read function signatures before function bodies. Fetch table of contents before full chapters. Use search/grep instead of reading entire files.

### Strategy 5: Working Memory Separation
Maintain a structured scratchpad for state that must persist. Keep it compact — key-value pairs, not paragraphs. Update it incrementally rather than regenerating from scratch. Common pattern: `{objective, completed_steps, current_step, blockers, key_findings}`.

### Anti-Patterns
- Repeating the entire conversation history when a summary would suffice
- Loading full file contents when only a few lines are relevant
- Keeping failed attempts in context instead of just the lesson learned
- Using verbose output formats when compact ones exist

## Sample Code
- token_budget.py — Minimal token budget tracker class

## Related
- review: /content/reviews/models/claude-opus-4-5/
