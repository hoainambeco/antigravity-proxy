import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

@Controller()
export class WebUiController {
  @Get()
  serveRoot(@Res() reply: FastifyReply) {
    if (typeof (reply as any).sendFile === 'function') {
      return (reply as any).sendFile('index.html');
    }
    return reply.status(200).send('LLM Gateway Proxy is running.');
  }

  @Get('dashboard')
  serveDashboard(@Res() reply: FastifyReply) {
    if (typeof (reply as any).sendFile === 'function') {
      return (reply as any).sendFile('index.html');
    }
    return reply.status(200).send('LLM Gateway Proxy is running.');
  }

  @Get('accounts')
  serveAccounts(@Res() reply: FastifyReply) {
    if (typeof (reply as any).sendFile === 'function') {
      return (reply as any).sendFile('index.html');
    }
    return reply.status(200).send('LLM Gateway Proxy is running.');
  }

  @Get('models')
  serveModels(@Res() reply: FastifyReply) {
    if (typeof (reply as any).sendFile === 'function') {
      return (reply as any).sendFile('index.html');
    }
    return reply.status(200).send('LLM Gateway Proxy is running.');
  }

  @Get('api-keys')
  serveApiKeys(@Res() reply: FastifyReply) {
    if (typeof (reply as any).sendFile === 'function') {
      return (reply as any).sendFile('index.html');
    }
    return reply.status(200).send('LLM Gateway Proxy is running.');
  }

  @Get('audit')
  serveAudit(@Res() reply: FastifyReply) {
    if (typeof (reply as any).sendFile === 'function') {
      return (reply as any).sendFile('index.html');
    }
    return reply.status(200).send('LLM Gateway Proxy is running.');
  }
}
