import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { getDatabasePath } from '@/modules/database/database.config';
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

export interface AuditHandle {
  id: string;
  startedAt: number;
  trafficClass: TrafficClass;
  method?: string;
  url?: string;
  model?: string;
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
  timestamp: number;
  method: string;
  endpoint: string;
  model: string | null;
  status: number;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  error_message: string | null;
}

export class TrafficAuditService {
  private config: TrafficAuditConfig | null = null;
  private db: Database.Database | null = null;

  private getConfig(): TrafficAuditConfig {
    return this.config ?? getServerConfig()?.traffic_audit ?? DEFAULT_APP_CONFIG.proxy.traffic_audit;
  }

  public isEnabled(): boolean {
    return this.getConfig().enabled;
  }

  private getDb(): Database.Database | null {
    if (this.db) {
      return this.db;
    }
    try {
      const dbPath = getDatabasePath();
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS traffic_logs (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          method TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          model TEXT,
          status INTEGER NOT NULL,
          latency_ms INTEGER NOT NULL DEFAULT 0,
          prompt_tokens INTEGER DEFAULT 0,
          completion_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          error_message TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_traffic_logs_timestamp ON traffic_logs (timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_traffic_logs_model ON traffic_logs (model);
        CREATE INDEX IF NOT EXISTS idx_traffic_logs_status ON traffic_logs (status);
      `);
      return this.db;
    } catch (err) {
      logger.warn('Could not initialize SQLite traffic_logs database:', err);
      return null;
    }
  }

  private recordTraffic(log: StoredTrafficLog): void {
    const db = this.getDb();
    if (!db) {
      return;
    }
    try {
      const stmt = db.prepare(`
        INSERT INTO traffic_logs (
          id, timestamp, method, endpoint, model, status, latency_ms,
          prompt_tokens, completion_tokens, total_tokens, error_message
        ) VALUES (
          @id, @timestamp, @method, @endpoint, @model, @status, @latency_ms,
          @prompt_tokens, @completion_tokens, @total_tokens, @error_message
        )
      `);
      stmt.run(log);

      // Keep max 10,000 records to prevent growth (5% sample check)
      if (Math.random() < 0.05) {
        db.prepare(`
          DELETE FROM traffic_logs WHERE id IN (
            SELECT id FROM traffic_logs ORDER BY timestamp DESC LIMIT -1 OFFSET 10000
          )
        `).run();
      }
    } catch (err) {
      logger.warn('Failed to insert traffic log into SQLite', err);
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
    this.recordTraffic({
      id: handle.id,
      timestamp: handle.startedAt,
      method: handle.method || 'POST',
      endpoint: handle.url || '',
      model: handle.model || null,
      status,
      latency_ms: duration,
      prompt_tokens: input.usage?.inputTokens || 0,
      completion_tokens: input.usage?.outputTokens || 0,
      total_tokens: (input.usage?.inputTokens || 0) + (input.usage?.outputTokens || 0),
      error_message: input.error
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
    const db = this.getDb();
    if (!db) {
      return { data: [], rows: [], total: 0 };
    }
    const limit = Math.min(input?.limit ?? 50, 100);
    const offset = input?.offset ?? 0;

    try {
      const rows = db.prepare(`
        SELECT 
          id as requestId,
          timestamp,
          method,
          endpoint,
          model,
          status,
          latency_ms as latencyMs,
          prompt_tokens as promptTokens,
          completion_tokens as completionTokens,
          total_tokens as totalTokens,
          error_message as errorMessage
        FROM traffic_logs
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset);

      const totalResult: any = db.prepare(`SELECT count(*) as count FROM traffic_logs`).get();
      const total = totalResult?.count ?? 0;

      return { data: rows, rows, total };
    } catch (err) {
      logger.warn('Failed to query traffic logs from SQLite', err);
      return { data: [], rows: [], total: 0 };
    }
  }

  public async filterOptions() {
    const db = this.getDb();
    if (!db) {
      return { models: [], operations: [], protocols: [] };
    }
    try {
      const modelRows: any[] = db.prepare(`SELECT DISTINCT model FROM traffic_logs WHERE model IS NOT NULL`).all();
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
    const db = this.getDb();
    let rowCount = 0;
    if (db) {
      try {
        const totalResult: any = db.prepare(`SELECT count(*) as count FROM traffic_logs`).get();
        rowCount = totalResult?.count ?? 0;
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
    const db = this.getDb();
    if (!db) return 0;
    try {
      const res = db.prepare(`DELETE FROM traffic_logs WHERE id = ?`).run(id);
      return res.changes;
    } catch {
      return 0;
    }
  }

  public async clear(_trafficClass: TrafficClass | null = null): Promise<number> {
    const db = this.getDb();
    if (!db) return 0;
    try {
      const res = db.prepare(`DELETE FROM traffic_logs`).run();
      return res.changes;
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

  public async close(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore
      }
      this.db = null;
    }
  }
}

export const trafficAuditService = new TrafficAuditService();
