import * as vscode from 'vscode';
import { FleetLogger } from '../utils/logger';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ModelsApi {
  private readonly logger: FleetLogger;

  constructor(logger: FleetLogger) {
    this.logger = logger;
  }

  async chat(
    messages: LLMMessage[],
    token: vscode.CancellationToken
  ): Promise<string> {
    this.logger.debug('Sending request to VS Code LM API');

    const [model] = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      family: 'gpt-4o',
    });

    if (!model) {
      throw new Error(
        'No Copilot chat model available. Ensure GitHub Copilot is active.'
      );
    }

    const vscodeMessages = messages.map(m => {
      if (m.role === 'user') {
        return vscode.LanguageModelChatMessage.User(m.content);
      }
      return vscode.LanguageModelChatMessage.Assistant(m.content);
    });

    const response = await model.sendRequest(vscodeMessages, {}, token);
    const parts: string[] = [];

    for await (const chunk of response.text) {
      parts.push(chunk);
    }

    const result = parts.join('');
    this.logger.debug(`LLM response length: ${result.length}`);
    return result;
  }
}
