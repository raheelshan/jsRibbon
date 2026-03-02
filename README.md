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
<script src="https://cdn.jsdelivr.net/gh/raheelshan/jsRibbon@v1.0.0/dist/jsRibbon.min.js"></script>
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
<div data-component="Counter">
    <h2 data-bind="text: count"></h2>
    <button data-bind="click: increment">+</button>
</div>

<script>
jsRibbon.component('Counter', ($state) => {
    $state.count = 0;

    $state.increment = () => {
        $state.count++;
    };
});
</script>
```

## Core Features

- **text** — Bind element text content
- **value** — Two-way input binding
- **html** — Bind inner HTML
- **visible** — Toggle element visibility
- **class** — Bind CSS classes
- **attr** — Bind HTML attributes
- **click** — Handle click events
- **submit** — Handle form submission
- **foreach** — Render list items
- **Checkbox & radio** — Multi-value form controls
- **Reactive arrays** — Auto-update on mutations
- **Automatic hydration** — MutationObserver for dynamic content

See full binding reference in the [documentation](https://jsribbon.raheelshan.com/).

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