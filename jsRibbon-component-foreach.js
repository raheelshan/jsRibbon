(function () {
    function parseForeachBind(bindAttr) {
        const parts = bindAttr.split(',').map(s => s.trim());
        const foreachMatch = parts[0]?.match(/^foreach\s*:\s*([\w.]+)$/i);
        const itemMatch = parts[1]?.match(/^item\s*:\s*([\w]+)$/i);

        return {
            arrayName: foreachMatch ? foreachMatch[1] : null,
            itemName: itemMatch ? itemMatch[1] : 'item'
        };
    }

    function renderItem(template, itemValue, alias, parentState) {
        const clone = template.content
            ? template.content.cloneNode(true)
            : template.cloneNode(true); // if <template> unsupported

        const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT, null, false);

        while (walker.nextNode()) {
            const el = walker.currentNode;
            const bindAttr = el.getAttribute?.('data-bind');
            if (!bindAttr) continue;

            const updated = bindAttr.replace(
                new RegExp(`\\b${alias}\\.`, 'g'),
                `__item__.`
            );
            el.setAttribute('data-bind', updated);
        }

        // temp state wrapper for this item
        const temp = document.createElement('div');
        temp.appendChild(clone);
        const fragment = temp.firstElementChild || temp;

        fragment.$item = itemValue;
        fragment.$state = new Proxy({}, {
            get(_, prop) {
                if (prop === alias) return itemValue;
                return parentState[prop];
            }
        });

        if (window.jsRibbonState?.init) {
            window.jsRibbonState.init(fragment);
        }

        return fragment;
    }

    function setupForeach(root) {
        const all = root.querySelectorAll('[data-bind*="foreach:"]');

        all.forEach(el => {
            const bindAttr = el.getAttribute('data-bind');
            const { arrayName, itemName } = parseForeachBind(bindAttr);

            if (!arrayName) return;

            const componentEl = el.closest('[data-bind*="component:"]');
            if (!componentEl || !componentEl.$state) return;

            const state = componentEl.$state;
            const arr = state[arrayName];

            if (!Array.isArray(arr)) {
                console.warn(`⚠️ Expected "${arrayName}" to be an array in component`, componentEl);
                return;
            }

            const placeholder = document.createComment(`foreach:${arrayName}`);
            el.parentNode.insertBefore(placeholder, el);
            el.remove(); // remove template

            const container = document.createElement('div');
            placeholder.parentNode.insertBefore(container, placeholder.nextSibling);

            // Watch for reactivity
            const render = () => {
                container.innerHTML = '';
                state[arrayName].forEach(item => {
                    const rendered = renderItem(el, item, itemName, state);
                    container.appendChild(rendered);
                });
            };

            // Replace array with proxy
            const proxy = new Proxy(arr, {
                get(target, prop) {
                    return typeof target[prop] === 'function'
                        ? (...args) => {
                            const result = target[prop](...args);
                            render();
                            return result;
                        }
                        : target[prop];
                },
                set(target, prop, value) {
                    target[prop] = value;
                    render();
                    return true;
                }
            });

            // Replace original array
            state[arrayName] = proxy;
            render();
        });
    }

    // Hook into jsRibbonState if present
    if (window.jsRibbonState) {
        const originalInit = window.jsRibbonState.init;

        window.jsRibbonState.init = function (el) {
            originalInit(el);
            setupForeach(el);
        };
    }
})();
