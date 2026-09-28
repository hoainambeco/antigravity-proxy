const inMemorySettings = new Map<string, unknown>();

export class CloudAccountSettingsStore {
  static getSetting<T>(key: string, defaultValue: T, _schema?: unknown): T {
    const val = inMemorySettings.get(key);
    return val !== undefined ? (val as T) : defaultValue;
  }

  static setSetting(key: string, value: unknown): void {
    inMemorySettings.set(key, value);
  }

  static readSetting(key: string): unknown {
    return inMemorySettings.get(key);
  }
}
