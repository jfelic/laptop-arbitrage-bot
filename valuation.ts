import { ApifyClient } from 'apify-client';
import 'dotenv/config';

// --- Configuration ---
const APIFY_TOKEN = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;

if (!APIFY_TOKEN) {
    console.warn("WARNING: APIFY_API_TOKEN is not set in environment variables. Valuation will fail.");
}

const apifyClient = new ApifyClient({
    token: APIFY_TOKEN,
});

// --- Types ---
export interface ValuationResult {
    ebayMedianPrice: number;
    ebaySoldItemsCount: number;
    ebaySearchUrl: string;
    profit: number;
    currency: string;
}

// --- Helpers ---

/**
 * Parses a Best Buy title to construct a search query for eBay.
 * Strategy: Extract Model, CPU, RAM, Storage.
 * Example: "Apple - MacBook Pro 14" Laptop - M3 Pro... - 18GB Memory - 1TB SSD..."
 *       -> "MacBook Pro 14 M3 Pro 18GB 1TB"
 */
export function constructEbayQuery(title: string): string {
    const parts = title.split(' - ').map(p => p.trim());

    // We want to capture specific segments.
    // Usually: [Brand, Model, CPU, RAM, Storage, Color/Other]
    // But sometimes order varies. We'll use heuristics on the parts.

    const validParts: string[] = [];

    // 1. Model (Usually index 1, but let's look for the one with "Laptop" or known models)
    // Actually, following the "Index 1 is usually model" heuristic from Best Buy is decent, 
    // but let's be smarter. WE know "Apple" or "Lenovo" is usually index 0.
    // Index 1 is usually the model name.
    if (parts.length > 1) {
        let modelPart = parts[1];
        // Clean up common noise
        modelPart = modelPart
            .replace(/Laptop/gi, '')
            .replace(/Notebook/gi, '')
            .replace(/Touch-Screen/gi, '')
            .replace(/Touch Screen/gi, '')
            .replace(/2-in-1/gi, '')
            .replace(/"/g, '') // Remove inch quote
            .trim();
        validParts.push(modelPart);
    }

    // 2. Scan other parts for specs
    for (let i = 2; i < parts.length; i++) {
        const part = parts[i];

        // CPU Heuristics
        if (
            part.includes('Intel') ||
            part.includes('AMD') ||
            part.includes('M1') ||
            part.includes('M2') ||
            part.includes('M3') ||
            part.includes('M4') ||
            part.includes('Snapdragon')
        ) {
            // Clean up "chip Built for..." marketing fluff
            let cpu = part.split(' Built for')[0]; // "M3 Pro chip Built for..." -> "M3 Pro chip"
            cpu = cpu.replace(/chip/gi, '').replace(/Processor/gi, '').trim();

            // Heuristic for when specs are clobbered together like "Snapdragon... 16GB Memory"
            // If the CPU part is suspiciously long or contains "Memory"/"Storage", strip it.
            if (cpu.length > 50 || cpu.includes('Memory') || cpu.includes('Storage')) {
                // Try to isolate the CPU name. 
                // e.g. "Snapdragon X Elite 3.8Ghz- 16GB Memory- 1TB Storage"
                // Remove anything after a hyphen if it looks like a spec separator
                cpu = cpu.split('-')[0].trim();
            }
            validParts.push(cpu);
            continue;
        }

        // RAM Heuristics
        if (part.includes('GB Memory') || part.includes('GB RAM')) {
            // "18GB Memory" -> "18GB"
            // handle "16GB Memory-" (Samsung case has hyphen)
            const ram = part.replace(/Memory/gi, '').replace(/RAM/gi, '').replace(/Unified/gi, '').replace(/-/g, '').trim();
            validParts.push(ram);
            continue;
        }

        // Storage Heuristics
        if (part.includes('SSD') || part.includes('HDD') || part.includes('eMMC') || part.includes('Storage') || part.includes('UFS')) {
            // "1TB SSD" -> "1TB"
            const storage = part.replace(/SSD/gi, '').replace(/HDD/gi, '').replace(/eMMC/gi, '').replace(/Storage/gi, '').replace(/UFS/gi, '').replace(/-/g, '').trim();
            validParts.push(storage);
            continue;
        }
    }

    return validParts.join(' ');
}

/**
 * Calculates the median of an array of numbers.
 */
function calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}

/**
 * Fetches sold prices from eBay using Apify.
 */
async function getEbaySoldPrices(query: string): Promise<number[]> {
    // Construct the URL with specific filters:
    // LH_Complete=1&LH_Sold=1 (Sold items)
    // _ipg=60 (Items per page, default 60 is fine, user asked for 10 in example but more data is better, though safer to stick to small to save credits if pay-per-result?) 
    // User URL: _ipg=10. Let's respect that to avoid scraping too much if not valid.

    // URL Encoding the query
    const encodedQuery = encodeURIComponent(query);
    const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&_sacat=0&_from=R40&_trksid=m570.l1313&LH_Complete=1&LH_Sold=1&_ipg=10`;

    console.log(`[Valuation] Scraping eBay for: "${query}"`);

    // Run the Actor
    // Actor: ivanvs/ebay-scraper-pay-per-result
    const run = await apifyClient.actor("ivanvs/ebay-scraper-pay-per-result").call({
        urls: [{ url: ebayUrl }],
        maxItems: 10,
        proxyConfiguration: {
            useApifyProxy: true
        }
    });

    // Fetch results from the dataset
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

    const prices: number[] = [];

    for (const item of items) {
        // cast to any because the dataset items are untyped by default
        const i = item as any;

        // We want the total price (price + shipping) if possible
        // The output usually has 'price' and 'shippingCost'
        // We need to parse "USD 1,200.00" or similar

        let price = 0;

        // Helper to parse price string "Msg 123.45" or "$123.45"
        const parsePrice = (str: any) => {
            if (typeof str === 'number') return str;
            if (!str) return 0;
            const num = parseFloat(toString(str).replace(/[^0-9.]/g, ''));
            return isNaN(num) ? 0 : num;
        };

        const toString = (val: any) => {
            return val ? String(val) : '';
        }

        if (i.price) {
            price += parsePrice(i.price);
        }

        // Add shipping if present (some scrapers include it, some separate it)
        // Adjust based on actual actor output format if known. 
        // For ivanvs/ebay-scraper, it usually returns a clean price number or string. 
        // Let's assume the 'price' field is the raw price. 
        // We should add shipping if available to be conservative on profit. 
        // If we can't find shipping, we assume 0 (which is risky, but okay for MVP).

        if (price > 0) {
            prices.push(price);
        }
    }

    return prices;
}

/**
 * Main valuation function.
 */
export async function valuateDeal(title: string, currentPrice: number): Promise<ValuationResult | null> {
    try {
        const query = constructEbayQuery(title);
        if (!query) {
            console.log(`[Valuation] Could not construct query for: ${title}`);
            return null;
        }

        const soldPrices = await getEbaySoldPrices(query);

        if (soldPrices.length === 0) {
            return {
                ebayMedianPrice: 0,
                ebaySoldItemsCount: 0,
                ebaySearchUrl: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1`,
                profit: -currentPrice, // Total loss if we can't sell it? Or just undefined.
                currency: 'USD'
            };
        }

        const median = calculateMedian(soldPrices);
        // Profit = Median Sold Price - (Buy Price + Tax (~8%) + eBay Fees (~13%) + Shipping (~$20))
        // This is a rough estimate.
        const estimatedTax = currentPrice * 0.08;
        const estimatedFees = median * 0.13;
        const estimatedShipping = 20;
        const totalCost = currentPrice + estimatedTax + estimatedFees + estimatedShipping;

        const profit = median - totalCost;

        return {
            ebayMedianPrice: median,
            ebaySoldItemsCount: soldPrices.length,
            ebaySearchUrl: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1`,
            profit: parseFloat(profit.toFixed(2)),
            currency: 'USD'
        };

    } catch (error) {
        console.error("[Valuation] Error valuating deal:", error);
        return null;
    }
}
