const fs = require('fs');

// استفاده از CORS Proxy عمومی برای دور زدن محدودیت‌ها
const PROXY = 'https://api.allorigins.win/raw?url=';

const SOURCES = [
    {
        name: 'ایرانسل همراه',
        operator: 'ایرانسل',
        type: 'همراه',
        url: 'https://irancell.ir/o/1001/mobile-internet-packages'
    },
    {
        name: 'همراه اول',
        operator: 'همراه اول',
        type: 'دائمی',
        url: 'https://mci.ir/internet-plans'
    },
    {
        name: 'شاتل موبایل',
        operator: 'شاتل موبایل',
        type: 'همراه',
        url: 'https://shatelmobile.ir/plans-tariffs/internet-packages/'
    }
];

async function fetchWithProxy(url) {
    const response = await fetch(PROXY + encodeURIComponent(url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
}

function fa2en(str) {
    return str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
              .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

async function scrapeSource(source) {
    console.log(`🔄 ${source.name}...`);
    const packages = [];

    try {
        const html = await fetchWithProxy(source.url);
        const text = fa2en(html.replace(/<[^>]+>/g, ' ')); // حذف تگ‌های HTML
        
        // الگوی جستجو: حجم + قیمت
        const regex = /(\d+(?:[\.\/]\d+)?)\s*(گیگابایت|GB)[\s\S]{0,300}?(\d[\d,،\s]*\d)\s*تومان/gi;
        let match;
        const seen = new Set();

        while ((match = regex.exec(text)) !== null) {
            let volume = parseFloat(match[1].replace(/\//g, '.'));
            if (volume < 0.1) continue;

            const price = parseFloat(match[3].replace(/[,،\s]/g, ''));
            if (price < 1000 || price > 10000000) continue;

            let days = 30;
            if (match[0].includes('ساله')) days = 365;
            else if (match[0].includes('ماهه')) {
                const m = match[0].match(/(\d+)\s*ماهه/);
                if (m) days = parseInt(m[1]) * 30;
            }
            else if (match[0].includes('روزه')) {
                const d = match[0].match(/(\d+)\s*روزه/);
                if (d) days = parseInt(d[1]);
            }

            const key = `${volume}-${days}-${price}`;
            if (!seen.has(key)) {
                seen.add(key);
                packages.push({
                    operator: source.operator,
                    type: source.type,
                    volume,
                    days,
                    price,
                    source: source.name
                });
            }
        }

        console.log(`   ✅ ${packages.length} بسته یافت شد`);
    } catch (error) {
        console.log(`   ❌ خطا: ${error.message}`);
    }

    return packages;
}

async function main() {
    console.log('🚀 شروع استخراج با CORS Proxy...\n');

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

    const output = {
        lastUpdated: new Date().toISOString(),
        totalPackages: unique.length,
        packages: unique,
        scrapeStatus: unique.length > 0 ? 'موفقیت‌آمیز با CORS Proxy' : 'شکست کامل'
    };

    fs.writeFileSync('data.json', JSON.stringify(output, null, 2), 'utf8');
    console.log(`\n🎉 ${unique.length} بسته ذخیره شد. وضعیت: ${output.scrapeStatus}`);
}

main().catch(console.error);
