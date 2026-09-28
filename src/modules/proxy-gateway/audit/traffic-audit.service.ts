import { randomUUID } from 'node:crypto';
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

export class TrafficAuditService {
  private config: TrafficAuditConfig | null = null;

  private getConfig(): TrafficAuditConfig {
    return this.config ?? getServerConfig()?.traffic_audit ?? DEFAULT_APP_CONFIG.proxy.traffic_audit;
  }

  public isEnabled(): boolean {
    return this.getConfig().enabled;
  }

  public startParent(input: StartAuditParentInput): AuditHandle | null {
    if (!this.isEnabled()) {
      return null;
    }
    const startedAt = Date.now();
    const handle: AuditHandle = {
      id: randomUUID(),
      startedAt,
      trafficClass: input.trafficClass,
    };
    logger.info(`[Audit] --> ${input.method} ${input.url} (class: ${input.trafficClass}, id: ${handle.id.slice(0, 8)})`);
    return handle;
  }

  public completeParent(handle: AuditHandle | null, input: CompleteAuditParentInput): void {
    if (!handle) {
      return;
    }
    const duration = Date.now() - handle.startedAt;
    const status = input.status ?? (input.error ? 500 : 200);
    logger.info(`[Audit] <-- Completed (${status}) in ${duration}ms (id: ${handle.id.slice(0, 8)})`);
  }

  public startAttempt(
    parent: AuditHandle | null,
    attemptSequence: number,
    input?: StartUpstreamAttemptInput,
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

  public async list(_input: TrafficAuditListInput) {
    return { rows: [], total: 0 };
  }

  public async filterOptions() {
    return { models: [], operations: [], protocols: [] };
  }

  public async detail(_id: string): Promise<TrafficAuditDetail | null> {
    return null;
  }

  public async bodyPage(_input: TrafficAuditBodyPageInput): Promise<TrafficAuditBodyPage | null> {
    return null;
  }

  public async *bodyContent(_bodyId: string): AsyncGenerator<string> {
    // Empty generator
  }

  public async bodySearch() {
    return { matches: [] };
  }

  public async stats(): Promise<TrafficAuditStats> {
    return {
      bodyStoredBytes: 0,
      databaseBytes: 0,
      droppedCount: 0,
      incompleteBodies: 0,
      lastDropReason: null,
      oldestTimestamp: null,
      rows: 0,
      workerAlive: true,
      workerPendingBytes: 0,
      workerPendingCommands: 0,
    };
  }

  public async delete(_id: string): Promise<number> {
    return 0;
  }

  public async clear(_trafficClass: TrafficClass | null = null): Promise<number> {
    return 0;
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
