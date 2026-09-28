const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeTorob() {
    console.log('🔄 استخراج از Torob.com...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const packages = [];

    try {
        // لیست بسته‌های اینترنت در Torob
        await page.goto('https://torob.com/price-list/1786/%D8%A8%D8%B3%D8%AA%D9%87-%D8%A7%DB%8C%D9%86%D8%AA%D8%B1%D9%86%D8%AA/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        await page.waitForTimeout(5000);

        // اسکرول برای لود شدن همه آیتم‌ها
        await page.evaluate(async () => {
            for (let i = 0; i < 20; i++) {
                window.scrollBy(0, 1000);
                await new Promise(r => setTimeout(r, 800));
            }
        });

        await page.waitForTimeout(3000);

        // استخراج اطلاعات
        const data = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.product-card, .product-item, [class*="product"]').forEach(el => {
                const text = el.innerText;
                const titleMatch = text.match(/(بسته|اینترنت)[^\n]*/i);
                const priceMatch = text.match(/([\d,]+)\s*تومان/);
                
                if (titleMatch && priceMatch) {
                    items.push({
                        title: titleMatch[0],
                        price: priceMatch[1].replace(/,/g, ''),
                        fullText: text
                    });
                }
            });
            return items;
        });

        // پردازش و تبدیل به فرمت استاندارد
        data.forEach(item => {
            const text = item.fullText;
            
            // استخراج اپراتور
            let operator = 'نامشخص';
            if (text.includes('ایرانسل')) operator = 'ایرانسل';
            else if (text.includes('همراه اول')) operator = 'همراه اول';
            else if (text.includes('شاتل')) operator = 'شاتل موبایل';
            else if (text.includes('سامانتل')) operator = 'سامانتل';

            // استخراج حجم
            const volumeMatch = text.match(/(\d+(?:\.\d+)?)\s*(گیگابایت|GB)/i);
            if (!volumeMatch) return;
            const volume = parseFloat(volumeMatch[1]);

            // استخراج مدت
            let days = 30;
            if (text.includes('ساله') || text.includes('یکساله')) days = 365;
            else if (text.includes('۶ ماهه') || text.includes('شش ماهه')) days = 180;
            else if (text.includes('۳ ماهه') || text.includes('سه ماهه')) days = 90;
            else if (text.includes('ماهه')) {
                const m = text.match(/(\d+)\s*ماهه/);
                if (m) days = parseInt(m[1]) * 30;
            }
            else if (text.includes('روزه')) {
                const d = text.match(/(\d+)\s*روزه/);
                if (d) days = parseInt(d[1]);
            }

            const price = parseInt(item.price);

            if (volume > 0 && price > 0 && operator !== 'نامشخص') {
                packages.push({
                    operator: operator,
                    type: operator === 'ایرانسل' && text.includes('TD-LTE') ? 'TD-LTE' : 'همراه',
                    volume: volume,
                    days: days,
                    price: price,
                    source: 'Torob.com'
                });
            }
        });

        console.log(`✅ ${packages.length} بسته از Torob استخراج شد.`);

    } catch (error) {
        console.error('❌ خطا:', error.message);
    }

    await browser.close();
    return packages;
}

async function main() {
    console.log('🚀 شروع استخراج...\n');
    
    let packages = await scrapeTorob();

    // حذف تکراری‌ها
    const unique = [];
    const seen = new Set();
    for (const pkg of packages) {
        const key = `${pkg.operator}|${pkg.volume}|${pkg.days}|${pkg.price}`;
        if (!seen.has(key) && pkg.volume > 0 && pkg.price > 0) {
            seen.add(key);
            unique.push(pkg);
        }
    }

    unique.sort((a, b) => (a.price / a.volume) - (b.price / b.volume));

    const output = {
        lastUpdated: new Date().toISOString(),
        totalPackages: unique.length,
        packages: unique,
        scrapeStatus: unique.length > 0 ? 'موفقیت‌آمیز از Torob' : 'شکست - Torob هم مسدود شد'
    };

    fs.writeFileSync('data.json', JSON.stringify(output, null, 2), 'utf8');
    console.log(`\n🎉 ${unique.length} بسته ذخیره شد.`);
}

main().catch(console.error);
