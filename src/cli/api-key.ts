import "dotenv/config";
import { randomBytes } from "node:crypto";
import { ApiKey, ApiKeyRole } from "../modules/api-key/entities/api-key.entity";
import { getStandaloneDataSource } from "../modules/database/database.config";

function maskKey(key: string): string {
  if (!key || key.length < 12) {
    return "****";
  }
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "Never";
  const d = new Date(date);
  return d.toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function printUsage() {
  console.log(`
Antigravity Proxy - Quản lý API Key (SQLite)
======================================================
Sử dụng:
  npm run api-key list                      - Liệt kê tất cả API Key
  npm run api-key create <name> [options]   - Tạo một API Key mới
  npm run api-key delete <id-or-name>       - Xóa một API Key
  npm run api-key toggle <id-or-name>       - Bật/Tắt (Enable/Disable) API Key

Options khi tạo key:
  --role <client|admin>   (mặc định: client)
  --key <custom_key>      (mặc định: tự sinh sk-ag-...)
  --expires <YYYY-MM-DD>  (mặc định: không giới hạn)

Ví dụ:
  npm run api-key create "Cursor - Nam"
  npm run api-key create "Admin Dashboard" --role admin
  npm run api-key list
  npm run api-key toggle "Cursor - Nam"
  npm run api-key delete 1a2b3c4d
======================================================
`);
}

async function listKeys() {
  const ds = await getStandaloneDataSource();
  const repo = ds.getRepository(ApiKey);
  const keys = await repo.find({ order: { createdAt: "DESC" } });

  console.log("\n=================== DANH SÁCH API KEY ===================");
  if (keys.length === 0) {
    console.log("Hiện chưa có API Key nào trong SQLite database.");
    console.log('Chạy: npm run api-key create "<name>" để tạo key mới.');
  } else {
    const tableData = keys.map((k) => {
      let status = k.isActive ? "✅ Active" : "⏸️ Disabled";
      if (k.expiresAt && new Date() > new Date(k.expiresAt)) {
        status = "❌ Expired";
      }
      return {
        ID: k.id.slice(0, 8),
        Name: k.name,
        Role: k.role,
        Status: status,
        Key: maskKey(k.key),
        "Last Used": formatDate(k.lastUsedAt),
        "Created At": formatDate(k.createdAt),
      };
    });
    console.table(tableData);
    console.log(`Tổng cộng: ${keys.length} key(s)`);
  }
  console.log("=========================================================\n");
}

async function createKey(args: string[]) {
  const nameArg = args.find((a) => !a.startsWith("--"));
  if (!nameArg) {
    console.error("❌ Lỗi: Vui lòng cung cấp tên định danh cho API Key.");
    console.log('Ví dụ: npm run api-key create "Cursor của Nam"');
    process.exit(1);
  }

  let role: ApiKeyRole = "client";
  const roleIdx = args.indexOf("--role");
  if (roleIdx !== -1 && args[roleIdx + 1]) {
    const val = args[roleIdx + 1].toLowerCase();
    if (val === "admin" || val === "client") {
      role = val;
    } else {
      console.warn(`⚠️ Role '${val}' không hợp lệ, dùng mặc định 'client'`);
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
      console.warn(`⚠️ Ngày hết hạn không hợp lệ, bỏ qua ngày hết hạn.`);
    }
  }

  const ds = await getStandaloneDataSource();
  const repo = ds.getRepository(ApiKey);

  const keyValue = customKey || `sk-ag-${randomBytes(24).toString("hex")}`;

  const existing = await repo.findOne({ where: { key: keyValue } });
  if (existing) {
    console.error(
      `❌ Lỗi: Key này đã tồn tại trong database (ID: ${existing.id}).`,
    );
    process.exit(1);
  }

  const newKey = repo.create({
    name: nameArg.trim(),
    key: keyValue,
    role,
    isActive: true,
    expiresAt,
    lastUsedAt: null,
  });

  const saved = await repo.save(newKey);

  console.log("\n======================================================");
  console.log("🎉 TẠO API KEY THÀNH CÔNG!");
  console.log("======================================================");
  console.log(`🆔 ID:          ${saved.id}`);
  console.log(`📛 Name:        ${saved.name}`);
  console.log(`🛡️  Role:        ${saved.role}`);
  console.log(`🔑 API Key:     ${saved.key}`);
  if (saved.expiresAt) {
    console.log(`⏳ Hết hạn:     ${formatDate(saved.expiresAt)}`);
  }
  console.log("------------------------------------------------------");
  console.log("⚠️  LƯU Ý QUAN TRỌNG:");
  console.log("  Hãy copy và lưu trữ API Key trên ngay bây giờ.");
  console.log(
    "  Vì lý do bảo mật, lệnh list sẽ chỉ hiển thị key dưới dạng che bớt!",
  );
  console.log("======================================================\n");
}

async function findKeyByQuery(query: string): Promise<ApiKey | null> {
  const ds = await getStandaloneDataSource();
  const repo = ds.getRepository(ApiKey);
  const trimmed = query.trim();

  // Try exact ID
  let key = await repo.findOne({ where: { id: trimmed } });
  if (key) return key;

  // Try exact key
  key = await repo.findOne({ where: { key: trimmed } });
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
    console.error("❌ Lỗi: Vui lòng cung cấp ID hoặc tên của API Key cần xóa.");
    process.exit(1);
  }

  const ds = await getStandaloneDataSource();
  const repo = ds.getRepository(ApiKey);
  const target = await findKeyByQuery(query);

  if (!target) {
    console.error(`❌ Không tìm thấy API Key nào khớp với: "${query}"`);
    process.exit(1);
  }

  await repo.delete(target.id);
  console.log(
    `\n🗑️  Đã xóa API Key: [${target.name}] (ID: ${target.id.slice(0, 8)}, Key: ${maskKey(target.key)})\n`,
  );
}

async function toggleKey(query: string) {
  if (!query) {
    console.error(
      "❌ Lỗi: Vui lòng cung cấp ID hoặc tên của API Key cần bật/tắt.",
    );
    process.exit(1);
  }

  const ds = await getStandaloneDataSource();
  const repo = ds.getRepository(ApiKey);
  const target = await findKeyByQuery(query);

  if (!target) {
    console.error(`❌ Không tìm thấy API Key nào khớp với: "${query}"`);
    process.exit(1);
  }

  target.isActive = !target.isActive;
  await repo.save(target);

  const statusStr = target.isActive
    ? "✅ ĐÃ BẬT (Active)"
    : "⏸️ ĐÃ TẮT (Disabled)";
  console.log(`\n🔄 Trạng thái API Key [${target.name}]: ${statusStr}\n`);
}

async function main() {
  const args = process.argv.slice(2);
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
    console.error("❌ Lỗi thực thi:", err);
    process.exit(1);
  } finally {
    const ds = await getStandaloneDataSource();
    if (ds.isInitialized) {
      await ds.destroy();
    }
  }
}

main();
