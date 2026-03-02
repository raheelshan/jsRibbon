function enhanceForm({
    formId,
    targetId,
    method = null,
    swap = "innerHTML",
    beforeSend = null,
    onSuccess = null,
    onError = null
}) {
    const form = document.getElementById(formId);
    const target = document.getElementById(targetId) || form.closest('[data-bind*="component:"]');

    if (!form || !target) {
        console.warn("Invalid formId or targetId passed.");
        return;
    }

    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        if (typeof beforeSend === "function") {
            beforeSend(form);
        }

        const formData = new FormData(form);
        const reqMethod = method || form.method || "POST";

        try {
            const response = await fetch(form.action, {
                method: reqMethod.toUpperCase(),
                headers: {
                    'X-Requested-With': 'fetch',
                },
                body: formData
            });

            const contentType = response.headers.get("content-type") || "";
            let result;

            if (contentType.includes("application/json")) {
                result = await response.json();
            } else {
                result = await response.text();
            }

            if (response.ok) {
                if (typeof onSuccess === "function") {
                    onSuccess(result);
                } else {
                    applySwap(target, result, swap);
                }
            } else {
                if (typeof onError === "function") {
                    onError(result, response.status);
                } else {
                    applySwap(target, `<strong>Error:</strong> ${response.status}`, swap);
                }
            }
        } catch (err) {
            if (typeof onError === "function") {
                onError(err.message, 0);
            } else {
                applySwap(target, `<strong>Network Error:</strong> ${err.message}`, swap);
            }
        }
    });
}

function applySwap(target, content, swap) {

    console.log(target, content, swap)

    switch (swap) {
        case "outerHTML":
            target.outerHTML = content;
            break;
        case "append":
            target.insertAdjacentHTML("beforeend", content);
            break;
        case "prepend":
            target.insertAdjacentHTML("afterbegin", content);
            break;
        case "innerHTML":
        default:
            target.innerHTML = content;
    }
}

(function () {

    function textBinding(bindings, bindingsMap, el, initialState) {
        let { text } = bindings;

        if (text) {
            bindingsMap.push({
                el,
                type: 'text',
                key: text,
                bindings: bindings
            });
            if (!(text in initialState)) {
                const textVal = el.textContent.trim();
                if (textVal) {
                    if (!isInsideLoopOrWith(el)) {
                        initialState[text] = textVal;
                    }
                } else {
                    if (!isInsideLoopOrWith(el)) {
                        initialState[text] = '';
                    }
                }
            }
        }
    }

    function applyText(el, key, type, state, subscribe) {
        if (type === 'text') {

            const parts = key.split('.');

            if (parts.length > 1) {
                ({ state, subscribe, key } = resolvePath(el, key) || { state, subscribe, key });
            }

            el.textContent = state[key];

            subscribe(key, val => {
                el.textContent = Array.isArray(val) ? val.join(', ') : val;
            });

            return;
        }
    }

    function valueBinding(bindings, bindingsMap, el, keyUsageCount, initialState) {

        let { value, update } = bindings;

        if (value) {
            bindingsMap.push({
                el,
                type: 'value',
                key: value,
                updateEvent: update || null,
                bindings: bindings
            });
            keyUsageCount[value] = (keyUsageCount[value] || 0) + 1;

            // Initialize value
            if (!(value in initialState)) {
                let val;
                if (el.type === 'checkbox') {
                    val = keyUsageCount[value] > 1 ? [] : !!el.checked;
                } else if (el.type === 'radio') {
                    if (el.checked) val = el.value;

                } else if (el.type === 'number') {
                    const num = parseFloat(el.value);
                    val = isNaN(num) ? '' : num;
                } else {
                    val = el.value;
                }

                if (!isInsideLoopOrWith(el)) {
                    initialState[value] = val;
                }

            } else {
                // If this key already came from a text binding but we have an input with value
                // → override it according to your priority
                if (el.value && el.value.trim()) {
                    if (!isInsideLoopOrWith(el)) {
                        initialState[value] = el.value;
                    }
                }
            }
        }
    }

    function splitBindings(input) {
        let result = [];
        let current = '';
        let depth = 0;

        for (let i = 0; i < input.length; i++) {
            let char = input[i];
            if (char === '[') {
                depth++;
                current += char;
            } else if (char === ']') {
                depth--;
                current += char;
            } else if (char === ',' && depth === 0) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        if (current.trim()) result.push(current.trim());
        return result;
    }

    function parseKeyValue(str) {
        let idx = str.indexOf(':');
        if (idx === -1) return [str.trim(), null];
        return [str.slice(0, idx).trim(), str.slice(idx + 1).trim()];
    }

    function extractBindings(bindings) {
        let refs = [];
        let names = [];

        bindings.forEach(binding => {
            let [key, value] = parseKeyValue(binding);

            if (key === 'value') {
                refs.push(value);
                names.push(key); // "value"
            }
            else if (key === 'click') {
                // prepend parent context if missing dot
                if (!value.includes('.')) refs.push('cart.' + value);
                else refs.push(value);
                names.push(key); // "click"
            }
            else if (key === 'class' || key === 'attr') {
                let inner = value.replace(/^\[|\]$/g, '').trim();
                let parts = splitBindings(inner);
                parts.forEach(p => {
                    let [from, to] = p.split('=>').map(x => x.trim());
                    refs.push(from);
                    names.push(to); // take right-hand DOM binding
                });
            }
            else if (key === 'foreach') {
                let inner = value.replace(/^\[|\]$/g, '').trim();
                let parts = splitBindings(inner);
                parts.forEach(p => {
                    let [k, v] = parseKeyValue(p);
                    if (k === 'data') {
                        refs.push(v);
                        names.push(key); // "foreach"
                    }
                });
            }
        });

        return { refs, names };
    }

    function applyValue(el, key, type, state, updateEvent, subscribe, keyUsageCount) {

        if (type === 'value' && el instanceof HTMLInputElement) {

            const parts = key.split('.');

            if (parts.length > 1) {
                ({ state, subscribe, key } = resolvePath(el, key) || { state, subscribe, key });
            }

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

            /*
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
            */
            if (inputType === 'radio') {
                const radioValue = el.value;

                // 👇 Automatically scope name within the component
                if (el.closest('[data-bind*="component:"]')) {
                    const compEl = el.closest('[data-bind*="component:"]');
                    const originalName = el.getAttribute('name') || key;
                    const scopedName = `${originalName}_${compEl.$id}`;
                    el.setAttribute('name', scopedName);
                }

                // --- 1. Initialize from checked attribute ---
                if (!(key in state) && el.checked) {
                    state[key] = radioValue;
                }

                // --- 2. Reflect state into DOM ---
                el.checked = state[key] === radioValue;

                // --- 3. When user changes ---
                el.addEventListener(eventToUse, () => {
                    if (el.checked) state[key] = radioValue;
                });

                // --- 4. Reactively sync ---
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

    function toTitleCase(str) {
        return str
            // Insert space before each uppercase letter (e.g. classChecker → class Checker)
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            // Split by space or underscore
            .split(/[\s_]+/)
            // Capitalize each word
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            // Join without spaces to form TitleCase
            .join('');
    }

    function resolvePath(componentEl, fullKey) {

        const parts = fullKey.split('.');

        if (parts.length > 1) {

            const parentContext = toTitleCase(parts[0]);
            const binding = parts[1];

            let parent = componentEl.parentElement;

            while (parent) {
                if (parent.$state && parent.getAttribute('data-bind')?.includes(`component:${parentContext}`)) {
                    return { state: parent.$state, subscribe: parent.$subscribe, key: binding };
                }
                parent = parent.parentElement;
            }

            throw new Error(`Context "${parentContext}" not found for binding "${fullKey}"`);
        }
    }

    function resolveMethod(componentEl, fullKey) {
        const parts = fullKey.split('.');
        if (parts.length === 1) {
            return componentEl.$ctx?.[parts[0]];
        }

        const parentContext = toTitleCase(parts[0]);
        const methodName = parts[1];
        let parent = componentEl.parentElement;

        while (parent) {
            if (parent.$state && parent.getAttribute('data-bind')?.includes(`component:${parentContext}`)) {
                return parent.$ctx[methodName];
            }
            parent = parent.parentElement;
        }

        return undefined;
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

    function renderForeach(el, items, alias, template, arrayKey, state) {

        // resolve nested context every time we render
        if (arrayKey.includes('.')) {
            const resolved = resolvePath(el, arrayKey);
            if (!resolved) {
                console.warn('Could not resolve foreach data:', arrayKey);
                return;
            }

            state = resolved.state;
            const key = resolved.key;
            items = state[key];
            arrayKey = key; // so data-foreach-owner isn't "layout.users"
        }

        // console.log(el)


        el.innerHTML = ''; // clear

        items.forEach((item, index) => {
            const clone = template.cloneNode(true);
            // mark ownership for remove/etc.
            // after creating clone and before appending it:
            clone.setAttribute('data-key', index);
            clone.setAttribute('data-foreach-owner', arrayKey);

            // if (alias) clone.setAttribute('data-foreach-alias', alias);

            // // attach runtime references (not attributes) for fast lookup
            // clone._foreach_ownerArray = items;            // the array instance (items param)
            // clone._foreach_ownerArrayName = arrayKey;     // e.g. "users"
            // clone._foreach_ownerState = state;            // authoritative state object that owns the array
            // clone._foreach_ownerSubscribe = (typeof state?.$subscribe === 'function')
            //     ? state.$subscribe
            //     : (typeof state?.subscribe === 'function' ? state.subscribe : null);
            /*
            */

            // bind all inner elements
            // const bindables = clone.querySelectorAll('[data-bind]');

            let bindables = [];

            if (clone.hasAttribute('data-bind')) {
                bindables.push(clone);
            }

            bindables = bindables.concat(Array.from(clone.querySelectorAll('[data-bind]')));            

            bindables.forEach(bindEl => {
                const bindInfo = parseBindings(bindEl.getAttribute('data-bind'));

                // console.log(bindEl);

                for (let [bType, bKey] of Object.entries(bindInfo)) {

                    // ✅ handle alias — if alias exists, allow row.firstName or firstName

                    let value;

                    if (alias && bKey.startsWith(alias + '.')) {
                        // e.g. bKey = "row.firstName"
                        const keyPart = bKey.split('.').slice(1).join('.');

                        value = item[keyPart];
                    } else {
                        // fallback: direct key like "firstName"
                        value = item[bKey];
                    }

                    // apply value
                    if (bType === 'text') {
                        bindEl.textContent = value ?? '';
                    }
                    if (bType === 'value' && bindEl instanceof HTMLInputElement) {
                        bindEl.value = value ?? '';
                        if (bindEl.type === 'checkbox') bindEl.checked = !!value;
                    }
                }
            });

            el.appendChild(clone);
        });
    }

    function resolveForeachBinding(bindings) {
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
                return;
            }
        }

        return { arrayKey, alias }

    }

    function resolveForeachParentContext(el, initialState, arrayKey) {
        let targetState = initialState;
        let finalKey = arrayKey;
        let originalKey = arrayKey;

        if (arrayKey.includes('.')) {
            // resolvePath returns { state, subscribe, key } for "layout.users"
            const resolved = resolvePath(el, arrayKey);
            if (!resolved) {
                console.warn('Could not resolve foreach data:', arrayKey);
                return;
            }
            targetState = resolved.state;
            finalKey = resolved.key; // e.g. "users"
        }

        return { targetState, finalKey, originalKey }

    }

    function getForeachMarkup(el, finalKey) {
        let children = Array.from(el.children || []);

        let template = null;

        if (children && children.length > 0) {
            let tag = children[0];

            if (tag.tagName === 'TEMPLATE') {
                // The .content is a DocumentFragment holding the real nodes
                const fragment = tag.content.cloneNode(true);
                // If you specifically need the first element (like <tr>)
                const node = fragment.firstElementChild;

                if (!node) {
                    throw new Error(`Empty <template> in foreach binding "${finalKey}"`);
                }

                template = node; // assign the actual usable element
                template.setAttribute('data-template-origin', finalKey);

                // ❌ remove <template> from the DOM so it's not rendered
                tag.remove();
            } else {
                // If not a template, just clone the existing node
                template = tag.cloneNode(true);
            }
        } else {
            throw new Error(`Markup not found for foreach binding "${finalKey}"`);
        }

        // Refresh children, excluding <template>
        children = Array.from(el.children || []).filter(c => c.tagName !== 'TEMPLATE');

        return { children, template };
    }

    function getForeachProxy(el, arr, alias, template, finalKey, targetState) {
        return new Proxy(arr, {
            get(target, prop, receiver) {
                if (['push', 'splice', 'shift', 'unshift', 'pop', 'sort', 'reverse'].includes(prop)) {
                    return function (...args) {
                        const result = Array.prototype[prop].apply(target, args);
                        // on mutation, re-render using finalKey and the authoritative state (targetState)
                        renderForeach(el, targetState[finalKey], alias, template, finalKey, targetState);
                        return result;
                    };
                }
                return Reflect.get(target, prop, receiver);
            },
            set(target, prop, value, receiver) {
                const result = Reflect.set(target, prop, value, receiver);
                renderForeach(el, targetState[finalKey], alias, template, finalKey, targetState);
                return result;
            }
        });
    }

    function getParsedForeachArray(children, state) {
        let arr = Array.isArray(state) ? state : null;

        if (!arr) {
            // parse existing DOM children into plain array
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

            arr = parsedArray;
        }

        return arr;
    }

    function foreachBinding(bindings, el, initialState, bindingsMap) {
        if (!bindings.foreach) return;

        // 1) parse config [ data: foo, as: alias ]
        let { arrayKey, alias } = resolveForeachBinding(bindings)

        // 2) resolve parent context if dotted (e.g. "layout.users")
        let { targetState, finalKey, originalKey } = resolveForeachParentContext(el, initialState, arrayKey);

        // 3) build template and initial parsed array from DOM if parent has no array yet
        let { children, template } = getForeachMarkup(el, finalKey);

        // 4) If parent state already has an array, use it; otherwise parse DOM and set it
        let arr = getParsedForeachArray(children, targetState[finalKey]);

        // 5) wrap the array with a Proxy that re-renders after mutating operations and store proxied array back into the authoritative state (parent or local)
        targetState[finalKey] = getForeachProxy(el, arr, alias, template, finalKey, targetState);

        bindingsMap.push({
            el,
            type: 'foreach',
            key: finalKey,
            bindings: bindings,
            finalKey: finalKey,
            alias,
            template,
            targetState,
            originalKey
        });
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

    function applySelect(el, key, type, state, update, subscribe) {
        if (type === 'value' && el instanceof HTMLSelectElement) {
            const parts = key.split('.');
            if (parts.length > 1) {
                ({ state, subscribe, key } = resolvePath(el, key) || { state, subscribe, key });
            }

            const eventToUse = update || 'change';

            // Helper to set selected options from value(s)
            const setSelected = (val) => {
                if (el.multiple) {
                    const values = Array.isArray(val) ? val.map(String) : [];
                    for (const option of el.options) {
                        option.selected = values.includes(option.value);
                    }
                } else {
                    el.value = val ?? '';
                }
            };

            // Initial set
            setSelected(state[key]);

            // On change → update state
            el.addEventListener(eventToUse, () => {
                if (el.multiple) {
                    const selected = Array.from(el.selectedOptions, o => o.value);
                    state[key] = selected;
                } else {
                    state[key] = el.value;
                }
            });

            // Subscribe to reactive updates
            subscribe(key, val => {
                setSelected(val);
            });

            return;
        }
    }

    function applyTextArea(el, key, type, state, update, subscribe,) {
        // ✅ TEXTAREA element
        if (type === 'value' && el instanceof HTMLTextAreaElement) {

            const parts = key.split('.');

            // context havng event not done yet 
            if (parts.length > 1) {
                ({ state, subscribe, key } = resolvePath(el, key) || { state, subscribe, key });
            }

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

    function applyFocused(el, key, type, state, subscribe) {
        if (type === 'focused') {

            const parts = key.split('.');

            if (parts.length > 1) {
                ({ state, subscribe, key } = resolvePath(el, key) || { state, subscribe, key });
            }

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

    function applyVisibile(el, key, type, state, subscribe) {
        if (type === 'visible') {

            const parts = key.split('.');

            if (parts.length > 1) {
                ({ state, subscribe, key } = resolvePath(el, key) || { state, subscribe, key });
            }

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

    function applyReadOnly(el, key, type, state, subscribe) {
        if (type === 'readonly') {

            const parts = key.split('.');

            if (parts.length > 1) {
                ({ state, subscribe, key } = resolvePath(el, key) || { state, subscribe, key });
            }

            el.readOnly = !!state[key];
            subscribe(key, val => {
                el.readOnly = !!val;
            });

        }
    }

    function applyDisabled(el, key, type, state, subscribe) {
        if (type === 'disabled') {

            const parts = key.split('.');

            if (parts.length > 1) {
                ({ state, subscribe, key } = resolvePath(el, key) || { state, subscribe, key });
            }

            el.disabled = !!state[key];

            subscribe(key, val => {
                el.disabled = !!val;
            });
        }
    }

    function applyCheckboxToggle(el, key, type, state, subscribe, componentEl) {
        // ✅ Select-All checkbox logic
        if (type === 'toggle' && el instanceof HTMLInputElement && el.type === 'checkbox') {

            const parts = key.split('.');

            if (parts.length > 1) {
                ({ state, subscribe, key } = resolvePath(el, key) || { state, subscribe, key });
            }

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

    function applyHtml(el, key, type, state, subscribe) {
        if (type === 'html') {

            const parts = key.split('.');

            if (parts.length > 1) {
                ({ state, subscribe, key } = resolvePath(el, key) || { state, subscribe, key });
            }

            // Initial render
            el.innerHTML = state[key];

            // Subscribe to future changes
            subscribe(key, val => {
                el.innerHTML = val;
            });

            return;
        }
    }

    function applyClass(el, key, type, state, subscribe) {
        if (type === 'class') {

            const parts = key.split('.');

            if (parts.length > 1) {

                let bindings = splitBindings(`${type}:${key}`);
                let { refs: finalBindings, names: bindingNames } = extractBindings(bindings);

                finalBindings.forEach((current, index) => {

                    let result = resolvePath(el, current);

                    let { state: targetState, subscribe: targetSubscribe, key: finalKey } = result;

                    let className = bindingNames[index];

                    try {
                        // Apply initial state
                        el.classList.toggle(className, !!targetState[finalKey]);

                        // Subscribe for updates
                        targetSubscribe(finalKey, (val) => {
                            el.classList.toggle(className, !!val);
                        });
                    } catch (e) {
                        console.warn('Invalid class binding:', key);
                    }
                })
            }

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

    function applyAttribute(el, key, type, state, subscribe) {
        if (type === 'attr') {

            const parts = key.split('.');

            if (parts.length > 1) {

                let bindings = splitBindings(`attr:${key}`);
                let { refs: finalBindings, names: bindingNames } = extractBindings(bindings);

                finalBindings.forEach((current, index) => {
                    let result = resolvePath(el, current);
                    let { state: targetState, subscribe: targetSubscribe, key: finalKey } = result;

                    try {

                        let attrName = bindingNames[index];

                        // Initial set
                        el.setAttribute(attrName, targetState[finalKey] ?? '');

                        // Reactive
                        targetSubscribe(finalKey, val => {
                            el.setAttribute(attrName, val ?? '');
                        });

                    } catch (e) {
                        console.warn('Invalid attr binding:', key);
                    }
                })

                return;
            }

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

    function applySubmit(el, key, type, bindings, componentEl) {
        if (type === 'submit' && el instanceof HTMLFormElement) {

            const parts = key.split('.');

            if (parts.length > 1) {
                ({ key } = resolvePath(el, key) || { key });
            }

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

    function applyForeach(el, type, state, data) {
        if (!(type === 'foreach')) {
            return;
        }
        let { alias, template, finalKey, originalKey, targetState } = data;

        if (originalKey.includes('.')) {
            // resolvePath returns { state, subscribe, key } for "layout.users"
            const resolved = resolvePath(el, originalKey);
            if (!resolved) {
                console.warn('Could not resolve foreach data:', originalKey);
                return;
            }
            state = resolved.state;
            finalKey = resolved.key; // e.g. "users"
        }

        renderForeach(el, targetState[finalKey], alias, template, originalKey, state);
    }

    function initializeStateBindings(componentEl, context = {}) {
        const ctx = componentEl.$ctx || context || {};
        const bindingsMap = [];
        const initialState = {};
        const keyUsageCount = {};

        const allBindings = componentEl.querySelectorAll('[data-bind]');
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

            textBinding(bindings, bindingsMap, el, initialState);
            valueBinding(bindings, bindingsMap, el, keyUsageCount, initialState);
            toggleBinding(bindings, bindingsMap, el, initialState);
            visibleBinding(bindings, bindingsMap, el, initialState);
            htmlBinding(bindings, bindingsMap, el, initialState);
            classBinding(bindings, initialState, el, bindingsMap);
            attributeBinding(bindings, initialState, el, bindingsMap);
            submitBinding(bindings, bindingsMap, el);
            foreachBinding(bindings, el, initialState, bindingsMap);
        });

        const { state, subscribe } = createReactiveState(initialState);
        componentEl.$state = state;
        componentEl.$subscribe = subscribe;   // ✅ store it here

        // Second pass: bind all
        bindingsMap.forEach((data) => {

            let { el, updateEvent, bindings } = data;

            Object.entries(bindings).forEach(([type, key]) => {
                applyText(el, key, type, state, subscribe) // done
                applyValue(el, key, type, state, updateEvent, subscribe, keyUsageCount)
                applySelect(el, key, type, state, updateEvent, subscribe)
                applyTextArea(el, key, type, state, updateEvent, subscribe);
                applyFocused(el, key, type, state, subscribe)
                applyVisibile(el, key, type, state, subscribe)
                applyReadOnly(el, key, type, state, subscribe)
                applyDisabled(el, key, type, state, subscribe)
                applyCheckboxToggle(el, key, type, state, subscribe, componentEl)
                applyHtml(el, key, type, state, subscribe)
                applyClass(el, key, type, state, subscribe)
                applyAttribute(el, key, type, state, subscribe)
                applySubmit(el, key, type, bindings, componentEl)
                applyForeach(el, type, state, data, ctx)
            });
        });
    }

    window.jsRibbonState = {
        init: initializeStateBindings,
        parseBindings,
        resolveMethod,
        enhanceForm,            // ← add these
        applySwap
    };
})();

(function () {
    let componentMap = new Map();            // { Counter: [el1, el2] }
    let initializedElements = new WeakSet(); // Track registered elements
    let componentKeys = new Set();           // Prevent duplicate by key
    let autoRegister = true;
    let hardFail = false; // ⬅️ hard fail stops everything

    const componentMarkupRegistry = new Map();

    function normalizeMarkup(html) {
        return html
            .replace(/\s+/g, ' ')
            .replace(/>\s+</g, '><')
            .trim();
    }

    // ---------- jsRibbon binding parser (supports "as" for alias, "=>" for mapping) ----------
    function splitTopLevel(s) {
        if (!s || typeof s !== 'string') return [];
        const parts = [];
        let cur = '', depth = 0, quote = null;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (quote) {
                cur += ch;
                if (ch === quote && s[i - 1] !== '\\') quote = null;
                continue;
            }
            if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
            if (ch === '[' || ch === '{' || ch === '(') { depth++; cur += ch; continue; }
            if (ch === ']' || ch === '}' || ch === ')') { depth = Math.max(0, depth - 1); cur += ch; continue; }
            if (ch === ',' && depth === 0) { if (cur.trim()) parts.push(cur.trim()); cur = ''; continue; }
            cur += ch;
        }
        if (cur.trim()) parts.push(cur.trim());
        return parts;
    }

    function stripQuotes(s) {
        return (s || '').replace(/^\s*['"]?|['"]?\s*$/g, '').trim();
    }

    // parse a single token in a bracket list
    // returns { kind: 'alias'|'map'|'plain'|'wildcard', source, target }
    function parseListToken(token) {
        const t = token.trim();
        if (!t) return null;

        // wildcard
        if (/^\*$/i.test(t) || /^['"]\*['"]$/.test(t)) {
            return { kind: 'wildcard' };
        }

        // "as" alias:  left as right   (aliasing: left = source name, right = alias name)
        const asMatch = t.match(/^(.+?)\s+as\s+(.+)$/i);
        if (asMatch) {
            return { kind: 'alias', source: stripQuotes(asMatch[1]), target: stripQuotes(asMatch[2]) };
        }

        // mapping "=>" : left => right  (mapping: left = source observable, right = target DOM name)
        const mapMatch = t.match(/^(.+?)\s*=>\s*(.+)$/);
        if (mapMatch) {
            return { kind: 'map', source: stripQuotes(mapMatch[1]), target: stripQuotes(mapMatch[2]) };
        }

        // fallback: maybe "key: value" inside list (support legacy forms like "data: fruits")
        const colonMatch = t.match(/^(.+?)\s*:\s*(.+)$/);
        if (colonMatch) {
            // treat as map with left=rhs? or left=rhs? We'll keep RHS as the "source value"
            // To be consistent with "left = source" rule, interpret "key: value" as (source=value, target=key)
            // i.e. "data: fruits" -> source: "fruits", target: "data"
            return { kind: 'map', source: stripQuotes(colonMatch[2]), target: stripQuotes(colonMatch[1]) };
        }

        // plain token: source and target are the same name (e.g., expose:[ firstName ])
        const id = stripQuotes(t);
        return { kind: 'plain', source: id, target: id };
    }

    // parse a bracket expression like "[ firstName as fName, lastName ]"
    function parseBracketExpression(raw) {
        const inner = raw.replace(/^\s*\[|\]\s*$/g, '').trim();
        if (inner === '') return { type: 'list', items: [] };
        const parts = splitTopLevel(inner);
        const items = [];
        let hasWildcard = false;
        for (const p of parts) {
            const token = parseListToken(p);
            if (!token) continue;
            if (token.kind === 'wildcard') { hasWildcard = true; continue; }
            items.push(token);
        }
        if (hasWildcard) return { type: 'wildcard', items };
        return { type: 'list', items };
    }

    // parse a single binding value (could be bracketed list or plain ident)
    function parseBindingValue(raw) {
        if (raw == null) return { type: 'raw', raw: '' };
        const s = raw.trim();
        if (!s) return { type: 'raw', raw: '' };

        // bracket expression
        if (s[0] === '[' && s[s.length - 1] === ']') {
            return parseBracketExpression(s);
        }

        // quoted or unquoted single ident: "firstName" or 'firstName' or user.name
        return { type: 'ident', name: stripQuotes(s) };
    }

    // public parse function: "text:accepted, class:[ isHidden => hidden ]"
    function parseDataBind(attr) {
        const out = {};
        if (!attr || typeof attr !== 'string') return out;
        const entries = splitTopLevel(attr);

        for (const e of entries) {
            // find top-level ':' that separates bindingName : bindingValue
            // we deliberately allow only top-level colon (not inside brackets)
            let idx = -1, depth = 0, quote = null;
            for (let i = 0; i < e.length; i++) {
                const ch = e[i];
                if (quote) {
                    if (ch === quote && e[i - 1] !== '\\') quote = null;
                    continue;
                }
                if (ch === '"' || ch === "'") { quote = ch; continue; }
                if (ch === '[' || ch === '{' || ch === '(') { depth++; continue; }
                if (ch === ']' || ch === '}' || ch === ')') { depth = Math.max(0, depth - 1); continue; }
                if (ch === ':' && depth === 0) { idx = i; break; }
            }
            if (idx === -1) {
                // bare token: treat as literal enable flag
                out[e.trim()] = { type: 'literal', value: true };
                continue;
            }
            const key = e.slice(0, idx).trim();
            const valRaw = e.slice(idx + 1).trim();
            out[key] = parseBindingValue(valRaw);
        }

        return out;
    }

    function parseDataset(dataset) {
        const parsed = {};

        for (const [key, value] of Object.entries(dataset)) {
            if (value === "true") parsed[key] = true;
            else if (value === "false") parsed[key] = false;
            else if (value === "null") parsed[key] = null;
            else if (!isNaN(value) && value.trim() !== "") parsed[key] = +value;
            else if (/^{.*}$/.test(value) || /^\[.*\]$/.test(value)) {
                try { parsed[key] = JSON.parse(value); }
                catch { parsed[key] = value; } // fallback if malformed
            }
            else parsed[key] = value;
        }

        return parsed;
    }

    function getComponentNameFrom(el) {
        const dataBind = el.getAttribute?.('data-bind')?.trim();
        const parsed = parseDataBind(dataBind || '');
        return parsed.component || null;
    }

    function getComponentInfo(el) {
        const dataBind = el.getAttribute?.('data-bind')?.trim();
        const parsed = parseDataBind(dataBind || '');
        return parsed;
    }

    function findParentComponent(el, parentName) {
        let current = el.parentElement;
        while (current) {
            const name = getComponentNameFrom(current);
            if (name === parentName) return current;
            current = current.parentElement;
        }
        return null;
    }

    function hasExpectedParent(el, expectedParent) {
        let parent = el.parentElement;
        while (parent) {
            const dataBind = parent.getAttribute?.('data-bind')?.trim();
            if (dataBind) {
                const match = dataBind.match(/component\s*:\s*([\w-]+)/i);
                if (match && match[1] === expectedParent) {
                    return true;
                }
            }
            parent = parent.parentElement;
        }
        return false;
    }

    function registerComponent(el) {
        if (initializedElements.has(el)) return;

        const info = getComponentInfo(el);
        const componentInfo = info.component;
        const key = el.getAttribute?.('data-key');

        if (!componentInfo) return;

        const { type, name } = componentInfo;

        // 🧠 Check for markup consistency among same-named components
        if (type === 'ident' && name) {
            const currentMarkup = normalizeMarkup(el.innerHTML);
            if (componentMarkupRegistry.has(name)) {
                const storedMarkup = componentMarkupRegistry.get(name);
                if (storedMarkup !== currentMarkup) {
                    const message =
                        `❌ JS Ribbon Error: Component "${name}" detected with multiple markup structures.\n` +
                        `→ Ensure backend uses consistent HTML for this component.\n` +
                        `⚠️ Offending element:`;

                    if (window.jsRibbon.hardFail) {
                        // 🚨 Hard fail: stop everything
                        throw new Error(message, { cause: el });
                        return; // ⬅️ Skip binding for this component
                    } else {
                        // ⚠️ Soft fail: warn and skip only this component
                        console.warn(message, el);
                    }
                }
            } else {
                componentMarkupRegistry.set(name, currentMarkup);
            }
        }


        if (type != 'ident') return;

        // Prevent duplicate by key
        if (key) {
            const mapKey = `${name}:${key}`;
            if (componentKeys.has(mapKey)) {
                console.log(`⚠️ Duplicate component "${name}" with key "${key}" skipped.`, el);
                return;
            }
            componentKeys.add(mapKey);
        }

        // Parent check
        if (info.parent) {
            const hasParent = hasExpectedParent(el, info.parent);
            if (!hasParent) {
                console.warn(`⚠️ Component "${name}" is missing expected parent "${info.parent}".`, el);
            }
        }

        if (!componentMap.has(name)) {
            componentMap.set(name, []);
        }

        componentMap.get(name).push(el);
        initializedElements.add(el);

        // if (!el.$id) {
        //     el.$id = Math.random().toString(36).slice(2, 10);
        //     el.setAttribute('data-comp-id', el.$id);
        // }

        // ✅ 1. Initialize state
        // Initialize the state first
        if (window.jsRibbonState?.init) {
            window.jsRibbonState.init(el, el.$context);
        }

        // ✅ 2. Register component methods after state is ready
        const def = window.jsRibbon.components?.[name];

        if (typeof def === 'function') {
            try {
                const ctx = def(el.$state, el) || {};
                el.$ctx = ctx;

                // install delegated event handling once per component
                if (!el._delegatedEventsInstalled) {
                    el._delegatedEventsInstalled = true;

                    const supportedEvents = [
                        'click', 'dblclick', 'mouseenter', 'mouseleave',
                        'mouseover', 'mouseout', 'mousedown', 'mouseup',
                        'keydown', 'keyup', 'keypress', 'input', 'change', 'focus', 'blur', 'contextmenu'
                    ];

                    supportedEvents.forEach(evt => {
                        el.addEventListener(evt, e => {
                            const target = e.target.closest('[data-bind]');
                            if (!target || !el.contains(target)) return;

                            // Parse binding string on the element
                            const bindInfo = window.jsRibbonState.parseBindings(target.getAttribute('data-bind') || '');
                            const handlerName = bindInfo[evt];
                            if (!handlerName) return;

                            // Special case: built-in remove
                            if (evt === 'click' && handlerName === 'removeItem') {
                                const row = target.closest('[data-key][data-foreach-owner]');
                                if (!row) return;
                                const idx = parseInt(row.getAttribute('data-key'), 10);
                                const owner = row.getAttribute('data-foreach-owner');
                                const array = el.$state[owner];
                                if (Array.isArray(array)) array.splice(idx, 1);
                                return;
                            }

                            // Figure out which context to call with
                            let contextToUse = el.$state; // default component context

                            const row = target.closest('[data-key][data-foreach-owner]');
                            if (row) {
                                const ownerKey = row.getAttribute('data-foreach-owner');
                                const idx = parseInt(row.getAttribute('data-key'), 10);
                                const array = el.$state[ownerKey];
                                if (Array.isArray(array)) {
                                    contextToUse = array[idx]; // the item itself
                                }
                            }

                            const finalTarget = handlerName.includes('.') ? target : el;

                            // Resolve handler
                            const fn = window.jsRibbonState.resolveMethod(finalTarget, handlerName);// || el.$ctx?.[handlerName];
                            if (typeof fn !== 'function') {
                                // console.warn(`Handler "${handlerName}" not found in component`);
                                console.warn(`⚠️ Event handler "${handlerName}" not found in "${name}"`);
                                return;
                            }

                            // Prepare dataset (if you use it)
                            const parsedDataset = parseDataset(target.dataset || {});
                            const dataset = { ...parsedDataset };
                            delete dataset['bind'];

                            try {
                                fn.call(contextToUse, e, dataset, target);
                            } catch (err) {
                                console.error(`Error executing handler "${handlerName}":`, err);
                            }
                        });
                    });
                }



            } catch (err) {
                console.warn(`⚠️ Failed to initialize component "${name}"`, err);
                el.$ctx = {};
            }
        }
    }


    function unregisterComponent(el) {
        if (!initializedElements.has(el)) return;

        const info = getComponentInfo(el);
        const name = info.component;
        const key = el.getAttribute?.('data-key');

        if (!name) return;

        const instances = componentMap.get(name);
        if (instances) {
            const index = instances.indexOf(el);
            if (index !== -1) {
                instances.splice(index, 1);
                console.log(`🗑️ Component removed: ${name}`, el);
            }

            if (instances.length === 0) {
                componentMap.delete(name);
            }
        }

        if (key) {
            const mapKey = `${name}:${key}`;
            componentKeys.delete(mapKey);
        }

        initializedElements.delete(el);
    }

    function scanAndRegister(root) {
        if (root.nodeType !== 1 && root.nodeType !== 9) return;

        if (root.hasAttribute?.('data-bind')) {
            registerComponent(root);
        }

        const all = root.querySelectorAll?.('[data-bind]') || [];
        all.forEach(el => registerComponent(el));
    }

    function scanAndUnregister(root) {
        if (root.nodeType !== 1 && root.nodeType !== 9) return;

        if (root.hasAttribute?.('data-bind')) {
            unregisterComponent(root);
        }

        const all = root.querySelectorAll?.('[data-bind]') || [];
        all.forEach(el => unregisterComponent(el));
    }

    function startMutationObserver() {
        const observer = new MutationObserver(mutations => {
            if (autoRegister) {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        scanAndRegister(node);
                    }
                }
            }

            for (const mutation of mutations) {
                for (const node of mutation.removedNodes) {
                    scanAndUnregister(node);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        scanAndRegister(document);
        startMutationObserver();
        console.log('🔧 Component system initialized with autoRegister = ' + autoRegister);
    });

    window.jsRibbon = {
        getComponents() {
            return componentMap;
        },
        getInstances(name) {
            return componentMap.get(name) || [];
        },
        get autoRegister() {
            return autoRegister;
        },
        set autoRegister(value) {
            autoRegister = !!value;
            console.log(`🔁 autoRegister is now ${autoRegister}`);
        },
        get hardFail() {
            return hardFail;
        },
        set hardFail(value) {
            hardFail = !!value;
            console.log(`🔁 hardFail is now ${hardFail}`);
        },        
        unregister(el) {
            unregisterComponent(el);
        },
        scanAndRegister,
        scanAndUnregister,
        reset() {
            componentMap.clear();
            componentKeys.clear();
            componentMarkupRegistry.clear();
            // Recreate the WeakSet
            initializedElements = new WeakSet();
            console.log('♻️ Component system has been reset.');
            scanAndRegister(document); // Optional: re-scan after reset
        },
        components: {},
        component(name, fn) {
            this.components[name] = fn;
        },

    };
})();