(function () {
    let componentMap = new Map();            // { Counter: [el1, el2] }
    let initializedElements = new WeakSet(); // Track registered elements
    let componentKeys = new Set();           // Prevent duplicate by key
    let autoRegister = true;

    function parseDataBind(attr) {
        return Object.fromEntries(
            attr
                .split(',')
                .map(pair => pair.trim().split(':').map(x => x.trim()))
                .filter(([key, val]) => key && val)
        );
    }

    function getComponentNameFrom(el) {
        const dataBind = el.getAttribute?.('data-bind')?.trim();
        const parsed = parseDataBind(dataBind || '');
        return parsed.component || null;
    }

    function getComponentInfo(el) {
        const dataBind = el.getAttribute?.('data-bind')?.trim();
        return parseDataBind(dataBind || '');
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
        const name = info.component;
        const key = el.getAttribute?.('data-key');

        if (!name) return;

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

        // ✅ 1. Initialize state
        // Initialize the state first
        if (window.jsRibbonState?.init) {
            window.jsRibbonState.init(el, el.$context);
        }

        // Now that $state is ready, handle expose
        if (info.expose) {
            const exposeRaw = info.expose.trim().replace(/^\[|\]$/g, '').trim();
            const exposePairs = exposeRaw.split(',').map(x => x.trim());

            let parentEl = el.parentElement;
            while (parentEl && !parentEl.hasAttribute('data-bind')) {
                parentEl = parentEl.parentElement;
            }

            if (parentEl?.$ctx) {
                exposePairs.forEach(pair => {
                    const [key, alias] = pair.split(/\s*=>\s*/).map(x => x.trim());
                    const from = key;
                    const to = alias || key;

                    if (el.$state && from in el.$state) {
                        parentEl.$ctx[to] = el.$state[from];
                    } else {
                        console.warn(`⚠️ Cannot expose key "${from}" from`, el);
                    }
                });
            }
        }


        // ✅ 2. Register component methods after state is ready
        const def = window.jsRibbon.components?.[name];
        if (typeof def === 'function') {
            try {
                const ctx = def(el.$state, el) || {};
                el.$ctx = ctx;

                // ✅ 3. If there were any pending events, bind them now
                if (Array.isArray(el._pendingEvents)) {
                    el._pendingEvents.forEach(({ el: targetEl, type, handlerName }) => {
                        if (typeof ctx[handlerName] === 'function') {
                            targetEl.addEventListener(type, ctx[handlerName]);
                        } else {
                            console.warn(`⚠️ Event handler "${handlerName}" still not found in "${name}"`, targetEl);
                        }
                    });
                    delete el._pendingEvents;
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
                // console.log(`🗑️ Component removed: ${name}`, el);
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
        // console.log('🔧 Component system initialized with autoRegister = ' + autoRegister);
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
            // console.log(`🔁 autoRegister is now ${autoRegister}`);
        },
        unregister(el) {
            unregisterComponent(el);
        },
        scanAndRegister,
        scanAndUnregister,
        reset() {
            componentMap.clear();
            componentKeys.clear();
            // Recreate the WeakSet
            initializedElements = new WeakSet();
            // console.log('♻️ Component system has been reset.');
            scanAndRegister(document); // Optional: re-scan after reset
        },
        components: {},
        component(name, fn) {
            this.components[name] = fn;
        },
    };
})();