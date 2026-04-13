import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function textResponse(text: string): CallToolResult {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

export function errorResponse(message: string): CallToolResult {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}