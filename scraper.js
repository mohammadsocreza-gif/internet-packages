const fs = require('fs');

const JINA_READER = 'https://r.jina.ai/';

// ==========================================
// لیست نجات (Fallback) - دقیق و به‌روز
// اگر اسکریپت نتواند استخراج کند، این لیست نمایش داده می‌شود
// ==========================================
const FALLBACK_DATA = [
    { operator: "ایرانسل", type: "TD-LTE", volume: 600, days: 365, price: 1651050, source: "ایرانسل TD-LTE" },
    { operator: "ایرانسل", type: "TD-LTE", volume: 90, days: 30, price: 259120, source: "ایرانسل TD-LTE" },
    { operator: "ایرانسل", type: "TD-LTE", volume: 50, days: 30, price: 167080, source: "ایرانسل TD-LTE" },
    { operator: "ایرانسل", type: "همراه", volume: 100, days: 120, price: 755000, source: "ایرانسل همراه" },
    { operator: "ایرانسل", type: "همراه", volume: 50, days: 30, price: 383500, source: "ایرانسل همراه" },
    { operator: "همراه اول", type: "دائمی", volume: 20, days: 30, price: 115620, source: "همراه اول" },
    { operator: "همراه اول", type: "دائمی", volume: 10, days: 30, price: 62000, source: "همراه اول" },
    { operator: "همراه اول", type: "دائمی", volume: 5, days: 30, price: 31620, source: "همراه اول" },
    { operator: "همراه اول", type: "دائمی", volume: 2, days: 30, price: 18760, source: "همراه اول" },
    { operator: "شاتل موبایل", type: "همراه", volume: 30, days: 30, price: 165000, source: "شاتل موبایل" },
    { operator: "شاتل موبایل", type: "همراه", volume: 10, days: 30, price: 71000, source: "شاتل موبایل" },
    { operator: "سامانتل", type: "همراه", volume: 15, days: 60, price: 66200, source: "سامانتل" },
    { operator: "سامانتل", type: "همراه", volume: 10, days: 60, price: 52300, source: "سامانتل" }
];

const SOURCES = [
    { name: 'ایرانسل همراه', operator: 'ایرانسل', type: 'همراه', url: 'https://irancell.ir/o/1001/mobile-internet-packages' },
    { name: 'همراه اول', operator: 'همراه اول', type: 'دائمی', url: 'https://mci.ir/internet-plans' },
    { name: 'شاتل موبایل', operator: 'شاتل موبایل', type: 'همراه', url: 'https://shatelmobile.ir/plans-tariffs/internet-packages/' }
];

function fa2en(str) {
    return str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
              .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

async function scrapeSource(source) {
    console.log(`🔄 تلاش برای استخراج: ${source.name}...`);
    const packages = [];

    try {
        const cacheBuster = `?v=${Date.now()}`;
        const response = await fetch(JINA_READER + encodeURIComponent(source.url + cacheBuster));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text();
        const normalizedText = fa2en(text);
        
        // الگوی جستجو
        const regex = /(\d+(?:\.\d+)?)\s*(?:گیگابایت|GB)[\s\S]{0,300}?(\d[\d,،\s]*)\s*تومان/gi;
        let match;
        const seen = new Set();

        while ((match = regex.exec(normalizedText)) !== null) {
            let volume = parseFloat(match[1].replace(/\//g, '.'));
            const priceStr = match[2].replace(/[,،\s]/g, '');
            const price = parseFloat(priceStr);
            
            if (volume < 0.1 || price < 1000) continue;

            // فیلتر هوشمند: قیمت هر گیگ باید بین ۱۰۰۰ تا ۵۰۰۰۰ تومان باشد (حذف داده‌های پرت)
            const pricePerGB = price / volume;
            if (pricePerGB < 1000 || pricePerGB > 50000) continue;

            let days = 30;
            const block = match[0];
            if (block.includes('ساله')) days = 365;
            else if (block.includes('ماهه')) {
                const m = block.match(/(\d+)\s*ماهه/);
                if (m) days = parseInt(m[1]) * 30;
            } else if (block.includes('روزه')) {
                const d = block.match(/(\d+)\s*روزه/);
                if (d) days = parseInt(d[1]);
            }

            const key = `${source.operator}-${volume}-${days}-${price}`;
            if (!seen.has(key)) {
                seen.add(key);
                packages.push({ operator: source.operator, type: source.type, volume, days, price, source: source.name });
            }
        }
        console.log(`   ✅ ${packages.length} بسته معتبر یافت شد.`);
    } catch (error) {
        console.log(`   ❌ خطا: ${error.message}`);
    }
    return packages;
}

async function main() {
    console.log('🚀 شروع فرآیند هوشمند...\n');

    let allPackages = [];
    for (const source of SOURCES) {
        const pkgs = await scrapeSource(source);
        allPackages = allPackages.concat(pkgs);
    }

    // حذف تکراری‌ها
    const unique = [];
    const seen = new Set();
    for (const pkg of allPackages) {
        const key = `${pkg.operator}|${pkg.volume}|${pkg.days}|${pkg.price}`;
        if (!seen.has(key) && pkg.volume > 0 && pkg.price > 0) {
            seen.add(key);
            unique.push(pkg);
        }
    }

    unique.sort((a, b) => (a.price / a.volume) - (b.price / b.volume));

    // ==========================================
    // منطق نجات (Fail-Safe)
    // ==========================================
    let finalPackages = unique;
    let status = "موفقیت‌آمیز (زنده)";

    // اگر کمتر از ۵ بسته پیدا کرد، یعنی فایروال جلوی ما را گرفته است
    if (unique.length < 5) {
        console.log('\n⚠️ هشدار: استخراج زنده ناموفق بود یا داده‌ها ناکافی هستند.');
        console.log('🛡️ فعال‌سازی حالت نجات: استفاده از لیست تأییدشده برای اطمینان از کارکرد داشبورد.');
        finalPackages = FALLBACK_DATA;
        status = "حالت نجات فعال (داده‌های تأییدشده)";
    }

    const output = {
        lastUpdated: new Date().toISOString(),
        totalPackages: finalPackages.length,
        packages: finalPackages,
        scrapeStatus: status
    };

    fs.writeFileSync('data.json', JSON.stringify(output, null, 2), 'utf8');
    console.log(`\n🎉 پایان! ${finalPackages.length} بسته در data.json ذخیره شد. (وضعیت: ${status})`);
}

main().catch(console.error);
