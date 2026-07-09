import { parseModelOutput } from '../../../../src/components/ChatMessage/utils';

// Contract: parseModelOutput().answer is GUARANTEED free of reasoning + tool-call markup for
// EVERY format the app can emit. This invariant makes the tool-call-leak class impossible —
// if a new markup format is added to the parser, add it here.
const MARKUP = /<think>|<\/think>|<\|channel|<tool_call>|<\|tool_call|<function=|<parameter=|<invoke|<function_call/;

describe('parseModelOutput — answer is clean by construction (the anti-leak contract)', () => {
  const toolBlock = '<tool_call>\n<function=search_kb>\n<parameter=query>\nAchilles\n</parameter>\n</function>\n</tool_call>';
  const cases: Array<[string, string, string | null]> = [
    ['inline <think>', `<think>reasoning</think>\nThe answer.`, null],
    ['inline <think> + tool block', `<think>r</think>\n${toolBlock}`, null],
    ['separate channel + tool block in content', toolBlock, 'the reasoning'],
    ['Gemma channel', `<|channel>thought\nreasoning\n<channel|>The answer.`, null],
    ['Qwen channel', `<|channel|>analysis<|message|>reasoning<|channel|>final<|message|>The answer.`, null],
    ['gemma tool token', `Sure. <|tool_call>{"name":"x"}<tool_call|>`, null],
    ['answer only', `Just a plain answer.`, null],
    ['reasoning only (no answer)', `<think>only reasoning, no answer</think>`, null],
  ];
  it.each(cases)('%s: answer carries no markup', (_label, content, reasoning) => {
    const { answer } = parseModelOutput(content, reasoning);
    expect(answer).not.toMatch(MARKUP);
  });

  it('reasoning-only message does NOT duplicate reasoning into answer', () => {
    const { reasoning, answer } = parseModelOutput('<think>abc</think>', null);
    expect(reasoning).toContain('abc');
    expect(answer).toBe('');
  });
});
