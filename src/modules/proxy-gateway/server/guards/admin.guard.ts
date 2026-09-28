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
      .getRequest<{ headers: RequestHeaders; ip?: string }>();
    const clientToken = extractApiKeyToken(request.headers);

    if (this.apiKeyService) {
      if (!this.apiKeyService.hasConfiguredProtection()) {
        throw new UnauthorizedException("Admin protection is not configured");
      }

      if (!clientToken) {
        throw new UnauthorizedException("API key is required");
      }

      const isAdmin = await this.apiKeyService.validateAdminKey(clientToken);
      if (isAdmin) {
        return true;
      }

      this.logger.warn(`Rejected unauthorized admin request`);
      throw new UnauthorizedException("Admin API key validation failed");
    }

    // Fallback if ApiKeyService is not registered
    const config = getServerConfig();
    const apiKey = config?.api_key;

    if (!hasConfiguredApiKey(apiKey)) {
      throw new UnauthorizedException("Admin API key is not configured");
    }

    if (clientToken && clientToken === apiKey) {
      return true;
    }

    throw new UnauthorizedException("API key validation failed");
  }
}
