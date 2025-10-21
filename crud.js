// 0. Create
const para  = document.createElement('p');
para.textContent = 'Welcome';
// or
para.innerHTML = 'Welcome';

// 1. Add
// Add elements or text inside a parent node, at the end.
const container = document.getElementById('container');
const p = document.createElement('p');
p.textContent = 'Appended paragraph';
container.append(p);

// parent.append(child1, child2, 'text')

// Prepand
// Add elements or text inside a parent node, at the beginning.
// prepend(...nodes)
const container = document.getElementById('container');
const heading = document.createElement('h2');
heading.textContent = 'Prepended heading';
container.prepend(heading);

// insert as sibling
// Use for positioning outside the target element.
// Works with multiple nodes or strings.
//  .after(...nodes)
const div = document.querySelector('.box');
const note = document.createElement('p');
note.textContent = 'This appears after the box.';
div.after(nte);

// .before(...nodes)
// Use when you want new elements right before an existing one.
// Works just like .after() but in reverse order.
const div = document.querySelector('.box');
const label = document.createElement('p');
label.textContent = 'This appears before the box.';
div.before(label);

// 2. Remove
// Completely delete an element from the DOM.
const item = document.querySelector('.old-item');
item.remove();
// or
const item = document.querySelector('.old-item');
item.remove();

// Avoid using innerHTML = '' to clear elements — .remove() is cleaner

// DOM Optimization with DocumentFragment
// Problem: When I add many elements directly to the DOM inside a loop, the browser reflows 
// and repaints the DOM after each insertion, making the page slow.
const list = document.getElementById('list');
for (let i = 0; i < 1000; i++) {
  const li = document.createElement('li');
  li.textContent = `Item ${i}`;
  list.append(li); // ❌ causes 1000 reflows
}
// Solution
const list = document.getElementById('list');
const fragment = document.createDocumentFragment();
for (let i = 0; i < 1000; i++) {
  const li = document.createElement('li');
  li.textContent = `Item ${i}`;
  fragment.append(li); // ✅ fast, no reflow yet
}
list.append(fragment); // ✅ single reflow, faster rendering