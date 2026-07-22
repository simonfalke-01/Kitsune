import { i as attr_class, m as stringify } from "./index-server.js";
//#region src/lib/components/Badge.svelte
function Badge($$renderer, $$props) {
	let { children, tone = "neutral" } = $$props;
	$$renderer.push(`<span${attr_class(`badge ${stringify(tone)}`, "svelte-dtbgkf")}>`);
	children($$renderer);
	$$renderer.push(`<!----></span>`);
}
//#endregion
export { Badge as t };
