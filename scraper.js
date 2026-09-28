const fs = require('fs');

const JINA_READER = 'https://r.jina.ai/';

const SOURCES = [
    { name: 'ایرانسل همراه', operator: 'ایرانسل', type: 'همراه', url: 'https://irancell.ir/o/1001/mobile-internet-packages' },
    { name: 'همراه اول', operator: 'همراه اول', type: 'دائمی', url: 'https://mci.ir/internet-plans' },
    { name: 'شاتل موبایل', operator: 'شاتل موبایل', type: 'همراه', url: 'https://shatelmobile.ir/plans-tariffs/internet-packages/' },
    { name: 'سامانتل', operator: 'سامانتل', type: 'همراه', url: 'https://payment.samantel.ir/package' }
];

function fa2en(str) {
    return str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
              .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

async function scrapeSource(source) {
    console.log(`🔄 در حال خواندن: ${source.name}...`);
    const packages = [];

    try {
        // اضافه کردن زمان فعلی برای شکستن کش و دریافت نسخه به‌روز
        const cacheBuster = `?v=${Date.now()}`;
        const response = await fetch(JINA_READER + encodeURIComponent(source.url + cacheBuster));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text();
        const normalizedText = fa2en(text);
        
        // الگوی دقیق‌تر: عدد + گیگابایت + (حداکثر ۱۵۰ کاراکتر فاصله) + قیمت + تومان
        const regex = /(\d+(?:\.\d+)?)\s*(?:گیگابایت|GB)[^\n]{0,150}(\d{4,})\s*تومان/gi;
        let match;
        const seen = new Set();

        while ((match = regex.exec(normalizedText)) !== null) {
            let volume = parseFloat(match[1].replace(/\//g, '.'));
            const price = parseFloat(match[2].replace(/[,،\s]/g, ''));
            
            // فیلتر کردن خطاهای استخراج (قیمت هر گیگ نباید کمتر از ۱۰۰۰ تومان باشد)
            if (volume < 0.1 || price < 1000 || (price / volume) < 1000) {
                continue;
            }

            // استخراج مدت زمان از همان بخش matched
            let days = 30;
            const matchedBlock = match[0];
            if (matchedBlock.includes('ساله')) days = 365;
            else if (matchedBlock.includes('ماهه')) {
                const m = matchedBlock.match(/(\d+)\s*ماهه/);
                if (m) days = parseInt(m[1]) * 30;
            }
            else if (matchedBlock.includes('روزه')) {
                const d = matchedBlock.match(/(\d+)\s*روزه/);
                if (d) days = parseInt(d[1]);
            }

            const key = `${source.operator}-${volume}-${days}-${price}`;
            if (!seen.has(key)) {
                seen.add(key);
                packages.push({
                    operator: source.operator,
                    type: source.type,
                    volume: Math.round(volume * 100) / 100,
                    days: days,
                    price: Math.round(price),
                    source: source.name
                });
            }
        }
        console.log(`   ✅ ${packages.length} بسته واقعی یافت شد.`);
    } catch (error) {
        console.log(`   ❌ خطا در ${source.name}: ${error.message}`);
    }

    return packages;
}

async function main() {
    console.log('🚀 شروع استخراج هوشمند و به‌روز...\n');

    let allPackages = [];
    for (const source of SOURCES) {
        const pkgs = await scrapeSource(source);
        allPackages = allPackages.concat(pkgs);
    }

    // حذف تکراری‌ها و مرتب‌سازی
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

    const output = {
        lastUpdated: new Date().toISOString(),
        totalPackages: unique.length,
        packages: unique,
        scrapeStatus: unique.length > 0 ? 'موفقیت‌آمیز (داده‌های به‌روز و فیلترشده)' : 'شکست در استخراج'
    };

    fs.writeFileSync('data.json', JSON.stringify(output, null, 2), 'utf8');
    console.log(`\n🎉 پایان! ${unique.length} بسته معتبر ذخیره شد.`);
}

main().catch(console.error);
