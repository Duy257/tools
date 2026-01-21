# dump-mongodb

Node.js tool dùng `mongodump` và `mongorestore` để **dump toàn bộ database A** và **restore sang database B**.

## Yêu cầu
- Node.js >= 18
- MongoDB Database Tools (cần có 2 lệnh trong PATH):
  - `mongodump`
  - `mongorestore`

Kiểm tra nhanh:

```bash
mongodump --version
mongorestore --version
```

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

