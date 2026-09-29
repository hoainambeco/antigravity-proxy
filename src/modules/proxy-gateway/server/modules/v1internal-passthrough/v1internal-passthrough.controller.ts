import {
  Body,
  Controller,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ProxyGuard } from '../../guards/proxy.guard';
import { V1InternalPassthroughService } from './v1internal-passthrough.service';

@Controller('v1internal')
@UseGuards(ProxyGuard)
export class V1InternalPassthroughController {
  constructor(
    @Inject(V1InternalPassthroughService)
    private readonly passthroughService: V1InternalPassthroughService,
  ) {}

  @Post('countTokens')
  async countTokens(
    @Body() body: unknown,
    @Res() response: FastifyReply,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.forward('countTokens', body, response, request);
  }

  @Post('embedContent')
  async embedContent(
    @Body() body: unknown,
    @Res() response: FastifyReply,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.forward('embedContent', body, response, request);
  }

  @Post('generateChat')
  async generateChat(
    @Body() body: unknown,
    @Res() response: FastifyReply,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.forward('generateChat', body, response, request);
  }

  private async forward(
    verb: string,
    body: unknown,
    response: FastifyReply,
    request: FastifyRequest,
  ): Promise<void> {
    const apiKeyInfo = (request as FastifyRequest & {
      apiKeyInfo?: { allowedAccountIds?: string[] | null };
    }).apiKeyInfo;
    const upstream = await this.passthroughService.forward(
      verb,
      body,
      apiKeyInfo?.allowedAccountIds ?? null,
    );
    for (const [name, value] of Object.entries(upstream.headers)) {
      response.header(name, value);
    }

    response.status(upstream.status).send(upstream.body);
  }
}
