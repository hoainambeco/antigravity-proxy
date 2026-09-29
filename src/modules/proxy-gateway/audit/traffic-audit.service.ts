import { randomUUID } from 'node:crypto';
import { getStandaloneDataSource } from '@/modules/database/database.config';
import type { TrafficAuditConfig } from '@/modules/config/types';
import { DEFAULT_APP_CONFIG } from '@/modules/config/types';
import { getServerConfig } from '@/server/server-config';
import { logger } from '@/shared/logging/logger';
import type {
  CompleteAuditParentInput,
  CompleteUpstreamAttemptInput,
  StartAuditParentInput,
  StartUpstreamAttemptInput,
  TrafficAuditBodyPage,
  TrafficAuditBodyPageInput,
  TrafficAuditDetail,
  TrafficAuditListInput,
  TrafficAuditStats,
} from './traffic-audit.types';
import type { TrafficClass } from './traffic-classifier';
import { TrafficLog } from './entities/traffic-log.entity';

export interface AuditHandle {
  id: string;
  startedAt: number;
  trafficClass: TrafficClass;
  method?: string;
  url?: string;
  model?: string;
  apiKeyId?: string;
}

export interface UpstreamAttemptHandle {
  attemptSequence: number;
  id: string;
  parentId: string;
  startedAt: number;
  trafficClass: TrafficClass;
}

export interface AuditSseBodyWriter {
  write(chunk: string): boolean;
  finish(outcome?: unknown): Promise<void>;
  end?(): void;
}

export interface DatabaseRepairResult {
  error?: string;
  recoveredRecords?: number;
  success: boolean;
}

interface StoredTrafficLog {
  id: string;
  apiKeyId: string | null;
  timestamp: number;
  method: string;
  endpoint: string;
  model: string | null;
  status: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  errorMessage: string | null;
}

export class TrafficAuditService {
  private config: TrafficAuditConfig | null = null;

  private getConfig(): TrafficAuditConfig {
    return this.config ?? getServerConfig()?.traffic_audit ?? DEFAULT_APP_CONFIG.proxy.traffic_audit;
  }

  public isEnabled(): boolean {
    return this.getConfig().enabled;
  }

  private async getRepository() {
    try {
      const dataSource = await getStandaloneDataSource();
      return dataSource.getRepository(TrafficLog);
    } catch (err) {
      logger.warn('Could not obtain TypeORM traffic_logs repository:', err);
      return null;
    }
  }

  private async recordTraffic(log: StoredTrafficLog): Promise<void> {
    const repo = await this.getRepository();
    if (!repo) {
      return;
    }
    try {
      const entity = repo.create({
        id: log.id,
        apiKeyId: log.apiKeyId,
        timestamp: log.timestamp,
        method: log.method,
        endpoint: log.endpoint,
        model: log.model,
        status: log.status,
        latencyMs: log.latencyMs,
        promptTokens: log.promptTokens,
        completionTokens: log.completionTokens,
        totalTokens: log.totalTokens,
        errorMessage: log.errorMessage,
      });
      await repo.insert(entity);

      // Keep max 10,000 records to prevent growth (5% sample check)
      if (Math.random() < 0.05) {
        await repo.query(
          `DELETE FROM traffic_logs WHERE id IN (
            SELECT id FROM traffic_logs ORDER BY timestamp DESC LIMIT -1 OFFSET 10000
          )`,
        );
      }
    } catch (err) {
      logger.warn('Failed to insert traffic log via TypeORM', err);
    }
  }

  public startParent(input: StartAuditParentInput): AuditHandle | null {
    if (!this.isEnabled()) {
      return null;
    }
    const startedAt = Date.now();

    let modelName: string | undefined = undefined;
    if (typeof input.requestBody === 'object' && input.requestBody !== null) {
      modelName = (input.requestBody as any).model;
    }
    if (!modelName && input.url) {
      const match = /\/models\/([^/:?]+)/.exec(input.url);
      if (match) {
        modelName = match[1];
      }
    }

    const handle: AuditHandle = {
      id: randomUUID(),
      startedAt,
      trafficClass: input.trafficClass,
      method: input.method,
      url: input.url,
      model: modelName,
      apiKeyId: input.apiKeyId,
    };

    logger.info(`[Audit] --> ${input.method} ${input.url} (class: ${input.trafficClass}, id: ${handle.id.slice(0, 8)})`);
    return handle;
  }

  public completeParent(handle: AuditHandle | null, input: CompleteAuditParentInput): void {
    if (!handle) {
      return;
    }
    const duration = Math.max(1, Date.now() - handle.startedAt);
    const status = input.status ?? (input.error ? 500 : 200);
    logger.info(`[Audit] <-- Completed (${status}) in ${duration}ms (id: ${handle.id.slice(0, 8)})`);

    // Only persist logs for actual AI model usage; skip auxiliary/system/ipc requests
    if (handle.trafficClass !== 'model') {
      return;
    }

    // Strictly save only non-sensitive metadata (NO prompt/chat content)
    void this.recordTraffic({
      id: handle.id,
      apiKeyId: input.apiKeyId ?? handle.apiKeyId ?? null,
      timestamp: handle.startedAt,
      method: handle.method || 'POST',
      endpoint: handle.url || '',
      model: handle.model || null,
      status,
      latencyMs: duration,
      promptTokens: input.usage?.inputTokens || 0,
      completionTokens: input.usage?.outputTokens || 0,
      totalTokens: (input.usage?.inputTokens || 0) + (input.usage?.outputTokens || 0),
      errorMessage: input.error
        ? input.error instanceof Error
          ? input.error.message
          : String(input.error)
        : null,
    });
  }

  public startAttempt(
    parent: AuditHandle | null,
    attemptSequence: number,
    _input?: StartUpstreamAttemptInput,
  ): UpstreamAttemptHandle | null {
    if (!parent || !this.isEnabled()) {
      return null;
    }
    return {
      attemptSequence,
      id: randomUUID(),
      parentId: parent.id,
      startedAt: Date.now(),
      trafficClass: parent.trafficClass,
    };
  }

  public completeAttempt(
    handle: UpstreamAttemptHandle | null,
    input: CompleteUpstreamAttemptInput,
  ): void {
    if (!handle) {
      return;
    }
    const duration = Date.now() - handle.startedAt;
    logger.debug(`[Audit] Upstream attempt ${handle.attemptSequence} finished (${input.status}) in ${duration}ms`);
  }

  public beginParentSse(_handle: AuditHandle | null): AuditSseBodyWriter | null {
    return {
      write: () => true,
      finish: () => Promise.resolve(),
      end: () => {},
    };
  }

  public beginAttemptSse(_handle: UpstreamAttemptHandle | null): AuditSseBodyWriter | null {
    return {
      write: () => true,
      finish: () => Promise.resolve(),
      end: () => {},
    };
  }

  public async list(input?: TrafficAuditListInput) {
    const repo = await this.getRepository();
    if (!repo) {
      return { data: [], rows: [], total: 0 };
    }
    const limit = Math.min(input?.limit ?? 50, 100);
    const offset = input?.offset ?? 0;

    try {
      const [logs, total] = await repo.findAndCount({
        order: { timestamp: 'DESC' },
        take: limit,
        skip: offset,
      });

      const rows = logs.map((log) => ({
        requestId: log.id,
        apiKeyId: log.apiKeyId,
        timestamp: log.timestamp,
        method: log.method,
        endpoint: log.endpoint,
        model: log.model,
        status: log.status,
        latencyMs: log.latencyMs,
        promptTokens: log.promptTokens,
        completionTokens: log.completionTokens,
        totalTokens: log.totalTokens,
        errorMessage: log.errorMessage,
      }));

      return { data: rows, rows, total };
    } catch (err) {
      logger.warn('Failed to query traffic logs via TypeORM', err);
      return { data: [], rows: [], total: 0 };
    }
  }

  public async filterOptions() {
    const repo = await this.getRepository();
    if (!repo) {
      return { models: [], operations: [], protocols: [] };
    }
    try {
      const modelRows: Array<{ model: string }> = await repo
        .createQueryBuilder('log')
        .select('DISTINCT log.model', 'model')
        .where('log.model IS NOT NULL')
        .getRawMany();
      return {
        models: modelRows.map((r) => r.model),
        operations: ['chat', 'messages', 'models'],
        protocols: ['openai', 'anthropic', 'gemini'],
      };
    } catch {
      return { models: [], operations: [], protocols: [] };
    }
  }

  public async detail(_id: string): Promise<TrafficAuditDetail | null> {
    return null;
  }

  public async bodyPage(_input: TrafficAuditBodyPageInput): Promise<TrafficAuditBodyPage | null> {
    return null;
  }

  public async *bodyContent(_bodyId: string): AsyncGenerator<string> {
    // Empty generator - no body content stored
  }

  public async bodySearch() {
    return { matches: [] };
  }

  public async stats(): Promise<TrafficAuditStats> {
    const repo = await this.getRepository();
    let rowCount = 0;
    if (repo) {
      try {
        rowCount = await repo.count();
      } catch {
        // ignore
      }
    }
    return {
      bodyStoredBytes: 0,
      databaseBytes: 0,
      droppedCount: 0,
      incompleteBodies: 0,
      lastDropReason: null,
      oldestTimestamp: null,
      rows: rowCount,
      workerAlive: true,
      workerPendingBytes: 0,
      workerPendingCommands: 0,
    };
  }

  public async delete(id: string): Promise<number> {
    const repo = await this.getRepository();
    if (!repo) return 0;
    try {
      const res = await repo.delete(id);
      return res.affected ?? 0;
    } catch {
      return 0;
    }
  }

  public async clear(_trafficClass: TrafficClass | null = null): Promise<number> {
    const repo = await this.getRepository();
    if (!repo) return 0;
    try {
      const logs = await repo.find();
      await repo.remove(logs);
      return logs.length;
    } catch {
      return 0;
    }
  }

  public async configure(config: TrafficAuditConfig): Promise<void> {
    this.config = config;
  }

  public async repair(): Promise<DatabaseRepairResult> {
    return { success: true };
  }

  public recordAdminOperation(_op: string, _affected?: number): void {}

  public async close(): Promise<void> {}
}

export const trafficAuditService = new TrafficAuditService();
