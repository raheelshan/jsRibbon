(function () {

    function parseBindings(attr) {
        const result = {};
        let current = '';
        let depth = 0;

        for (let i = 0; i < attr.length; i++) {
            const char = attr[i];

            if (char === ',' && depth === 0) {
                processBinding(current, result);
                current = '';
            } else {
                if (char === '[' || char === '{') depth++;
                if (char === ']' || char === '}') depth--;
                current += char;
            }
        }

        if (current) processBinding(current, result);
        return result;
    }

    function processBinding(str, result) {
        const parts = str.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join(':').trim();
            result[key] = val;
        }
    }

    function createReactiveState(initial) {
        const subscribers = {};

        const proxy = new Proxy(initial, {
            get(target, prop) {
                return target[prop];
            },
            set(target, prop, value) {
                target[prop] = value;
                if (subscribers[prop]) {
                    subscribers[prop].forEach(cb => cb(value));
                }
                return true;
            }
        });

        function subscribe(key, fn) {
            if (!subscribers[key]) subscribers[key] = [];
            subscribers[key].push(fn);
        }

        return { state: proxy, subscribe };
    }

    function isInsideLoopOrWith(el) {
        return el.closest('[data-bind*="foreach:"]') || el.closest('[data-bind*="with:"]');
    }

    function initializeStateBindings(componentEl, context = {}) {
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


        // First pass: collect bindings and count usage        
        bindables.forEach(el => {
            const bindings = parseBindings(el.getAttribute('data-bind'));

            if (bindings.value) {
                bindingsMap.push({
                    el,
                    type: 'value',
                    key: bindings.value,
                    updateEvent: bindings.update || null,
                    bindings: bindings

                });
                keyUsageCount[bindings.value] = (keyUsageCount[bindings.value] || 0) + 1;

                // Initialize value
                if (!(bindings.value in initialState)) {
                    let val;
                    if (el.type === 'checkbox') {
                        val = keyUsageCount[bindings.value] > 1 ? [] : !!el.checked;
                    } else if (el.type === 'radio') {
                        if (el.checked) val = el.value;

                    } else if (el.type === 'number') {
                        const num = parseFloat(el.value);
                        val = isNaN(num) ? '' : num;
                    } else {
                        val = el.value;
                    }

                    if (!isInsideLoopOrWith(el)) {
                        initialState[bindings.value] = val;
                    }

                } else {
                    // If this key already came from a text binding but we have an input with value
                    // → override it according to your priority
                    if (el.value && el.value.trim()) {
                        if (!isInsideLoopOrWith(el)) {
                            initialState[bindings.value] = el.value;
                        }
                    }
                }


            }

            if (bindings.text) {
                bindingsMap.push({
                    el,
                    type: 'text',
                    key: bindings.text,
                    bindings: bindings
                });
                if (!(bindings.text in initialState)) {
                    const textVal = el.textContent.trim();
                    if (textVal) {
                        if (!isInsideLoopOrWith(el)) {
                            initialState[bindings.text] = textVal;
                        }
                    } else {
                        if (!isInsideLoopOrWith(el)) {
                            initialState[bindings.text] = ''; // fallback until we see a value binding
                        }
                    }
                }
            }

            if (bindings.toggle) {
                bindingsMap.push({
                    el,
                    type: 'toggle',
                    key: bindings.all,
                    updateEvent: bindings.update || null,
                    bindings: bindings,
                });

                if (!(bindings.all in initialState)) {
                    if (!isInsideLoopOrWith(el)) {
                        initialState[bindings.all] = [];
                    }
                }
            }

            if (bindings.visible) {
                bindingsMap.push({
                    el,
                    type: 'visible',
                    key: bindings.visible,
                    updateEvent: bindings.update || null,
                    bindings: bindings,
                });

                if (!(bindings.visible in initialState)) {
                    if (!isInsideLoopOrWith(el)) {
                        initialState[bindings.visible] = true; // or false if you want hidden by default
                    }

                }
            }

            if (bindings.html) {
                bindingsMap.push({
                    el,
                    type: 'html',
                    key: bindings.html,
                    updateEvent: bindings.update || null,
                    bindings: bindings,
                });

                if (!(bindings.html in initialState)) {
                    if (!isInsideLoopOrWith(el)) {
                        initialState[bindings.html] = '';
                    }
                }
            }

            if (bindings.class) {
                try {
                    const cleaned = bindings.class.trim().replace(/^\[|\]$/g, '').trim(); // removes [ ]
                    const regex = /([\w-]+)\s*=>\s*([\w.]+)/g;
                    let match;

                    while ((match = regex.exec(cleaned)) !== null) {
                        const stateKey = match[2];
                        if (!(stateKey in initialState)) {
                            if (!isInsideLoopOrWith(el)) {
                                initialState[stateKey] = false;
                            }
                        }
                    }

                    bindingsMap.push({
                        el,
                        type: 'class',
                        key: bindings.class,
                        updateEvent: bindings.update || null,
                        bindings: bindings,
                    });
                } catch (e) {
                    console.warn('Invalid class binding during initialization:', bindings.class);
                }
            }

            if (bindings.attr) {
                try {
                    const cleaned = bindings.attr.trim().replace(/^\[|\]$/g, '').trim(); // removes [ ]
                    const regex = /([\w-]+)\s*=>\s*([\w.]+)/g;
                    let match;

                    while ((match = regex.exec(cleaned)) !== null) {
                        const stateKey = match[2];
                        if (!(stateKey in initialState)) {
                            if (!isInsideLoopOrWith(el)) {
                                initialState[stateKey] = "";
                            }
                        }
                    }

                    bindingsMap.push({
                        el,
                        type: 'attr',
                        key: bindings.attr,
                        updateEvent: bindings.update || null,
                        bindings: bindings,
                    });
                } catch (e) {
                    console.warn('Invalid attr binding during initialization:', bindings.attr);
                }
            }

            if (bindings.submit) {
                bindingsMap.push({
                    el,
                    type: 'submit',
                    key: bindings.submit, // either 'ajax' or 'default'
                    bindings: bindings,
                });
            }

            const supportedEvents = [
                'click', 'change', 'input', 'blur', 'focus',
                'keydown', 'keyup', 'keypress',
                'mouseenter', 'mouseleave', 'mouseover', 'mouseout',
                'dblclick', 'contextmenu',
                'mousedown', 'mouseup'
            ];

            supportedEvents.forEach(eventType => {
                if (bindings[eventType]) {
                    bindingsMap.push({
                        el,
                        type: eventType,
                        key: bindings[eventType],
                        bindings: bindings
                    });
                }
            });

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

                if (type === 'text') {
                    el.textContent = state[key];
                    subscribe(key, val => {
                        el.textContent = Array.isArray(val) ? val.join(', ') : val;
                    });
                    return;
                }

                if (type === 'value' && el instanceof HTMLInputElement) {
                    const inputType = el.type;
                    const fallbackEvent = inputType === 'checkbox' || inputType === 'radio' ? 'change' : 'input';
                    const eventToUse = updateEvent || fallbackEvent;

                    if (inputType === 'checkbox') {
                        const checkboxValue = el.value;
                        const isGrouped = Array.isArray(state[key]) || keyUsageCount[key] > 1;

                        if (isGrouped) {
                            if (!Array.isArray(state[key])) {
                                state[key] = [];
                            }

                            el.checked = state[key].includes(checkboxValue);

                            el.addEventListener(eventToUse, () => {
                                const current = new Set(state[key]);

                                if (el.checked) {
                                    current.add(checkboxValue);
                                } else {
                                    current.delete(checkboxValue);
                                }

                                state[key] = [...current];
                            });

                            subscribe(key, val => {
                                el.checked = val.includes(checkboxValue);
                            });
                        } else {
                            el.checked = !!state[key];

                            el.addEventListener(eventToUse, () => {
                                state[key] = el.checked;
                            });

                            subscribe(key, val => {
                                el.checked = !!val;
                            });
                        }

                        return;
                    }

                    if (inputType === 'radio') {
                        const radioValue = el.value;

                        // Set initially checked radio if not already set
                        if (!(key in state) && el.checked) {
                            state[key] = radioValue;
                        }

                        // Reflect current state into DOM
                        el.checked = state[key] === radioValue;

                        // When user selects a radio, update state
                        el.addEventListener(eventToUse, () => {
                            if (el.checked) {
                                state[key] = radioValue;
                            }
                        });

                        // When state changes, update which radio is checked
                        subscribe(key, val => {
                            el.checked = val === radioValue;
                        });

                        return;
                    }

                    // For text/number/etc
                    const min = el.hasAttribute('min') ? parseFloat(el.getAttribute('min')) : null;
                    const max = el.hasAttribute('max') ? parseFloat(el.getAttribute('max')) : null;

                    el.value = state[key];

                    el.addEventListener(eventToUse, e => {
                        let val = e.target.value;

                        if (inputType === 'number') {
                            val = parseFloat(val);
                            if (!isNaN(val)) {
                                if (min !== null && val < min) val = min;
                                if (max !== null && val > max) val = max;
                            } else {
                                val = '';
                            }
                        }

                        state[key] = val;
                    });

                    subscribe(key, val => {
                        if (el.value !== val) el.value = val;
                    });
                }

                // ✅ SELECT element
                if (type === 'value' && el instanceof HTMLSelectElement) {
                    const eventToUse = bindings.update || 'change';

                    el.value = state[key];

                    el.addEventListener(eventToUse, e => {
                        state[key] = e.target.value;
                    });

                    subscribe(key, val => {
                        if (el.value !== val) el.value = val;
                    });

                    return;
                }

                // ✅ TEXTAREA element
                if (type === 'value' && el instanceof HTMLTextAreaElement) {
                    const eventToUse = bindings.update || 'input';

                    el.value = state[key];

                    el.addEventListener(eventToUse, e => {
                        state[key] = e.target.value;
                    });

                    subscribe(key, val => {
                        if (el.value !== val) el.value = val;
                    });

                    return;
                }

                if (type === 'focused') {
                    // Update state when user focuses or blurs input
                    el.addEventListener('focus', () => {
                        state[key] = true;
                    });
                    el.addEventListener('blur', () => {
                        state[key] = false;
                    });

                    // Reactively apply focus based on state
                    subscribe(key, val => {
                        if (val && document.activeElement !== el) {
                            el.focus();
                        }
                        // Optional: remove focus when false
                        // else if (!val && document.activeElement === el) {
                        //     el.blur();
                        // }
                    });

                    return;
                }

                if (type === 'visible') {
                    const applyVisibility = (val) => {
                        el.style.display = val ? '' : 'none';
                    };

                    // Initial
                    applyVisibility(state[key]);

                    // React on change
                    subscribe(key, val => {
                        applyVisibility(val);
                    });

                    return;
                }


                if (type === 'readonly') {
                    el.readOnly = !!state[key];
                    subscribe(key, val => {
                        el.readOnly = !!val;
                    });
                }

                if (type === 'disabled') {
                    el.disabled = !!state[key];
                    subscribe(key, val => {
                        el.disabled = !!val;
                    });
                }

                // ✅ Select-All checkbox logic
                if (type === 'toggle' && el instanceof HTMLInputElement && el.type === 'checkbox') {
                    el.addEventListener('change', () => {
                        const groupCheckboxes = componentEl.querySelectorAll(`input[type="checkbox"][data-bind*="value:${key}"]`);
                        const values = Array.from(groupCheckboxes).map(c => c.value);
                        state[key] = el.checked ? values : [];
                    });

                    subscribe(key, val => {
                        const groupCheckboxes = componentEl.querySelectorAll(`input[type="checkbox"][data-bind*="value:${key}"]`);
                        const values = Array.from(groupCheckboxes).map(c => c.value);
                        el.checked = Array.isArray(val) && values.every(v => val.includes(v));
                    });
                }

                if (type === 'html') {
                    // Initial render
                    el.innerHTML = state[key];

                    // Subscribe to future changes
                    subscribe(key, val => {
                        el.innerHTML = val;
                    });

                    return;
                }

                if (type === 'class') {
                    try {
                        const cleaned = key.trim().replace(/^\[|\]$/g, '').trim();
                        const pairs = cleaned.split(',').map(pair => pair.trim());

                        for (const pair of pairs) {
                            const [className, stateKey] = pair.split(/\s*=>\s*/);

                            if (!className || !stateKey) continue;

                            // 🟢 Make sure current value is applied
                            el.classList.toggle(className, !!state[stateKey]);

                            // 🟢 Watch each stateKey independently
                            subscribe(stateKey, (val => {
                                el.classList.toggle(className, !!val);
                            }));
                        }
                    } catch (e) {
                        console.warn('Invalid class binding:', key);
                    }

                    return;
                }

                if (type === 'attr') {
                    try {
                        const cleaned = key.trim().replace(/^\[|\]$/g, '').trim();
                        const pairs = cleaned.split(',').map(pair => pair.trim());

                        for (const pair of pairs) {
                            const [attrName, stateKey] = pair.split(/\s*=>\s*/);
                            if (!attrName || !stateKey) continue;

                            // Initial set
                            el.setAttribute(attrName, state[stateKey]);

                            // Reactive
                            subscribe(stateKey, val => {
                                el.setAttribute(attrName, val ?? '');
                            });
                        }
                    } catch (e) {
                        console.warn('Invalid attr binding:', key);
                    }

                    return;
                }

                if (type === 'submit' && el instanceof HTMLFormElement) {
                    const behavior = key.trim(); // ajax or default
                    const swap = bindings.swap?.trim() || 'innerHTML';

                    if (behavior === 'ajax') {
                        const formId = el.id || `form-${Math.random().toString(36).slice(2)}`;
                        el.id = formId;

                        const parentComponent = componentEl;
                        const targetId = parentComponent.id || `target-${Math.random().toString(36).slice(2)}`;
                        parentComponent.id = targetId;

                        const ctx = componentEl.$ctx || {};

                        enhanceForm({
                            formId,
                            targetId,
                            swap,
                            beforeSend: ctx.beforeSend,
                            onSuccess: ctx.onSuccess,
                            onError: ctx.onError
                        });
                    }

                    // If "default", do nothing – browser will handle it
                    return;
                }

                // ✅ Handle basic events like click, input, change
                const supportedEvents = [
                    'click', 'change', 'input', 'blur', 'focus',
                    'keydown', 'keyup', 'keypress',
                    'mouseenter', 'mouseleave', 'mouseover', 'mouseout',
                    'dblclick', 'contextmenu',
                    'mousedown', 'mouseup'
                ];

                if (supportedEvents.includes(type)) {
                    const handlerName = key;
                    const ctx = componentEl.$ctx || {};

                    if (typeof ctx[handlerName] === 'function') {
                        el.addEventListener(type, ctx[handlerName]);
                    } else {
                        // Delay binding until ctx is available
                        if (!componentEl._pendingEvents) componentEl._pendingEvents = [];
                        componentEl._pendingEvents.push({
                            el,
                            type,
                            handlerName
                        });
                    }

                    if (type === 'click') {
                        // Fall back to user-defined click handler
                        const ctx = componentEl.$ctx || {};
                        if (typeof ctx[key] === 'function') {
                            el.addEventListener('click', ctx[key]);
                        } else {
                            if (!componentEl._pendingEvents) componentEl._pendingEvents = [];
                            componentEl._pendingEvents.push({
                                el,
                                type,
                                handlerName: key
                            });
                        }

                        return;
                    }


                    return;
                }

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

    window.jsRibbonState = {
        init: initializeStateBindings,
        enhanceForm,            // ← add these
        applySwap
    };
})();
