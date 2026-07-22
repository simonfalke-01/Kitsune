import "./index-server.js";
//#region src/lib/stores/realtime.svelte.ts
var RealtimeStore = class {
	connected = false;
	latest = null;
	socket = null;
	reconnect = null;
	stopped = false;
	start() {}
	stop() {
		this.stopped = true;
		if (this.reconnect) clearTimeout(this.reconnect);
		this.socket?.close();
		this.socket = null;
		this.connected = false;
	}
};
var realtime = new RealtimeStore();
//#endregion
export { realtime as t };
