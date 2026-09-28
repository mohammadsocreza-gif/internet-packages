const puppeteer = require('puppeteer');
const fs = require('fs');

// =============================================
// تنظیمات اصلی
// =============================================
const SOURCES = [
    {
        name: "ایرانسل همراه",
        operator: "ایرانسل",
        type: "همراه",
        url: "https://irancell.ir/o/1001/mobile-internet-packages"
    },
    {
        name: "ایرانسل TD-LTE",
        operator: "ایرانسل",
        type: "TD-LTE",
        url: "https://irancell.ir/p/305229/td-lte-internet-packages"
    },
    {
        name: "همراه اول",
        operator: "همراه اول",
        type: "دائمی",
        url: "https://mci.ir/internet-plans"
    },
    {
        name: "شاتل موبایل",
        operator: "شاتل موبایل",
        type: "همراه",
        url: "https://shatelmobile.ir/plans-tariffs/internet-packages/"
    },
    {
        name: "سامانتل",
        operator: "سامانتل",
        type: "همراه",
        url: "https://payment.samantel.ir/package"
    }
];

// =============================================
// تابع استخراج اعداد از متن فارسی
// =============================================
function extractNumber(text, pattern) {
    const match = text.match(pattern);
    if (!match) return null;
    // حذف کاما و تبدیل به عدد
    return parseFloat(match[1].replace(/[,،]/g, ''));
}

function extractDays(text) {
    // الگوهای مختلف مدت زمان
    const patterns = [
        { regex: /(\d+)\s*روزه/, multiplier: 1 },
        { regex: /(\d+)\s*ماهه/, multiplier: 30 },
        { regex: /(\d+)\s*ساله/, multiplier: 365 },
        { regex: /ماهانه/, fixed: 30 },
        { regex: /روزانه/, fixed: 1 },
        { regex: /هفتگی/, fixed: 7 },
        { regex: /ساعتی/, fixed: 1 }
    ];
    for (const p of patterns) {
        if (p.fixed) {
            if (new RegExp(p.regex.source).test(text)) return p.fixed;
        } else {
            const m = text.match(p.regex);
            if (m) return parseInt(m[1]) * p.multiplier;
        }
    }
    return 30; // پیش‌فرض
}

// =============================================
// تابع اصلی استخراج
// =============================================
async function scrapeSource(page, source) {
    console.log(`\n🔄 در حال استخراج: ${source.name}...`);
    const packages = [];

    try {
        await page.goto(source.url, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // صبر برای بارگذاری محتوای پویا
        await page.waitForTimeout(5000);

        // اسکرول به پایین صفحه برای بارگذاری تمام بسته‌ها (Lazy Loading)
        await page.evaluate(async () => {
            for (let i = 0; i < 10; i++) {
                window.scrollBy(0, 1000);
                await new Promise(r => setTimeout(r, 1000));
            }
        });

        // استخراج تمام متن‌های صفحه
        const pageText = await page.evaluate(() => document.body.innerText);
        const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // روش ۱: جستجوی الگوی "X گیگابایت ... Y تومان" در متن
        const fullText = pageText.replace(/\n/g, ' ');
        
        // الگوهای مختلف حجم
        const volumePatterns = [
            /(\d+(?:[\.\/]\d+)?)\s*گیگابایت/g,
            /(\d+(?:[\.\/]\d+)?)\s*GB/gi,
            /(\d+)\s*مگابایت/g
        ];

        // پیدا کردن تمام بلاک‌های بسته
        // هر بسته معمولاً شامل: حجم + مدت + قیمت است
        const blockRegex = /(\d+(?:\.\d+)?)\s*(گیگابایت|مگابایت|GB|MB)[\s\S]{0,300}?(\d[\d,،]*)\s*تومان/gi;
        let match;
        
        while ((match = blockRegex.exec(fullText)) !== null) {
            try {
                let volume = parseFloat(match[1].replace(/[\/]/g, '.'));
                const unit = match[2].toLowerCase();
                
                // تبدیل مگابایت به گیگابایت
                if (unit.includes('مگا') || unit.includes('mb')) {
                    volume = volume / 1024;
                }
                
                if (volume < 0.05) continue; // حذف بسته‌های خیلی کوچک

                const blockText = match[0];
                const price = parseFloat(match[3].replace(/[,،]/g, ''));
                const days = extractDays(blockText);

                if (price > 0 && volume > 0) {
                    packages.push({
                        operator: source.operator,
                        type: source.type,
                        volume: Math.round(volume * 100) / 100,
                        days: days,
                        price: Math.round(price),
                        source: source.name
                    });
                }
            } catch (e) {
                continue;
            }
        }

        // روش ۲: اگر روش ۱ نتیجه نداد، از ساختار DOM استفاده کن
        if (packages.length === 0) {
            console.log(`   ⚠️ روش متنی نتیجه نداد، تلاش با DOM...`);
            const domPackages = await page.evaluate(() => {
                const results = [];
                // تمام المان‌هایی که ممکن است کارت بسته باشند
                const candidates = document.querySelectorAll(
                    'div[class*="package"], div[class*="plan"], div[class*="product"], ' +
                    'div[class*="offer"], div[class*="card"], div[class*="item"], ' +
                    'li[class*="package"], section[class*="package"]'
                );
                
                candidates.forEach(el => {
                    const text = el.innerText;
                    const volMatch = text.match(/(\d+(?:\.\d+)?)\s*(گیگابایت|GB)/i);
                    const priceMatch = text.match(/([\d,،]+)\s*تومان/);
                    
                    if (volMatch && priceMatch) {
                        results.push({
                            volume: parseFloat(volMatch[1]),
                            price: parseFloat(priceMatch[1].replace(/[,،]/g, '')),
                            text: text.substring(0, 200)
                        });
                    }
                });
                return results;
            });

            domPackages.forEach(p => {
                if (p.volume > 0 && p.price > 0) {
                    packages.push({
                        operator: source.operator,
                        type: source.type,
                        volume: p.volume,
                        days: extractDays(p.text),
                        price: Math.round(p.price),
                        source: source.name
                    });
                }
            });
        }

        console.log(`   ✅ ${packages.length} بسته استخراج شد.`);

    } catch (error) {
        console.error(`   ❌ خطا در ${source.name}: ${error.message}`);
    }

    return packages;
}

// =============================================
// اجرای اصلی
// =============================================
async function main() {
    console.log('🚀 شروع استخراج بسته‌های اینترنت...\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    const page = await browser.newPage();
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    let allPackages = [];

    for (const source of SOURCES) {
        const packages = await scrapeSource(page, source);
        allPackages = allPackages.concat(packages);
    }

    await browser.close();

    // =============================================
    // حذف تکراری‌ها و پاکسازی
    // =============================================
    const unique = [];
    const seen = new Set();
    
    for (const pkg of allPackages) {
        const key = `${pkg.operator}-${pkg.type}-${pkg.volume}-${pkg.days}`;
        if (!seen.has(key) && pkg.price > 0 && pkg.volume >= 0.1) {
            seen.add(key);
            unique.push(pkg);
        }
    }

    // مرتب‌سازی بر اساس قیمت هر گیگ
    unique.sort((a, b) => (a.price / a.volume) - (b.price / b.volume));

    // ذخیره نتیجه
    const output = {
        lastUpdated: new Date().toISOString(),
        totalPackages: unique.length,
        packages: unique
    };

    fs.writeFileSync('data.json', JSON.stringify(output, null, 2), 'utf8');
    console.log(`\n🎉 پایان! ${unique.length} بسته یکتا در data.json ذخیره شد.`);
}

main().catch(console.error);
