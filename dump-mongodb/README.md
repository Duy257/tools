# dump-mongodb

Node.js tool dùng `mongodump` và `mongorestore` để **dump toàn bộ database A** và **restore sang database B**.

## Yêu cầu
- Node.js >= 18
- MongoDB Database Tools (cần có 2 lệnh trong PATH):
  - `mongodump`
  - `mongorestore`

### Cài đặt MongoDB Database Tools

**Windows:**
1. Tải MongoDB Database Tools từ: https://www.mongodb.com/try/download/database-tools
2. Giải nén file ZIP vào thư mục (ví dụ: `C:\mongodb-database-tools`)
3. Thêm thư mục `bin` vào PATH:
   - Mở "Environment Variables" (Biến môi trường)
   - Thêm `C:\mongodb-database-tools\bin` vào System PATH
   - Hoặc User PATH nếu chỉ dùng cho user hiện tại
4. Mở lại terminal/PowerShell và kiểm tra

**macOS/Linux:**
```bash
# macOS với Homebrew
brew install mongodb-database-tools

# Hoặc tải từ MongoDB website và thêm vào PATH
```

Kiểm tra nhanh:

```bash
mongodump --version
mongorestore --version
```

Nếu lệnh không tìm thấy, kiểm tra PATH:
- Windows: `where mongodump` (PowerShell) hoặc `where.exe mongodump` (CMD)
- macOS/Linux: `which mongodump`

## Cấu hình
Tạo file `config.json` (copy từ `config.example.json`):

- `sourceUri`: MongoDB URI **có kèm dbName** (vd `...mongodb.net/dbA`)
- `destUri`: MongoDB URI **có kèm dbName** (vd `...mongodb.net/dbB`)
- `options.dumpDir`: thư mục dump tạm (mặc định `./.dump_tmp`)
- `options.drop`: nếu `true` thì restore sẽ `--drop`
- `options.gzip`: nếu `true` thì dump sẽ `--gzip`
- `options.cleanup`: nếu `true` thì xoá dumpDir sau khi restore thành công

Lưu ý: Tool sẽ **mask password** khi log ra console, nhưng vẫn dùng URI thật để chạy lệnh.

## Chạy tool

```bash
cd /Users/duynguyen/MyProject/tools/dump-mongodb
node index.js --config ./config.json
```

### Dry run (chỉ in command)

```bash
node index.js --config ./config.json --dry-run
```

## Notes
- Với Atlas `mongodb+srv://...`, `mongodump/mongorestore` cần môi trường có DNS hoạt động bình thường.
- Dump output thường nằm ở `<dumpDir>/<sourceDbName>/...`; tool sẽ tự detect theo dbName từ `sourceUri`.

