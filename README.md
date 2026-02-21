# jsRibbon

> Lightweight, dependency-free DOM component and data-binding library for progressive enhancement.

Use `data-bind` attributes to declare components, reactive state and UI bindings (text, value, class, attr, foreach, events, forms, and more). Designed to hydrate server-rendered markup and enhance it on the client.

---

## Install

Include the three scripts in order (helpers & state before core):

```html
<script src="./jsRibbon-enhance-form.js"></script>
<script src="./jsRibbon-component-state.js"></script>
<script src="./jsRibbon.js"></script>
```

You can toggle runtime flags after loading:

```html
<script>
  jsRibbon.autoRegister = true;   // default: true
  jsRibbon.hardFail = false;      // when true, inconsistent component markup throws
</script>
```

---

## Quick Start

1. Register a component in JS:

```html
<script>
  jsRibbon.component('MyCard', ($state) => {
    function sayHi(){ console.log('Hi', $state.name); }
    return { sayHi };
  });
</script>
```

2. Add markup and bindings:

```html
<div data-bind="component:MyCard">
  <span data-bind="text:name">Default Name</span>
  <button data-bind="click:sayHi">Say Hi</button>
</div>
```

On DOMContentLoaded `jsRibbon` will scan, initialize `$state` for the element and call the registered component factory with that state.

---

## Bindings (data-bind syntax)

Bindings are declared inside a `data-bind` attribute. Multiple bindings are comma-separated. Supported binding types:

- `component:Name` — declare component root.
- `text:stateKey` — bind `textContent` to state.
- `value:stateKey` — two-way binding for inputs, selects and textareas. Handles checkboxes, radios and numbers.
- `class:[ stateKey => className, ... ]` — toggle CSS classes.
- `attr:[ stateKey => attrName, ... ]` — set attributes from state.
- `html:stateKey` — set `innerHTML`.
- `visible:stateKey` — show/hide via `display`.
- `toggle:stateKey` — select-all checkbox semantics for groups.
- `readonly:stateKey`, `disabled:stateKey`, `focused:stateKey` — control element props.
- `foreach: [ data: arrayKey, as: alias ]` — repeat a block for each item in an array (supports hydration and templates).
- `submit:ajax` — enhance `<form>` to submit via fetch.
- Event bindings: any event name can be used, e.g. `click:handlerName`.

Syntax notes:
- Use `=>` to map state keys to DOM class/attribute names: `class:[ isHidden => hidden ]`.
- Use `as` in `foreach` for an item alias: `foreach: [ data: users, as: user ]`.
- Dotted keys like `layout.users` resolve to parent component contexts.

---

## Component lifecycle & API

- `jsRibbon.component(name, factory)` registers a component factory. The factory is called with the reactive `$state` for each instance and should return a context object (methods) that will be accessible to event handlers.
- During initialization: `jsRibbonState.init(el)` prepares `el.$state` and `el.$subscribe` then `jsRibbon` calls the component factory and stores returned object as `el.$ctx`.
- Event delegation is installed once per component root. Handlers are resolved in the local context (`el.$ctx`) or in parent components using dotted names.

Programmatic helpers:
- `jsRibbon.getInstances(name)` — get registered instances for a component name.
- `jsRibbon.scanAndRegister(root)` / `jsRibbon.scanAndUnregister(root)` — scan a subtree.
- `jsRibbon.unregister(el)` — unregister a component instance.
- `jsRibbon.reset()` — clears registries and rescans the document.

---

## Events

- Declare an event handler: `data-bind="click:editItem"`.
- Handler resolution order: local component context → parent context when dotted (e.g., `cart.removeItem`).
- Handler signature: `handler(event, dataset, targetElement)`. `dataset` is the element's `data-*` attributes parsed (numbers, booleans, JSON are auto-parsed).
- Special built-in: `removeItem` on a button inside a `foreach` row removes the item from its owning array.

---

## Foreach & Templates

- Put `data-bind="foreach: [ data: items, as: item ]"` on the container (e.g., `<tbody>` or `<ul>`).
- If a `<template>` element is present inside the container, it will be used as the clone source for new items; otherwise the first child is cloned.
- Server-rendered rows with `data-key` are hydrated and matched to the underlying array by index or `id`/`key`.
- Arrays are proxied so mutating methods (`push`, `splice`, etc.) trigger controlled re-renders.

---

## Forms (AJAX enhancement)

- Use `data-bind="submit:ajax"` on a `<form>` to enable fetch-based submits.
- The helper `enhanceForm({ formId, targetId, swap, beforeSend, onSuccess, onError })` does the work. `swap` options: `innerHTML` (default), `outerHTML`, `append`, `prepend`.
- Component factories may provide `beforeSend`, `onSuccess`, `onError` callbacks in `el.$ctx` to customize behavior.

---

## Advanced

- Parent context resolution: dotted keys (`Layout.users`, etc.) look up nearest ancestor component with matching name (title-cased).
- State is reactive via a Proxy: use `el.$state` and `el.$subscribe(key, fn)` to observe changes.
- `jsRibbon.autoRegister` controls whether a MutationObserver auto-registers elements added to the DOM.
- `jsRibbon.hardFail` toggles whether the system throws on inconsistent component markup across instances.

---

## Troubleshooting

- Component not initializing: ensure `data-bind="component:Name"` exists and `jsRibbon.component('Name', ...)` is registered before DOMContentLoaded, or rely on `autoRegister`.
- Duplicate keyed instances: if two elements share the same `component` name and `data-key` value, the second is skipped (to avoid collisions).
- Handler not found: ensure the handler name matches a method returned by the registered component factory; use dotted names to access parent methods.

---

## Examples

See the repo examples in the project root for working pages. Quick example — counter:

```html
<div data-bind="component:Counter">
  <span data-bind="text:count">0</span>
  <button data-bind="click:inc">+</button>
  <button data-bind="click:dec">-</button>
</div>

<script>
  jsRibbon.component('Counter', ($state) => {
    $state.count = $state.count ?? 0;
    function inc(){ $state.count = $state.count + 1; }
    function dec(){ $state.count = Math.max(0, $state.count - 1); }
    return { inc, dec };
  });
</script>
```

---

If you want, I can also add a standalone example HTML page (`example.html`) or tweak this README for publishing on npm/GitHub.
# jsRibbon
Declerative UI library
