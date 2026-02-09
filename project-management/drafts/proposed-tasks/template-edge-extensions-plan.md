# Proposed Tasks from: template-edge-extensions-plan.md

**Source:** project-management/drafts/boxen/template-edge-extensions-plan.md
**Processed:** 2026-02-09

## Task 1: Add edge extension support to templates

- **Title:** Enable templates to use edge extensions and add pencil holder template
- **Role:** implement
- **Priority:** P3
- **Complexity:** S
- **Description:** Add face panel ID resolution (`$front`, `$back`, `$left`, `$right`, `$top`, `$bottom`) to the template engine so templates can reference face panels in edge extension actions. Create a Pencil Holder template that demonstrates this (tall box, open top, all bottom edges extended 15mm for stability). Files: `src/templates/templateEngine.ts`, `src/templates/builtinTemplates.ts`.
- **Success criteria:**
  - `$bottom`, `$front`, etc. resolve to correct face panel IDs in templates
  - Pencil Holder template loads correctly with extended base
  - `SET_EDGE_EXTENSIONS_BATCH` works in template action sequences
  - Geometry validation passes on instantiated template
