import createClient from 'openapi-fetch';

//#region src/lib/api/client.ts
var api = createClient({
	baseUrl: "",
	credentials: "include",
	headers: { accept: "application/json" }
});
function errorMessage(error, fallback) {
	return error?.message ?? fallback;
}
//#endregion
//#region src/lib/stores/session.svelte.ts
var SessionStore = class {
	current = null;
	loading = true;
	error = null;
	get authenticated() {
		return this.current !== null;
	}
	can(permission) {
		return this.current?.permissions.includes(permission) ?? false;
	}
	async bootstrap() {}
	async login(input) {
		this.loading = true;
		this.error = null;
		const { data, error } = await api.POST("/api/v1/auth/login", { body: input });
		this.loading = false;
		if (!data) {
			this.error = errorMessage(error, "The credentials did not match.");
			return false;
		}
		this.current = data;
		return true;
	}
	async setup(input) {
		this.loading = true;
		this.error = null;
		const { data, error } = await api.POST("/api/v1/setup", { body: input });
		this.loading = false;
		if (!data) {
			this.error = errorMessage(error, "Setup could not be completed.");
			return false;
		}
		this.current = data;
		return true;
	}
	async logout() {
		const csrf = this.current?.csrf_token;
		if (!csrf) return;
		await api.POST("/api/v1/auth/logout", { headers: { "x-csrf-token": csrf } });
		this.current = null;
	}
};
var session = new SessionStore();

export { session as s };
//# sourceMappingURL=session.svelte.js-Jv6BIpyL.js.map
