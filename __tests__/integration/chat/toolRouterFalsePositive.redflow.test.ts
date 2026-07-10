/**
 * RED-FLOW (integration) — Q4: the on-device tool router force-selects a tool whose NAME merely appears
 * as a substring of the router model's prose, and the "none" branch never runs when a name is present.
 *
 * Drives the REAL selectRelevantTools (litertToolSelector) — the only faked boundary is the model text
 * (the `generate` callback), i.e. what the router LLM would say. This is the router's real substring
 * logic (litertToolSelector.ts:55-62): `raw.includes(name)` selects on any mention, and
 * `selected.length > 0` returns BEFORE the `'none'` check — so a decline that names the tool selects it.
 *
 * (Screen surface — the "Tools sent" row — is gated behind the MCP subsystem; this exercises the exact
 * decision that row renders, with real router logic. A screen-level variant would additionally wire MCP.)
 */
import { selectRelevantTools } from '../../../src/services/litertToolSelector';

const TOOLS = [
  { type: 'function', function: { name: 'calculator', description: 'Evaluate a math expression' } },
  { type: 'function', function: { name: 'web_search', description: 'Search the web' } },
] as never[];

describe('Q4 — tool router false-positive (red-flow)', () => {
  it('selects NO tool when the router declines but happens to name one', async () => {
    // The router model declines ("none") yet mentions "calculator" in its prose.
    const generate = async () => 'None of these tools apply — the calculator is not needed for a greeting.';
    const selected = await selectRelevantTools('hello there', TOOLS, generate);

    // Correct: the router said none → []. Today the substring match on "calculator" wins (and short-
    // circuits before the 'none' branch) → ['calculator'] → RED.
    expect(selected).toEqual([]);
  });

  it('control: when the router names ONLY the tool it wants, that tool is selected', async () => {
    const generate = async () => 'Use web_search to answer this.';
    const selected = await selectRelevantTools('what is the weather in Paris', TOOLS, generate);
    expect(selected).toEqual(['web_search']);
  });
});
