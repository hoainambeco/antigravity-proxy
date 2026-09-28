import fs from 'node:fs/promises';
import path from 'node:path';
import type { AccountLeaseAccountStore } from '../interfaces/account-lease-adapters';
import type { CloudAccount, CloudQuotaData } from '@/modules/cloud-account/types';
import { logger } from '@/shared/logging/logger';

export class JsonAccountStore implements AccountLeaseAccountStore {
  private filePath: string;
  private writeLock = Promise.resolve();

  constructor(filePath?: string) {
    this.filePath = path.resolve(filePath || process.env.ACCOUNTS_FILE || './accounts.json');
  }

  async getAccounts(): Promise<CloudAccount[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        return data as CloudAccount[];
      }
      return [];
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn(`Accounts file not found at ${this.filePath}. Initializing empty accounts array.`);
        await this.saveAccounts([]);
        return [];
      }
      logger.error(`Failed to read accounts file from ${this.filePath}:`, err);
      return [];
    }
  }

  async getAccount(accountId: string): Promise<CloudAccount | undefined> {
    const accounts = await this.getAccounts();
    return accounts.find((a) => a.id === accountId);
  }

  /**
   * Adds an account, or merges into the existing one with the same id.
   *
   * Not part of AccountLeaseAccountStore: the lease runtime only ever reads and
   * updates accounts, so adding is kept to the callers that provision them.
   */
  async upsertAccount(account: CloudAccount): Promise<void> {
    await this.lockedWrite((accounts) => {
      const idx = accounts.findIndex((a) => a.id === account.id);
      if (idx === -1) {
        accounts.push(account);
        return;
      }

      // Preserve what the caller does not know about: quota, accrued health, the
      // original created_at, and any token fields it did not refresh.
      accounts[idx] = {
        ...accounts[idx],
        ...account,
        created_at: accounts[idx].created_at ?? account.created_at,
        token: { ...accounts[idx].token, ...account.token },
        health: { ...accounts[idx].health, ...account.health },
      };
    });
  }

  async updateToken(accountId: string, token: CloudAccount['token']): Promise<void> {
    await this.lockedWrite(async (accounts) => {
      const idx = accounts.findIndex((a) => a.id === accountId);
      if (idx !== -1) {
        accounts[idx].token = {
          ...accounts[idx].token,
          ...token,
        };
      }
    });
  }

  async updateQuota(accountId: string, quota: CloudQuotaData): Promise<void> {
    await this.lockedWrite(async (accounts) => {
      const idx = accounts.findIndex((a) => a.id === accountId);
      if (idx !== -1) {
        accounts[idx].quota = quota;
      }
    });
  }

  async deleteAccount(accountId: string): Promise<boolean> {
    let deleted = false;
    await this.lockedWrite((accounts) => {
      const idx = accounts.findIndex((a) => a.id === accountId);
      if (idx !== -1) {
        accounts.splice(idx, 1);
        deleted = true;
      }
    });
    return deleted;
  }

  async mutateHealth(
    accountId: string,
    mutation: (health: CloudAccount['health']) => CloudAccount['health'],
  ): Promise<CloudAccount['health']> {
    let resultHealth: CloudAccount['health'];
    await this.lockedWrite(async (accounts) => {
      const idx = accounts.findIndex((a) => a.id === accountId);
      if (idx !== -1) {
        const nextHealth = mutation(accounts[idx].health);
        accounts[idx].health = nextHealth;
        resultHealth = nextHealth;
      }
    });
    return resultHealth;
  }

  private async lockedWrite(updateFn: (accounts: CloudAccount[]) => Promise<void> | void): Promise<void> {
    this.writeLock = this.writeLock
      .catch(() => {})
      .then(async () => {
        const accounts = await this.getAccounts();
        await updateFn(accounts);
        await this.saveAccounts(accounts);
      });
    return this.writeLock;
  }

  private async saveAccounts(accounts: CloudAccount[]): Promise<void> {
    const tempPath = `${this.filePath}.tmp.${Date.now()}`;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(tempPath, JSON.stringify(accounts, null, 2), 'utf-8');
    await fs.rename(tempPath, this.filePath);
  }
}

export const jsonAccountStoreInstance = new JsonAccountStore();
