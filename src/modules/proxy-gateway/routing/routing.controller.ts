import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '@/modules/proxy-gateway/server/guards/admin.guard';
import { RuleBasedRouterService } from './rule-based-router.service';
import { RoutingConfig } from './routing.types';

@Controller('internal/routing')
@UseGuards(AdminGuard)
export class RoutingController {
  private readonly logger = new Logger(RoutingController.name);

  constructor(
    @Inject(RuleBasedRouterService)
    private readonly routerService: RuleBasedRouterService,
  ) {}

  @Get()
  getConfig() {
    try {
      return {
        success: true,
        data: this.routerService.getConfig(),
      };
    } catch (error) {
      this.logger.error('Failed to get routing config', error);
      throw new HttpException('Failed to retrieve routing configuration', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post()
  async updateConfig(@Body() body: RoutingConfig) {
    if (!body || !Array.isArray(body.rules) || !Array.isArray(body.default_pipeline)) {
      throw new HttpException('Invalid routing configuration shape', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.routerService.saveConfig(body);
      return {
        success: true,
        message: 'Routing configuration updated successfully',
        data: this.routerService.getConfig(),
      };
    } catch (error) {
      this.logger.error('Failed to update routing config', error);
      throw new HttpException('Failed to save routing configuration', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
