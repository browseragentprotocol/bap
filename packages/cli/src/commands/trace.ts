/**
 * bap trace               — Show last 10 steps from the most recent trace
 * bap trace --all         — Show all steps
 * bap trace --session=<s> — Show trace for a specific session
 * bap trace --sessions    — List all trace sessions
 * bap trace --export=<f>  — Export trace to JSON file
 * bap trace --export-evidence=<f> — Export normalized skill-contract evidence
 * bap trace --replay      — Generate self-contained HTML timeline viewer
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { BAPClient } from '@browseragentprotocol/client';
import type { GlobalFlags } from '../config/state.js';
import { register } from './registry.js';

interface TraceEntry {
	ts: string;
	sessionId?: string;
	clientId: string;
	method: string;
	duration: number;
	status: 'ok' | 'error';
	error?: string;
	requestSummary?: Record<string, unknown>;
	resultSummary?: Record<string, unknown>;
}

interface ContractRuntimeEvidence {
	tools?: string[];
	actions?: string[];
	domains?: string[];
	artifacts?: string[];
	approvalsObserved?: string[];
}

interface ContractProvenanceEvidence {
	formats?: string[];
	replaySupported?: boolean;
	determinism?: 'none' | 'best-effort' | 'strict';
	validator?: string;
}

interface ContractGroundingEvidence {
	observationModels?: string[];
	identityMechanisms?: string[];
	stableRefs?: boolean;
	abstentionSupported?: boolean;
}

interface ContractEvidence {
	adapter: 'bap';
	version: 1;
	runtime?: ContractRuntimeEvidence;
	provenance?: ContractProvenanceEvidence;
	grounding?: ContractGroundingEvidence;
}

const TRACE_DIR = path.join(os.homedir(), '.bap', 'traces');

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object';
}

function readTraceFile(filepath: string): TraceEntry[] {
	try {
		const content = fs.readFileSync(filepath, 'utf-8');
		return content
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((line) => {
				try {
					return JSON.parse(line) as TraceEntry;
				} catch {
					return null;
				}
			})
			.filter((e): e is TraceEntry => e !== null);
	} catch {
		return [];
	}
}

function countLines(filepath: string): number {
	try {
		const content = fs.readFileSync(filepath, 'utf-8');
		return content.trim().split('\n').filter(Boolean).length;
	} catch {
		return 0;
	}
}

function normalizeToolName(method: string): string | null {
	switch (method) {
		case 'page/navigate':
			return 'navigate';
		case 'page/reload':
			return 'reload';
		case 'page/goBack':
			return 'go_back';
		case 'page/goForward':
			return 'go_forward';
		case 'page/close':
			return 'close_page';
		case 'page/list':
			return 'pages';
		case 'page/activate':
			return 'activate_page';
		case 'observe/screenshot':
			return 'screenshot';
		case 'observe/accessibility':
			return 'accessibility';
		case 'observe/content':
			return 'content';
		case 'observe/element':
			return 'element';
		case 'observe/ariaSnapshot':
			return 'aria_snapshot';
		case 'observe/dom':
			return 'dom';
		case 'observe/pdf':
			return 'pdf';
		case 'agent/act':
			return 'act';
		case 'agent/observe':
			return 'observe';
		case 'agent/extract':
			return 'extract';
		case 'discovery/discover':
			return 'discover_tools';
		case 'action/click':
			return 'click';
		case 'action/dblclick':
			return 'dblclick';
		case 'action/fill':
			return 'fill';
		case 'action/type':
			return 'type';
		case 'action/press':
			return 'press';
		case 'action/hover':
			return 'hover';
		case 'action/scroll':
			return 'scroll';
		case 'action/select':
			return 'select';
		case 'action/check':
			return 'check';
		case 'action/uncheck':
			return 'uncheck';
		case 'action/clear':
			return 'clear';
		case 'action/upload':
			return 'upload';
		case 'action/drag':
			return 'drag';
		default:
			return null;
	}
}

function normalizeActionName(action: string): string {
	switch (action) {
		case 'page/navigate':
			return 'navigate';
		case 'page/reload':
			return 'reload';
		case 'page/goBack':
			return 'go_back';
		case 'page/goForward':
			return 'go_forward';
		default:
			return action.replace(/^action\//, '');
	}
}

function extractOrigin(url: unknown): string | null {
	if (typeof url !== 'string' || url.length === 0) return null;
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

function collectObserveSummaries(entry: TraceEntry): Array<Record<string, unknown>> {
	const summaries: Array<Record<string, unknown>> = [];

	if (!isRecord(entry.requestSummary)) {
		return summaries;
	}

	if (entry.method === 'agent/observe') {
		summaries.push(entry.requestSummary);
	}

	for (const key of ['observe', 'preObserve', 'postObserve']) {
		const value = entry.requestSummary[key];
		if (isRecord(value)) {
			summaries.push(value);
		}
	}

	return summaries;
}

function resolveOutputPath(target: string): string | null {
	const resolved = path.resolve(target);
	const cwd = process.cwd();
	const bapDir = path.join(os.homedir(), '.bap');

	if (
		!resolved.startsWith(cwd + path.sep) &&
		!resolved.startsWith(bapDir + path.sep) &&
		resolved !== cwd &&
		resolved !== bapDir
	) {
		console.error('Export path must be under current directory or ~/.bap/');
		return null;
	}

	return resolved;
}

export function buildContractEvidence(entries: TraceEntry[]): ContractEvidence {
	const tools = new Set<string>();
	const actions = new Set<string>();
	const domains = new Set<string>();
	const artifacts = new Set<string>(['trace-jsonl']);
	const approvalsObserved = new Set<string>();
	const observationModels = new Set<string>();
	const identityMechanisms = new Set<string>();

	let sawObservation = false;
	let stableRefsObserved: boolean | undefined;

	for (const entry of entries) {
		const tool = normalizeToolName(entry.method);
		if (tool) {
			tools.add(tool);
		}

		// Extract actions from direct action/* method calls
		if (entry.method.startsWith('action/')) {
			actions.add(normalizeActionName(entry.method));
		}

		if (entry.method === 'approval/respond') {
			approvalsObserved.add('manual');
		}

		if (isRecord(entry.requestSummary)) {
			const url = extractOrigin(entry.requestSummary.url);
			if (url) domains.add(url);

			if (Array.isArray(entry.requestSummary.actions)) {
				for (const action of entry.requestSummary.actions) {
					if (typeof action === 'string') {
						actions.add(normalizeActionName(action));
					}
				}
			}
		}

		const resultUrl = extractOrigin(entry.resultSummary?.url);
		if (resultUrl) {
			domains.add(resultUrl);
		}

		const observeSummaries = collectObserveSummaries(entry);
		if (observeSummaries.length > 0 || entry.method === 'agent/observe') {
			sawObservation = true;
			tools.add('observe');
		}

		for (const observeSummary of observeSummaries) {
			observationModels.add('interactive-elements');
			if (observeSummary.incremental === true) {
				observationModels.add('incremental-changes');
			}
			if (observeSummary.includeScreenshot === true || observeSummary.annotateScreenshot === true) {
				observationModels.add('screenshot-observation');
				artifacts.add('screenshot');
			}

			if (typeof observeSummary.stableRefs === 'boolean') {
				stableRefsObserved = stableRefsObserved ?? false;
				stableRefsObserved = stableRefsObserved || observeSummary.stableRefs;
			}
		}

		if (entry.method === 'observe/screenshot' || entry.resultSummary?.hasScreenshot === true) {
			observationModels.add('screenshot-observation');
			artifacts.add('screenshot');
		}

		if (entry.method === 'agent/extract') {
			artifacts.add('json-extraction');
		}

		if (entry.method === 'observe/pdf') {
			artifacts.add('pdf');
		}
	}

	if (sawObservation) {
		identityMechanisms.add('stable-ref');
		identityMechanisms.add('semantic-selector');
		identityMechanisms.add('selector-fallback');
		stableRefsObserved = stableRefsObserved ?? true;
	}

	return {
		adapter: 'bap',
		version: 1,
		runtime: {
			tools: [...tools].sort(),
			actions: [...actions].sort(),
			domains: [...domains].sort(),
			artifacts: [...artifacts].sort(),
			approvalsObserved: [...approvalsObserved].sort(),
		},
		provenance: {
			formats: ['bap-trace-jsonl'],
			replaySupported: true,
			determinism: 'best-effort',
			validator: 'bap trace --replay',
		},
		grounding: {
			observationModels: [...observationModels].sort(),
			identityMechanisms: [...identityMechanisms].sort(),
			stableRefs: stableRefsObserved,
			abstentionSupported: false,
		},
	};
}

function listTraceSessions(): Array<{
	sessionId: string;
	file: string;
	entries: number;
	size: number;
	modified: Date;
}> {
	if (!fs.existsSync(TRACE_DIR)) return [];

	return fs
		.readdirSync(TRACE_DIR)
		.filter((f) => f.endsWith('.jsonl'))
		.map((f) => {
			const stat = fs.statSync(path.join(TRACE_DIR, f));
			const sessionId = f.replace(/-\d+\.jsonl$/, '');
			// Count lines without JSON parsing — O(n) string scan vs O(n*m) parse
			const entries = countLines(path.join(TRACE_DIR, f));
			return { sessionId, file: f, entries, size: stat.size, modified: stat.mtime };
		})
		.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

function formatDuration(ms: number): string {
	if (ms < 1) return '<1ms';
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatEntry(entry: TraceEntry, index: number): string {
	const status = entry.status === 'ok' ? '\u2713' : '\u2717';
	const time = new Date(entry.ts).toLocaleTimeString();
	const dur = formatDuration(entry.duration);
	let summary = '';

	if (entry.error) {
		summary = ` error="${entry.error}"`;
	} else if (entry.resultSummary) {
		const rs = entry.resultSummary;
		if (rs.url) summary += ` url=${rs.url}`;
		if (rs.elementCount !== undefined) summary += ` elements=${rs.elementCount}`;
		if (rs.status !== undefined) summary += ` status=${rs.status}`;
		if (rs.sizeKB !== undefined) summary += ` ${rs.sizeKB}KB`;
		if (rs.completed !== undefined) summary += ` ${rs.completed}/${rs.total}`;
		if (rs.count !== undefined) summary += ` count=${rs.count}`;
	}

	return `  ${String(index + 1).padStart(3)} ${status} ${time} ${entry.method.padEnd(25)} ${dur.padStart(7)}${summary}`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function generateHtmlReplay(entries: TraceEntry[], sessionId: string): string {
	const rows = entries
		.map((e, i) => {
			const cls = e.status === 'error' ? 'error' : '';
			const summary = e.error
				? `<span class="err">${escapeHtml(e.error)}</span>`
				: escapeHtml(JSON.stringify(e.resultSummary ?? {}));
			return `<tr class="${cls}"><td>${i + 1}</td><td>${new Date(e.ts).toLocaleTimeString()}</td><td>${escapeHtml(e.method)}</td><td>${formatDuration(e.duration)}</td><td>${e.status}</td><td class="summary">${summary}</td></tr>`;
		})
		.join('\n');

	const totalDuration = entries.reduce((s, e) => s + e.duration, 0);
	const errorCount = entries.filter((e) => e.status === 'error').length;

	return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>BAP Trace: ${escapeHtml(sessionId)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #1a1a2e; color: #e0e0e0; }
  h1 { color: #00d4ff; }
  .stats { display: flex; gap: 2rem; margin: 1rem 0; }
  .stat { background: #16213e; padding: 1rem; border-radius: 8px; }
  .stat-value { font-size: 1.5rem; font-weight: bold; color: #00d4ff; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th { text-align: left; padding: 0.5rem; border-bottom: 2px solid #333; color: #888; }
  td { padding: 0.5rem; border-bottom: 1px solid #222; font-family: monospace; font-size: 0.85rem; }
  tr.error { background: #2d1b1b; }
  .err { color: #ff6b6b; }
  .summary { max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; }
</style></head><body>
<h1>BAP Trace: ${escapeHtml(sessionId)}</h1>
<div class="stats">
  <div class="stat"><div class="stat-value">${entries.length}</div>Requests</div>
  <div class="stat"><div class="stat-value">${formatDuration(totalDuration)}</div>Total Time</div>
  <div class="stat"><div class="stat-value">${errorCount}</div>Errors</div>
</div>
<table>
<thead><tr><th>#</th><th>Time</th><th>Method</th><th>Duration</th><th>Status</th><th>Summary</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
}

export async function traceCommand(
	args: string[],
	_flags: GlobalFlags,
	_client: BAPClient,
): Promise<void> {
	// Parse trace-specific flags
	const listFlag = args.includes('--sessions') || args.includes('-l');
	const allFlag = args.includes('--all') || args.includes('-a');
	const replayFlag = args.includes('--replay');
	let sessionFilter: string | undefined;
	let exportFile: string | undefined;
	let evidenceFile: string | undefined;
	let limit = 10;

	for (const arg of args) {
		if (arg.startsWith('--session=')) sessionFilter = arg.slice('--session='.length);
		if (arg.startsWith('--export=')) exportFile = arg.slice('--export='.length);
		if (arg.startsWith('--export-evidence=')) {
			evidenceFile = arg.slice('--export-evidence='.length);
		}
		if (arg.startsWith('--limit=')) limit = parseInt(arg.slice('--limit='.length), 10) || 10;
	}

	if (!fs.existsSync(TRACE_DIR)) {
		console.log(
			'No traces found. Run some BAP commands first — traces are recorded automatically.',
		);
		return;
	}

	// --list: show all sessions
	if (listFlag) {
		const sessions = listTraceSessions();
		if (sessions.length === 0) {
			console.log('No trace sessions found.');
			return;
		}
		console.log('### Trace Sessions');
		console.log('');
		for (const s of sessions) {
			const age = Math.round((Date.now() - s.modified.getTime()) / 1000);
			const ageStr =
				age < 60
					? `${age}s ago`
					: age < 3600
						? `${Math.round(age / 60)}m ago`
						: `${Math.round(age / 3600)}h ago`;
			console.log(
				`  ${s.sessionId.padEnd(20)} ${String(s.entries).padStart(4)} entries  ${(s.size / 1024).toFixed(1).padStart(6)}KB  ${ageStr}`,
			);
		}
		return;
	}

	// Find the right trace file
	const sessions = listTraceSessions();
	let targetFile: string | undefined;
	let targetSessionId: string | undefined;

	if (sessionFilter) {
		const match = sessions.find(
			(s) => s.sessionId === sessionFilter || s.file.includes(sessionFilter),
		);
		if (!match) {
			console.error(`No trace found for session: ${sessionFilter}`);
			console.error("Run 'bap trace --sessions' to see available sessions.");
			return;
		}
		targetFile = path.join(TRACE_DIR, match.file);
		targetSessionId = match.sessionId;
	} else if (sessions.length > 0) {
		targetFile = path.join(TRACE_DIR, sessions[0]!.file);
		targetSessionId = sessions[0]!.sessionId;
	} else {
		console.log('No traces found.');
		return;
	}

	const entries = readTraceFile(targetFile);

	if (exportFile) {
		const resolved = resolveOutputPath(exportFile);
		if (!resolved) {
			return;
		}
		fs.mkdirSync(path.dirname(resolved), { recursive: true });
		fs.writeFileSync(resolved, JSON.stringify(entries, null, 2));
		console.log(`Exported ${entries.length} trace entries to ${exportFile}`);
	}

	if (evidenceFile) {
		const resolved = resolveOutputPath(evidenceFile);
		if (!resolved) {
			return;
		}

		fs.mkdirSync(path.dirname(resolved), { recursive: true });
		fs.writeFileSync(resolved, JSON.stringify(buildContractEvidence(entries), null, 2));
		console.log(`Exported contract evidence to ${evidenceFile}`);
	}

	// --replay: generate HTML (sanitize sessionId for filesystem safety)
	if (replayFlag) {
		const safeId = targetSessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
		const html = generateHtmlReplay(entries, targetSessionId);
		const outFile = `.bap/trace-replay-${safeId}.html`;
		fs.mkdirSync(path.dirname(outFile), { recursive: true });
		fs.writeFileSync(outFile, html);
		console.log(`### Trace Replay`);
		console.log(`[Open replay](${outFile}) — ${entries.length} requests`);
		return;
	}

	if (exportFile || evidenceFile) {
		return;
	}

	// Default: show last N entries
	const displayEntries = allFlag ? entries : entries.slice(-limit);
	const skipped = entries.length - displayEntries.length;

	console.log(`### Trace: ${targetSessionId}`);
	if (skipped > 0) {
		console.log(`  (${skipped} earlier entries hidden — use --all to show all)`);
	}
	console.log('');
	for (let i = 0; i < displayEntries.length; i++) {
		console.log(formatEntry(displayEntries[i]!, (allFlag ? 0 : skipped) + i));
	}

	const totalDuration = entries.reduce((s, e) => s + e.duration, 0);
	const errorCount = entries.filter((e) => e.status === 'error').length;
	console.log('');
	console.log(
		`  Total: ${entries.length} requests, ${formatDuration(totalDuration)}, ${errorCount} errors`,
	);
}

register('trace', traceCommand);
