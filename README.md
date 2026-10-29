# jsRibbon

**jsRibbon** is a lightweight, DOM-first reactive JavaScript library for building interactive UI directly on server-rendered HTML.

It enhances real DOM elements using declarative `data-bind` attributes — no virtual DOM, no build step, no dependencies.

---

## Why jsRibbon?

- DOM-first architecture  
- Zero dependencies  
- No build tools required  
- Reactive state via Proxy  
- Automatic hydration of dynamically injected HTML  
- Designed for server-rendered applications  

jsRibbon treats your existing HTML as the template and the initial state source.

---

## Documentation

Full documentation is available here:

👉 https://jsribbon.raheelshan.com/

---

## Installation

### CDN (jsDelivr)

```html
<script src="https://cdn.jsdelivr.net/gh/raheelshan/jsRibbon@v1.0.7/dist/jsRibbon.min.js"></script>
```

### Latest version:

```html
<script src="https://cdn.jsdelivr.net/gh/raheelshan/jsRibbon@latest/dist/jsRibbon.min.js"></script>
```

### npm

```bash
npm install jsribbon
```

```javascript
import 'jsribbon';
```

## Basic Example

```html
<div data-bind="component:Counter">
  <span data-bind="text:count">0</span>
  <button data-bind="click:increment">+</button>
  <button data-bind="click:decrement">−</button>
</div>

<script>
  jsRibbon.component('Counter', ($state) => {
    const increment = () => $state.count++;
    const decrement = () => $state.count--;
    return { increment, decrement };
  });
</script>
```

## Core Features

- **component** — Define element component
- **text** — Bind element text content
- **value** — Two-way input binding
- **html** — Bind inner HTML
- **visible** — Toggle element visibility
- **class** — Bind CSS classes
- **attr** — Bind HTML attributes
- **click** — Handle events (`click`, `dblclick`, `input`, `change`, `keydown`, `keyup`, `focus`, `blur`, `mouseenter`, `mouseleave`, ...)
- **foreach** — Render list items, hydrated in place from server-rendered rows
- **Checkbox & radio** — Multi-value form controls
- **Reactive arrays** — Auto-update on mutations
- **Automatic hydration** — MutationObserver for dynamic content

jsRibbon intentionally does not ship a bespoke AJAX form helper — pair it with
[HTMX](https://htmx.org/) for AJAX form submission. Any HTML HTMX injects is
auto-hydrated by jsRibbon's MutationObserver, no extra wiring needed.

See full binding reference in the [documentation](https://jsribbon.raheelshan.com/).

## foreach

Server-rendered rows are the template and the initial data. jsRibbon reads
each row into `$state` and keeps the existing nodes (no re-render on load).

```html
<div data-bind="component:Team">
  <ul data-bind="foreach:[data: users, as: user]">
    <li>
      <span data-bind="text:user.name">Ali</span>
      <input data-bind="value:user.name" value="Ali">
    </li>
    <li>
      <span data-bind="text:user.name">Sara</span>
      <input data-bind="value:user.name" value="Sara">
    </li>
  </ul>
</div>
```

`$state.users` starts as `[{ name: 'Ali' }, { name: 'Sara' }]`. Row keys can
be written with the alias (`user.name`) or without it (`name`).

For a list of plain values, bind the alias itself:

```html
<ul data-bind="foreach:[data: fruits, as: fruit]">
  <li data-bind="text:fruit">Apple</li>
  <li data-bind="text:fruit">Mango</li>
</ul>
```

`$state.fruits` starts as `['Apple', 'Mango']`.

**Updating the list.** All of these re-render it:

```js
$state.users.push({ name: 'Omar' });             // push, pop, shift, unshift, splice, sort, reverse
$state.users[0] = { name: 'Ali Khan' };          // replace one row
$state.users = await fetch('/users').then(r => r.json());   // replace the whole list
```

Changing a field on an existing item (`$state.users[0].name = 'x'`) does not
re-render. Replace the item instead: `$state.users[0] = { ...$state.users[0], name: 'x' }`.
Typing into a row's `value:` input updates its item automatically.

## Project Structure

```
src/      → Source files
dist/     → Production builds
examples/ → Usage examples
```

## Versioning

jsRibbon follows semantic versioning:

- **Patch** → bug fixes
- **Minor** → new features (backward compatible)
- **Major** → breaking changes

## License

MIT License  
© 2026 Raheel Shan