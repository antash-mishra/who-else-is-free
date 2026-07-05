/**
 * mobile-mcp bridge extension
 *
 * Bridges the `mobile-mcp` MCP server (Android emulator/device automation) into
 * pi as native tools, with zero runtime dependencies beyond mobile-mcp itself.
 *
 * It speaks the minimal MCP JSON-RPC 2.0 subset over stdio:
 *   - initialize
 *   - tools/list
 *   - tools/call
 *
 * At session_start it spawns the mobile-mcp server, performs the handshake, and
 * registers every discovered tool via pi.registerTool(). MCP image content
 * blocks (screenshots) are converted to pi image content so vision-capable
 * models can actually see them.
 *
 * If the server fails to start (no adb / no emulator), it registers a single
 * `mobile_mcp_status` tool that explains how to fix it instead of crashing.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface McpContent {
	type: "text" | "image" | "resource";
	text?: string;
	data?: string;
	mimeType?: string;
	[key: string]: unknown;
}

interface McpTool {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
	timer: NodeJS.Timeout;
}

const HANDSHAKE_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 120_000;

class McpClient {
	private proc: ChildProcessWithoutNullStreams | null = null;
	private buffer = "";
	private nextId = 1;
	private pending = new Map<number, PendingRequest>();
	private started = false;
	private startError: string | null = null;

	get status(): { started: boolean; error: string | null } {
		return { started: this.started, error: this.startError };
	}

	async start(serverPath: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let proc: ChildProcessWithoutNullStreams;
			try {
				proc = spawn(process.execPath, [serverPath], {
					stdio: ["pipe", "pipe", "pipe"],
					env: { ...process.env },
				});
			} catch (e) {
				this.startError = `Failed to spawn mobile-mcp: ${(e as Error).message}`;
				return reject(new Error(this.startError));
			}
			this.proc = proc;

			const stderrChunks: string[] = [];
			proc.stderr.on("data", (d: Buffer) => {
				stderrChunks.push(d.toString());
			});
			proc.on("error", (err) => {
				this.startError = `mobile-mcp process error: ${err.message}`;
				if (!this.started) reject(new Error(this.startError));
				this.failAll(err);
			});
			proc.on("close", (code) => {
				const msg = `mobile-mcp exited with code ${code}`;
				this.startError = this.startError ?? msg;
				if (!this.started) reject(new Error(this.startError));
				this.failAll(new Error(msg));
				this.proc = null;
			});

			proc.stdout.on("data", (d: Buffer) => {
				this.buffer += d.toString();
				const lines = this.buffer.split("\n");
				this.buffer = lines.pop() ?? "";
				for (const line of lines) this.handleLine(line);
			});

			// initialize handshake
			this.request("initialize", {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "pi-mobile-mcp-bridge", version: "1.0.0" },
			})
				.then(() => {
					// Acknowledge initialized notification (no response expected).
					this.notify("notifications/initialized", {});
					this.started = true;
					resolve();
				})
				.catch((err) => {
					this.startError = `initialize failed: ${err.message}\n${stderrChunks.join("")}`;
					reject(new Error(this.startError));
				});
		});
	}

	async listTools(): Promise<McpTool[]> {
		const res = (await this.request("tools/list", {})) as { tools?: McpTool[] };
		return res.tools ?? [];
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<{ content: McpContent[]; isError?: boolean }> {
		const res = (await this.request("tools/call", { name, arguments: args })) as {
			content?: McpContent[];
			isError?: boolean;
		};
		return { content: res.content ?? [], isError: res.isError };
	}

	private request(method: string, params: unknown): Promise<unknown> {
		return new Promise((resolve, reject) => {
			if (!this.proc || this.proc.killed) {
				return reject(new Error("mobile-mcp server is not running"));
			}
			const id = this.nextId++;
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`MCP request "${method}" timed out after ${CALL_TIMEOUT_MS}ms`));
			}, CALL_TIMEOUT_MS);
			this.pending.set(id, { resolve, reject, timer });
			const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
			this.proc.stdin.write(payload);
		});
	}

	private notify(method: string, params: unknown): void {
		if (!this.proc) return;
		const payload = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
		this.proc.stdin.write(payload);
	}

	private handleLine(line: string): void {
		const trimmed = line.trim();
		if (!trimmed) return;
		let msg: { jsonrpc?: string; id?: number; result?: unknown; error?: { message?: string } };
		try {
			msg = JSON.parse(trimmed);
		} catch {
			// Not JSON (server log line on stdout). Ignore.
			return;
		}
		if (typeof msg.id !== "number") return; // notification, ignore
		const pending = this.pending.get(msg.id);
		if (!pending) return;
		this.pending.delete(msg.id);
		clearTimeout(pending.timer);
		if (msg.error) pending.reject(new Error(msg.error.message ?? "MCP error"));
		else pending.resolve(msg.result);
	}

	private failAll(err: Error): void {
		for (const p of this.pending.values()) {
			clearTimeout(p.timer);
			p.reject(err);
		}
		this.pending.clear();
	}

	stop(): void {
		this.failAll(new Error("mobile-mcp server stopped"));
		if (this.proc) {
			try {
				this.proc.stdin.end();
				this.proc.kill("SIGTERM");
			} catch {
				/* ignore */
			}
			this.proc = null;
		}
	}
}

/** Convert an MCP content array into a pi tool-result content array. */
function convertContent(content: McpContent[]): Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; mediaType: string; data: string } }> {
	const out: Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; mediaType: string; data: string } }> = [];
	for (const block of content) {
		if (block.type === "text" && typeof block.text === "string") {
			out.push({ type: "text", text: block.text });
		} else if (block.type === "image" && typeof block.data === "string") {
			out.push({
				type: "image",
				source: { type: "base64", mediaType: block.mimeType ?? "image/png", data: block.data },
			});
		}
		// Drop unsupported block types (resource, etc.).
	}
	return out;
}

/** Build a typebox schema from an MCP tool inputSchema (a JSON Schema object). */
function schemaFromMcp(inputSchema: Record<string, unknown> | undefined) {
	const schema =
		inputSchema && typeof inputSchema === "object" && Object.keys(inputSchema).length > 0
			? inputSchema
			: { type: "object", properties: {}, additionalProperties: true };
	return Type.Unsafe(schema);
}

export default function (pi: ExtensionAPI) {
	let client: McpClient | null = null;

	// Defer subprocess startup until session_start (per extension guidance:
	// do not start background resources from the factory).
	pi.on("session_start", async (_event, ctx) => {
		const extDir = path.dirname(new URL(import.meta.url).pathname);
		const serverPath = path.join(extDir, "node_modules", "mobile-mcp", "dist", "index.js");

		if (!fs.existsSync(serverPath)) {
			ctx.ui.notify(
				`mobile-mcp not installed. Run: cd "${extDir}" && npm install`,
				"error",
			);
			registerStatusTool(pi, () => `mobile-mcp not installed at ${serverPath}. Run: cd "${extDir}" && npm install`);
			return;
		}

		client = new McpClient();
		try {
			await withTimeout(client.start(serverPath), HANDSHAKE_TIMEOUT_MS, "mobile-mcp handshake");
		} catch (e) {
			const msg = (e as Error).message;
			ctx.ui.notify(`mobile-mcp failed to start: ${msg.split("\n")[0]}`, "error");
			client = null;
			registerStatusTool(pi, () => `mobile-mcp is not running.\n\nError: ${msg}\n\nMake sure adb is installed and an Android emulator/device is connected, then restart pi or run /reload.`);
			return;
		}

		let tools: McpTool[] = [];
		try {
			tools = await client.listTools();
		} catch (e) {
			ctx.ui.notify(`mobile-mcp tools/list failed: ${(e as Error).message}`, "error");
			registerStatusTool(pi, () => `mobile-mcp tools/list failed: ${(e as Error).message}`);
			return;
		}

		if (tools.length === 0) {
			ctx.ui.notify("mobile-mcp exposed no tools", "warning");
			registerStatusTool(pi, () => "mobile-mcp exposed no tools.");
			return;
		}

		for (const tool of tools) {
			const name = tool.name;
			pi.registerTool({
				name,
				label: name,
				description: tool.description ?? `mobile-mcp tool: ${name}`,
				parameters: schemaFromMcp(tool.inputSchema),
				promptGuidelines: [
					`Use ${name} for Android emulator interaction via mobile-mcp. Call mobile_init once before any other mobile_* tool.`,
				],
				async execute(_toolCallId, params, signal, onUpdate) {
					if (!client) {
						return {
							content: [{ type: "text", text: "mobile-mcp server is not running. Restart pi or run /reload." }],
							isError: true,
							details: {},
						};
					}
					const args = (params ?? {}) as Record<string, unknown>;
					// Best-effort abort: kill the in-flight call if the agent aborts.
					const abortPromise = new Promise<{ content: McpContent[]; isError?: boolean }>((resolve) => {
						if (!signal) return;
						if (signal.aborted) {
							resolve({ content: [{ type: "text", text: "Aborted" }], isError: true });
						} else {
							signal.addEventListener(
								"abort",
								() => resolve({ content: [{ type: "text", text: "Aborted" }], isError: true }),
								{ once: true },
							);
						}
					});

					try {
						const result = await Promise.race([client.callTool(name, args), abortPromise]);
						const content = convertContent(result.content);
						if (onUpdate) onUpdate({ content });
						return { content, isError: result.isError === true, details: {} };
					} catch (e) {
						return {
							content: [{ type: "text", text: `mobile-mcp call "${name}" failed: ${(e as Error).message}` }],
							isError: true,
							details: {},
						};
					}
				},
			});
		}

		ctx.ui.notify(`mobile-mcp ready: ${tools.length} tools (${tools.map((t) => t.name).join(", ")})`, "info");
	});

	pi.on("session_shutdown", () => {
		client?.stop();
		client = null;
	});
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
		promise.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			(err) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});
}

/** Register a fallback tool so the model gets a clear, actionable error. */
function registerStatusTool(pi: ExtensionAPI, message: () => string): void {
	pi.registerTool({
		name: "mobile_mcp_status",
		label: "mobile-mcp status",
		description: "Report why the mobile-mcp Android bridge is unavailable and how to fix it.",
		parameters: Type.Object({}),
		async execute() {
			return { content: [{ type: "text", text: message() }], details: {} };
		},
	});
}
