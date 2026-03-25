import { beforeEach, describe, expect, it, vi } from 'vitest';

const existsSync = vi.fn();
const readFileSync = vi.fn();
const readdirSync = vi.fn();
const statSync = vi.fn();
const mkdirSync = vi.fn();
const writeFileSync = vi.fn();
const register = vi.fn();

vi.mock('node:fs', () => ({
	default: {
		existsSync,
		readFileSync,
		readdirSync,
		statSync,
		mkdirSync,
		writeFileSync,
	},
}));

vi.mock('node:os', () => ({
	default: {
		homedir: () => '/tmp/test-home',
	},
}));

vi.mock('../../src/commands/registry.js', () => ({
	register,
}));

const { buildContractEvidence, traceCommand } = await import('../../src/commands/trace.js');

describe('trace contract evidence export', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('normalizes BAP trace entries into contract evidence', () => {
		const evidence = buildContractEvidence([
			{
				ts: '2026-03-24T18:00:00.000Z',
				sessionId: 'checkout-demo',
				clientId: 'client-1',
				method: 'page/navigate',
				duration: 42,
				status: 'ok',
				requestSummary: {
					url: 'https://example.com/login',
					observe: {
						responseTier: 'interactive',
						stableRefs: true,
					},
				},
				resultSummary: {
					url: 'https://example.com/login',
					status: 200,
				},
			},
			{
				ts: '2026-03-24T18:00:05.000Z',
				sessionId: 'checkout-demo',
				clientId: 'client-1',
				method: 'agent/act',
				duration: 85,
				status: 'ok',
				requestSummary: {
					actions: ['action/fill', 'action/click'],
					postObserve: {
						incremental: true,
						includeScreenshot: true,
						stableRefs: true,
					},
				},
				resultSummary: {
					completed: 2,
					total: 2,
				},
			},
			{
				ts: '2026-03-24T18:00:06.000Z',
				sessionId: 'checkout-demo',
				clientId: 'client-1',
				method: 'agent/extract',
				duration: 33,
				status: 'ok',
				requestSummary: {
					mode: 'list',
				},
				resultSummary: {
					keys: ['data', 'sourceRefs'],
				},
			},
		]);

		expect(evidence).toEqual({
			adapter: 'bap',
			version: 1,
			runtime: {
				tools: ['act', 'extract', 'navigate', 'observe'],
				actions: ['click', 'fill'],
				domains: ['https://example.com'],
				artifacts: ['json-extraction', 'screenshot', 'trace-jsonl'],
				approvalsObserved: [],
			},
			provenance: {
				formats: ['bap-trace-jsonl'],
				replaySupported: true,
				determinism: 'best-effort',
				validator: 'bap trace --replay',
			},
			grounding: {
				observationModels: [
					'incremental-changes',
					'interactive-elements',
					'screenshot-observation',
				],
				identityMechanisms: ['selector-fallback', 'semantic-selector', 'stable-ref'],
				stableRefs: true,
				abstentionSupported: false,
			},
		});
	});

	it('captures direct action/* method calls as tools and actions', () => {
		const evidence = buildContractEvidence([
			{
				ts: '2026-03-24T18:00:00.000Z',
				sessionId: 'direct-actions',
				clientId: 'client-1',
				method: 'action/click',
				duration: 15,
				status: 'ok',
				requestSummary: { selector: 'e5' },
			},
			{
				ts: '2026-03-24T18:00:01.000Z',
				sessionId: 'direct-actions',
				clientId: 'client-1',
				method: 'action/fill',
				duration: 20,
				status: 'ok',
				requestSummary: { selector: 'e8', value: 'test@example.com' },
			},
			{
				ts: '2026-03-24T18:00:02.000Z',
				sessionId: 'direct-actions',
				clientId: 'client-1',
				method: 'action/hover',
				duration: 10,
				status: 'ok',
				requestSummary: { selector: 'e12' },
			},
		]);

		// Direct action/* calls should appear in both tools AND actions
		expect(evidence.runtime?.tools).toContain('click');
		expect(evidence.runtime?.tools).toContain('fill');
		expect(evidence.runtime?.tools).toContain('hover');
		expect(evidence.runtime?.actions).toContain('click');
		expect(evidence.runtime?.actions).toContain('fill');
		expect(evidence.runtime?.actions).toContain('hover');
	});

	it('exports normalized evidence from the trace command', async () => {
		existsSync.mockReturnValue(true);
		readdirSync.mockReturnValue(['checkout-demo-123.jsonl']);
		statSync.mockReturnValue({
			size: 512,
			mtime: new Date('2026-03-24T18:01:00.000Z'),
		});
		readFileSync.mockReturnValue(
			[
				JSON.stringify({
					ts: '2026-03-24T18:00:00.000Z',
					sessionId: 'checkout-demo',
					clientId: 'client-1',
					method: 'page/navigate',
					duration: 42,
					status: 'ok',
					requestSummary: {
						url: 'https://example.com/login',
						observe: { responseTier: 'interactive', stableRefs: true },
					},
					resultSummary: { url: 'https://example.com/login', status: 200 },
				}),
				JSON.stringify({
					ts: '2026-03-24T18:00:05.000Z',
					sessionId: 'checkout-demo',
					clientId: 'client-1',
					method: 'agent/act',
					duration: 85,
					status: 'ok',
					requestSummary: {
						actions: ['action/fill', 'action/click'],
						postObserve: {
							incremental: true,
							includeScreenshot: true,
							stableRefs: true,
						},
					},
					resultSummary: { completed: 2, total: 2 },
				}),
			].join('\n'),
		);

		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await traceCommand(['--export-evidence=.bap/trace-evidence.json'], {} as never, {} as never);

		expect(mkdirSync).toHaveBeenCalled();
		expect(writeFileSync).toHaveBeenCalledTimes(1);

		const [, writtenJson] = writeFileSync.mock.calls[0] as [string, string];
		expect(JSON.parse(writtenJson)).toEqual({
			adapter: 'bap',
			version: 1,
			runtime: {
				tools: ['act', 'navigate', 'observe'],
				actions: ['click', 'fill'],
				domains: ['https://example.com'],
				artifacts: ['screenshot', 'trace-jsonl'],
				approvalsObserved: [],
			},
			provenance: {
				formats: ['bap-trace-jsonl'],
				replaySupported: true,
				determinism: 'best-effort',
				validator: 'bap trace --replay',
			},
			grounding: {
				observationModels: [
					'incremental-changes',
					'interactive-elements',
					'screenshot-observation',
				],
				identityMechanisms: ['selector-fallback', 'semantic-selector', 'stable-ref'],
				stableRefs: true,
				abstentionSupported: false,
			},
		});

		expect(logSpy).toHaveBeenCalledWith('Exported contract evidence to .bap/trace-evidence.json');
		expect(errorSpy).not.toHaveBeenCalled();
	});
});
