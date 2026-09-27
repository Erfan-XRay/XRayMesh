<p align="center">
  <img src="assets/logo.svg" alt="XRayMesh logo" width="128" height="128" />
</p>

<h1 align="center">XRayMesh</h1>

<p align="center">
  <strong>مدیریت شبکه مش امن و پنل تحت وب مدرن برای سرورهای لینوکس</strong><br>
  مبتنی بر <a href="https://github.com/EasyTier/EasyTier">EasyTier</a>، مدیریت پیشرفته تونل‌های ترافیکی و همگام‌سازی کلاستر SafeSync.
</p>

<p align="center">
  <a href="https://github.com/Erfan-XRay/XRayMesh/releases/tag/v3.0.6"><img src="https://img.shields.io/badge/version-3.0.6-2dd4bf.svg?style=flat-square" alt="Version 3.0.6" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Source--Available-red.svg?style=flat-square" alt="Source-Available License" /></a>
  <img src="https://img.shields.io/badge/EasyTier-v2.6.4-cyan.svg?style=flat-square" alt="EasyTier core" />
  <img src="https://img.shields.io/badge/platform-Debian%20%7C%20Ubuntu-orange.svg?style=flat-square" alt="Supported OS" />
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>فارسی</strong>
</p>

---

XRayMesh سرورهای لینوکسی شما را با [EasyTier](https://github.com/EasyTier/EasyTier) در یک شبکهٔ خصوصی رمزنگاری‌شده به هم وصل می‌کند، بین آن‌ها پورت فوروارد می‌کند و برای مدیریت همهٔ این‌ها یک پنل وب فارسی و انگلیسی در اختیارتان می‌گذارد.

<p align="center">
  <a href="https://erfan-xray.github.io/XRayMesh/fa/"><strong>📖 مستندات کامل را بخوانید</strong></a>
  &nbsp;·&nbsp;
  <a href="https://erfan-xray.github.io/XRayMesh/">English documentation</a>
</p>

## قابلیت‌ها

- **مش خصوصی:** هر سرور یک نشانی خصوصی مثل `10.144.144.2` می‌گیرد و مستقیم و رمزنگاری‌شده به سرورهای دیگر دسترسی دارد.
- **نُه پروتکل انتقال:** TCP، UDP، WebSocket (با یا بدون TLS)، QUIC، FakeTCP، و لینک‌های ICMP و PCK با قدرت [BackPack](https://github.com/AminMGMT/BackPack) برای شبکه‌هایی که تقریباً هیچ چیز دیگری از آن‌ها رد نمی‌شود.
- **پنل وب:** همتاها، تأخیر و ترافیک زنده، پینگ و تست سرعت بین هر دو سرور، تم تیره و روشن، و قابل نصب روی گوشی.
- **فوروارد پورت:** با Realm، HAProxy، GOST یا iptables هسته؛ از یک پورت تا یک بازهٔ کامل.
- **SafeSync:** تغییر تنظیمات مشترک روی همهٔ سرورها به‌طور هم‌زمان، با بازگشت خودکار اگر سروری ارتباطش را از دست بدهد.
- **امن از همان ابتدا:** لینک‌های ورود یک‌بارمصرف، ورود بدون رمز، محدودیت تلاش برای ورود و HTTPS رایگان با Let's Encrypt.

## نصب سریع

روی هر سرور Debian یا Ubuntu و با کاربر `root`:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/main/xraymesh.sh)
```

لینک ورودی را که نمایش داده می‌شود باز کنید، روی سرور اول یک مش بسازید و سرورهای دیگر را با کد دعوت آن وصل کنید. [راهنمای شروع کار](https://erfan-xray.github.io/XRayMesh/fa/start/introduction/) همهٔ مراحل را قدم‌به‌قدم توضیح می‌دهد.

## مستندات

| بخش | محتوا |
| :--- | :--- |
| [شروع کار](https://erfan-xray.github.io/XRayMesh/fa/start/introduction/) | پیش‌نیازها، نصب، اولین ورود، ساخت مش و افزودن سرورها |
| [راهنماها](https://erfan-xray.github.io/XRayMesh/fa/guides/tunnels/) | فوروارد پورت، پروتکل‌های انتقال، SafeSync، به‌روزرسانی، امنیت، پینگ و تست سرعت |
| [دستورهای ترمینال](https://erfan-xray.github.io/XRayMesh/fa/reference/cli/) | همهٔ دستورهای `xraymesh` |
| [رفع مشکل](https://erfan-xray.github.io/XRayMesh/fa/troubleshooting/) | راه‌حل رایج‌ترین مشکل‌ها |

دنبال نسخهٔ **v1.x** بدون پنل وب هستید؟ همچنان در [v1.7.0](https://github.com/Erfan-XRay/XRayMesh/tree/v1.7.0) در دسترس است.

## حمایت از پروژه

XRayMesh برای استفادهٔ شخصی رایگان است. اگر به کارتان می‌آید، می‌توانید از توسعه‌اش حمایت کنید. هر ارز را **فقط روی شبکه‌ای که کنارش نوشته شده** بفرستید؛ ارزی که روی شبکهٔ دیگری فرستاده شود از دست می‌رود.

**USDT** روی شبکهٔ **TRC20 (Tron)**

```text
TKM87mEXhUpEBzqvNxs1qjM4EddX6VMXmw
```

**Gram (TON)** روی شبکهٔ **TON**

```text
UQDfjT-h4ENIrt_Sq5-zBy9TvhckniwSLCkS7zIVX4fVSaFw
```

**بیت‌کوین (BTC)**

```text
bc1qc4cgy5etuwj2375c5zqma7xmjtk59s5s49rfp5
```

کدهای QR در [صفحهٔ حمایت](https://erfan-xray.github.io/XRayMesh/fa/support/) هستند. دادن ⭐ در GitHub هم کمک می‌کند.

---

## مجوز و حق مالکیت معنوی (License)

تمامی حقوق مادی و معنوی این اثر متعلق به **ErfanXRay** می‌باشد.

این پروژه تحت مجوز انحصاری **[XRayMesh Source-Available License](LICENSE)** محافظت می‌شود:
- **استفاده مجاز:** دانلود و استفاده شخصی، غیرتجاری و داخلی روی سرورها برای تمامی کاربران کاملاً رایگان و آزاد است.
- **ممنوعیت‌های صریح قانونی:** هیچ شخص، گروه یا شرکتی بدون کسب اجازه کتبی از توسعه‌دهنده اصلی (ErfanXRay) حق **کپی‌برداری، بازنشر، ایجاد میرور، فورک و انتشار با نام خود یا برند دیگر، حذف کپی‌رایت و فروش تجاری** این سورس‌کد و اسکریپت را ندارد.
- هسته EasyTier، [BackPack](https://github.com/AminMGMT/BackPack) (با مجوز AGPL-3.0) و سایر ابزارهای شخص ثالث تابع قوانین و لایسنس اختصاصی خود باقی می‌مانند.

طراحی و توسعه‌یافته با ❤️ توسط [ErfanXRay](https://github.com/Erfan-XRay).
