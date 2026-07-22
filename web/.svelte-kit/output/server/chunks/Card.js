import { i as attr_class } from "./index-server.js";
//#region src/lib/components/Card.svelte
function Card($$renderer, $$props) {
	let { children, padded = true, elevated = false } = $$props;
	$$renderer.push(`<div${attr_class("card svelte-1udyrqm", void 0, {
		"padded": padded,
		"elevated": elevated
	})}>`);
	children($$renderer);
	$$renderer.push(`<!----></div>`);
}
//#endregion
export { Card as t };
