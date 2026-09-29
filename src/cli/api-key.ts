import "dotenv/config";
import {
  generateApiKey,
  hashApiKey,
  MIN_CUSTOM_KEY_LENGTH,
  previewApiKey,
} from "../modules/api-key/api-key-hash";
import { ApiKey, ApiKeyRole } from "../modules/api-key/entities/api-key.entity";
import { getStandaloneDataSource } from "../modules/database/database.config";
import { tCli, getCliLanguage, setCliLanguage, type CliLanguage } from "./i18n";

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return getCliLanguage() === 'vi' ? 'Chưa dùng' : 'Never';
  const d = new Date(date);
  const locale = getCliLanguage() === 'vi' ? 'vi-VN' : 'en-US';
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function printUsage() {
  console.log(tCli('apiKey.usage'));
}

async function listKeys() {
  const ds = await getStandaloneDataSource();
  const repo = ds.getRepository(ApiKey);
  const keys = await repo.find({ order: { createdAt: "DESC" } });

  console.log(tCli('apiKey.listHeader'));
  if (keys.length === 0) {
    console.log(tCli('apiKey.noKeys'));
  } else {
    const tableData = keys.map((k) => {
      let status = k.isActive ? "✅ Active" : "⏸️ Disabled";
      if (k.expiresAt && new Date() > new Date(k.expiresAt)) {
        status = "❌ Expired";
      }
      const accountsStr =
        k.allowedAccountIds && k.allowedAccountIds.length > 0
          ? k.allowedAccountIds.join(", ")
          : tCli('apiKey.allAccounts');

      return {
        ID: k.id.slice(0, 8),
        Name: k.name,
        Role: k.role,
        Accounts: accountsStr,
        Status: status,
        Key: k.keyPreview,
        "Last Used": formatDate(k.lastUsedAt),
        "Created At": formatDate(k.createdAt),
      };
    });
    console.table(tableData);
    console.log(tCli('apiKey.totalKeys', { count: keys.length }));
  }
  console.log("=========================================================\n");
}

async function createKey(args: string[]) {
  const nameArg = args.find((a) => !a.startsWith("--"));
  if (!nameArg) {
    console.error(tCli('apiKey.provideNameError'));
    process.exit(1);
  }

  let role: ApiKeyRole = "client";
  const roleIdx = args.indexOf("--role");
  if (roleIdx !== -1 && args[roleIdx + 1]) {
    const val = args[roleIdx + 1].toLowerCase();
    if (val === "admin" || val === "client") {
      role = val;
    } else {
      console.warn(tCli('apiKey.invalidRoleWarn', { val }));
    }
  }

  let customKey: string | undefined;
  const keyIdx = args.indexOf("--key");
  if (keyIdx !== -1 && args[keyIdx + 1]) {
    customKey = args[keyIdx + 1].trim();
  }

  let expiresAt: Date | null = null;
  const expIdx = args.indexOf("--expires");
  if (expIdx !== -1 && args[expIdx + 1]) {
    const parsed = new Date(args[expIdx + 1]);
    if (!isNaN(parsed.getTime())) {
      expiresAt = parsed;
    } else {
      console.warn(tCli('apiKey.invalidExpiresWarn'));
    }
  }

  let allowedAccountIds: string[] | null = null;
  const accIdx = args.indexOf("--accounts");
  if (accIdx !== -1 && args[accIdx + 1]) {
    const list = args[accIdx + 1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0) {
      allowedAccountIds = list;
    }
  }

  const ds = await getStandaloneDataSource();
  const repo = ds.getRepository(ApiKey);

  if (customKey && customKey.length < MIN_CUSTOM_KEY_LENGTH) {
    console.error(
      tCli('apiKey.customKeyTooShortError', { min: MIN_CUSTOM_KEY_LENGTH }),
    );
    process.exit(1);
  }

  const keyValue = customKey || generateApiKey();

  const existing = await repo.findOne({
    where: { keyHash: hashApiKey(keyValue) },
  });
  if (existing) {
    console.error(tCli('apiKey.keyExistsError', { id: existing.id }));
    process.exit(1);
  }

  const newKey = repo.create({
    name: nameArg.trim(),
    keyHash: hashApiKey(keyValue),
    keyPreview: previewApiKey(keyValue),
    role,
    isActive: true,
    allowedAccountIds,
    expiresAt,
    lastUsedAt: null,
  });

  const saved = await repo.save(newKey);

  console.log("\n======================================================");
  console.log(tCli('apiKey.createSuccessBanner'));
  console.log("======================================================");
  console.log(tCli('apiKey.labelId', { id: saved.id }));
  console.log(tCli('apiKey.labelName', { name: saved.name }));
  console.log(tCli('apiKey.labelRole', { role: saved.role }));
  console.log(
    tCli('apiKey.labelAccounts', {
      accounts:
        saved.allowedAccountIds && saved.allowedAccountIds.length > 0
          ? saved.allowedAccountIds.join(", ")
          : tCli('apiKey.allAccounts'),
    }),
  );
  console.log(tCli('apiKey.labelKey', { key: keyValue }));
  if (saved.expiresAt) {
    console.log(tCli('apiKey.labelExpires', { date: formatDate(saved.expiresAt) }));
  }
  console.log("------------------------------------------------------");
  console.log(tCli('apiKey.importantNotice'));
  console.log(tCli('apiKey.copyNowNotice'));
  console.log(tCli('apiKey.maskNotice'));
  console.log("======================================================\n");
}

async function findKeyByQuery(query: string): Promise<ApiKey | null> {
  const ds = await getStandaloneDataSource();
  const repo = ds.getRepository(ApiKey);
  const trimmed = query.trim();

  // Try exact ID
  let key = await repo.findOne({ where: { id: trimmed } });
  if (key) return key;

  // Try the key itself: only its digest is stored, so hash the query to look it up.
  key = await repo.findOne({ where: { keyHash: hashApiKey(trimmed) } });
  if (key) return key;

  // Try exact name
  key = await repo.findOne({ where: { name: trimmed } });
  if (key) return key;

  // Try prefix of ID
  const all = await repo.find();
  const prefixMatch = all.find((k) => k.id.startsWith(trimmed));
  if (prefixMatch) return prefixMatch;

  // Try partial name
  const nameMatch = all.find((k) =>
    k.name.toLowerCase().includes(trimmed.toLowerCase()),
  );
  if (nameMatch) return nameMatch;

  return null;
}

async function deleteKey(query: string) {
  if (!query) {
    console.error(tCli('apiKey.deleteProvideIdError'));
    process.exit(1);
  }

  const ds = await getStandaloneDataSource();
  const repo = ds.getRepository(ApiKey);
  const target = await findKeyByQuery(query);

  if (!target) {
    console.error(tCli('apiKey.notFoundError', { query }));
    process.exit(1);
  }

  await repo.delete(target.id);
  console.log(
    `\n` +
      tCli('apiKey.deletedSuccess', {
        name: target.name,
        id: target.id.slice(0, 8),
        key: target.keyPreview,
      }) +
      `\n`,
  );
}

async function toggleKey(query: string) {
  if (!query) {
    console.error(tCli('apiKey.toggleProvideIdError'));
    process.exit(1);
  }

  const ds = await getStandaloneDataSource();
  const repo = ds.getRepository(ApiKey);
  const target = await findKeyByQuery(query);

  if (!target) {
    console.error(tCli('apiKey.notFoundError', { query }));
    process.exit(1);
  }

  target.isActive = !target.isActive;
  await repo.save(target);

  const statusStr = target.isActive
    ? tCli('apiKey.statusEnabled')
    : tCli('apiKey.statusDisabled');
  console.log(`\n` + tCli('apiKey.toggleStatus', { name: target.name, status: statusStr }) + `\n`);
}

async function main() {
  let args = process.argv.slice(2);

  // Check for --lang
  const langIdx = args.indexOf('--lang');
  if (langIdx !== -1 && args[langIdx + 1]) {
    const l = args[langIdx + 1].toLowerCase() as CliLanguage;
    if (l === 'en' || l === 'vi') {
      setCliLanguage(l);
    }
    args = args.filter((_, i) => i !== langIdx && i !== langIdx + 1);
  }

  const command = args[0]?.toLowerCase();

  try {
    switch (command) {
      case "list":
      case "ls":
        await listKeys();
        break;
      case "create":
      case "add":
      case "new":
        await createKey(args.slice(1));
        break;
      case "delete":
      case "rm":
      case "remove":
        await deleteKey(args[1]);
        break;
      case "toggle":
      case "disable":
      case "enable":
        await toggleKey(args[1]);
        break;
      case "help":
      case "--help":
      case "-h":
      default:
        printUsage();
        break;
    }
  } catch (err) {
    console.error(tCli('apiKey.execError'), err);
    process.exit(1);
  } finally {
    const ds = await getStandaloneDataSource();
    if (ds.isInitialized) {
      await ds.destroy();
    }
  }
}

main();
