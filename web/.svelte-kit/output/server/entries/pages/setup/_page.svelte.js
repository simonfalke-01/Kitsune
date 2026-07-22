import { u as head, v as attr, x as escape_html } from "../../../chunks/index-server.js";
import "../../../chunks/navigation.js";
import "../../../chunks/Icon.js";
import { t as Arrow_right } from "../../../chunks/arrow-right.js";
import { r as toned, t as copy } from "../../../chunks/index.svelte.js";
import { t as BrandMark } from "../../../chunks/BrandMark.js";
import { t as Button } from "../../../chunks/Button.js";
import { t as session } from "../../../chunks/session.svelte.js";
import { t as Card } from "../../../chunks/Card.js";
//#endregion
//#region src/routes/setup/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let organizationName = "";
		let organizationSlug = "";
		let displayName = "";
		let email = "";
		let password = "";
		head("g40i6i", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Set up Kitsune</title>`);
			});
		});
		$$renderer.push(`<div class="page page-narrow setup svelte-g40i6i">`);
		BrandMark($$renderer, {});
		$$renderer.push(`<!----> `);
		$$renderer.push("<!--[-1-->");
		$$renderer.push(`<header class="svelte-g40i6i"><p class="eyebrow">First light</p> <h1 class="title">${escape_html(toned(copy("auth").setupTitle))}</h1> <p class="lede">One owner account is all Kitsune needs. Everything else stays optional.</p></header> `);
		Card($$renderer, {
			elevated: true,
			children: ($$renderer) => {
				$$renderer.push(`<form class="svelte-g40i6i"><div class="pair svelte-g40i6i"><label class="field"><span>Organization name</span> <input${attr("value", organizationName)} required="" autocomplete="organization"/></label> <label class="field"><span>Organization key</span> <input${attr("value", organizationSlug)} required="" pattern="[a-z0-9][a-z0-9-]{0,62}"/></label></div> <label class="field"><span>Your name</span> <input${attr("value", displayName)} required="" autocomplete="name"/></label> <label class="field"><span>Email</span> <input${attr("value", email)} type="email" required="" autocomplete="username"/></label> <label class="field"><span>Password</span> <input${attr("value", password)} type="password" required="" minlength="12" maxlength="128" autocomplete="new-password"/> <small class="field-hint">At least 12 characters. A passphrase works beautifully.</small></label> `);
				if (session.error) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<p class="error-text" role="alert">${escape_html(session.error)}</p>`);
				} else $$renderer.push("<!--[-1-->");
				$$renderer.push(`<!--]--> `);
				Button($$renderer, {
					type: "submit",
					loading: session.loading,
					children: ($$renderer) => {
						$$renderer.push(`<!---->Create Kitsune `);
						Arrow_right($$renderer, { size: 15 });
						$$renderer.push(`<!---->`);
					},
					$$slots: { default: true }
				});
				$$renderer.push(`<!----></form>`);
			},
			$$slots: { default: true }
		});
		$$renderer.push(`<!---->`);
		$$renderer.push(`<!--]--></div>`);
	});
}
//#endregion
export { _page as default };
