import { i as attr_class, m as stringify, v as attr } from "./index-server.js";
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
//#endregion
export { Button as t };
