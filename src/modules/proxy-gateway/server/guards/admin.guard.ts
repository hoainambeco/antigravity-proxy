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
import {
  extractApiKeyToken,
  hasConfiguredApiKey,
  type RequestHeaders,
} from "./api-key-auth.util";

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(
    @Optional()
    @Inject(ApiKeyService)
    private readonly apiKeyService?: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: RequestHeaders; ip?: string; socket?: any; raw?: any }>();
    const clientToken = extractApiKeyToken(request.headers);

    const clientIp =
      request.ip ||
      request.raw?.socket?.remoteAddress ||
      request.socket?.remoteAddress ||
      "";
    const isLoopback =
      clientIp === "127.0.0.1" ||
      clientIp === "::1" ||
      clientIp === "::ffff:127.0.0.1" ||
      clientIp.startsWith("127.") ||
      clientIp === "localhost";

    const config = getServerConfig();
    const masterKey = (
      config?.api_key ||
      process.env.PROXY_API_KEY ||
      ""
    ).trim();

    // 1. If client provided a token, validate it
    if (clientToken) {
      if (this.apiKeyService) {
        const isAdmin = await this.apiKeyService.validateAdminKey(clientToken);
        if (isAdmin) {
          return true;
        }
      }
      if (hasConfiguredApiKey(masterKey) && clientToken === masterKey) {
        return true;
      }
      this.logger.warn(`Rejected unauthorized admin request with invalid token`);
      throw new UnauthorizedException("Admin API key validation failed");
    }

    // 2. Loopback / localhost: allow local administrative dashboard access
    //    (remote access still requires a valid API key)
    if (isLoopback) {
      return true;
    }

    // 3. Otherwise require an API key
    throw new UnauthorizedException("API key is required");
  }
}
