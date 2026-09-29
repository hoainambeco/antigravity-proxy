import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AccountLeaseService } from '@/modules/proxy-gateway/server/modules/account-lease/account-lease.service';
import { GoogleAPIService } from '@/modules/cloud-account/services/GoogleAPIService';
import { OAuthCallbackServer } from '@/modules/cloud-account/services/OAuthCallbackServer';
import { AdminGuard } from '@/modules/proxy-gateway/server/guards/admin.guard';
import { Public } from '@/modules/proxy-gateway/server/guards/public.decorator';

interface OAuthCallbackDto {
  code: string;
  redirect_uri?: string;
}

@Controller('internal/accounts')
@UseGuards(AdminGuard)
export class AccountManagementController {
  private readonly logger = new Logger(AccountManagementController.name);

  constructor(
    private readonly accountLeaseService: AccountLeaseService,
    private readonly oauthCallbackServer: OAuthCallbackServer,
  ) {}

  @Get()
  async listAccounts() {
    try {
      const accounts = await this.accountLeaseService.getAccountsOverview();
      return {
        data: accounts,
        total: accounts.length,
      };
    } catch (error) {
      this.logger.error('Failed to list accounts', error);
      throw new HttpException(
        { message: 'Failed to retrieve accounts', error: String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('sync')
  async syncAccounts(@Query('id') accountId?: string) {
    try {
      if (accountId) {
        const synced = await this.accountLeaseService.syncSingleAccount(accountId);
        if (!synced) {
          throw new HttpException('Account not found or sync failed', HttpStatus.BAD_REQUEST);
        }
        return { success: true, message: `Account ${accountId} synced successfully` };
      }

      await this.accountLeaseService.syncAllAccountQuotas();
      return { success: true, message: 'All accounts synced successfully' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Sync failed', error);
      throw new HttpException(
        { message: 'Sync failed', error: String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  async deleteAccount(@Param('id') accountId: string) {
    try {
      const deleted = await this.accountLeaseService.deleteAccountById(accountId);
      if (!deleted) {
        throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
      }
      return { success: true, message: `Account ${accountId} deleted` };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to delete account ${accountId}`, error);
      throw new HttpException(
        { message: 'Failed to delete account', error: String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('oauth/url')
  getOAuthUrl(@Query('redirect_uri') customRedirectUri?: string) {
    try {
      const redirectUri =
        customRedirectUri ||
        process.env.GOOGLE_OAUTH_REDIRECT_URI ||
        this.oauthCallbackServer.getRedirectUri();
      const url = GoogleAPIService.getAuthUrl(undefined, redirectUri);
      return { url };
    } catch (error) {
      this.logger.error('Failed to generate OAuth URL', error);
      throw new HttpException(
        { message: 'Failed to generate OAuth URL', error: String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Public()
  @Get('oauth/callback')
  async oauthCallback(
    @Req() req: FastifyRequest,
    @Query('code') code?: string,
    @Query('error') error?: string,
  ) {
    if (error || !code) {
      return this.oauthCallbackServer.renderError(error || 'Thiếu mã code');
    }

    try {
      // Reconstruct the exact redirect_uri that generated this auth URL so the
      // token exchange matches what Google issued the code for.
      const protocol = req.protocol || 'http';
      const host = req.headers.host || req.hostname;
      const redirectUri = `${protocol}://${host}/internal/accounts/oauth/callback`;
      const account = await this.oauthCallbackServer.saveOAuthAccount(code, redirectUri);
      return this.oauthCallbackServer.renderSuccess(
        account.email,
        account.id,
      );
    } catch (error) {
      this.logger.error('OAuth callback failed', error);
      return this.oauthCallbackServer.renderError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  @Public()
  @Post('oauth/callback')
  async handleOAuthCallback(@Body() body: OAuthCallbackDto) {
    if (!body?.code) {
      throw new HttpException('Authorization code is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const redirectUri =
        body.redirect_uri ||
        process.env.GOOGLE_OAUTH_REDIRECT_URI ||
        this.oauthCallbackServer.getRedirectUri();
      const account = await this.oauthCallbackServer.saveOAuthAccount(body.code, redirectUri);

      return {
        success: true,
        account: {
          id: account.id,
          email: account.email,
          project_id: account.token?.project_id || '',
        },
      };
    } catch (error) {
      this.logger.error('OAuth token exchange failed', error);
      throw new HttpException(
        { message: 'OAuth exchange failed', error: error instanceof Error ? error.message : String(error) },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}