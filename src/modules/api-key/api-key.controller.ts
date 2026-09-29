import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AdminGuard } from "../proxy-gateway/server/guards/admin.guard";
import {
  extractApiKeyToken,
  type RequestHeaders,
} from "../proxy-gateway/server/guards/api-key-auth.util";
import { ApiKeyService } from "./api-key.service";
import { CreateApiKeyDto, UpdateApiKeyDto } from "./dto/api-key.dto";

@Controller("internal/api-keys")
@UseGuards(AdminGuard)
export class ApiKeyController {
  constructor(
    @Inject(ApiKeyService) private readonly apiKeyService: ApiKeyService,
  ) {}

  @Get()
  async listKeys() {
    const keys = await this.apiKeyService.listKeys(false);
    return {
      success: true,
      data: keys,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createKey(@Body() body: CreateApiKeyDto) {
    const created = await this.apiKeyService.createKey(body);
    return {
      success: true,
      data: created, // returns full raw key upon creation so user can copy it
      message:
        "API Key created successfully. Store the key securely as it will not be displayed in full again.",
    };
  }

  @Get(":id/raw")
  async getRawKey(@Param("id") id: string) {
    const key = await this.apiKeyService.getRawKey(id);
    return {
      success: true,
      key,
    };
  }

  @Get(":id")
  async getKey(@Param("id") id: string) {
    const key = await this.apiKeyService.getKeyById(id);
    return {
      success: true,
      data: {
        ...key,
        key: this.apiKeyService.maskKey(key.key),
      },
    };
  }

  @Patch(":id")
  async updateKey(@Param("id") id: string, @Body() body: UpdateApiKeyDto) {
    const updated = await this.apiKeyService.updateKey(id, body);
    return {
      success: true,
      data: {
        ...updated,
        key: this.apiKeyService.maskKey(updated.key),
      },
      message: "API Key updated successfully",
    };
  }

  @Delete(":id")
  async deleteKey(@Param("id") id: string) {
    await this.apiKeyService.deleteKey(id);
    return {
      success: true,
      message: `API Key with ID ${id} deleted successfully`,
    };
  }
}
