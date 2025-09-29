(function () {

    function resolveBindingKey(binding) {
        if (!binding) return null;

        if (typeof binding === 'string') return binding;
        if (binding.type === 'ident') return binding.name;
        if (binding.type === 'raw') return binding.raw;
        if (binding.type === 'literal') return binding.value;
        return null;
    }

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

    function parseForeachBinding(str) {
        let arrayKey = str;
        let alias = null;
        if (str && str.trim().startsWith('[')) {
            const configStr = str.trim().replace(/^\[|\]$/g, '');
            const parts = configStr.split(',').map(p => p.trim());
            parts.forEach(p => {
                const [k, v] = p.split(':').map(x => x.trim());
                if (k === 'data') arrayKey = v;
                if (k === 'as') alias = v;
            });
        }
        return { arrayKey, alias };
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

        function wrapArray(arr, propKey) {
            return new Proxy(arr, {
                get(target, prop, receiver) {
                    // Intercept mutating array methods
                    if (['push', 'splice', 'shift', 'unshift', 'pop', 'sort', 'reverse'].includes(prop)) {
                        return function (...args) {
                            const result = Array.prototype[prop].apply(target, args);
                            if (subscribers[propKey]) {
                                subscribers[propKey].forEach(cb => cb(target));
                            }
                            return result;
                        }
                    }
                    return Reflect.get(target, prop, receiver);
                },
                set(target, prop, value, receiver) {
                    const result = Reflect.set(target, prop, value, receiver);
                    if (subscribers[propKey]) {
                        subscribers[propKey].forEach(cb => cb(target));
                    }
                    return result;
                }
            });
        }

        const proxy = new Proxy(initial, {
            get(target, prop, receiver) {
                return Reflect.get(target, prop, receiver);
            },
            set(target, prop, value, receiver) {
                // If assigning an array, wrap it so mutations trigger updates
                if (Array.isArray(value)) {
                    value = wrapArray(value, prop);
                }
                const result = Reflect.set(target, prop, value, receiver);
                if (subscribers[prop]) {
                    subscribers[prop].forEach(cb => cb(value));
                }
                return result;
            }
        });

        // Wrap existing arrays in `initial` so they’re reactive too
        for (const key in initial) {
            if (Array.isArray(initial[key])) {
                proxy[key] = wrapArray(initial[key], key);
            }
        }

        function subscribe(key, fn) {
            if (!subscribers[key]) subscribers[key] = [];
            subscribers[key].push(fn);
        }

        return { state: proxy, subscribe };
    }

    function isInsideLoopOrWith(el) {
        return el.closest('[data-bind*="foreach:"]') || el.closest('[data-bind*="with:"]');
    }

    function renderForeach(container, arr, alias, template, arrayKey, state) {
        container.innerHTML = '';

        arr.forEach((item, index) => {
            const clone = template.cloneNode(true);

            // Tag this row with index & owner array
            clone.setAttribute('data-key', index);
            clone.setAttribute('data-foreach-owner', arrayKey);

            // Bind text/value fields
            const bindables = clone.querySelectorAll('[data-bind]');

            const supportedEvents = [
                'click', 'change', 'input', 'blur', 'focus',
                'keydown', 'keyup', 'keypress',
                'mouseenter', 'mouseleave', 'mouseover', 'mouseout',
                'dblclick', 'contextmenu',
                'mousedown', 'mouseup'
            ];

            bindables.forEach(el => {
                const bindInfo = parseBindings(el.getAttribute('data-bind'));
                for (let [bType, bKey] of Object.entries(bindInfo)) {
                    if (bType === 'text') {
                        el.textContent = item[bKey];
                    }
                    if (bType === 'value' && el instanceof HTMLInputElement) {
                        if (el.type === 'checkbox') {
                            el.checked = item[bKey];
                        } else {
                            el.value = item[bKey];
                        }
                    }

                    if (supportedEvents.includes(bType)) {
                        if (bKey === 'remove' || bKey === 'removeItem') {
                            el.addEventListener(bType, () => {
                                state[arrayKey].splice(index, 1);
                            });
                        } else if (typeof state[bKey] === 'function') {
                            el.addEventListener(bType, () => {
                                state[bKey](item, index, state[arrayKey]);
                            });
                        }
                    }
                }
            });

            container.appendChild(clone);
        });
    }

    function eventBinding(bindings, bindingsMap, el) {
        const supportedEvents = [
            'click', 'change', 'input', 'blur', 'focus',
            'keydown', 'keyup', 'keypress',
            'mouseenter', 'mouseleave', 'mouseover', 'mouseout',
            'dblclick', 'contextmenu',
            'mousedown', 'mouseup'
        ];

        supportedEvents.forEach(eventType => {

            if (bindings[eventType]) {
                const handlerName = resolveBindingKey(bindings[eventType]);
                if (!handlerName) return;

                bindingsMap.push({
                    el,
                    type: eventType,
                    key: handlerName,
                    bindings: bindings
                });
            }
        });
    }

    function applyEvent(el, key, type, state, update, subscribe, componentEl) {
        // ✅ Handle basic events like click, input, change
        const supportedEvents = [
            'click', 'change', 'input', 'blur', 'focus',
            'keydown', 'keyup', 'keypress',
            'mouseenter', 'mouseleave', 'mouseover', 'mouseout',
            'dblclick', 'contextmenu',
            'mousedown', 'mouseup'
        ];

        // If element is inside foreach, skip direct binding – delegation will handle it
        if (el.closest('[data-foreach-owner]')) {
            return;
        }

        if (supportedEvents.includes(type)) {
            const handlerName = key;  // ✅ now "handleClick" or "handleHover"
            const ctx = componentEl.$ctx || {};

            if (typeof ctx[handlerName] === 'function') {
                el.addEventListener(type, ctx[handlerName]);
                return;
            }

            if (type === 'click') {
                if (key === 'remove' || key === 'removeItem') {
                    el.addEventListener('click', () => {
                        const parent = el.closest('[data-key][data-foreach-owner]');
                        if (!parent) return;

                        const index = parseInt(parent.getAttribute('data-key'), 10);
                        const stateKey = parent.getAttribute('data-foreach-owner');

                        if (!Array.isArray(state[stateKey])) return;

                        state[stateKey].splice(index, 1); // This triggers re-render via Proxy 
                    });
                    return;
                }


                // Fall back to user-defined click handler 
                const ctx = componentEl.$ctx || {};

                if (typeof ctx[key] === 'function') {
                    el.addEventListener('click', ctx[key]);
                } else {
                    if (!componentEl._pendingEvents) componentEl._pendingEvents = [];
                    componentEl._pendingEvents.push({
                        el,
                        type,
                        handlerName
                    });
                }

            } else {

                // Delay binding until ctx is available
                if (!componentEl._pendingEvents) componentEl._pendingEvents = [];
                componentEl._pendingEvents.push({
                    el,
                    type,
                    handlerName
                });
            }

            // console.log(componentEl._pendingEvents)

            return;
        }
    }

    function exportBinding(bindings, bindingsMap, el) {
        if (bindings.expose) {
            try {
                const exposeStr = bindings.expose.trim().replace(/^\[|\]$/g, '');
                const pairs = exposeStr.split(',').map(p => p.trim()).filter(Boolean);

                const exposeMap = {};
                pairs.forEach(pair => {
                    let [from, to] = pair.split(/\s*(?:=>|as)\s*/).map(x => x.trim());
                    if (!to) to = from; // if no alias, keep same name
                    exposeMap[from] = to;
                });

                console.log(exposeMap);

                bindingsMap.push({
                    el,
                    type: "expose",
                    key: bindings.expose,
                    exposeMap, // 🟢 attach here
                    bindings
                });
            } catch (e) {
                console.warn("Invalid expose binding:", bindings.expose);
            }
        }
    }

    function withBinding(bindings, ctx, initialState, el, bindingsMap) {
        if (bindings.with) {
            const withKey = bindings.with.trim();

            // Create sub-context for the child
            const subCtx = { ...ctx };

            // Allocate object in parent state if not exists
            if (!(withKey in initialState)) {
                initialState[withKey] = {};
            }

            // Attach context marker
            el.setAttribute("data-with-owner", withKey);

            bindingsMap.push({
                el,
                type: "with",
                key: withKey,
                bindings
            });
        }
    }

    function foreachBinding(bindings, el, initialState, ctx) {
        if (bindings.foreach) {
            let arrayKey = bindings.foreach;
            let alias = null;

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
            const template = children[0].cloneNode(true);

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

            // Reactive Proxy
            initialState[arrayKey] = new Proxy(parsedArray, {
                get(target, prop, receiver) {
                    if (['push', 'splice', 'shift', 'unshift', 'pop', 'sort', 'reverse'].includes(prop)) {
                        return function (...args) {
                            const result = Array.prototype[prop].apply(target, args);
                            renderForeach(el, target, alias, template, arrayKey, initialState, ctx);
                            return result;
                        };
                    }
                    return Reflect.get(target, prop, receiver);
                },
                set(target, prop, value, receiver) {
                    const result = Reflect.set(target, prop, value, receiver);
                    renderForeach(el, target, alias, template, arrayKey, initialState, ctx);
                    return result;
                }
            });

            // Initial render
            renderForeach(el, initialState[arrayKey], alias, template, arrayKey, initialState, ctx);
        }
    }

    function submitBinding(bindings, bindingsMap, el) {
        if (bindings.submit) {
            bindingsMap.push({
                el,
                type: 'submit',
                key: bindings.submit, // either 'ajax' or 'default'
                bindings: bindings,
            });
        }
    }

    function attributeBinding(bindings, initialState, el, bindingsMap) {
        if (bindings.attr) {
            try {
                const cleaned = bindings.attr.trim().replace(/^\[|\]$/g, '').trim(); // removes [ ]
                const regex = /([\w.]+)\s*=>\s*([\w-]+)/g; // left = stateKey, right = attrName
                let match;

                while ((match = regex.exec(cleaned)) !== null) {
                    const stateKey = match[1]; // ✅ state first
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
    }

    function classBinding(bindings, initialState, el, bindingsMap) {
        if (bindings.class) {
            try {
                const cleaned = bindings.class.trim().replace(/^\[|\]$/g, '').trim(); // removes [ ]
                const regex = /([\w.]+)\s*=>\s*([\w-]+)/g; // left = stateKey, right = className
                let match;

                while ((match = regex.exec(cleaned)) !== null) {
                    const stateKey = match[1]; // ✅ state comes first now
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
    }

    function htmlBinding(bindings, bindingsMap, el, initialState) {
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
    }

    function visibleBinding(bindings, bindingsMap, el, initialState) {
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
                    initialState[bindings.visible] = true;
                }

            }
        }
    }

    function toggleBinding(bindings, bindingsMap, el, initialState) {
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
    }

    function applyText(el, key, type, state, subscribe) {
        if (type === 'text') {
            el.textContent = state[key];
            subscribe(key, val => {
                el.textContent = Array.isArray(val) ? val.join(', ') : val;
            });
            return;
        }
    }

    function textBinding(bindings, bindingsMap, el, initialState) {
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
                        initialState[bindings.text] = '';
                    }
                }
            }
        }
    }

    function applyValue(el, key, type, state, updateEvent, subscribe, keyUsageCount) {
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
    }

    function valueBinding(bindings, bindingsMap, el, keyUsageCount, initialState) {
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
    }

    function applySelect(el, key, type, state, update, subscribe) {
        // ✅ SELECT element
        if (type === 'value' && el instanceof HTMLSelectElement) {
            const eventToUse = update || 'change';

            el.value = state[key];

            el.addEventListener(eventToUse, e => {
                state[key] = e.target.value;
            });

            subscribe(key, val => {
                if (el.value !== val) el.value = val;
            });

            return;
        }
    }

    function applyTextArea(el, key, type, state, update, subscribe,) {
        // ✅ TEXTAREA element
        if (type === 'value' && el instanceof HTMLTextAreaElement) {
            const eventToUse = update || 'input';

            el.value = state[key];

            el.addEventListener(eventToUse, e => {
                state[key] = e.target.value;
            });

            subscribe(key, val => {
                if (el.value !== val) el.value = val;
            });

            return;
        }
    }

    function applyFocused(el, key, type, state, update, subscribe) {
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
    }

    function applyVisibile(el, key, type, state, update, subscribe) {
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
    }

    function applyReadOnly(el, key, type, state, update, subscribe) {
        if (type === 'readonly') {
            el.readOnly = !!state[key];
            subscribe(key, val => {
                el.readOnly = !!val;
            });
        }
    }

    function applyDisabled(el, key, type, state, update, subscribe) {
        if (type === 'disabled') {
            el.disabled = !!state[key];
            subscribe(key, val => {
                el.disabled = !!val;
            });
        }
    }

    function applyCheckboxToggle(el, key, type, state, update, subscribe, componentEl) {
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
    }

    function applyHtml(el, key, type, state, update, subscribe) {
        if (type === 'html') {
            // Initial render
            el.innerHTML = state[key];

            // Subscribe to future changes
            subscribe(key, val => {
                el.innerHTML = val;
            });

            return;
        }
    }

    function applyClass(el, key, type, state, update, subscribe) {
        if (type === 'class') {
            try {
                const cleaned = key.trim().replace(/^\[|\]$/g, '').trim();
                const pairs = cleaned.split(',').map(pair => pair.trim());

                for (const pair of pairs) {
                    const [stateKey, className] = pair.split(/\s*=>\s*/); // ✅ swapped

                    if (!stateKey || !className) continue;

                    // Apply initial state
                    el.classList.toggle(className, !!state[stateKey]);

                    // Subscribe for updates
                    subscribe(stateKey, (val) => {
                        el.classList.toggle(className, !!val);
                    });
                }
            } catch (e) {
                console.warn('Invalid class binding:', key);
            }

            return;
        }
    }

    function applyAttribute(el, key, type, state, update, subscribe) {
        if (type === 'attr') {
            try {
                const cleaned = key.trim().replace(/^\[|\]$/g, '').trim();
                const pairs = cleaned.split(',').map(pair => pair.trim());

                for (const pair of pairs) {
                    const [stateKey, attrName] = pair.split(/\s*=>\s*/); // ✅ swapped

                    if (!stateKey || !attrName) continue;

                    // Initial set
                    el.setAttribute(attrName, state[stateKey] ?? '');

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
    }

    function applySubmit(el, key, type, state, update, subscribe) {
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
    }

    function applyForeach(el, key, type, state, update, subscribe) {
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

                    /*
                    Object.entries(bindInfo).forEach(([bType, bKey]) => {
                        let finalKey = bKey;

                        // Support alias: "alias.someProp" → item.someProp
                        if (alias && finalKey.startsWith(alias + '.')) {
                            finalKey = finalKey.replace(alias + '.', '');
                        }

                        if (bType === 'text') {
                            bindEl.textContent = item[finalKey];
                        }
                        if (bType === 'value' && bindEl instanceof HTMLInputElement) {
                            bindEl.value = item[finalKey];
                            if (bindEl.type === 'checkbox') {
                                bindEl.checked = !!item[finalKey];
                            }
                        }
                    });
                    */

                });

                parent.appendChild(clone);
            });

            return;
        }
    }

    function applyWith(el, key, type, state, update, subscribe) {
        if (type === "with") {
            const subKey = data.key;
            const subState = {}; // child context

            // Attach Proxy so child updates notify parent
            initialState[subKey] = new Proxy(subState, {
                set(target, prop, value) {
                    const result = Reflect.set(target, prop, value);
                    // Re-render logic can be added if needed
                    return result;
                }
            });

            return;
        }
    }

    function applyExpose(el, key, type, state, update, subscribe) {
        if (type === "expose") {
            const exposeMap = data.exposeMap;  // will always exist now
            if (!exposeMap || Object.keys(exposeMap).length === 0) return;

            const parentKey = el.closest("[data-with-owner]")?.getAttribute("data-with-owner");
            if (!parentKey) return;

            const parentObj = initialState[parentKey];

            Object.entries(exposeMap).forEach(([childProp, parentProp]) => {
                Object.defineProperty(parentObj, parentProp, {
                    get: () => state[childProp],
                    set: (val) => { state[childProp] = val; },
                    enumerable: true,
                    configurable: true
                });
            });
            return;
        }
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

            valueBinding(bindings, bindingsMap, el, keyUsageCount, initialState);
            textBinding(bindings, bindingsMap, el, initialState);
            toggleBinding(bindings, bindingsMap, el, initialState);
            visibleBinding(bindings, bindingsMap, el, initialState);
            htmlBinding(bindings, bindingsMap, el, initialState);
            classBinding(bindings, initialState, el, bindingsMap);
            attributeBinding(bindings, initialState, el, bindingsMap);
            submitBinding(bindings, bindingsMap, el);
            eventBinding(bindings, bindingsMap, el);
            foreachBinding(bindings, el, initialState, ctx);
            withBinding(bindings, ctx, initialState, el, bindingsMap);
            exportBinding(bindings, bindingsMap, el);
        });

        const { state, subscribe } = createReactiveState(initialState);
        componentEl.$state = state;

        // Second pass: bind all
        bindingsMap.forEach((data) => {

            let { el, updateEvent, bindings } = data;

            Object.entries(bindings).forEach(([type, key]) => {
                applyText(el, key, type, state, subscribe)
                applyValue(el, key, type, state, updateEvent, subscribe, keyUsageCount)
                applySelect(el, key, type, state, updateEvent, subscribe)
                applyTextArea(el, key, type, state, updateEvent, subscribe);
                applyFocused(el, key, type, state, updateEvent, subscribe)
                applyVisibile(el, key, type, state, updateEvent, subscribe)
                applyReadOnly(el, key, type, state, updateEvent, subscribe)
                applyDisabled(el, key, type, state, updateEvent, subscribe)
                applyCheckboxToggle(el, key, type, state, updateEvent, subscribe, componentEl)
                applyHtml(el, key, type, state, updateEvent, subscribe)
                applyClass(el, key, type, state, updateEvent, subscribe)
                applyAttribute(el, key, type, state, updateEvent, subscribe)
                applySubmit(el, key, type, state, updateEvent, subscribe)
                applyEvent(el, key, type, state, updateEvent, subscribe, componentEl)
                applyForeach(el, key, type, state, updateEvent, subscribe)
                applyWith(el, key, type, state, updateEvent, subscribe)
                applyExpose(el, key, type, state, updateEvent, subscribe)
            });
        });
    }

    window.jsRibbonState = {
        init: initializeStateBindings,
        enhanceForm,            // ← add these
        applySwap
    };
})();
