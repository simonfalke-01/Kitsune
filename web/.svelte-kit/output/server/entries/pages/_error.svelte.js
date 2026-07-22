import { x as escape_html } from "../../chunks/index-server.js";
import { t as page } from "../../chunks/state.js";
import { t as Button } from "../../chunks/Button.js";
//#region src/routes/+error.svelte
function _error($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		$$renderer.push(`<section class="error-page svelte-1j96wlh"><div class="gate svelte-1j96wlh" aria-hidden="true"><span class="svelte-1j96wlh"></span><i></i><i></i></div> <p class="eyebrow svelte-1j96wlh">${escape_html(page.status)}</p> <h1 class="svelte-1j96wlh">${escape_html(page.status === 404 ? "This path slips beyond the torii." : "The trail went cold.")}</h1> <p class="svelte-1j96wlh">${escape_html(page.status === 404 ? "Nothing lives at this address." : "Kitsune recorded the failure. Try the gate again.")}</p> <a href="/">`);
		Button($$renderer, {
			children: ($$renderer) => {
				$$renderer.push(`<!---->Return home`);
			},
			$$slots: { default: true }
		});
		$$renderer.push(`<!----></a></section>`);
	});
}
//#endregion
export { _error as default };
