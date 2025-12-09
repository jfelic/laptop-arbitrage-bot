"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const axios_1 = __importDefault(require("axios"));
require("dotenv/config");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const BEST_BUY_API_KEY = process.env.BEST_BUY_API_KEY;
const LAPTOP_CATEGORY_ID = 'abcat0502000';
/**
 * Lambda Handler: Scanner Service
 *
 * Triggered by: CloudWatch Events (Schedule)
 * Purpose: Fetches open-box laptops from Best Buy api and pushes candidates to SQS.
 * Note: Does NOT filter by profitability yet (that's the Valuator's job).
 */
const handler = async (event) => {
    if (!BEST_BUY_API_KEY) {
        throw new Error("BEST_BUY_API_KEY is missing");
    }
    console.log("Starting Scanner...");
    let page = 1;
    let totalDealsFound = 0;
    // In a Lambda, we might want to limit execution time or pages. 
    // For now, let's scan a fixed number of pages or until empty to avoid timeouts.
    const MAX_PAGES = 5;
    while (page <= MAX_PAGES) {
        const url = `https://api.bestbuy.com/beta/products/openBox(categoryId=${LAPTOP_CATEGORY_ID})?apiKey=${BEST_BUY_API_KEY}&pageSize=100&page=${page}`;
        console.log(`Fetching Page ${page}`);
        try {
            const response = await axios_1.default.get(url);
            const products = response.data.results;
            if (!products || products.length === 0) {
                console.log("No more products found.");
                break;
            }
            const entries = [];
            for (const product of products) {
                for (const offer of product.offers) {
                    // Filter 1: Must be available online specifically for shipping
                    if (!offer.onlineAvailability) {
                        continue;
                    }
                    const payload = {
                        id: `${product.sku}-${offer.condition}-${offer.prices.current}`,
                        sku: product.sku,
                        title: product.names.title,
                        condition: offer.condition,
                        price: offer.prices.current,
                        regularPrice: offer.prices.regular,
                        link: product.links.web,
                        foundAt: new Date().toISOString()
                    };
                    entries.push({
                        Id: payload.id.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 80), // SQS Id constraints
                        MessageBody: JSON.stringify(payload)
                    });
                }
            }
            if (entries.length > 0) {
                // SQS Batch limit is 10. We need to chunk.
                for (let i = 0; i < entries.length; i += 10) {
                    const chunk = entries.slice(i, i + 10);
                    if (QUEUE_URL) {
                        try {
                            await sqs.send(new client_sqs_1.SendMessageBatchCommand({
                                QueueUrl: QUEUE_URL,
                                Entries: chunk
                            }));
                            console.log(`Sent batch of ${chunk.length} deals to SQS.`);
                        }
                        catch (err) {
                            console.error("Failed to send batch to SQS:", err);
                        }
                    }
                    else {
                        console.log(`[DRY RUN] Would send ${chunk.length} deals to SQS (SQS_QUEUE_URL not set).`);
                    }
                }
            }
            totalDealsFound += entries.length;
            page++;
            await new Promise(r => setTimeout(r, 1000)); // Be nice to Best Buy API
        }
        catch (error) {
            console.error("Error scraping page", page, error);
            break;
        }
    }
    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Scan complete", dealsFound: totalDealsFound })
    };
};
exports.handler = handler;
