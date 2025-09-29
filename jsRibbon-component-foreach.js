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

    function setupForeach(componentEl, context = {}) {

        const ctx = componentEl.$ctx || context || {};
        const bindingsMap = [];
        const initialState = {};
        const keyUsageCount = {};

        const allBindings = document.querySelectorAll('[data-bind]');
        const bindables = [];

        allBindings.forEach(el => {
            const nearestComponent = el.closest('[data-bind*="component:"]');

            if (nearestComponent === componentEl) {
                bindables.push(el); // ✅ Inside this specific component
            } else if (!nearestComponent) {
                console.warn('⚠️ Found data-bind element outside any component:', el);
            }
        });

        bindables.forEach(el => {
            if (bindings.foreach) {
                let arrayKey = bindings.foreach;
                let alias = null;

                // Support [ data: users, as: user ]
                if (arrayKey.startsWith('[')) {
                    try {
                        const configStr = arrayKey.trim().replace(/^\[|\]$/g, '');
                        const configParts = configStr.split(',').map(p => p.trim());
                        configParts.forEach(part => {
                            const [k, v] = part.split(':').map(x => x.trim());
                            if (k === 'data') arrayKey = v;
                            if (k === 'as') alias = v;
                        });
                    } catch (err) {
                        console.warn('Invalid foreach syntax', arrayKey);
                    }
                }

                const children = Array.from(el.children);

                const parsedArray = children.map(child => {
                    const obj = {};
                    const deepBindables = child.querySelectorAll('[data-bind]');
                    deepBindables.forEach(bindable => {
                        const bindInfo = parseBindings(bindable.getAttribute('data-bind'));
                        for (let [bType, bKey] of Object.entries(bindInfo)) {
                            if (bType === 'text') {
                                obj[bKey] = bindable.textContent.trim();
                            }
                            if (bType === 'value' && bindable instanceof HTMLInputElement) {
                                obj[bKey] = bindable.type === 'checkbox'
                                    ? bindable.checked
                                    : bindable.value;
                            }
                        }
                    });
                    return obj;
                });

                initialState[arrayKey] = parsedArray;

                // console.log(parsedArray) // fruits

                bindingsMap.push({
                    el,
                    type: 'foreach',
                    key: arrayKey,
                    alias: alias, // 👈 store alias here
                    bindings: bindings
                });
            }
        });

        const { state, subscribe } = createReactiveState(initialState);
        componentEl.$state = state;

        // Second pass: bind all
        bindingsMap.forEach((data) => {

            let { el, updateEvent, bindings } = data;

            Object.entries(bindings).forEach(([type, key]) => {

               if (type === 'foreach') {
                   const items = state[data.key];
                   const parent = el;
                   const templateNodes = Array.from(parent.children);

                   // Just tag items with $index and $item (optional for future use)
                   // console.log(items);

                   parent.innerHTML = ''; // clear

                   items.forEach((item, index) => {
                       const clone = templateNodes[index]?.cloneNode(true);
                       if (!clone) return;
                       const innerBindables = clone.querySelectorAll('[data-bind]');

                       innerBindables.forEach(bindEl => {
                           const bindInfo = parseBindings(bindEl.getAttribute('data-bind'));
                           Object.entries(bindInfo).forEach(([bType, bKey]) => {
                               if (bType === 'text') {
                                   bindEl.textContent = item[bKey];
                               }
                               if (bType === 'value' && bindEl instanceof HTMLInputElement) {
                                   bindEl.value = item[bKey];
                                   if (bindEl.type === 'checkbox') {
                                       bindEl.checked = !!item[bKey];
                                   }
                               }
                           });
                       });

                       parent.appendChild(clone);
                   });

                   return;
               }
            })
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
