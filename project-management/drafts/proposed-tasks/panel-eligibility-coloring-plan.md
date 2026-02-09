# Proposed Tasks from: panel-eligibility-coloring-plan.md

**Source:** project-management/drafts/boxen/panel-eligibility-coloring-plan.md
**Processed:** 2026-02-09

## Task 1: Add panel eligibility coloring when tools are active

- **Title:** Color panels green/pink based on tool eligibility
- **Role:** implement
- **Priority:** P3
- **Complexity:** S
- **Description:** When a tool is active, color panels green (eligible) or pink (ineligible) based on whether the panel can be operated on. Rules: Inset → has non-locked edges; Fillet → has eligible corners; Move → divider panels only; Push/Pull → face panels only. Selection/hover colors still override eligibility. Depends on color-system-plan being implemented. Files: `src/components/PanelPathRenderer.tsx`, possibly `src/config/colors.ts`.
- **Success criteria:**
  - Each tool shows green/pink coloring on panels when active
  - Selection and hover colors override eligibility colors
  - Select tool shows normal panel colors (no eligibility)
  - Opacity differs: eligible panels more opaque than ineligible
