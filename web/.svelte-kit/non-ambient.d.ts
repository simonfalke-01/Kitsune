
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/admin" | "/admin/automation" | "/admin/challenges" | "/admin/settings" | "/challenges" | "/design-system" | "/login" | "/recover" | "/scoreboard" | "/setup" | "/team";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>;
			"/admin": Record<string, never>;
			"/admin/automation": Record<string, never>;
			"/admin/challenges": Record<string, never>;
			"/admin/settings": Record<string, never>;
			"/challenges": Record<string, never>;
			"/design-system": Record<string, never>;
			"/login": Record<string, never>;
			"/recover": Record<string, never>;
			"/scoreboard": Record<string, never>;
			"/setup": Record<string, never>;
			"/team": Record<string, never>
		};
		Pathname(): "/" | "/admin" | "/admin/automation" | "/admin/challenges" | "/admin/settings" | "/challenges" | "/design-system" | "/login" | "/scoreboard" | "/setup" | "/team";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): string & {};
	}
}