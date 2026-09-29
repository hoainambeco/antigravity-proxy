import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ApiKeyService } from "./api-key.service";
import { extractApiKeyToken, type RequestHeaders } from "../proxy-gateway/server/guards/api-key-auth.util";

interface ValidateKeyDto {
  key?: string;
}

@Controller("internal/auth")
export class AuthController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post("validate")
  @HttpCode(HttpStatus.OK)
  async validate(
    @Body() body: ValidateKeyDto,
    @Req() request: FastifyRequest,
  ) {
    const clientToken =
      body?.key?.trim() ||
      extractApiKeyToken(request.headers as RequestHeaders);

    if (!clientToken) {
      return { valid: false, error: "API key is required" };
    }

    const result = await this.apiKeyService.validateKey(clientToken);

    if (!result.valid) {
      return {
        valid: false,
        error:
          result.reason === "disabled"
            ? "API key is disabled"
            : result.reason === "expired"
              ? "API key has expired"
              : "Invalid API key",
      };
    }

    return {
      valid: true,
      keyId: result.keyId ?? null,
      keyName: result.keyName ?? null,
      role: result.role ?? "client",
      isMaster: result.isMaster ?? false,
    };
  }
}