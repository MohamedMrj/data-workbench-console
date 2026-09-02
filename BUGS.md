# BUGS.md — open defects

Working list of known, **verified** defects in this repository. Every entry below was
reproduced against the code, not inferred from reading.

---

## How agents must use this file

1. **Fix one entry at a time.** Each entry is scoped to be an independent change.
2. **Add the regression test named in the entry.** A fix without the test does not count as
   fixed — nothing here was caught by the existing suites, which is why they are listed.
3. **Record the fix in [CHANGELOG.md](CHANGELOG.md)** under a new version heading, following the
   existing format (summary line, then `### Fixed` / `### Security` / `### Verification`).
   `CHANGELOG.md` is the permanent history.
4. **Then delete the entry from this file**, including its row in the index table below.
   Do not mark it "done", strike it through, or move it to a "fixed" section — **delete it.**
   The changelog already holds the record.
5. If an entry turns out to be intended behaviour, delete it from here and move the
   explanation into
   [ARCHITECTURE.md §21 → "Intentional — do not fix"](ARCHITECTURE.md#21-known-issues-and-intentional-oddities)
   instead.
6. When this file has no entries left, delete the file.
7. Never recycle an ID. New entries continue from the highest number ever used.

Do not add speculative or unverified items. If you suspect a defect, reproduce it first and
paste the reproduction into the entry.

**Severity:** `high` = wrong results, data loss, or a broken user-facing operation ·
`medium` = a feature does not work as documented · `low` = dead code, misleading config, or a
cosmetic/edge-case defect · `decision` = looks wrong, needs the maintainer's intent.

---

## Index

| ID | Severity | Area | One line |
| --- | --- | --- | --- |
| [BUG-010](#bug-010) | decision | `workbench.css` | `2200px` override makes the two-column studio unreachable |

---

## BUG-010

**The `2200px` override makes the two-column studio layout unreachable** · `decision`

> **Blocked pending a decision from the maintainer.** Do not change code for this entry until
> the question below is answered — both fix paths are valid and they lead in opposite
> directions.

**Location:** [app/workbench.css:1151](app/workbench.css#L1151) —
`@media (max-width: 2200px) { .app-shell:not(.activity-panel-collapsed) .studio-grid { grid-template-columns: 1fr !important } }`,
against [workbench.css:1145](app/workbench.css#L1145) —
`@media (min-width: 1180px) { .studio-grid { grid-template-columns: minmax(0, 1.18fr) minmax(420px, 0.82fr) } }`.

**Symptom:** With the themes/history panel visible, Query Builder and SQL Editor are forced
into a single column on any viewport up to 2200px — i.e. every ordinary monitor. The
`min-width: 1180px` two-column rule can never apply. Meanwhile the JavaScript layout engine
still computes and sets `data-studio-mode="wide"` at those widths, and the
`[data-studio-mode="wide"]` rules that make the two cards fill a stretched row are applied to
a grid that is actually one column — so JS intent and CSS reality disagree.

**Reproduce:** open the app at 1920px with the themes/history panel shown. Inspect
`.app-shell` — `data-studio-mode="wide"`. Inspect `.studio-grid` — one column, from the
`!important` rule. Collapse the right panel and the two-column layout appears.

**Root cause:** Unclear, and that is why this is filed as `decision`. It may be an intentional
readability choice, or a leftover from the 1.4.19–1.4.22 work on the right-panel layout — the
`2200px` breakpoint and the blanket `!important` both read like a debugging value that was
never narrowed.

**Needed from the maintainer:** is single-column-with-right-panel-open the intended design?

- **If yes:** delete the unreachable `min-width: 1180px` rule, and stop computing
  `data-studio-mode="wide"` in `getLayoutMode()` when the activity panel is visible, so the JS
  state matches what renders. Then move this into
  [ARCHITECTURE.md §21 → "Intentional"](ARCHITECTURE.md#21-known-issues-and-intentional-oddities)
  with the reasoning.
- **If no:** replace the `2200px` blanket with a threshold derived from actual available width
  (the JS already computes it) and drop the `!important`, letting `data-studio-mode` drive the
  template as the rest of the layout engine does.

**Regression test:** [scripts/responsive-audit.mjs](scripts/responsive-audit.mjs) already
asserts the activity panel sits beside the studio in `wide` mode; add a matching assertion that
`.studio-grid`'s computed column count agrees with `data-studio-mode`, so the two cannot drift
apart again. Note the existing jsdom suite cannot catch this — it does not evaluate container
or media queries, which is exactly how 1.4.22 regressed.
