import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { AccountLeaseService } from '@/modules/proxy-gateway/server/modules/account-lease/account-lease.service';
import { jsonAccountStoreInstance } from '@/modules/proxy-gateway/server/modules/account-lease/adapters/json-account.store';
import { GoogleAPIService } from '@/modules/cloud-account/services/GoogleAPIService';
import type { CloudAccount } from '@/modules/cloud-account/types';

interface OAuthCallbackDto {
  code: string;
  redirect_uri?: string;
}

@Controller('internal/accounts')
export class AccountManagementController {
  private readonly logger = new Logger(AccountManagementController.name);

  constructor(private readonly accountLeaseService: AccountLeaseService) {}

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
      const url = GoogleAPIService.getAuthUrl(undefined, customRedirectUri);
      return { url };
    } catch (error) {
      this.logger.error('Failed to generate OAuth URL', error);
      throw new HttpException(
        { message: 'Failed to generate OAuth URL', error: String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('oauth/callback')
  async handleOAuthCallback(@Body() body: OAuthCallbackDto) {
    if (!body?.code) {
      throw new HttpException('Authorization code is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const tokens = await GoogleAPIService.exchangeCode(
        body.code,
        undefined,
        undefined,
        body.redirect_uri,
      );

      let email = 'unknown@gmail.com';
      try {
        const userInfo = await GoogleAPIService.getUserInfo(tokens.access_token);
        if (userInfo.email) {
          email = userInfo.email;
        }
      } catch {
        this.logger.warn('Could not fetch email profile; using default');
      }

      let projectId = '';
      try {
        const projectContext = await GoogleAPIService.fetchProjectContext(tokens.access_token);
        projectId = projectContext.projectId || '';
      } catch {
        this.logger.warn('Could not auto-fetch project context');
      }

      const accounts = await jsonAccountStoreInstance.getAccounts();
      const existingIndex = accounts.findIndex((a) => a.email === email);
      const accountId =
        existingIndex !== -1
          ? accounts[existingIndex].id
          : `acc-${Date.now().toString().slice(-4)}`;

      const newAccount: CloudAccount = {
        id: accountId,
        provider: 'google',
        email,
        created_at: Date.now(),
        last_used: Date.now(),
        token: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          expiry_timestamp: Math.floor(Date.now() / 1000) + tokens.expires_in,
          token_type: tokens.token_type || 'Bearer',
          email,
          project_id: projectId || undefined,
        },
        health: {},
      };

      try {
        const quota = await GoogleAPIService.fetchQuota(tokens.access_token);
        newAccount.quota = quota;
      } catch (quotaErr) {
        this.logger.warn('Initial quota fetch failed, will retry on background interval', quotaErr);
      }

      await jsonAccountStoreInstance.upsertAccount(newAccount);
      await this.accountLeaseService.reloadAllAccounts();

      return {
        success: true,
        account: {
          id: accountId,
          email,
          project_id: projectId,
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
