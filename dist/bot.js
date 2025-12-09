"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
require("dotenv/config");
const valuation_1 = require("./valuation");
const notifications_1 = require("./notifications");
// --- Configuration ---
const BEST_BUY_API_KEY = process.env.BEST_BUY_API_KEY;
const LAPTOP_CATEGORY_ID = 'abcat0502000';
const SEEN_DEALS_FILE = path.join(__dirname, 'seen_deals.json');
const PROFITABLE_DEALS_FILE = path.join(__dirname, 'profitable_flips.json');
// --- Helpers ---
function loadSeenDeals() {
    if (fs.existsSync(SEEN_DEALS_FILE)) {
        try {
            const data = fs.readFileSync(SEEN_DEALS_FILE, 'utf-8');
            // Handle migration from old string[] format if necessary, or just fail safely
            const json = JSON.parse(data);
            if (Array.isArray(json) && typeof json[0] === 'string') {
                console.warn("Detected old format in seen_deals.json, resetting.");
                return [];
            }
            return json;
        }
        catch (error) {
            console.error("Error reading seen_deals.json, starting fresh.", error);
            return [];
        }
    }
    return [];
}
function saveSeenDeals(deals) {
    fs.writeFileSync(SEEN_DEALS_FILE, JSON.stringify(deals, null, 2));
}
function loadProfitableDeals() {
    if (fs.existsSync(PROFITABLE_DEALS_FILE)) {
        try {
            const data = fs.readFileSync(PROFITABLE_DEALS_FILE, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            console.error("Error reading profitable_flips.json, starting fresh.", error);
            return [];
        }
    }
    return [];
}
function saveProfitableDeals(deals) {
    fs.writeFileSync(PROFITABLE_DEALS_FILE, JSON.stringify(deals, null, 2));
}
// --- Main Logic ---
async function main() {
    if (!BEST_BUY_API_KEY) {
        console.error("Error: BEST_BUY_API_KEY is missing in .env");
        process.exit(1);
    }
    console.log("Starting Best Buy Open Box Scanner for Laptops...");
    try {
        let page = 1;
        while (true) {
            // 1. Ingest
            const url = `https://api.bestbuy.com/beta/products/openBox(categoryId=${LAPTOP_CATEGORY_ID})?apiKey=${BEST_BUY_API_KEY}&pageSize=100&page=${page}`;
            console.log(`Fetching Page ${page} from: ${url.replace(BEST_BUY_API_KEY, '***')}`);
            const response = await axios_1.default.get(url);
            const products = response.data.results;
            if (!products || products.length === 0) {
                console.log("No more Open Box products found. Finished scanning.");
                break;
            }
            console.log(`Found ${products.length} products on Page ${page}.`);
            const seenDeals = loadSeenDeals();
            const seenIds = new Set(seenDeals.map(d => d.id));
            const newDeals = [];
            let newDealsCount = 0;
            let valuationCount = 0;
            const MAX_VALUATIONS_PER_RUN = 100; // Increased to cover full page (w/ sleep)
            // 2. Process
            for (const product of products) {
                let productDetails = null;
                let detailsFetched = false;
                for (const offer of product.offers) {
                    const offerId = `${product.sku}-${offer.condition}-${offer.prices.current}`;
                    // Filter: Shipping Must Be Available
                    if (!offer.onlineAvailability) {
                        continue;
                    }
                    if (seenIds.has(offerId)) {
                        continue;
                    }
                    // Fetch details only if we haven't yet for this product
                    if (!detailsFetched) {
                        try {
                            const detailUrl = `https://api.bestbuy.com/v1/products/${product.sku}.json?apiKey=${BEST_BUY_API_KEY}`;
                            const detailResponse = await axios_1.default.get(detailUrl);
                            productDetails = detailResponse.data;
                            // Rate limit detail fetches slightly to avoid 429s
                            await new Promise(resolve => setTimeout(resolve, 250));
                        }
                        catch (err) {
                            console.error(`Failed to fetch details for SKU ${product.sku}`);
                        }
                        detailsFetched = true; // Mark as attempted
                    }
                    const modelNumber = productDetails?.modelNumber || "N/A";
                    const upc = productDetails?.upc || "N/A";
                    console.log("------------------------------------------------");
                    console.log(`NEW DEAL FOUND: ${product.names.title}`);
                    // ... (Logs)
                    console.log(`Condition: ${offer.condition}`);
                    console.log(`Price: $${offer.prices.current} (Regular: $${offer.prices.regular})`);
                    console.log(`SKU: ${product.sku}`);
                    console.log(`Model: ${modelNumber}`);
                    console.log(`UPC: ${upc}`);
                    console.log(`Link: ${product.links.web}`);
                    // 3. Valuate
                    let valuation = null;
                    if (valuationCount >= MAX_VALUATIONS_PER_RUN) {
                        console.log(`  [SAFETY] limit reached (${MAX_VALUATIONS_PER_RUN}). Skipping valuation.`);
                    }
                    else {
                        try {
                            console.log(`Valuating deal via eBay (${valuationCount + 1}/${MAX_VALUATIONS_PER_RUN})...`);
                            valuation = await (0, valuation_1.valuateDeal)(product.names.title, offer.prices.current);
                            valuationCount++;
                            if (valuation) {
                                console.log(`  > eBay Median Sold Price: $${valuation.ebayMedianPrice.toFixed(2)}`);
                                console.log(`  > Estimated Profit: $${valuation.profit.toFixed(2)}`);
                                console.log(`  Based on ${valuation.ebaySoldItemsCount} sold items.`);
                                if (valuation.profit >= 200) {
                                    console.log(`  \x1b[32m$$$ PROFITABLE FLIP FOUND ($${valuation.profit.toFixed(2)}) $$$\x1b[0m`);
                                }
                            }
                            else {
                                console.log("Valuation returned no data or failed.");
                            }
                        }
                        catch (valErr) {
                            console.error("Valuation failed:", valErr);
                        }
                        // Sleep for 5-10 seconds to be gentle on eBay/Apify
                        const sleepMs = Math.floor(Math.random() * 5000) + 5000;
                        console.log(`  [Sleep] Waiting ${sleepMs / 1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, sleepMs));
                    }
                    const deal = {
                        id: offerId,
                        title: product.names.title,
                        condition: offer.condition,
                        price: offer.prices.current,
                        regularPrice: offer.prices.regular,
                        sku: product.sku,
                        model: modelNumber,
                        upc: upc,
                        link: product.links.web,
                        foundAt: new Date().toISOString(),
                        valuation: valuation
                    };
                    // 4. Persist Immediately (Safety first)
                    const currentDeals = loadSeenDeals();
                    currentDeals.push(deal);
                    saveSeenDeals(currentDeals);
                    console.log(`  [Saved] Deal persisted to seen_deals.json`);
                    // 5. Check & Save Profitable Deal
                    if (deal.valuation && deal.valuation.profit >= 200) {
                        const profitableDeals = loadProfitableDeals();
                        profitableDeals.push(deal);
                        saveProfitableDeals(profitableDeals);
                        console.log(`  [Saved] *** PROFITABLE DEAL persisted to profitable_flips.json ***`);
                        // 6. Send Discord Notification
                        console.log(`  [Discord] Sending alert...`);
                        await (0, notifications_1.sendDiscordAlert)(deal);
                    }
                    newDeals.push(deal);
                    seenIds.add(offerId);
                    newDealsCount++;
                }
            }
            console.log(`\nFinished processing Page ${page}. (${newDealsCount} new deals)`);
            page++;
            // Rate limit page fetches
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            if (error.response?.status === 400 &&
                error.response.data.errorMessage?.includes('exceeds last page')) {
                console.log("Finished scanning all pages.");
                return;
            }
            console.error("API Error:", error.message);
            if (error.response) {
                console.error("Status:", error.response.status);
                console.error("Data:", error.response.data);
            }
        }
        else {
            console.error("Unexpected Error:", error);
        }
    }
}
main();
