import { Module } from '@nestjs/common';
import { AnthropicUpstreamService } from './anthropic/anthropic-upstream.service';
import { AnthropicOAuthRefresher } from './anthropic/anthropic-oauth-refresher';
import { OpenAIUpstreamService } from './openai/openai-upstream.service';
import { OpenAIOAuthRefresher } from './openai/openai-oauth-refresher';
import { CopilotTokenService } from './copilot/copilot-token.service';
import { CopilotUpstreamService } from './copilot/copilot-upstream.service';
import { ClaudeWebUpstreamService } from './claude-web/claude-web-upstream.service';
import { ChatGPTWebUpstreamService } from './chatgpt-web/chatgpt-web-upstream.service';

@Module({
  providers: [
    AnthropicUpstreamService,
    AnthropicOAuthRefresher,
    OpenAIUpstreamService,
    OpenAIOAuthRefresher,
    CopilotTokenService,
    CopilotUpstreamService,
    ClaudeWebUpstreamService,
    ChatGPTWebUpstreamService,
  ],
  exports: [
    AnthropicUpstreamService,
    AnthropicOAuthRefresher,
    OpenAIUpstreamService,
    OpenAIOAuthRefresher,
    CopilotTokenService,
    CopilotUpstreamService,
    ClaudeWebUpstreamService,
    ChatGPTWebUpstreamService,
  ],
})
export class UpstreamsModule {}
