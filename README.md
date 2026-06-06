# Hotmail Graph Code Railway

Web rieng de doc ma code trong Hotmail/Outlook bang Microsoft Graph `refresh_token + client_id`, deploy duoc len Railway.

Nhap moi dong theo dinh dang:

```text
email|password|refresh_token|client_id
```

Hoac:

```text
email|refresh_token|client_id
```

Cot `password` chi de giu dung format account. Backend khong gui password len Microsoft Graph hoac DongVan.

## Lay code 2FA Google

Tab `2FA Google` ho tro tao ma TOTP 6 so tu secret Google Authenticator.

Nhap moi dong mot secret:

```text
JBSWY3DPEHPK3PXP
```

Hoac dan link dang:

```text
otpauth://totp/Google:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Google
```

Ma 2FA duoc tao truc tiep trong trinh duyet va khong gui secret len backend.

## Tach dinh dang mail

Tab `Tach dinh dang` ho tro tach cac dong Hotmail/Gmail ngan cach bang dau `|`, vi du:

```text
email@gmail.com|password|refresh_token|client_id
```

Sau khi bam `Tach dinh dang`, co the copy rieng tung cot `email`, `password`, `refresh_token`, `client_id`, copy tung o trong bang, hoac copy lai tat ca theo format goc.

Nut `Gop dinh dang` chuyen cac dong dang tab/khoang trang thanh dau `|`:

```text
kimuralab4@gmail.com 0123asdf@#L m2c5ycrcstcefnqmd2sd3t32ifkgobmc
```

Thanh:

```text
kimuralab4@gmail.com|0123asdf@#L|m2c5ycrcstcefnqmd2sd3t32ifkgobmc
```

## Chay local

```bash
npm install
npm start
```

Mo:

```text
http://localhost:3000
```

## Bien moi truong

| Bien | Mac dinh | Ghi chu |
| --- | --- | --- |
| `PORT` | `3000` | Railway tu inject |
| `ACCESS_TOKEN` | rong | Khi dat, web yeu cau nhap token truoc khi doc code |
| `CODE_PROVIDER` | `direct` | `direct`, `oauth2`, `dongvan`, hoac `dongvan_fallback` |
| `MAIL_TOP` | `30` | So email moi nhat can quet trong hop thu |
| `DISPLAY_TIME_ZONE` | `Asia/Ho_Chi_Minh` | Mui gio hien thi thoi gian email |
| `MAX_ACCOUNTS_PER_REQUEST` | `200` | Gioi han so dong moi lan |
| `REQUEST_TIMEOUT_MS` | `45000` | Timeout cho moi request |

Mac dinh app dung `direct`: doi refresh token lay access token Microsoft, sau do goi:

```text
GET https://graph.microsoft.com/v1.0/me/messages
```

Neu muon dung API DongVanFB thay cho doc truc tiep, dat:

```text
CODE_PROVIDER=dongvan
GRAPH_CODE_ENDPOINT=https://tools.dongvanfb.net/api/graph_code
```

Neu muon dung API DongVanFB OAuth2:

```text
CODE_PROVIDER=oauth2
OAUTH2_CODE_ENDPOINT=https://tools.dongvanfb.net/api/get_code_oauth2
```

## Deploy Railway

1. Tao repo GitHub tu thu muc nay.
2. Push code len GitHub.
3. Vao Railway, chon **New Project** -> **Deploy from GitHub repo**.
4. Them `ACCESS_TOKEN` trong Railway Variables neu muon khoa web.
5. Railway se chay bang `npm start`.

## API noi bo

Doc mot account:

```http
POST /api/code
Content-Type: application/json
```

```json
{
  "line": "email@hotmail.com|password|refresh_token|client_id",
  "provider": "oauth2",
  "type": "all"
}
```

Doc batch:

```http
POST /api/batch
Content-Type: application/json
```

```json
{
  "lines": "email1@hotmail.com|password|refresh_token|client_id\nemail2@hotmail.com|password|refresh_token|client_id",
  "provider": "direct",
  "type": "openai"
}
```

## Luu y bao mat

Khong commit `.env`, password, refresh token, client id rieng tu, hoac du lieu account that len GitHub. Nen bat `ACCESS_TOKEN` tren Railway de tranh nguoi ngoai dung web cua ban.
