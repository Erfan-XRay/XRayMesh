# XRayMesh

[English](README.md) | **فارسی**

XRayMesh یک اسکریپت Bash برای ساخت و مدیریت شبکه Mesh امن بین سرورهای لینوکسی
است. این ابزار با استفاده از
[EasyTier](https://github.com/EasyTier/EasyTier)، سرورها را از طریق IPهای مجازی
خصوصی به یکدیگر متصل می‌کند و امکاناتی مانند چند Peer، انتخاب Transport، مانیتورینگ
زنده و بازیابی خودکار سرویس را در اختیار کاربر قرار می‌دهد.

توسعه داده‌شده توسط **ErfanXRay**

## XRayMesh چه کاری انجام می‌دهد؟

- اتصال دو یا چند سرور لینوکسی در یک شبکه خصوصی رمزنگاری‌شده
- اختصاص یک IPv4 مجازی و یکتا به هر سرور
- پشتیبانی از چند Peer برای ایجاد مسیرهای جایگزین
- پشتیبانی از حالت TCP/UDP fallback و حالت اختصاصی WSS یا QUIC
- دانلود و بروزرسانی خودکار آخرین نسخه پایدار EasyTier
- اجرای دائمی هر نود به‌صورت سرویس systemd با Restart خودکار
- نمایش Peerها، Latency، Route، ترافیک و Transport فعال
- ساخت تونل‌های TCP با HAProxy به مقصد نودهای موجود EasyTier
- پشتیبانی از لیست پورت و Port Range برای انتقال HAProxy
- نمایش لاگ سرویس و ابزار عیب‌یابی اتصال و Handshake
- نمایش IPv4 و IPv6 واقعی سرور به‌صورت جدا از IP مجازی Mesh
- ویرایش یا حذف امن یک نود بدون نیاز به نصب مجدد کامل
- پشتیبانی از معماری‌های `x86_64`، `aarch64`، `armv7` و `i686`

XRayMesh برای ساده‌ترشدن تنظیمات و مدیریت روزانه، یک رابط ترمینالی رنگی و مرتب
نیز ارائه می‌دهد.

## موارد استفاده

- اتصال سرورهای ایران و خارج در یک شبکه خصوصی
- دسترسی به سرویس‌ها از طریق IP مجازی ثابت
- ساخت توپولوژی‌های چندنودی، Relay و Routing
- عبور ترافیک برنامه‌های TCP و UDP از داخل WSS یا QUIC
- ایجاد چند مسیر جایگزین در صورت قطع‌شدن یک سرور یا مسیر
- بررسی Transport فعال، Latency و وضعیت Routeهای EasyTier

## پیش‌نیازها

- Debian یا Ubuntu
- دسترسی Root
- systemd
- بازبودن پورت مورد استفاده در فایروال

## نصب

اجرای XRayMesh با یک دستور:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/main/xraymesh.sh)
```

یا دانلود و اجرای محلی:

```bash
chmod +x xraymesh.sh
sudo ./xraymesh.sh
```

XRayMesh پیش‌نیازها و فایل EasyTier متناسب با معماری سرور را به‌صورت خودکار نصب
می‌کند.

## اتصال دو سرور

### سرور اول

1. XRayMesh را اجرا و گزینه **Configure or edit node** را انتخاب کنید.
2. یک نام برای شبکه وارد کنید.
3. Network Secret تولیدشده را ذخیره کنید.
4. یک IP مجازی مانند `10.144.144.1` انتخاب کنید.
5. Transport و پورت را انتخاب کنید.
6. آدرس Peer را خالی بگذارید.

### سرور دوم

1. دقیقاً همان Network Name و Network Secret سرور اول را وارد کنید.
2. یک IP مجازی متفاوت مانند `10.144.144.2` انتخاب کنید.
3. از همان Transport و پورت استفاده کنید.
4. IP عمومی سرور اول را به‌عنوان Peer وارد کنید:

```text
1.2.3.4:11010
```

تمام نودهای شبکه باید Network Name و Secret یکسان، اما IP مجازی متفاوت داشته
باشند.

## حالت‌های Transport

### حالت TCP/UDP fallback

با انتخاب TCP یا UDP، Listener هر دو پروتکل فعال می‌شود. اگر آدرس Peer بدون
scheme وارد شود، XRayMesh مسیر TCP و UDP را ایجاد می‌کند تا EasyTier از مسیر
قابل‌دسترس استفاده کند.

پورت انتخابی را برای هر دو پروتکل TCP و UDP باز کنید.

### حالت اختصاصی WSS

با انتخاب WSS فقط Listener و اتصال Peer از نوع WSS ایجاد می‌شود:

```text
wss://1.2.3.4:11010
```

WSS ترافیک Mesh را روی TLS/TCP حمل می‌کند. پورت انتخابی باید برای TCP باز باشد.

### حالت اختصاصی QUIC

با انتخاب QUIC فقط Listener و اتصال Peer از نوع QUIC ایجاد می‌شود:

```text
quic://1.2.3.4:11010
```

QUIC ترافیک Mesh را روی UDP حمل می‌کند. پورت انتخابی باید برای UDP باز باشد.

## استفاده از چند Peer

آدرس Peerها را با ویرگول جدا کنید:

```text
1.2.3.4:11010,5.6.7.8:11010
```

چند Peer باعث افزایش پایداری می‌شود و نود می‌تواند از طریق بیش از یک سرور
قابل‌دسترس وارد شبکه شود.

## مانیتورینگ و عیب‌یابی

داشبورد XRayMesh اطلاعات زیر را نمایش می‌دهد:

- وضعیت سرویس و نسخه EasyTier
- IPv4 و IPv6 واقعی سرور
- IP مجازی و نام شبکه Mesh
- Transport فعال و Peerهای متصل
- Latency، میزان ترافیک، Route Cost و Tunnel Protocol

بخش Diagnostics، Listenerهای محلی، وضعیت Peer Center و خطاهای اخیر Handshake،
Timeout و Connection را بررسی می‌کند. لاگ زنده systemd و جدول Routeهای EasyTier
نیز از منوی اصلی در دسترس هستند.

## تونل TCP با HAProxy

XRayMesh می‌تواند از سرور فعلی به یکی از نودهای موجود EasyTier، Port Forward
از نوع TCP ایجاد کند. هنگام ساخت تونل، نودهای شناسایی‌شده در Peer List به کاربر
پیشنهاد داده می‌شوند و امکان ورود دستی IP مجازی نیز وجود دارد.

پورت‌ها را می‌توان به‌صورت تکی، جداشده با ویرگول، Range یا ترکیبی وارد کرد:

```text
22
80,443
8000-8010
22,80,443,8000-8010
```

هر پورت ورودی به همان شماره پورت روی نود مقصد منتقل می‌شود. تونل‌ها از زیرمنوی
HAProxy قابل مشاهده، ویرایش و حذف هستند. XRayMesh قبل از Restart کردن سرویس
مستقل `xraymesh-haproxy.service`، تنظیمات تولیدشده را اعتبارسنجی می‌کند.

تونل HAProxy در XRayMesh فقط از **TCP** پشتیبانی می‌کند. HAProxy استاندارد قابلیت
Port Forward عمومی UDP را ندارد و پشتیبانی HAProxy از QUIC به‌معنای انتقال
دلخواه برنامه‌های UDP نیست.

## دستورات

```text
sudo ./xraymesh.sh menu       بازکردن مدیریت تعاملی
sudo ./xraymesh.sh install    نصب و تنظیم نود
sudo ./xraymesh.sh status     نمایش وضعیت نود و Peerها
sudo ./xraymesh.sh peers      نمایش Peerهای متصل
sudo ./xraymesh.sh routes     نمایش جدول Route شبکه
sudo ./xraymesh.sh logs       نمایش زنده لاگ سرویس
sudo ./xraymesh.sh update     بروزرسانی EasyTier
sudo ./xraymesh.sh delete     حذف تنظیمات نود فعلی
sudo ./xraymesh.sh haproxy    مدیریت تونل‌های TCP با HAProxy
sudo ./xraymesh.sh start      اجرای نود
sudo ./xraymesh.sh stop       توقف نود
sudo ./xraymesh.sh restart    راه‌اندازی مجدد نود
```

## تفاوت Delete و Uninstall

- گزینه **Delete mesh configuration** سرویس و تنظیمات خصوصی نود فعلی را حذف
  می‌کند، اما XRayMesh و EasyTier نصب باقی می‌مانند.
- گزینه **Uninstall XRayMesh completely** تنظیمات، سرویس، فایل‌های برنامه و
  باینری‌های EasyTier را به‌صورت کامل حذف می‌کند.

## عیب‌یابی نمایش‌ندادن Peerها

اگر فقط نود محلی نمایش داده می‌شود:

1. Network Name و Secret تمام نودها را بررسی کنید؛ باید دقیقاً یکسان باشند.
2. مطمئن شوید IP مجازی هر نود متفاوت است.
3. آدرس Peer باید شامل IP عمومی قابل‌دسترس و پورت صحیح باشد.
4. پورت را در UFW و فایروال پنل ارائه‌دهنده VPS باز کنید.
5. برای WSS پورت TCP، برای QUIC پورت UDP و برای fallback هر دو را باز کنید.
6. بخش **Connection diagnostics** را باز و خطاهای Handshake را بررسی کنید.

## فایل‌ها و امنیت

- فایل‌های برنامه: `/opt/xraymesh`
- تنظیمات خصوصی: `/etc/xraymesh/config.env`
- سرویس systemd: `/etc/systemd/system/xraymesh.service`
- تنظیمات HAProxy: `/etc/xraymesh/haproxy-tunnels`
- سرویس HAProxy: `/etc/systemd/system/xraymesh-haproxy.service`

فایل تنظیمات خصوصی با دسترسی `600` ذخیره می‌شود. Network Secret را منتشر نکنید،
برای هر نود IP مجازی متفاوت در نظر بگیرید و فقط پورت موردنیاز Mesh را باز کنید.

## بروزرسانی EasyTier

XRayMesh آخرین نسخه پایدار EasyTier را از API رسمی GitHub دریافت می‌کند. اگر API
موقتاً در دسترس نباشد، نسخه پایدار `v2.6.4` به‌عنوان fallback استفاده می‌شود.

## مجوز

کپی‌رایت © 2026 ErfanXRay. تمامی حقوق محفوظ است.

سورس XRayMesh برای استفاده شخصی و داخلی در دسترس است. بازنشر، Mirror، تغییر
نام و برند، فروش یا قراردادن این پروژه یا نسخه تغییریافته آن در یک Repository
دیگر، بدون دریافت اجازه کتبی از ErfanXRay ممنوع است. متن کامل را در
[مجوز اختصاصی XRayMesh](LICENSE) مطالعه کنید.

EasyTier یک پروژه مستقل است و مجوز اختصاصی خودش را دارد.
