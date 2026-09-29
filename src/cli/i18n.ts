export type CliLanguage = 'en' | 'vi';

let currentLang: CliLanguage = 'en';

export function detectCliLanguage(): CliLanguage {
  // 1. Check command line arguments for --lang en / --lang vi
  const langArgIdx = process.argv.findIndex((arg) => arg === '--lang');
  if (langArgIdx !== -1 && process.argv[langArgIdx + 1]) {
    const val = process.argv[langArgIdx + 1].toLowerCase();
    if (val === 'vi' || val === 'en') {
      currentLang = val;
      return currentLang;
    }
  }

  // 2. Check environment variable ANTIGRAVITY_LANG
  if (process.env.ANTIGRAVITY_LANG) {
    const envLang = process.env.ANTIGRAVITY_LANG.toLowerCase();
    if (envLang === 'vi' || envLang === 'en') {
      currentLang = envLang;
      return currentLang;
    }
  }

  // 3. Check system locale
  const sysLang = (process.env.LANG || process.env.LC_ALL || '').toLowerCase();
  if (sysLang.startsWith('vi') || sysLang.includes('vietnam')) {
    currentLang = 'vi';
    return currentLang;
  }

  // Default to Vietnamese if running in typical VN environment or English
  // Since original codebase was in Vietnamese, default to vi unless specified otherwise or on non-VN systems
  if (process.env.LANG && !process.env.LANG.toLowerCase().startsWith('vi')) {
    currentLang = 'en';
  } else {
    currentLang = 'vi';
  }

  return currentLang;
}

currentLang = detectCliLanguage();

export function setCliLanguage(lang: CliLanguage) {
  currentLang = lang;
}

export function getCliLanguage(): CliLanguage {
  return currentLang;
}

export const cliTranslations = {
  en: {
    addAccount: {
      banner: '🔑 LLM Gateway Proxy - Add Google Cloud Account',
      cannotOpenPort: 'Cannot open OAuth callback port on any of: {ports}',
      error: '❌ Error: {message}',
      listening: 'Listening for OAuth callback at: {uri}',
      openLinkPrompt: '👉 Please open the link below in your browser to sign in to Google:\n',
      successHtmlTitle: '✅ Sign-in Successful!',
      successHtmlDesc: 'You may close this tab and return to the terminal.',
      failedHtmlTitle: '❌ Sign-in Failed',
      failedHtmlDesc: 'Authentication code not received.',
      cancelledOrError: '❌ Sign-in was cancelled or encountered an error: {message}',
      exchangingCode: '⏳ Exchanging authorization code for tokens...',
      tokenReceived: '✅ Received access_token and refresh_token.',
      syncingModels: '📡 Syncing model list and quotas from Google Upstream...',
      modelsSynced: '✅ Successfully synced {count} available models from Google!',
      quotaWarning: 'Quota could not be fetched immediately; system will auto-sync on startup.',
      accountUpdated: '🔄 Updated token for existing account [{email}] (ID: {id})',
      accountAdded: '🎉 New account added successfully!',
      summaryEmail: '📧 Email:      {email}',
      summaryId: '🆔 Account ID: {id}',
      summaryProject: '📂 Project ID: {project}',
      summarySaved: '💾 Saved to:   accounts.json',
      summaryTotal: '📊 Total active accounts: {count}',
      noProject: '(none or GCP not activated)',
    },
    apiKey: {
      usage: `
LLM Gateway Proxy - API Key Management (SQLite)
======================================================
Usage:
  npm run api-key list                      - List all API Keys
  npm run api-key create <name> [options]   - Create a new API Key
  npm run api-key delete <id-or-name>       - Delete an API Key
  npm run api-key toggle <id-or-name>       - Enable/Disable an API Key

Create options:
  --role <client|admin>   (default: client)
  --key <custom_key>      (default: auto-generated sk-ag-...)
  --accounts <id1,id2>    (default: all accounts)
  --expires <YYYY-MM-DD>  (default: unlimited)
  --lang <en|vi>          (CLI display language)

Examples:
  npm run api-key create "Desktop Cursor" --accounts acc-1202,acc-2059
  npm run api-key create "Admin Dashboard" --role admin
  npm run api-key list
  npm run api-key toggle "Desktop Cursor"
  npm run api-key delete 1a2b3c4d
======================================================
`,
      listHeader: '\n=================== API KEY LIST ===================',
      noKeys: 'No API Keys found in SQLite database.\nRun: npm run api-key create "<name>" to create a key.',
      totalKeys: 'Total: {count} key(s)',
      provideNameError: '❌ Error: Please provide an identifier name for the API Key.\nExample: npm run api-key create "Desktop Cursor"',
      invalidRoleWarn: "⚠️ Role '{val}' is invalid, defaulting to 'client'",
      invalidExpiresWarn: '⚠️ Invalid expiration date, ignoring expires date.',
      keyExistsError: '❌ Error: This key already exists in database (ID: {id}).',
      customKeyTooShortError:
        '❌ Error: A custom key must be at least {min} characters. Only its hash is stored, so a short key would be guessable.',
      createSuccessBanner: '🎉 API KEY CREATED SUCCESSFULLY!',
      labelId: '🆔 ID:          {id}',
      labelName: '📛 Name:        {name}',
      labelRole: '🛡️  Role:        {role}',
      labelAccounts: '👥 Accounts:    {accounts}',
      allAccounts: 'All accounts',
      labelKey: '🔑 API Key:     {key}',
      labelExpires: '⏳ Expires:     {date}',
      importantNotice: '⚠️  IMPORTANT NOTICE:',
      copyNowNotice: '  Please copy and store your API Key now.',
      maskNotice:
        '  Only a hash of the key is stored -- it cannot be shown again, here or in the web UI.',
      deleteProvideIdError: '❌ Error: Please provide the ID or name of the API Key to delete.',
      notFoundError: '❌ No API Key found matching: "{query}"',
      deletedSuccess: '🗑️  Deleted API Key: [{name}] (ID: {id}, Key: {key})',
      toggleProvideIdError: '❌ Error: Please provide the ID or name of the API Key to enable/disable.',
      statusEnabled: '✅ ENABLED (Active)',
      statusDisabled: '⏸️ DISABLED',
      toggleStatus: '🔄 API Key [{name}] status: {status}',
      execError: '❌ Execution error:',
    },
  },
  vi: {
    addAccount: {
      banner: '🔑 LLM Gateway Proxy - Thêm tài khoản Google Cloud',
      cannotOpenPort: 'Không thể mở cổng callback OAuth trên các cổng: {ports}',
      error: '❌ Lỗi: {message}',
      listening: 'Đang lắng nghe OAuth callback tại: {uri}',
      openLinkPrompt: '👉 Vui lòng mở đường link bên dưới trên trình duyệt để đăng nhập Google:\n',
      successHtmlTitle: '✅ Đăng nhập thành công!',
      successHtmlDesc: 'Bạn có thể đóng tab này và quay lại Terminal.',
      failedHtmlTitle: '❌ Đăng nhập thất bại',
      failedHtmlDesc: 'Không nhận được mã xác thực.',
      cancelledOrError: '❌ Đăng nhập bị hủy hoặc gặp lỗi: {message}',
      exchangingCode: '⏳ Đang trao đổi mã xác thực để lấy token...',
      tokenReceived: '✅ Đã nhận được access_token và refresh_token.',
      syncingModels: '📡 Đang đồng bộ danh sách models và hạn mức từ Google Upstream...',
      modelsSynced: '✅ Đã đồng bộ thành công {count} models khả dụng từ Google!',
      quotaWarning: 'Chưa lấy được quota ngay lúc này, hệ thống sẽ tự động đồng bộ khi chạy.',
      accountUpdated: '🔄 Đã cập nhật token cho tài khoản có sẵn [{email}] (ID: {id})',
      accountAdded: '🎉 Đã thêm tài khoản mới thành công!',
      summaryEmail: '📧 Email:      {email}',
      summaryId: '🆔 Account ID: {id}',
      summaryProject: '📂 Project ID: {project}',
      summarySaved: '💾 Đã lưu vào: accounts.json',
      summaryTotal: '📊 Tổng số tài khoản hiện tại: {count}',
      noProject: '(chưa có hoặc chưa kích hoạt GCP)',
    },
    apiKey: {
      usage: `
LLM Gateway Proxy - Quản lý API Key (SQLite)
======================================================
Sử dụng:
  npm run api-key list                      - Liệt kê tất cả API Key
  npm run api-key create <name> [options]   - Tạo một API Key mới
  npm run api-key delete <id-or-name>       - Xóa một API Key
  npm run api-key toggle <id-or-name>       - Bật/Tắt (Enable/Disable) API Key

Options khi tạo key:
  --role <client|admin>   (mặc định: client)
  --key <custom_key>      (mặc định: tự sinh sk-ag-...)
  --accounts <id1,id2>    (mặc định: tất cả tài khoản)
  --expires <YYYY-MM-DD>  (mặc định: không giới hạn)
  --lang <en|vi>          (ngôn ngữ hiển thị)

Ví dụ:
  npm run api-key create "Cursor của Nam" --accounts acc-1202,acc-2059
  npm run api-key create "Admin Dashboard" --role admin
  npm run api-key list
  npm run api-key toggle "Cursor của Nam"
  npm run api-key delete 1a2b3c4d
======================================================
`,
      listHeader: '\n=================== DANH SÁCH API KEY ===================',
      noKeys: 'Hiện chưa có API Key nào trong SQLite database.\nChạy: npm run api-key create "<name>" để tạo key mới.',
      totalKeys: 'Tổng cộng: {count} key(s)',
      provideNameError: '❌ Lỗi: Vui lòng cung cấp tên định danh cho API Key.\nVí dụ: npm run api-key create "Cursor của Nam"',
      invalidRoleWarn: "⚠️ Role '{val}' không hợp lệ, dùng mặc định 'client'",
      invalidExpiresWarn: '⚠️ Ngày hết hạn không hợp lệ, bỏ qua ngày hết hạn.',
      keyExistsError: '❌ Lỗi: Key này đã tồn tại trong database (ID: {id}).',
      customKeyTooShortError:
        '❌ Lỗi: Key tự đặt phải dài tối thiểu {min} ký tự. Hệ thống chỉ lưu hash, nên key ngắn sẽ dễ bị dò.',
      createSuccessBanner: '🎉 TẠO API KEY THÀNH CÔNG!',
      labelId: '🆔 ID:          {id}',
      labelName: '📛 Name:        {name}',
      labelRole: '🛡️  Role:        {role}',
      labelAccounts: '👥 Tài khoản:   {accounts}',
      allAccounts: 'Tất cả tài khoản',
      labelKey: '🔑 API Key:     {key}',
      labelExpires: '⏳ Hết hạn:     {date}',
      importantNotice: '⚠️  LƯU Ý QUAN TRỌNG:',
      copyNowNotice: '  Hãy copy và lưu trữ API Key trên ngay bây giờ.',
      maskNotice:
        '  Hệ thống chỉ lưu hash của key -- không thể xem lại key đầy đủ, kể cả trên web UI.',
      deleteProvideIdError: '❌ Lỗi: Vui lòng cung cấp ID hoặc tên của API Key cần xóa.',
      notFoundError: '❌ Không tìm thấy API Key nào khớp với: "{query}"',
      deletedSuccess: '🗑️  Đã xóa API Key: [{name}] (ID: {id}, Key: {key})',
      toggleProvideIdError: '❌ Lỗi: Vui lòng cung cấp ID hoặc tên của API Key cần bật/tắt.',
      statusEnabled: '✅ ĐÃ BẬT (Active)',
      statusDisabled: '⏸️ ĐÃ TẮT (Disabled)',
      toggleStatus: '🔄 Trạng thái API Key [{name}]: {status}',
      execError: '❌ Lỗi thực thi:',
    },
  },
};

export function tCli(path: string, params?: Record<string, string | number>): string {
  const parts = path.split('.');
  let current: any = cliTranslations[currentLang] || cliTranslations.en;
  for (const part of parts) {
    if (current == null) break;
    current = current[part];
  }
  if (typeof current !== 'string') {
    // fallback to en
    current = cliTranslations.en;
    for (const part of parts) {
      if (current == null) break;
      current = current[part];
    }
  }
  if (typeof current !== 'string') return path;
  if (!params) return current;
  return current.replace(/\{(\w+)\}/g, (match, key) => {
    return key in params ? String(params[key]) : match;
  });
}
