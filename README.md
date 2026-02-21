# jsRibbon

> Lightweight, dependency-free DOM component and data-binding library for progressive enhancement.

jsRibbon attaches behavior to server-rendered HTML using `data-bind` attributes. It treats the DOM as both the markup and the authoritative state: the DOM is the markup, and the DOM is the state. The library watches the document for new HTML (via a `MutationObserver`) and makes newly inserted markup reactive automatically — without the developer needing to recall or rebind components.

---

## Features

- Declarative bindings via a single `data-bind` attribute (text, value, class, attr, html, visible, foreach, events, etc.).
- Component registration with `jsRibbon.component(name, factory)`; each instance receives a reactive `$state` and `$subscribe`.
- Foreach templating with hydration: server-rendered rows are preserved and hydrated, new items are created from `<template>` or cloned nodes.
- Arrays are proxied so mutating methods (`push`, `splice`, etc.) automatically trigger DOM updates.
- Automatic registration and teardown via a `MutationObserver` — dynamically added HTML becomes reactive without manual rebind.
- Minimal footprint and zero virtual DOM: DOM is the source of truth and is updated directly.

---

## How jsRibbon differs from other libraries

- DOM-first model: Unlike virtual DOM frameworks, jsRibbon treats the actual DOM as the canonical state container — server markup is the initial state and remains authoritative.
- No reconcilers or virtual DOM diffing: updates mutate the DOM directly via targeted bindings and proxies, reducing conceptual overhead for server-rendered apps.
- Hydration-friendly: server-generated markup can be hydrated in-place; jsRibbon will reuse existing DOM (including `data-key` rows) rather than replacing it.
- Auto-enhancement: a `MutationObserver` watches for incoming HTML and registers components automatically — no manual rebind calls required when injecting markup.
- Small and focused: provides bindings and component scoping without a heavy framework, making it ideal for progressive enhancement and incremental adoption.

---

## Install

Include the library files (order matters — state helpers before core):

```html
<script src="./jsRibbon-component-state.js"></script>
<script src="./jsRibbon.js"></script>
```

Notes on forms: jsRibbon intentionally does not ship a bespoke AJAX form helper. For form enhancement and progressive XHR behavior we recommend using HTMX (https://htmx.org/) together with jsRibbon — HTMX specializes in declarative XHR and content swapping while jsRibbon provides DOM-centric reactivity and component scoping.

---

## Quick Start

1. Register a component:

```html
<script>
  jsRibbon.component('MyCard', ($state) => {
    function sayHi(){ console.log('Hi', $state.name); }
    return { sayHi };
  });
</script>
```

2. Add markup:

```html
<div data-bind="component:MyCard">
  <span data-bind="text:name">Default Name</span>
  <button data-bind="click:sayHi">Say Hi</button>
</div>
```

jsRibbon will scan on DOMContentLoaded and will also automatically pick up components injected later into the DOM.

---

## Bindings

Common binding types (used in `data-bind`):

- `component:Name`
- `text:stateKey`
- `value:stateKey` (inputs, textareas, select)
- `class:[ stateKey => className, ... ]`
- `attr:[ stateKey => attrName, ... ]`
- `html:stateKey`
- `visible:stateKey`
- `foreach: [ data: arrayKey, as: alias ]`
- `submit:ajax` — (use HTMX instead; see forms section)
- Event bindings: `click:handler`, `input:handler`, etc.

Syntax notes: use `=>` to map state -> DOM name; use `as` inside `foreach` to create an item alias; dotted keys (e.g., `layout.users`) resolve to parent component contexts.

---

## Component API & lifecycle

- `jsRibbon.component(name, factory)` — register a component factory. Factory receives `($state)` and should return a context object containing methods used by event bindings.
- Each component element receives `el.$state` and `el.$subscribe` from `jsRibbonState.init(el)` and `el.$ctx` is set to the value returned by the factory.
- Event delegation is installed on the component root and resolves handlers in the component context or in parent context for dotted names.

Helpers:

- `jsRibbon.getInstances(name)` — get registered component instances.
- `jsRibbon.scanAndRegister(root)` / `jsRibbon.scanAndUnregister(root)` — programmatic scanning.
- `jsRibbon.unregister(el)` — remove instance registration.
- `jsRibbon.reset()` — clear internal registries and rescan the document.

---

## Forms

Prefer HTMX for AJAX forms and server interactions. HTMX provides declarative attributes (`hx-post`, `hx-swap`, etc.) and integrates naturally: server responses contain markup that jsRibbon will detect and hydrate automatically.

Example: use HTMX to POST a form and replace a component area; jsRibbon's `MutationObserver` will make any new markup reactive without additional calls.

---

## Foreach & Templates

- Use `data-bind="foreach: [ data: items, as: item ]"` on a container.
- Server-rendered children with `data-key` are hydrated and mapped to items by index or `id`/`key`.
- When arrays are proxied, mutating operations trigger re-rendering of only the necessary DOM.

---

## Troubleshooting

- If a component doesn't initialize, confirm `data-bind="component:Name"` and that `jsRibbon.component('Name', ...)` is registered.
- Duplicate `data-key` instances are skipped to avoid collisions.
- If a handler isn't found, ensure the method exists on the component's returned context or use a dotted name to reference a parent method.

---

## Example demo

See `example.html` in this repo — it demonstrates:

- Component registration and events
- Foreach with template and server-hydrated rows
- Dynamic insertion of component markup (showing MutationObserver auto-registration)

---

If you'd like, I can also generate a published `package.json` or a short CHANGELOG and a separate `example.html` (already included) with comments. 
