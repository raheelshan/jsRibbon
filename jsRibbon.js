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

                /*
                // ✅ 3. If there were any pending events, bind them now
                if (Array.isArray(el._pendingEvents)) {
                    el._pendingEvents.forEach(({ el: targetEl, type, handlerName }) => {

                        if (typeof ctx[handlerName] === 'function') {
                            // targetEl.addEventListener(type, ctx[handlerName]);
                            targetEl.addEventListener(type, e => {
                                let parsedDataset = parseDataset(targetEl.dataset);
                                const dataset = { ...parsedDataset };
                                delete dataset['bind'];
                                ctx[handlerName].call(el.$state || ctx, e, dataset, targetEl);
                            });
                            
                        } else {
                            console.warn(`⚠️ Event handler "${handlerName}" not found in "${name}"`, targetEl);
                        }
                    });
                    delete el._pendingEvents;
                }
                */
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

                            // Resolve handler
                            const fn = window.jsRibbonState.resolveMethod(el, handlerName) || el.$ctx?.[handlerName];
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