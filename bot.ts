import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

import { valuateDeal, ValuationResult } from './valuation';

// --- Configuration ---
const BEST_BUY_API_KEY = process.env.BEST_BUY_API_KEY;
const LAPTOP_CATEGORY_ID = 'abcat0502000';
const SEEN_DEALS_FILE = path.join(__dirname, 'seen_deals.json');

// --- Types ---
interface BestBuyOffer {
    condition: string;
    onlineAvailability: boolean;
    prices: {
        current: number;
        regular: number;
    };
}

interface BestBuyProductDetail {
    modelNumber: string;
    upc: string;
}

interface BestBuyProduct {
    sku: string;
    names: {
        title: string;
    };
    links: {
        web: string;
        addToCart: string;
    };
    offers: BestBuyOffer[];
    prices: {
        current: number;
        regular: number;
    };
}

interface BestBuyResponse {
    results: BestBuyProduct[];
}

interface SavedDeal {
    id: string; // Unique ID (SKU-Condition-Price)
    title: string;
    condition: string;
    price: number;
    regularPrice: number;
    sku: string;
    model: string;
    upc: string;
    link: string;
    foundAt: string; // ISO Timestamp
    valuation?: ValuationResult | null;
}

// --- Helpers ---
function loadSeenDeals(): SavedDeal[] {
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
        } catch (error) {
            console.error("Error reading seen_deals.json, starting fresh.", error);
            return [];
        }
    }
    return [];
}

function saveSeenDeals(deals: SavedDeal[]) {
    fs.writeFileSync(SEEN_DEALS_FILE, JSON.stringify(deals, null, 2));
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

            const response = await axios.get<BestBuyResponse>(url);
            const products = response.data.results;

            if (!products || products.length === 0) {
                console.log("No more Open Box products found. Finished scanning.");
                break;
            }

            console.log(`Found ${products.length} products on Page ${page}.`);

            const seenDeals = loadSeenDeals();
            const seenIds = new Set(seenDeals.map(d => d.id));

            const newDeals: SavedDeal[] = [];
            let newDealsCount = 0;
            let valuationCount = 0;
            const MAX_VALUATIONS_PER_RUN = 3;

            // 2. Process
            for (const product of products) {
                let productDetails: BestBuyProductDetail | null = null;
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
                            const detailResponse = await axios.get<BestBuyProductDetail>(detailUrl);
                            productDetails = detailResponse.data;

                            // Rate limit detail fetches slightly to avoid 429s
                            await new Promise(resolve => setTimeout(resolve, 250));
                        } catch (err) {
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
                    let valuation: ValuationResult | null = null;
                    if (valuationCount < MAX_VALUATIONS_PER_RUN) {
                        try {
                            console.log(`Valuating deal via eBay (${valuationCount + 1}/${MAX_VALUATIONS_PER_RUN})...`);
                            valuation = await valuateDeal(product.names.title, offer.prices.current);
                            valuationCount++;

                            if (valuation) {
                                console.log(`eBay Median Sold Price: $${valuation.ebayMedianPrice.toFixed(2)}`);
                                console.log(`Estimated Profit: $${valuation.profit.toFixed(2)}`);
                                console.log(`Based on ${valuation.ebaySoldItemsCount} sold items.`);
                            } else {
                                console.log("Valuation returned no data or failed.");
                            }
                        } catch (valErr) {
                            console.error("Valuation failed:", valErr);
                        }
                    } else {
                        console.log("Skipping valuation (limit reached).");
                    }


                    const deal: SavedDeal = {
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

                    newDeals.push(deal);
                    seenIds.add(offerId); // Prevent duplicate adds in same run
                    newDealsCount++;
                }
            }

            // 4. Persist (Per page)
            if (newDealsCount > 0) {
                console.log(`\nSaved ${newDealsCount} new deals from Page ${page} to seen_deals.json`);
                // Reload current file state to append safely (in case of concurrent writes, though not issue here)
                const currentDeals = loadSeenDeals();
                const updatedDeals = [...currentDeals, ...newDeals];
                saveSeenDeals(updatedDeals);
            } else {
                console.log(`\nNo new deals found on Page ${page}.`);
            }

            page++;
            // Rate limit page fetches
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.response?.status === 400 &&
                (error.response.data as any).errorMessage?.includes('exceeds last page')) {
                console.log("Finished scanning all pages.");
                return;
            }
            console.error("API Error:", error.message);
            if (error.response) {
                console.error("Status:", error.response.status);
                console.error("Data:", error.response.data);
            }
        } else {
            console.error("Unexpected Error:", error);
        }
    }
}

main();