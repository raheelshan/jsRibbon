let autoRegister = true;

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


    // ✅ 2. Register component methods after state is ready
    const def = window.jsRibbon.components?.[name];
    if (typeof def === 'function') {
        try {
            const ctx = def(el.$state, el) || {};
            el.$ctx = ctx;

            // ✅ 3. If there were any pending events, bind them now
            if (Array.isArray(el._pendingEvents)) {
                el._pendingEvents.forEach(({ el: targetEl, type, handlerName }) => {

                    if (!(handlerName === 'remove' || handlerName === 'removeItem')) {
                        if (typeof ctx[handlerName] === 'function') {
                            targetEl.addEventListener(type, ctx[handlerName]);
                        } else {
                            console.warn(`⚠️ Event handler "${handlerName}" still not found in "${name}"`, targetEl);
                        }
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

function scanAndRegister(root) {
    
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    
    if (root.hasAttribute?.('data-bind')) {
        registerComponent(root);
    }

    const all = root.querySelectorAll?.('[data-bind]') || [];
    all.forEach(el => registerComponent(el));
}

document.addEventListener('DOMContentLoaded', () => {
    scanAndRegister(document);
    // startMutationObserver();
    console.log('🔧 Component system initialized with autoRegister = ' + autoRegister);
});