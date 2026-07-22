import { P as attr_class, Q as attr, R as stringify } from './index-server.js-Chdi67Z_.js';

//#region src/lib/components/Button.svelte
function Button($$renderer, $$props) {
	let { children, variant = "primary", type = "button", disabled = false, loading = false, onclick, ariaLabel } = $$props;
	$$renderer.push(`<button${attr_class(`button ${stringify(variant)}`, "svelte-18sv61c")}${attr("type", type)}${attr("disabled", disabled || loading, true)}${attr("aria-busy", loading)}${attr("aria-label", ariaLabel)}>`);
	if (loading) {
		$$renderer.push("<!--[0-->");
		$$renderer.push(`<span class="spinner svelte-18sv61c" aria-hidden="true"></span>`);
	} else $$renderer.push("<!--[-1-->");
	$$renderer.push(`<!--]--> <span${attr_class("svelte-18sv61c", void 0, { "visually-muted": loading })}>`);
	children($$renderer);
	$$renderer.push(`<!----></span></button>`);
}

export { Button as B };
//# sourceMappingURL=Button.js-CFr2qd92.js.map
