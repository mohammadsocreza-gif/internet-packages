const fs = require('fs');

const JINA_READER = 'https://r.jina.ai/';

const SOURCES = [
    { name: 'ایرانسل همراه', operator: 'ایرانسل', type: 'همراه', url: 'https://irancell.ir/o/1001/mobile-internet-packages' },
    { name: 'ایرانسل TD-LTE', operator: 'ایرانسل', type: 'TD-LTE', url: 'https://irancell.ir/p/305229/td-lte-internet-packages' },
    { name: 'همراه اول', operator: 'همراه اول', type: 'دائمی', url: 'https://mci.ir/internet-plans' },
    { name: 'شاتل موبایل', operator: 'شاتل موبایل', type: 'همراه', url: 'https://shatelmobile.ir/plans-tariffs/internet-packages/' },
    { name: 'سامانتل', operator: 'سامانتل', type: 'همراه', url: 'https://samantel.ir/internet-package/' }
];

function fa2en(str) {
    return str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
              .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

async function scrapeSource(source) {
    console.log(`🔄 در حال خواندن: ${source.name}...`);
    const packages = [];

    try {
        const cacheBuster = `?v=${Date.now()}`;
        const response = await fetch(JINA_READER + encodeURIComponent(source.url + cacheBuster));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text();
        const normalizedText = fa2en(text);
        
        // الگوی موفق قبلی (همانی که ۹۵ بسته پیدا کرد)
        const regex = /(\d+(?:\.\d+)?)\s*(?:گیگابایت|GB)[\s\S]{0,300}?(\d[\d,،\s]*)\s*تومان/gi;
        let match;
        const seen = new Set();

        while ((match = regex.exec(normalizedText)) !== null) {
            let volume = parseFloat(match[1].replace(/\//g, '.'));
            const priceStr = match[2].replace(/[,،\s]/g, '');
            const price = parseFloat(priceStr);
            
            if (volume < 0.1 || price < 1000) continue;

            // فیلتر منطقی (همان فیلتر موفق قبلی)
            const pricePerGB = price / volume;
            if (pricePerGB < 1000 || pricePerGB > 50000) continue;

            // حذف بسته‌های ترکیبی
            const block = match[0];
            const contextBefore = normalizedText.substring(Math.max(0, match.index - 150), match.index);
            if (contextBefore.includes('ثابت') || contextBefore.includes('FMC')) {
                continue;
            }

            let days = 30;
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
        console.log(`   ✅ ${packages.length} بسته یافت شد.`);
    } catch (error) {
        console.log(`   ❌ خطا در ${source.name}: ${error.message}`);
    }
    return packages;
}

async function main() {
    console.log('🚀 شروع استخراج (بدون Fallback)...\n');

    let allPackages = [];
    for (const source of SOURCES) {
        const pkgs = await scrapeSource(source);
        allPackages = allPackages.concat(pkgs);
    }

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
        scrapeStatus: unique.length > 0 ? 'موفقیت‌آمیز (فقط داده‌های زنده)' : 'شکست - هیچ داده‌ای استخراج نشد'
    };

    fs.writeFileSync('data.json', JSON.stringify(output, null, 2), 'utf8');
    console.log(`\n🎉 پایان! ${unique.length} بسته ذخیره شد.`);
    
    if (unique.length === 0) {
        console.log('⚠️ هشدار: هیچ بسته‌ای استخراج نشد.');
    }
}

main().catch(console.error);
