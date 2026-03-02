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