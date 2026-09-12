# GitHub File Storage

Web app lưu trữ và quản lý file trực tiếp trên repository GitHub của bạn.

## Tính năng

- Upload file (kéo thả hoặc chọn file)
- Xem danh sách file trong repo
- Tải file về
- Xóa file
- Hỗ trợ thư mục tùy chọn khi upload
- Lưu cấu hình trên trình duyệt (localStorage)
- Giao diện tiếng Việt, đẹp, responsive

## Cách sử dụng

### 1. Tạo Personal Access Token (PAT)

1. Vào GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Bấm **Generate new token (classic)**
3. Đặt tên (ví dụ: `file-storage`)
4. Chọn quyền **`repo`** (full control of private repositories)
5. Generate và **copy token** (chỉ hiện 1 lần)

### 2. Tạo repository

Tạo 1 repository mới trên GitHub (có thể public hoặc private).

### 3. Chạy web app

Mở file `index.html` bằng trình duyệt, hoặc deploy lên GitHub Pages.

Điền:
- **Tên người dùng GitHub**
- **Tên Repository**
- **Personal Access Token**

Bấm **Kết nối** → bắt đầu sử dụng.

### 4. Deploy lên GitHub Pages (tùy chọn)

1. Tạo repo mới (ví dụ: `file-storage-web`)
2. Upload file `index.html` lên
3. Vào **Settings → Pages** → Source chọn branch `main`
4. Truy cập: `https://your-username.github.io/file-storage-web`

## Lưu ý quan trọng

- Token được lưu **chỉ trên trình duyệt của bạn** (localStorage), không gửi đi đâu khác.
- GitHub có giới hạn kích thước file (thường 100MB). Nên nén file lớn trước khi upload.
- Không nên upload dữ liệu nhạy cảm lên repo public.
- Rate limit API: 5000 request/giờ với token.

## Cấu trúc

```
github-file-storage/
├── index.html      # Toàn bộ ứng dụng (HTML + CSS + JS)
└── README.md
```

---

Tạo bởi Grok · 2026
