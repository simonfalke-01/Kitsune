import { P as attr_class, R as stringify } from './index-server.js-Chdi67Z_.js';

//#region src/lib/components/Badge.svelte
function Badge($$renderer, $$props) {
	let { children, tone = "neutral" } = $$props;
	$$renderer.push(`<span${attr_class(`badge ${stringify(tone)}`, "svelte-dtbgkf")}>`);
	children($$renderer);
	$$renderer.push(`<!----></span>`);
}

export { Badge as B };
//# sourceMappingURL=Badge.js-Cc55HWA_.js.map
