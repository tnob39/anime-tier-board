---
title: Component Page Guide
status: current
updated: 2026-06-27
sources:
  - ../../CLAUDE.md
---

# Component Page Guide

Create one page per durable product or technical area, not one page per source
file.

Each component page should answer:

- What user or system responsibility does this component own?
- Which routes, components, libraries, and APIs implement it?
- What are the current behavior and invariants?
- Which accepted decisions constrain changes?
- Which edge cases repeatedly require investigation?
- Which sources prove the claims?

Prefer updating an existing component page after a related implementation or
investigation. Split a page when it becomes too broad to load independently.

Return to the [Wiki Index](../index.md).
