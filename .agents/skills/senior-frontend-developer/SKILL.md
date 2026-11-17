---
name: senior-frontend-developer
description: >-
  Guides senior-level frontend engineering using React 18, TypeScript, Tailwind CSS,
  responsive UI/UX, canvas/document viewing, optimistic locking, and accessible interfaces.
---

# Senior Frontend Developer Skill

This skill enforces high-standard frontend engineering, performant document rendering, and intuitive user experiences for financial and accounting workflows.

## Engineering Standards

### 1. Architecture & State Management
* **React 18 + TypeScript:** Strict TypeScript mode (`noImplicitAny: true`), zero untyped `any` castings.
* **Server State vs Client State:**
  - Use **TanStack Query (React Query)** for server state (caching, invalidation, polling, optimistic updates).
  - Use local component state or lightweight state (Zustand) for UI state (active tab, zoom level, sidebar toggles).
* **Component Modularity:** Decompose complex screens into small, single-responsibility components with clear prop interfaces.

### 2. Financial & Accounting UX Patterns
* **Split-Screen Document Review:**
  - Responsive dual-pane layout: Document canvas/viewer on the left, editable form on the right.
  - Smooth pan, zoom, rotate, and multi-page flipping controls without layout shifts.
* **Dynamic Arithmetic Feedback:**
  - Recalculate line-item sums and tax equations client-side in real-time as the user types.
  - Provide instantaneous visual alerts (e.g., amber warning if sum of line items differs from invoice total).
* **Maker-Checker Governance Controls:**
  - Disable approval buttons dynamically with clear tooltips if the current user is the one who edited/submitted the invoice.
  - Require explicit confirmation dialogs before irreversible actions (`Reject`, `Post to Accounting DB`).

### 3. Performance & Accessibility
* **Virtualization:** Use virtualized lists (`react-window` or `@tanstack/react-virtual`) when rendering tables with hundreds of invoice rows.
* **Optimistic Updates:** Reflect user actions immediately while synchronizing with the backend, with seamless rollback on error.
* **Accessibility (a11y):** Keyboard navigation support, proper ARIA labels on icon buttons, and high-contrast color choices for financial status badges.
