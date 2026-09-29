import fs from 'node:fs';
import path from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ApiKey } from '../api-key/entities/api-key.entity';
import { TrafficLog } from '../proxy-gateway/audit/entities/traffic-log.entity';

export function getDatabasePath(): string {
  const customPath = process.env.SQLITE_DB_PATH || process.env.DATABASE_FILE;
  const dbPath = customPath
    ? path.resolve(customPath)
    : path.resolve(process.cwd(), 'data/antigravity.sqlite');

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dbPath;
}

export function createTypeOrmOptions(): DataSourceOptions {
  return {
    type: 'better-sqlite3',
    database: getDatabasePath(),
    entities: [ApiKey, TrafficLog],
    migrations: [path.join(__dirname, 'migrations/*{.ts,.js}')],
    migrationsRun: true,
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    logging: process.env.DEBUG_SQL === 'true',
  };
}

let dataSourceInstance: DataSource | null = null;

export async function getStandaloneDataSource(): Promise<DataSource> {
  if (dataSourceInstance && dataSourceInstance.isInitialized) {
    return dataSourceInstance;
  }

  const ds = new DataSource(createTypeOrmOptions());
  await ds.initialize();
  await ds.runMigrations();
  dataSourceInstance = ds;
  return ds;
}
