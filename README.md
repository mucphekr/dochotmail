# Check code hotmail by Muc Phe

Web doc ma code Hotmail/Outlook bang Microsoft Graph, chay truc tiep tren GitHub Pages.
Ban khong can Railway/Vercel/Netlify hay server Node rieng.

## Cau truc

```text
index.html
app.js
styles.css
.nojekyll
.github/workflows/pages.yml
```

## Dinh dang account

Nhap moi dong theo mot trong hai dang:

```text
email|password|refresh_token|client_id
email|refresh_token|client_id
```

Cot `password` chi de giu dung format account, app khong dung password.

## Chay local

Mo truc tiep file `index.html` bang trinh duyet.

## Chay tren GitHub Pages

Workflow `.github/workflows/pages.yml` tu dong deploy static site sau moi lan push len nhanh `main`.

Sau khi push, vao:

```text
Settings -> Pages
```

Chon source la `GitHub Actions` neu repo chua bat Pages.

URL mac dinh se co dang:

```text
https://mucphekr.github.io/dochotmail/
```

## Gan domain rieng

Khi co domain that, them file `CNAME` o thu muc goc repo, noi dung chi gom domain:

```text
your-domain.com
```

Sau do tro DNS cua domain ve GitHub Pages trong trang quan ly ten mien cua ban, roi vao:

```text
Settings -> Pages -> Custom domain
```

Nhap lai domain va bat `Enforce HTTPS`.

## Luu y bao mat

Ban khong nen commit account that, password, refresh token hoac client id rieng tu len GitHub.

Vi app chay tinh tren GitHub Pages, refresh token va client id se duoc xu ly truc tiep trong trinh duyet cua ban. Khong co backend trung gian luu du lieu.
