import { ApiKeyService } from "@/modules/api-key/api-key.service";
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { getServerConfig } from "../../../../server/server-config";
import { setCurrentAuditAllowedAccountIds } from "../../audit/traffic-audit-context";
import {
  buildAuthErrorBody,
  resolveAuthErrorSurface,
} from "../common/auth-error-envelope";
import {
  extractApiKeyToken,
  hasConfiguredApiKey,
  type RequestHeaders,
} from "./api-key-auth.util";

@Injectable()
export class ProxyGuard implements CanActivate {
  private readonly logger = new Logger(ProxyGuard.name);

  constructor(
    @Optional()
    @Inject(ApiKeyService)
    private readonly apiKeyService?: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{
        headers: RequestHeaders;
        ip: string;
        url?: string;
        apiKeyInfo?: unknown;
      }>();

    // 1. If ApiKeyService is available, use dynamic multi-key validation
    if (this.apiKeyService) {
      if (!this.apiKeyService.hasConfiguredProtection()) {
        // Open Mode (no keys configured)
        return true;
      }

      const clientToken = extractApiKeyToken(request.headers);
      const surface = resolveAuthErrorSurface(request);

      const clientIp =
        request.ip ||
        (request as any).raw?.socket?.remoteAddress ||
        (request as any).socket?.remoteAddress ||
        "";
      const isLoopback =
        clientIp === "127.0.0.1" ||
        clientIp === "::1" ||
        clientIp === "::ffff:127.0.0.1" ||
        clientIp.startsWith("127.");

      const rawReq = (request as any).raw;
      const method = rawReq?.method || "GET";
      const url = request.url || "";
      const isModelCatalogRoute =
        method === "GET" &&
        (url === "/v1/models" ||
          url.startsWith("/v1/models?") ||
          url.startsWith("/v1/models/") ||
          url === "/v1beta/models" ||
          url.startsWith("/v1beta/models?") ||
          url.startsWith("/v1beta/models/"));

      // Allow viewing model list without requiring key on localhost/browser
      if (isModelCatalogRoute && (isLoopback || !clientToken)) {
        if (clientToken) {
          const authResult = await this.apiKeyService.validateKey(clientToken);
          if (authResult.valid) {
            request.apiKeyInfo = authResult;
            setCurrentAuditAllowedAccountIds(authResult.allowedAccountIds ?? null);
          }
        }
        return true;
      }

      if (!clientToken) {
        this.logger.warn(
          `Rejected request missing API key from ${request.ip} (${request.url})`,
        );
        throw new UnauthorizedException(
          buildAuthErrorBody(surface, "API key is required"),
        );
      }

      const authResult = await this.apiKeyService.validateKey(clientToken);
      if (authResult.valid) {
        request.apiKeyInfo = authResult;
        setCurrentAuditAllowedAccountIds(authResult.allowedAccountIds ?? null);
        return true;
      }

      this.logger.warn(
        `Rejected unauthorized request from ${request.ip}: ${authResult.reason || "invalid_key"}`,
      );
      const message =
        authResult.reason === "disabled"
          ? "API key is disabled"
          : authResult.reason === "expired"
            ? "API key has expired"
            : "API key validation failed";

      throw new UnauthorizedException(buildAuthErrorBody(surface, message));
    }

    // 2. Fallback to static config check if ApiKeyService is not registered
    const config = getServerConfig();
    const apiKey = config?.api_key;
    const clientToken = extractApiKeyToken(request.headers);

    if (!hasConfiguredApiKey(apiKey)) {
      return true;
    }

    if (clientToken === apiKey) {
      return true;
    }

    this.logger.warn(`Rejected unauthorized request from ${request.ip}`);
    const surface = resolveAuthErrorSurface(request);
    throw new UnauthorizedException(
      buildAuthErrorBody(surface, "API key validation failed"),
    );
  }
}
