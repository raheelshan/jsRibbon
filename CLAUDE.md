# jsRibbon

## What this is

jsRibbon is a zero-dependency, no-build-step, DOM-first reactive library. It is
**not** a competitor to React/Vue in their own terms — it's built for backend
developers who render HTML server-side and want to sprinkle in reactivity
without owning a JS build pipeline or a component templating layer on the
client.

Core philosophy (from the author):

- The server always owns the HTML. jsRibbon enhances real DOM elements via
  `data-bind` attributes — it never generates markup from JS-side templates.
- Initial state is **derived from the existing DOM**, not declared separately
  (`data-bind="text:count"` seeds `state.count` from `el.textContent`, etc.).
  This is the library's main differentiator vs. Alpine/Knockout/HTMX+hyperscript.
- When the server returns HTML fragments/partials (via HTMX — jsRibbon
  intentionally does not ship its own AJAX form helper, see below), a
  `MutationObserver` auto-hydrates the injected nodes — no manual rebind step.
- Most UI should need **zero JS**; JS is only for custom event handlers via
  `jsRibbon.component(name, factory)`.
- SEO-preserving: content exists in the initial server-rendered markup, not
  synthesized by a client-side render pass.
- Composition is inspired by Knockout's `with` binding: a child component
  should be able to read an ancestor component's state via a dotted key like
  `text:layout.firstName`.
- Strategic goal: give backend developers (Rails/Django/PHP/Laravel/etc.
  style stacks) a path to interactive UI without adopting React/Alpine and
  the client-owned-state model that comes with them.

**Read `src/jsRibbon.js` top to bottom before making changes** — it's one
file (~1850 lines), so there's no module boundary hiding the design.

## Layout

```
src/jsRibbon.js       — the entire library (single file, hand-written, no build needed to run it)
dist/jsRibbon.js      — unminified copy of src, tracked in git (do not hand-edit — regenerate)
dist/jsRibbon.min.js  — terser output, tracked in git, referenced by the jsDelivr CDN install snippet
examples/*.html       — manual smoke tests (open in a browser + check devtools console); NOT automated tests
README.md             — quickstart, points to https://jsribbon.raheelshan.com/ for full docs
```

Build: `npm run build` → runs `terser src/jsRibbon.js -o dist/jsRibbon.min.js -c -m`.
There is no other build step. `dist/jsRibbon.js` (the unminified copy) must be
kept in sync with `src/jsRibbon.js` manually — there's no script that copies it.

No test runner is configured (`package.json` has no `test` script). Verifying
a change currently means opening the relevant file(s) in `examples/` in a
browser and checking behavior/console output by hand.

`.gitignore` lists `dist/`, but `dist/*.js` is already tracked from before
that rule was added (`git ls-files` confirms both files are tracked). The
CDN install link in the README (`@v1.0.0/dist/jsRibbon.min.js`) is valid —
don't "fix" this by untracking dist.

## Architecture (inside `src/jsRibbon.js`)

Two IIFEs, all in one file:

1. **Binding engine IIFE** → exposes `window.jsRibbonState` (`init`,
   `parseBindings`, `resolveMethod`).
   - `initializeStateBindings(componentEl)` does two passes over
     `[data-bind]` descendants (stopping at nested `component:` boundaries):
     pass 1 collects bindings and infers `initialState` from the DOM; pass 2
     (after wrapping state in a reactive `Proxy` via `createReactiveState`)
     wires up each binding type's live DOM behavior.
   - One `apply*` function per binding type (`applyText`, `applyValue`,
     `applySelect`, `applyTextArea`, `applyVisibile`, `applyClass`,
     `applyAttribute`, `applyHtml`, `applyForeach`, `applyFocused`,
     `applyReadOnly`, `applyDisabled`, `applyCheckboxToggle`).
   - `resolvePath(el, "parent.key")` / `resolveMethod(el, "parent.method")`
     implement cross-component reads: they title-case the dotted prefix and
     walk `parentElement` looking for an ancestor whose `data-bind` contains
     `component:ThatName`. **This is the composition mechanism** — there is
     no separate `context:` attribute; resolution is purely name-matching
     off the dotted key itself.
   - `resolvePath` returns `undefined` (with a `console.warn`) if the
     ancestor isn't found — it never throws. Every caller either guards with
     `if (!resolved) { ... return; }` or falls back via
     `resolvePath(...) || {state, subscribe, key}`.
   - `foreach` rows are hydrated/patched in place: `renderForeach` reuses
     `el.children` by index (tagging `data-key`/`data-foreach-owner`/
     `data-foreach-alias` and re-binding fields via `bindRowFields`) rather
     than wiping and rebuilding the list on every render — including the
     very first render, so server-rendered rows are never torn down just to
     be recreated.
   - `foreach` re-renders purely through `subscribe(key)`, like every other
     binding: `createReactiveState`'s `wrapArray` notifies on array methods
     and index sets, and the top-level `set` trap notifies on reassignment.
     There is deliberately no foreach-specific array proxy: a dotted foreach
     used to wrap the ancestor's array in a proxy closing over the child's
     DOM, which stacked one layer per HTMX swap. `WRAPPED_KEY` stops
     `wrapArray` double-wrapping an already-wrapped array.
   - Subscriptions on an ancestor's state (anything resolved via
     `resolvePath`) are recorded on the owning component's `$cleanup` and
     removed in `unregisterComponent`. `subscribe()` returns an unsubscribe
     function. The MutationObserver skips removed nodes that are still
     connected (moved, not removed).
   - Every DOM listener a component adds (binding-engine `listen()` calls
     and the delegated events) is tied to that instance's `el.$abort`
     AbortController, aborted in `unregisterComponent`. `reset()`
     unregisters every instance before re-scanning, and a foreach keeps its
     original template on `el.$foreachTemplate` (and a radio its original
     name on `el.$originalName`) so a re-init doesn't depend on DOM the
     first init already changed.
   - Row keys may carry the alias (`text:user.name`) or not (`text:name`);
     `rowFieldKey` strips it for both seeding (`getParsedForeachArray`) and
     writes (`writeForeachRowValue`). A bare alias (`text:fruit`) means the
     row item is a primitive. The row element itself may carry a binding.
   - Row bindings support the full static vocabulary (`text`/`html`/
     `visible`/`class`/`attr`/`readonly`/`disabled`/`value` on inputs, checkboxes,
     `<select>` incl. `multiple` (an array), `<textarea>`) via
     `bindRowFields`, re-run on that one row whenever it changes. Editable
     `value:` inputs inside rows are two-way: writes go through the
     delegated-event system (`resolveForeachRow`/`writeForeachRowValue` in
     the component registry IIFE), resolving the current item via
     `data-key` **at event time** rather than a per-row listener closing
     over the item — so it stays correct even if that row's DOM node later
     gets reused for a different item after a `splice`/`shift`. Named-handler
     events (`click`, `mouseenter`, etc.) already worked inside rows before
     this, via the same event-time resolution. `resolveForeachRow` also
     walks up the ancestor-component chain (not just the local component's
     own `$state`) to find whichever component actually owns the array —
     needed for a dotted (cross-component) `foreach`, e.g. a child
     component doing `foreach:[data:parent.items, as:item]`, where the
     row-reactive array lives on the ancestor's state, not the child's.
   - Uses its own simpler parser: `parseBindings`/`processBinding`/
     `splitBindings`/`parseKeyValue`.
   - AJAX form submission is intentionally **not** implemented here — use
     HTMX; jsRibbon's `MutationObserver` auto-hydrates whatever HTMX injects.

2. **Component registry IIFE** → exposes `window.jsRibbon` (`component`,
   `getComponents`, `getInstances`, `autoRegister`, `hardFail`, `reset`,
   `scanAndRegister`, `scanAndUnregister`, `unregister`).
   - `registerComponent(el)` initializes state (calls into
     `window.jsRibbonState.init`), calls the registered factory
     `jsRibbon.component(name, fn)` to get `$ctx`, installs one delegated
     listener per supported DOM event on the component root. Nested
     components each install their own listener, so a click inside a child
     component also bubbles to every ancestor component's listener — each
     delegated listener checks that the clicked element's *nearest*
     enclosing component is itself before acting, otherwise a dotted
     handler (which resolves to the same target function regardless of
     which ancestor's listener runs it) would fire once per ancestor level
     instead of once.
   - `MutationObserver` on `document.body` drives auto (un)registration of
     injected/removed `[data-bind]` subtrees (`autoRegister`, default true).
   - `hardFail` (default false) + `componentMarkupRegistry` enforce that all
     instances of a same-named component share identical markup structure —
     a guard specifically for "backend template drifted" bugs.
   - Uses a second, richer parser (`parseDataBind`/`parseBracketExpression`/
     `splitTopLevel`) — but **only** to read the `component:` value off the
     root element, not for general binding parsing. See "Known issues" below
     — this is a real divergence, not an intentional split.

## `data-bind` syntax quick reference

```
component:Name                       — mark a component root
text:key                             — textContent
value:key[, update:eventName]        — two-way input/select/textarea binding
html:key                             — innerHTML (unsanitized)
visible:key                          — display:none toggle
class:[key => className, ...]        — conditional classList
attr:[key => attrName, ...]          — reactive attribute
click:handlerName                    — delegated event (also dblclick, keydown, input, change, focus, blur, ...)
foreach:[data: arrayKey, as: alias]  — list rendering, hydrated/patched in place; rows support the full binding vocabulary above, including two-way value:
toggle:arrayKey                      — select-all checkbox for a checkbox group
readonly:key / disabled:key / focused:key
```

Dotted keys (`layout.firstName`) reach into an ancestor component's state via
`resolvePath` — see composition note above. There is no `submit:` binding —
use HTMX for AJAX forms; a plain `<form>` with no `data-bind` submits natively.

## Known issues / active backlog

Found by close reading against the stated project philosophy; fixed items
removed from this list as of the 2026-08-21 cleanup pass (see git history for
the diff). Still open:

1. Two separate `data-bind` parsers exist (`parseBindings` vs.
   `parseDataBind`); only the latter supports `as`/wildcards, and it's only
   used for the `component:` value. New binding syntax added to one won't
   automatically apply to the other.
2. No component lifecycle hooks (`onMount`/`onDestroy`), by decision: the
   factory already runs on mount, and HTMX's `htmx:beforeCleanupElement`
   covers teardown.
3. No automated tests; `examples/*.html` are manual/console-driven only.
   Headless Chrome works for scripted checks: a page that runs assertions
   and writes them into the DOM, read back with
   `chrome --headless=new --allow-file-access-from-files --virtual-time-budget=5000 --dump-dom file:///...`. If
   you touch `renderForeach`/`bindRowFields`/`resolvePath`/the two parsers,
   manually exercise the relevant `examples/*.html` file(s) in a browser —
   there's no regression net yet.
4. Global, unscoped module state (`componentMap`/`componentKeys`/
   `componentMarkupRegistry`/`initializedElements`) — fine for one page/one
   app, but no story for multiple independent jsRibbon instances on one page
   beyond `reset()`.
5. Mutating a field on a foreach item (`state.items[0].name = 'x'`) does not
   re-render; items are plain objects. Replacing the item
   (`state.items[0] = {...}`) or any array method does.

## Conventions observed in this repo

- Commit messages are short and plain ("readme fixes", "example fix") — match
  that style, don't invent conventional-commit prefixes.
- No linter/formatter config present — match existing file's style (4-space
  indent, semicolons, `const`/`let`) rather than introducing a new one.
- Comments in the source occasionally include emoji markers (✅/⚠️/🔧) for
  warnings/state changes logged to console — this is existing style, not
  something to strip out reflexively, but don't add net-new emoji-decorated
  `console.log` calls without a reason; several already-commented-out ones
  suggest the author has been trimming these down over time.
