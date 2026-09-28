# Tài liệu Hướng dẫn Toàn diện: Antigravity Proxy Standalone

**Antigravity Proxy** là một cổng chuyển tiếp (LLM Proxy Gateway) hiệu năng cao, độc lập, được trích xuất từ lõi NestJS/Fastify của dự án AntigravityManager. 

Dự án cho phép bạn sử dụng các tài khoản **Google Cloud Code / Antigravity** thông qua các giao thức phổ biến: **OpenAI**, **Anthropic Messages** và **Gemini API** với cơ chế tự động xoay vòng tài khoản (Multi-Account Pooling), tự động phục hồi Thought Signatures và chuyển tài khoản khi gặp lỗi giới hạn tốc độ (Rate Limit 429).

---

## Mục lục
1. [Điểm nổi bật của dự án](#1-điểm-nổi-bật-của-dự-án)
2. [Kiến trúc và Cơ chế hoạt động](#2-kiến-trúc-và-cơ-chế-hoạt-động)
3. [Cài đặt và Yêu cầu môi trường](#3-cài-đặt-và-yêu-cầu-môi-trường)
4. [Quản lý Tài khoản (Thêm nhiều tài khoản)](#4-quản-lý-tài-khoản-thêm-nhiều-tài-khoản)
5. [Cấu hình hệ thống (.env)](#5-cấu-hình-hệ-thống-env)
6. [Khởi chạy Server (NestJS CLI & Docker)](#6-khởi-chạy-server-nestjs-cli--docker)
7. [Hướng dẫn kết nối các Client (Cursor, Claude Code, Cline, OpenCode)](#7-hướng-dẫn-kết-nối-các-client)
8. [Danh sách Endpoints và Models hỗ trợ](#8-danh-sách-endpoints-và-models-hỗ-trợ)
9. [Xử lý lỗi thường gặp (Troubleshooting)](#9-xử-lý-lỗi-thường-gặp-troubleshooting)

---

## 1. Điểm nổi bật của dự án

- **Hoàn toàn độc lập (Headless):** Loại bỏ hoàn toàn Electron, React UI, và các thư viện C++ native (`better-sqlite3`, `keytar`). Không yêu cầu trình biên dịch khi cài đặt.
- **Đa giao thức (Multi-Protocol):**
  - Giả lập OpenAI API (`/v1/chat/completions`, `/v1/models`, `/v1/responses`, `/v1/images/generations`).
  - Giả lập Anthropic API (`/v1/messages`).
  - Hỗ trợ giao thức gốc Gemini (`/v1beta/models/...`).
- **Quản lý Pool tài khoản (Account Leasing):**
  - Hỗ trợ không giới hạn số lượng tài khoản Google Cloud.
  - Phân phối tải theo cơ chế **Round-Robin** (xoay vòng đều) hoặc **Sticky Session** (giữ nguyên tài khoản trong cùng phiên chat để tối ưu bộ nhớ đệm Context Cache).
  - Tự động phát hiện lỗi `429 Rate Limit` để đưa tài khoản vào thời gian nghỉ (Cooldown) và failover mượt mà sang tài khoản tiếp theo mà không làm gián đoạn request của người dùng.
- **Thought Signature Recovery:** Tự động khôi phục và duy trì chuỗi suy luận (Reasoning Trace / Signature) cho các mô hình suy nghĩ như **Claude 3.7 Sonnet (Thinking)** và **Gemini 2.0 Flash / Pro**, loại bỏ triệt để lỗi `400 Invalid Argument` do rụng signature khi gọi function calling/tools.
- **Tiêu chuẩn NestJS CLI:** Hỗ trợ đầy đủ các lệnh phát triển và build chuẩn NestJS (`npm run start:dev`, `npm run build`, `npm run start:prod`).

---

## 2. Kiến trúc và Cơ chế hoạt động

```plaintext
   +-------------------------------------------------------------+
   | Client (Cursor, Claude Code CLI, Cline, Roo Code, OpenCode)  |
   +-------------------------------------------------------------+
                                  |
                                  | HTTP (OpenAI / Anthropic / Gemini formats)
                                  v
   +-------------------------------------------------------------+
   |                Antigravity Proxy Gateway (Fastify)          |
   |                                                             |
   |  [Guards & Auth] -> Xác thực PROXY_API_KEY (nếu có)         |
   |  [Mappers]       -> Chuẩn hóa Request sang định dạng Google |
   |  [Thought Store] -> Quản lý & phục hồi thought signatures   |
   |  [Account Lease] -> Xoay vòng tài khoản & Cooldown 429      |
   +-------------------------------------------------------------+
                                  |
                                  | Upstream HTTPS (Cloud Code Internal API)
                                  v
   +-------------------------------------------------------------+
   |        Google Cloud Code / Antigravity Upstream APIs        |
   +-------------------------------------------------------------+
```

1. **Client gửi Request:** Ví dụ Cursor gửi request dạng OpenAI `/v1/chat/completions` với model `claude-3-7-sonnet`.
2. **Account Selection:** Module `AccountLeaseService` kiểm tra danh sách tài khoản trong `accounts.json`, loại bỏ các tài khoản đang trong trạng thái cooldown 429, sau đó chọn tài khoản thích hợp nhất.
3. **Token Hydration:** Nếu `access_token` của tài khoản đã hết hạn, hệ thống tự động gọi Google OAuth để đổi `refresh_token` lấy `access_token` mới và ghi lại vào `accounts.json`.
4. **Protocol Translation:** Request được dịch sang định dạng Google Cloud Code Internal API (`loadCodeAssist` / `v1internal`). Nếu là model có thinking, proxy sẽ tự động kiểm tra và chèn thought signature phù hợp.
5. **Streaming Response:** Phản hồi từ Google được chuyển đổi ngược về dạng Server-Sent Events (SSE) theo chuẩn OpenAI / Anthropic và stream trực tiếp về client với độ trễ thấp nhất.

---

## 3. Cài đặt và Yêu cầu môi trường

### Yêu cầu
- **Node.js:** Phiên bản `>= 20.x` hoặc `>= 22.x`.
- **NPM:** Phiên bản `>= 9.x`.

### Các bước cài đặt
```bash
# 1. Di chuyển vào thư mục dự án
cd /home/hoainam/code/antigravity-proxy

# 2. Cài đặt các gói phụ thuộc
npm install

# 3. Tạo file cấu hình môi trường
cp .env.example .env
```

---

## 4. Quản lý Tài khoản (Thêm nhiều tài khoản)

Hệ thống lưu trữ toàn bộ thông tin tài khoản tại file `accounts.json`. Bạn có 2 cách để thêm tài khoản:

### Cách 1: Đăng nhập tự động qua Terminal (Khuyên dùng) 🚀
Chạy lệnh sau trên terminal:
```bash
npm run add-account
```

**Quy trình:**
1. Script sẽ mở cổng callback (8888 - 8892) và tự động mở trình duyệt đến trang đăng nhập Google (hoặc in URL màu xanh ra terminal nếu bạn dùng qua SSH/VPS).
2. Bạn đăng nhập tài khoản Google và bấm cho phép quyền truy cập.
3. Trình duyệt hiển thị thông báo *"✅ Đăng nhập thành công"*.
4. Script tự động lấy `refresh_token`, `access_token`, email và tự truy vấn `project_id` trên Google Cloud, sau đó ghi trực tiếp vào file `accounts.json`.
5. Tiếp tục chạy lại `npm run add-account` để thêm các tài khoản tiếp theo.

### Cách 2: Điền thủ công vào file `accounts.json`
Tạo hoặc mở file `accounts.json` và thêm các tài khoản theo định dạng:
```json
[
  {
    "id": "acc-1",
    "provider": "google",
    "email": "user1@gmail.com",
    "token": {
      "refresh_token": "1//04_REFRESH_TOKEN_CUA_BAN_1",
      "access_token": "",
      "project_id": "your-gcp-project-1"
    },
    "health": {}
  },
  {
    "id": "acc-2",
    "provider": "google",
    "email": "user2@gmail.com",
    "token": {
      "refresh_token": "1//04_REFRESH_TOKEN_CUA_BAN_2",
      "access_token": "",
      "project_id": "your-gcp-project-2"
    },
    "health": {}
  }
]
```
> **Ghi chú:** `access_token` có thể để trống `""`. Khi server chạy, nó sẽ tự động dùng `refresh_token` để lấy access token mới.
>
> Nếu bạn **tự điền** `access_token`, phải điền kèm `expiry_timestamp` tính bằng **giây** (Unix seconds, ví dụ `1740000000`), không phải milliseconds. Điền sai đơn vị thì token bị coi như còn hiệu lực hàng nghìn năm và cơ chế tự refresh sẽ không bao giờ chạy. Xem `accounts.json.example` để có bản đầy đủ mọi field.

---

## 5. Cấu hình hệ thống (.env)

Mở file `.env` để tuỳ chỉnh các tham số:

| Biến môi trường | Mặc định | Ý nghĩa |
| :--- | :--- | :--- |
| `ANTIGRAVITY_OAUTH_CLIENT_ID` | *(trống)* | **Bắt buộc.** Client ID của OAuth client. Xem mục 9.4 nếu chưa có. |
| `ANTIGRAVITY_OAUTH_CLIENT_SECRET` | *(trống)* | **Bắt buộc.** Client secret, phải đặt cùng lúc với biến trên. |
| `ANTIGRAVITY_OAUTH_CLIENTS` | *(trống)* | Tuỳ chọn. Khai báo thêm client theo dạng `key\|client_id\|client_secret[\|label]`, nhiều entry cách nhau bằng `;`. Dùng khi muốn có client dự phòng để failover. |
| `ANTIGRAVITY_OAUTH_CLIENT_KEY` | `antigravity_enterprise` | Tuỳ chọn. Chọn client nào active lúc khởi động. Gõ sai key thì hệ thống lặng lẽ dùng client đầu tiên. |
| `PORT` | `8045` | Cổng HTTP mà proxy sẽ lắng nghe. |
| `HOST` | `0.0.0.0` | Địa chỉ host binding (`0.0.0.0` cho phép truy cập từ mạng LAN/Docker). |
| `PROXY_API_KEY` | *(trống)* | Nếu thiết lập, các client bắt buộc phải gửi header `Authorization: Bearer <KEY>`. Để trống nếu muốn dùng tự do. |
| `ACCOUNTS_FILE` | `./accounts.json` | Đường dẫn đến file lưu trữ danh sách tài khoản. |
| `ROUTING_STRATEGY` | `balance` | Chế độ xoay vòng: `balance` (xoay đều), `cache-first` (ưu tiên context cache), `performance-first`. |

---

## 6. Khởi chạy Server (NestJS CLI & Docker)

### 1. Khởi chạy bằng Node / NPM

```bash
# Chế độ phát triển (Tự reload khi sửa code):
npm run start:dev

# Biên dịch dự án (Build dist/):
npm run build

# Chạy bản Production đã build:
npm run start:prod
```

### 2. Chạy dưới dạng Daemon bằng PM2 (cho VPS/Server)
```bash
# Cài PM2 toàn cục (nếu chưa có)
npm install -g pm2

# Build và khởi chạy
npm run build
pm2 start dist/main.js --name antigravity-proxy

# Lưu trạng thái tự khởi động lại khi reboot VPS:
pm2 save
pm2 startup
```

### 3. Khởi chạy bằng Docker
File `Dockerfile` đã được tối ưu hóa multi-stage build:
```bash
# Build Docker image
docker build -t antigravity-proxy .

# Chạy container và mount file accounts.json
docker run -d \
  --name antigravity-proxy \
  -p 8045:8045 \
  -v $(pwd)/accounts.json:/app/data/accounts.json \
  -e PORT=8045 \
  --restart always \
  antigravity-proxy
```

---

## 7. Hướng dẫn kết nối các Client

### A. Cursor IDE
1. Mở **Cursor Settings** -> chọn **Models**.
2. Tắt các model mặc định nếu muốn, thêm các model mong muốn:
   - `claude-3-7-sonnet`
   - `claude-3-5-sonnet-20241022`
   - `gemini-2.5-pro`
   - `gemini-2.0-flash-exp`
3. Cuộn xuống phần **OpenAI API Key**:
   - Bật **Override OpenAI Base URL**.
   - Điền URL: `http://localhost:8045/v1`
   - Điền API Key: Nhập `PROXY_API_KEY` của bạn (hoặc bất kỳ chuỗi nào nếu không đặt key).

---

### B. Claude Code CLI (Official Anthropic CLI)
Thiết lập biến môi trường trỏ trực tiếp vào endpoint Anthropic của proxy:
```bash
export ANTHROPIC_BASE_URL="http://localhost:8045"
export ANTHROPIC_API_KEY="sk-antigravity"

# Khởi chạy Claude Code
claude
```

---

### C. Cline / Roo Code (VS Code Extension)
1. Mở cài đặt Cline trên VS Code.
2. Tại mục **API Provider**, chọn **OpenAI Compatible** (hoặc **Anthropic**):
   - Nếu chọn **OpenAI Compatible**:
     - Base URL: `http://localhost:8045/v1`
     - API Key: `sk-antigravity` (hoặc key của bạn)
     - Model ID: `claude-3-7-sonnet` hoặc `gemini-2.5-pro`
   - Nếu chọn **Anthropic**:
     - Base URL: `http://localhost:8045`
     - API Key: `sk-antigravity`
     - Model ID: `claude-3-7-sonnet`

---

### D. OpenCode CLI
Cấu hình trong `~/.config/opencode/opencode.json` hoặc biến môi trường:
```bash
export OPENAI_BASE_URL="http://localhost:8045/v1"
export OPENAI_API_KEY="sk-antigravity"
```

---

## 8. Danh sách Endpoints và Models hỗ trợ

### Các Endpoints chính
| Endpoint | Giao thức | Mô tả |
| :--- | :--- | :--- |
| `POST /v1/chat/completions` | OpenAI | Sinh phản hồi chat (hỗ trợ SSE stream & tools) |
| `GET /v1/models` | OpenAI | Liệt kê danh sách các models đang sẵn sàng |
| `POST /v1/messages` | Anthropic | Chuẩn Messages API (hỗ trợ SSE stream & tools) |
| `POST /v1beta/models/:model:generateContent` | Gemini | Chuẩn sinh nội dung Gemini gốc |
| `POST /v1beta/models/:model:streamGenerateContent` | Gemini | Chuẩn SSE streaming Gemini gốc |

### Danh sách Model tiêu biểu
- **Anthropic Claude Family:**
  - `claude-3-7-sonnet` / `claude-3-7-sonnet-thought`
  - `claude-3-5-sonnet-20241022`
  - `claude-sonnet-4-6-thinking`
  - `claude-opus-4-6-thinking`
- **Google Gemini Family:**
  - `gemini-2.5-pro`
  - `gemini-2.5-flash`
  - `gemini-2.0-flash-exp`
  - `gemini-3-flash`
  - `gemini-3.7-flash`
- **Mã nguồn mở:**
  - `gpt-oss-120b-medium`

---

## 9. Xử lý lỗi thường gặp (Troubleshooting)

### 1. Lỗi `address already in use` hoặc `EADDRINUSE: 8045`
- **Nguyên nhân:** Cổng 8045 đang bị một tiến trình khác (hoặc app AntigravityManager chính) chiếm dụng.
- **Cách khắc phục:** 
  - Đổi biến `PORT=8046` trong file `.env`.
  - Hoặc tắt tiến trình cũ: `lsof -i :8045` -> `kill -9 <PID>`.

### 2. Lỗi `429 Too Many Requests`
- **Nguyên nhân:** Tài khoản hiện tại đã dùng hết hạn mức phút hoặc ngày của Google Cloud.
- **Cách khắc phục:** 
  - Proxy sẽ **tự động cooldown** tài khoản này và chuyển sang tài khoản khác trong `accounts.json`.
  - Để tránh gián đoạn, hãy thêm ít nhất 2 - 3 tài khoản Google Cloud bằng lệnh `npm run add-account`.

### 3. Lỗi `invalid_grant` khi refresh token
- **Nguyên nhân:** Refresh token của tài khoản đã bị người dùng thu hồi quyền hoặc hết hạn (thường sau 6 tháng nếu chưa xác minh ứng dụng).
- **Cách khắc phục:** Chạy lại lệnh `npm run add-account` để đăng nhập lại cho tài khoản đó.

### 4. Lỗi `No OAuth client configured`
- **Nguyên nhân:** Chưa cấu hình OAuth Client. Source code **không kèm** credential mặc định nào, nên đây là lỗi bắt buộc gặp khi mới clone về.
- **Cách khắc phục:** Đặt **cả hai** biến sau trong `.env` rồi khởi động lại:
  ```bash
  ANTIGRAVITY_OAUTH_CLIENT_ID=<client id>
  ANTIGRAVITY_OAUTH_CLIENT_SECRET=<client secret>
  ```
  Thiếu một trong hai thì proxy bỏ qua cả cặp và vẫn báo lỗi này (log sẽ có dòng `must be set together`).
- **Lấy credential ở đâu:** Trích từ bản Antigravity cài trên máy bạn. Client tự tạo trong GCP project riêng **không dùng được**, vì proxy cần các scope nội bộ của Google (`auth/aicode`, `auth/cclog`, `auth/experimentsandconfigs`) mà Google chỉ cấp cho first-party client. Xem mục "OAuth Client Credentials" trong `README.md`.
