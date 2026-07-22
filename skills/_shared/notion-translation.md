# Notion translation (notion backend only)

Operational reference for translating Cadence's obsidian-flavored markdown to and from the official Notion MCP's Notion-flavored Markdown. The `notion` branch of `storage-resolution.md` applies this on every `write_doc` (obsidian to Notion-flavored Markdown, before the MCP call) and every `read_artifact` (Notion-flavored Markdown back to obsidian, after the fetch). The filesystem backend never runs any of this. Design rationale: [[../../docs/designs/2026-07-10-notion-mode/04-content-translation]].

Only two constructs are translated, because only two are obsidian extensions rather than standard markdown: **callouts** and **wikilinks**. Everything else (headings, paragraphs, bulleted and numbered lists, GFM tables, fenced code including ` ```mermaid `, task checkboxes `- [ ]` / `- [x]`, plain blockquotes) is standard markdown and passes to the MCP untouched, with one caveat for table-cell pipes (below). Do not otherwise rewrite those.

> **Why translate at all.** Notion-flavored Markdown treats `[`, `]`, `<`, and `>` as characters that must be escaped outside code blocks. A raw obsidian callout (`> [!summary]`) or wikilink (`[[slug]]`) handed to the MCP is escaped into literal text (`> \[!summary\]`, `\[\[slug\]\]`), and the callout renders as a plain quote block with no icon, color, or callout affordance. Emitting Notion-flavored tags avoids the escaping and produces native blocks. This was verified by round-trip against the official MCP.

## Callouts to `<callout>` (write)

Every obsidian callout `> [!type] Label` (with its continuation `>` lines) becomes one `<callout>` block. Pick icon and background by type:

| Obsidian callout | icon | color |
|---|---|---|
| `> [!summary] Plain English` | 💡 | `gray_bg` |
| `> [!success] Decision` | ✅ | `green_bg` |
| `> [!warning]` | ⚠️ | `yellow_bg` |
| `> [!note]` | 📝 | `blue_bg` |
| `> [!bug] Fix:` | 🐛 | `red_bg` |
| `> [!todo] Build:` | ☑️ | `purple_bg` |

Rules:

- The label after `[!type]` (`Plain English`, `Decision`, `Fix:`, `Build:`, and so on), when present, becomes the callout's first child line in bold (`**Plain English**`). A callout with no label (a bare `> [!warning]`) has no label line.
- Every body line (each continuation `>` line) becomes a child line of the callout, indented one literal tab. Multi-line bodies stay inside the one callout; never split them into separate blocks.
- An unknown `[!type]` with no table entry still becomes a `<callout>`, with a default icon (💬) and no color, never escaped text.

Example. This obsidian callout:

```
> [!summary] Plain English
> The gate lives in the prepare step.
> Skipped children never reach the DistributedMap.
```

translates to (each indent is a literal tab):

```
<callout icon="💡" color="gray_bg">
	**Plain English**
	The gate lives in the prepare step.
	Skipped children never reach the DistributedMap.
</callout>
```

Plain blockquotes (`>` with no `[!type]` marker) are left untouched and become Notion quote blocks.

## Wikilinks to `<mention-page>` (write, two-pass)

A wikilink `[[NN-topic#Section]]` becomes `<mention-page url="URL">Title</mention-page>`, where `URL` is the target sub-page's Notion URL. Resolution is two-pass, because a wikilink can point at a sibling written later in the same batch:

1. **Pass 1, create.** Write every doc in the batch (`notion-create-pages`) with wikilinks left as-is. Collect the slug-to-page-URL map from the create responses.
2. **Pass 2, `resolve_links`.** For each written doc, replace each `[[slug#anchor]]` with `<mention-page url="{resolved-url}">{display}</mention-page>` via `notion-update-page` (`update_content` search-and-replace, `old_str` = the literal `[[…]]` string). `{display}` is the target's human title or the slug. A `#anchor` is dropped: a `<mention-page>` addresses a page, not a block.

Fallback: if a slug does not resolve (target not created yet, for example a design linking to a not-yet-created plan), leave the readable display text (the slug), never the literal `[[…]]`. `resolve_links` is idempotent and re-runs when the target later exists.

## Tags multi-select options (write)

The official MCP rejects a `notion-create-pages` or property write whose Tags multi-select payload contains a value that is not an existing option on the data source (`validation_error`). Before any write that sets Tags (`create_artifact`, `set_property` on `tags`):

1. Fetch the target database's data-source schema (`notion-fetch` on the data source, or the schema returned by `notion-query-data-sources`).
2. Diff the artifact's `tags` against the Tags property's existing option names — exact, case-sensitive string match.
3. If any tags are missing, add them with `notion-update-data-source`, re-sending the FULL option list (existing options unchanged — same name, same color — plus the new names with no color, letting Notion assign defaults). The update is add-only; never remove or recolor an existing option. Example payload shape for adding `resolver` to existing options `design` and `plan`:

   ```json
   {
     "data_source_id": "<designs-or-plans-data-source-id>",
     "properties": {
       "Tags": {
         "multi_select": {
           "options": [
             { "name": "design", "color": "blue" },
             { "name": "plan", "color": "green" },
             { "name": "resolver" }
           ]
         }
       }
     }
   }
   ```

4. Proceed with the page create or property write.

The pre-step is idempotent (the diff against freshly fetched schema makes re-runs no-ops) and skipped entirely when the diff is empty. Race rule: on a `validation_error` from the option add or the subsequent write, refetch the schema and retry the diff-and-write sequence once; a second consecutive failure surfaces as a normal storage-layer error (the backend never falls back to the filesystem).

## Table cells and literal pipes

A GFM pipe table cannot carry a literal `|` inside a cell through the MCP: the pipe is read as a column delimiter and splits the row, and there is no working escape (verified by round-trip against the official MCP — `\|` comes back as a stray backslash and an extra column, and `&#124;` comes back as literal text). So author tables with no cell-internal `|` (reword per [[obsidian-format#Tables]]), or emit that table as a Notion-flavored `<table>` block, where a raw `|` inside a `<td>` is plain text. When migrating a pre-existing GFM table whose cell needs a literal pipe, rebuild that one table as a `<table>` block. This is a GFM limitation to work around, not an obsidian-to-Notion construct translation, and it has no read-back inverse.

## Read-back inverse (`read_artifact`)

When reconstructing obsidian markdown from a fetched Notion page:

- `<callout icon="I" color="C">` becomes `> [!type] Label` plus `>` body lines, choosing `type` and `Label` by reversing the table above on the icon (fall back to `[!note]` for an unrecognized icon). The bolded first child line is the label.
- `<mention-page url="URL"/>` becomes `[[slug]]`. The official MCP returns mentions **self-closing, without title text**, so derive `slug` by resolving the URL to its page and reading its Slug property (or the `NN-topic` in its title). If the URL resolves to no known artifact, keep the page title as plain text.
- Standard-markdown blocks (headings, lists, tables, code, `- [ ]` / `- [x]`, plain quotes) map back verbatim.

Load-bearing: the plan-reading path (`/c-execute`) must recover each `### Task N.M` heading with its `Reads:` / `Touches:` / `Depends:` fields and step checkboxes. Parse those structurally (by keyword and by to-do block), not by exact characters, per [[../../docs/designs/2026-07-10-notion-mode/04-content-translation#Reading an artifact back out of Notion]].
