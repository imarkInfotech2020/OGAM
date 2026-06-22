import { trimToolForSmallModel, truncateDescription } from '../../../pro/mcp/schemaTrim';
import type { McpTool } from '../../../pro/mcp/types';

const bigNotionTool = {
  name: 'notion-search',
  description: 'Search the user\'s Notion workspace and connected sources. '.repeat(20),
  inputSchema: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1, description: 'Semantic search query. '.repeat(20) },
      query_type: { type: 'string', enum: ['internal', 'user'] },
      filters: {
        type: 'object',
        properties: {
          created_date_range: {
            type: 'object',
            properties: {
              start_date: { type: 'string', format: 'date', pattern: '^\\d{4}-\\d\\d-\\d\\d$', description: 'x'.repeat(300) },
            },
            additionalProperties: {},
          },
        },
        additionalProperties: {},
      },
      teamspace_id: { type: 'string', description: 'y'.repeat(300) },
      page_url: { type: 'string', description: 'z'.repeat(300) },
    },
    required: ['query'],
    additionalProperties: {},
  },
} as unknown as McpTool;

describe('truncateDescription', () => {
  it('keeps short text, truncates long to first sentence / cap', () => {
    expect(truncateDescription('Short desc.')).toBe('Short desc.');
    expect(truncateDescription('First sentence here. Then a lot more that we drop.').length)
      .toBeLessThanOrEqual(160);
    expect(truncateDescription('x'.repeat(500)).length).toBeLessThanOrEqual(160);
  });
});

describe('trimToolForSmallModel', () => {
  it('passes a compact tool through unchanged', () => {
    const small: McpTool = {
      name: 'echo',
      description: 'Echo text back',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    };
    expect(trimToolForSmallModel(small)).toBe(small);
  });

  it('trims a bloated tool under budget while preserving the required param', () => {
    const trimmed = trimToolForSmallModel(bigNotionTool);
    const size = JSON.stringify({ name: trimmed.name, description: trimmed.description, parameters: trimmed.inputSchema }).length;
    expect(size).toBeLessThanOrEqual(800);
    // Required param survives.
    expect(trimmed.inputSchema.properties?.query).toBeDefined();
    expect(trimmed.inputSchema.required).toContain('query');
    // Noise keywords are gone.
    const json = JSON.stringify(trimmed.inputSchema);
    expect(json).not.toContain('$schema');
    expect(json).not.toContain('pattern');
    expect(json).not.toContain('additionalProperties');
    // Enum values preserved when query_type is kept.
    if (trimmed.inputSchema.properties?.query_type) {
      expect(trimmed.inputSchema.properties.query_type.enum).toEqual(['internal', 'user']);
    }
  });
});
