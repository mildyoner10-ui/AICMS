# AICMS Design System

## 1. Overview

AICMS (AI Change Management System) is an enterprise web application for governing IT infrastructure changes. Its visual language must communicate trust, control, clarity, technical depth, and operational readiness.

The interface serves requesters, network/system engineers, technical reviewers, managers, Change Managers, CAB members, final approvers, auditors, and administrators.

### Design principles
1. Enterprise clarity: readable information hierarchy and predictable navigation.
2. Decision support: risk, AI findings, approval state, and required actions are immediately understandable.
3. Evidence first: every AI finding and recommendation links to source evidence.
4. Human authority: AI recommendations must never look like final approval decisions.
5. Consistency: use the same status labels, colors, and icons throughout the product.
6. Progressive disclosure: show decision-critical information first; place deep technical detail in tabs or expandable panels.
7. Accessibility: never rely on color alone to communicate state.

This is a modern enterprise operations platform, not a consumer game, marketing website, or generic analytics template.

## 2. Color System

Use a restrained navy/blue enterprise palette with neutral surfaces. Reserve strong colors for meaningful statuses and risk indicators.

### Brand and interaction
- Primary Navy: `#16324F` — navigation, headings, selected navigation.
- Primary Blue: `#2563EB` — primary actions, links, focus accents.
- Primary Blue Light: `#DBEAFE` — selected backgrounds and information highlights.
- Primary Blue Dark: `#1D4ED8` — hover and active states.
- Accent Teal: `#0F766E` — secondary technical/operational accent.
- Accent Teal Light: `#CCFBF1` — subtle information surfaces.

### Neutral surfaces
- App Background: `#F5F7FA`
- Surface: `#FFFFFF`
- Surface Subtle: `#F8FAFC`
- Border: `#E2E8F0`
- Border Strong: `#CBD5E1`
- Text Primary: `#0F172A`
- Text Secondary: `#475569`
- Text Muted: `#64748B`
- Disabled: `#94A3B8`

### Semantic colors
- Success: `#15803D`; Success Surface: `#DCFCE7`
- Warning: `#B45309`; Warning Surface: `#FEF3C7`
- Danger: `#B91C1C`; Danger Surface: `#FEE2E2`
- Info: `#0369A1`; Info Surface: `#E0F2FE`
- Neutral Status: `#475569`; Neutral Surface: `#F1F5F9`

### Risk severity
| Severity | Color | Usage |
|---|---|---|
| Critical | `#991B1B` | Critical issue or hard blocker |
| High | `#B91C1C` | High-risk finding |
| Medium | `#B45309` | Warning requiring review or mitigation |
| Low | `#0369A1` | Low-impact observation |
| Informational | `#475569` | Context/non-blocking note |

### AI recommendation mapping
- `RECOMMEND_APPROVE`: success styling, label **AI recommends approval**.
- `RECOMMEND_APPROVE_WITH_CONDITIONS`: warning styling.
- `REQUEST_REVISION`: warning styling.
- `NOT_RECOMMENDED`: danger styling.
- `INSUFFICIENT_EVIDENCE`: neutral/info styling.

Never show a green “Approved” badge for an AI recommendation. “Approved” is reserved for a human workflow decision.

## 3. Typography

- Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Headings: 600–700 weight; avoid excessive letter spacing.
- Body: 400–500 weight.
- Labels/table headers: 500–600 weight.
- KPI numbers: tabular numerals.

| Token | Desktop size | Weight | Usage |
|---|---:|---:|---|
| Display | 32–36px | 700 | Dashboard KPI/hero |
| H1 | 28px | 700 | Page title |
| H2 | 22px | 650 | Main section |
| H3 | 18px | 600 | Card/panel title |
| Body | 14px | 400 | Standard content |
| Body Strong | 14px | 600 | Key values |
| Small | 12px | 400 | Metadata |
| Micro | 11px | 500 | Dense labels only |

Use 14px as the default minimum for essential interface text. Dense tables may use 13px where necessary.

## 4. Spacing

Use a 4px base spacing system:
- 2XS: 4px
- XS: 8px
- SM: 12px
- MD: 16px
- LG: 24px
- XL: 32px
- 2XL: 40px
- 3XL: 48px

Layout guidance:
- Main page padding: 24–32px desktop, 16px tablet, 12–16px mobile.
- Standard card padding: 20–24px; compact card: 16px.
- Form field gap: 16–20px.
- Section gap: 24–32px.
- Table row height: 48–56px; compact mode 40–44px.
- Align dashboard cards and detail panels consistently.

## 5. Border Radius

- XS: 4px — small tags.
- SM: 6px — inputs and buttons.
- MD: 8px — cards, tables, dropdowns.
- LG: 12px — panels and dialogs.
- XL: 16px — large modal/feature container.
- Pill: 999px — status badges and filter chips.

Avoid oversized rounded cards and playful pill buttons for every control. Standard buttons use a modest 6–8px radius.

## 6. Elevation and Borders

Use subtle neutral shadows; avoid colored glow effects.
- shadow-sm: `0 1px 2px rgba(15, 23, 42, 0.06)`
- shadow-md: `0 4px 12px rgba(15, 23, 42, 0.08)`
- shadow-lg: `0 12px 28px rgba(15, 23, 42, 0.12)`
- shadow-dialog: `0 20px 48px rgba(15, 23, 42, 0.18)`
- focus-ring: `0 0 0 3px rgba(37, 99, 235, 0.20)`

Prefer a 1px border for cards and panels. Use elevation mainly for overlays and floating elements.

## 7. Application Shell

### Main navigation
Desktop:
- Fixed/sticky left sidebar, approximately 240–256px.
- Main content fills remaining width.
- Top header includes page context, optional global search, notifications, and user menu.
- Sidebar supports collapsed icon-only mode.

Primary navigation:
1. Overview
2. Change Requests
3. Approval Inbox
4. AI Review Center
5. Change Calendar
6. Reports & Audit
7. Administration (role-gated)

### Header
- Page title and optional breadcrumb.
- Main page action at upper-right, e.g. **Create Change Request**.
- User identity and role available from profile menu.
- Notifications distinguish approval tasks, review completion, SLA reminders, and system alerts.

### Responsive behavior
- Desktop: persistent sidebar and multi-column dashboard.
- Tablet: collapsible navigation and reduced grid columns.
- Mobile: drawer navigation; stack cards and form sections; tables scroll horizontally or transform into list cards.
- Approval decisions and critical findings remain usable on mobile.

## 8. Components

### 8.1 Buttons
- Primary: solid Primary Blue for the main page action.
- Secondary: neutral surface with border.
- Tertiary/Ghost: text or subtle surface.
- Danger: red treatment for destructive/rejection actions.
- Disabled: muted styling with clear disabled state.

Guidelines:
- Standard height 36–40px; large action 44px.
- Icon-only button minimum 36px square, with tooltip and accessible label.
- Include hover, focus, active, disabled, and loading states.
- Avoid multiple competing primary buttons in one action group.

### 8.2 Status Badges
Use compact badges with text and subtle tinted backgrounds.

Supported labels include Draft, Submitted, AI Review, Pending Approval, Revision Required, Approved, Scheduled, In Progress, Completed, Rejected, Failed, Rolled Back, and Stale.

Badge text must be explicit. Never rely on color alone.

### 8.3 Risk Badges
Use Critical, High, Medium, Low, and Informational. Display a numeric score only when its scale is explained.

### 8.4 Cards
- White surface, 1px neutral border, 8px radius.
- Subtle shadow only when needed.
- Clear title, optional description, and aligned actions.
- Colored left border only for meaningful emphasis, such as a critical finding or selected item.

### 8.5 KPI Cards
Contain metric label, prominent value, optional trend/comparison period, supporting description, and link to underlying filtered records. Use tabular numerals.

### 8.6 Data Tables
Tables are a primary AICMS interaction pattern. Support search, filters, sorting, pagination, sticky headers, and loading/empty/error states.

Recommended Change Request columns:
- Change ID
- Title
- Category
- Type
- Risk
- Status
- Requester
- Implementation Window
- Pending With
- Updated At

Keep identifiers and dates consistently aligned. Maintain readable density.

### 8.7 Forms
- Labels above fields.
- Consistent required-field marker.
- Helper text below fields.
- Validation adjacent to the field.
- Group long RFC forms into logical steps.
- Preserve draft progress.
- Never use placeholder text as the only label.
- Show character limits and accepted file types.

### 8.8 File Upload
- Drag-and-drop area plus browse action.
- Show filename, size, document type, uploader, upload time, version, checksum in details, scan state, and extraction state.
- Display upload progress.
- Distinguish uploaded, scanning, processed, failed, and blocked.
- Never imply a file is safe before malware scanning completes.
- Uploading a replacement creates a new version; it does not overwrite the original.

### 8.9 AI Review Summary
This is a central product component. Display:
- Review status.
- Source RFC revision and document versions.
- AI recommendation with explicit advisory wording.
- Risk score and factor breakdown.
- Hard blockers.
- Review limitations.
- Model, prompt, and ruleset versions where appropriate.

Use wording such as:
- “AI recommends approval”
- “AI recommends approval with conditions”
- “Revision required based on AI findings”
- “Not recommended by AI”
- “Insufficient evidence for recommendation”

Never display “AI approved” or “AI rejected”.

### 8.10 AI Findings
Each finding shows severity, check status, title, plain-language explanation, evidence source (filename/page/line/section/config path), safe excerpt if applicable, remediation, and human-validation indicator.

Allow filtering by severity, category, and status. Findings remain linked to the review snapshot that generated them.

### 8.11 Approval Workflow Timeline
Show step number/name, required role/approver, status, decision timestamp, approver comment, and pending SLA/age. Use a vertical timeline on detail pages. Clearly distinguish completed approvals from pending steps.

### 8.12 Approval Decision Panel
Show change summary, risk, AI findings, relevant documents, and workflow context before decision actions.

Actions:
- Approve
- Reject
- Request Revision

Require confirmation. Require a comment for rejection and revision requests. Display actions only when the current user is authorized.

### 8.13 Change Calendar
- Month, week, and list views.
- Filters by category, risk, status, environment, and service.
- Show maintenance window and owner.
- Show warning for possible overlap.
- Do not claim two changes conflict unless dependency data and policy support that conclusion.

### 8.14 Audit Trail
Chronological, read-only events showing actor, action, object, timestamp, relevant metadata, and correlation/reference ID.

### 8.15 Dialogs and Drawers
Use dialogs for confirmation and short focused tasks. Use drawers for contextual detail. Avoid deeply nested modals.

## 9. Page-Level Design Guidance

### 9.1 Overview Dashboard
Recommended layout:
- Page title and context.
- KPI row: Total Changes, Pending Approval, AI Reviews, Upcoming Changes.
- Change status distribution.
- Risk distribution.
- Pending approval table.
- Upcoming change schedule.
- Recent AI critical/high findings.
- Recent activity/audit feed.

Prioritize actionable queues over decorative charts.

### 9.2 Change Request List
- Filter bar and search at top.
- Search by Change ID, title, device, or service.
- Table with risk and workflow state.
- Clear primary action to create a change.
- Saved filters may be added later.

### 9.3 Create Change Request
Use a stepper or grouped sections:
1. General Information
2. Scope & Impact
3. Implementation Plan
4. Test & Rollback Plan
5. Schedule
6. Supporting Documents
7. Review & Submit

Show completion summary before submission. Block submission when mandatory fields are missing.

### 9.4 Change Detail
Header: Change ID/title, status, risk, requester/owner, and permitted primary action.

Tabs:
- Overview
- Documents
- AI Review
- Risk Assessment
- Approval Workflow
- Schedule
- Implementation & PIR
- Audit History

### 9.5 AI Review Center
- Review queue and status.
- Filter by recommendation, risk, category, and age.
- Detail view with evidence.
- Clearly show failed, stale, incomplete, and unsupported checks.
- Never turn a failed processing job into a successful review.

### 9.6 Approval Inbox
- Pending tasks assigned to current user.
- SLA age and due date.
- Risk and AI recommendation.
- Key findings and blockers.
- Link to full change detail.
- Decision actions with confirmation and comments.

### 9.7 Administration
- User and role management.
- Workflow configuration.
- Risk thresholds and weights.
- Required document checklists.
- AI provider/model configuration.
- Rule and baseline version management.
- SLA and notification settings.

All administrative actions are role-restricted and audited.

## 10. Icons and Data Visualization

- Use one consistent outline icon family (Lucide or equivalent).
- Use familiar symbols for network, server, firewall, file, shield, approval, calendar, and audit.
- Icon-only controls require accessible labels.
- Charts use semantic colors consistently and include labels/legends.
- Provide accessible text summaries.
- Avoid 3D charts, unnecessary gradients, and decorative visualizations.
- Risk charts must not hide exact values or underlying records.

## 11. Motion and Interaction

- Hover/focus transitions: 120–180ms.
- Drawer/modal transitions: 160–220ms.
- Loading indicators only while work is active.
- Progress bars reflect real progress; otherwise use indeterminate loading.
- Use skeletons for page/data loading.
- Avoid celebratory effects in approval and risk workflows.
- Respect `prefers-reduced-motion`.
- Motion must never be the only indication of state change.

## 12. Accessibility

Target WCAG 2.1 AA:
- Keyboard navigation for all actions.
- Visible focus ring.
- Semantic HTML and correct heading order.
- Labels/descriptions for all form fields.
- Sufficient contrast for text and badges.
- Screen-reader announcements for async review completion and validation errors.
- Never rely on color alone for risk, status, or approval state.
- Tables use proper header associations.

## 13. Do's and Don'ts

### Do
1. Use navy/blue as the primary enterprise identity.
2. Use neutral surfaces and restrained semantic colors.
3. Keep AI recommendations separate from human approval decisions.
4. Put evidence next to every AI finding.
5. Show review limitations and unsupported checks.
6. Use consistent status and risk labels.
7. Make pending actions and overdue approvals easy to find.
8. Provide loading, empty, error, stale, and retry states.
9. Keep tables dense but readable.
10. Confirm approval, rejection, cancellation, and other consequential actions.
11. Ensure keyboard and accessibility support.
12. Label realistic sample data as demo data.

### Don't
1. Do not use playful game styling, confetti, bounce animations, or decorative ribbons.
2. Do not use colored glow shadows or heavy gradients.
3. Do not present AI recommendation as final approval.
4. Do not use color as the only status indicator.
5. Do not hide hard blockers below generic summary cards.
6. Do not fabricate progress, risk, evidence, or monitoring data.
7. Do not use tiny text for important operational details.
8. Do not expose approval actions to unauthorized users.
9. Do not imply an unsupported configuration check passed.
10. Do not clutter dashboards with charts that do not support an operational decision.

## 14. Design Tokens (CSS Reference)

```css
:root {
  --color-primary-navy: #16324F;
  --color-primary: #2563EB;
  --color-primary-hover: #1D4ED8;
  --color-primary-soft: #DBEAFE;
  --color-teal: #0F766E;
  --color-teal-soft: #CCFBF1;

  --color-bg: #F5F7FA;
  --color-surface: #FFFFFF;
  --color-surface-subtle: #F8FAFC;
  --color-border: #E2E8F0;
  --color-border-strong: #CBD5E1;

  --color-text: #0F172A;
  --color-text-secondary: #475569;
  --color-text-muted: #64748B;
  --color-disabled: #94A3B8;

  --color-success: #15803D;
  --color-success-bg: #DCFCE7;
  --color-warning: #B45309;
  --color-warning-bg: #FEF3C7;
  --color-danger: #B91C1C;
  --color-danger-bg: #FEE2E2;
  --color-info: #0369A1;
  --color-info-bg: #E0F2FE;
  --color-neutral: #475569;
  --color-neutral-bg: #F1F5F9;

  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", sans-serif;

  --space-2xs: 4px;
  --space-xs: 8px;
  --space-sm: 12px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 40px;
  --space-3xl: 48px;

  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-pill: 999px;

  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.08);
  --shadow-lg: 0 12px 28px rgba(15, 23, 42, 0.12);
  --shadow-dialog: 0 20px 48px rgba(15, 23, 42, 0.18);
  --focus-ring: 0 0 0 3px rgba(37, 99, 235, 0.20);
}
```

## 15. Design Acceptance Checklist

- [ ] Uses shared color, typography, spacing, and radius tokens.
- [ ] Navigation and page hierarchy are consistent.
- [ ] Primary action is clear and permission-aware.
- [ ] Loading, empty, error, and disabled states are implemented.
- [ ] Status and risk use text as well as color.
- [ ] AI recommendation is explicitly advisory.
- [ ] Findings include evidence and limitations.
- [ ] Approval decisions require correct role and confirmation.
- [ ] Responsive at desktop, tablet, and mobile widths.
- [ ] Keyboard focus and accessible labels are present.
- [ ] No placeholder metrics or fake operational state are shown as live data.
- [ ] Visual implementation matches the AICMS enterprise operations purpose.
