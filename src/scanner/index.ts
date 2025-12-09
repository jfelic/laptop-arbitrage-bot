import { SQSClient, SendMessageBatchCommand, SendMessageBatchRequestEntry } from "@aws-sdk/client-sqs";
import axios from 'axios';
import 'dotenv/config';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const BEST_BUY_API_KEY = process.env.BEST_BUY_API_KEY;
const LAPTOP_CATEGORY_ID = 'abcat0502000';

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

/**
 * Lambda Handler: Scanner Service
 * 
 * Triggered by: CloudWatch Events (Schedule)
 * Purpose: Fetches open-box laptops from Best Buy api and pushes candidates to SQS.
 * Note: Does NOT filter by profitability yet (that's the Valuator's job).
 */
export const handler = async (event: any) => {
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
            const response = await axios.get<BestBuyResponse>(url);
            const products = response.data.results;

            if (!products || products.length === 0) {
                console.log("No more products found.");
                break;
            }

            const entries: SendMessageBatchRequestEntry[] = [];

            for (const product of products) {
                for (const offer of product.offers) {
                    if (!offer.onlineAvailability) continue;

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
                            await sqs.send(new SendMessageBatchCommand({
                                QueueUrl: QUEUE_URL,
                                Entries: chunk
                            }));
                            console.log(`Sent batch of ${chunk.length} deals to SQS.`);
                        } catch (err) {
                            console.error("Failed to send batch to SQS:", err);
                        }
                    } else {
                        console.log(`[DRY RUN] Would send ${chunk.length} deals to SQS (SQS_QUEUE_URL not set).`);
                    }
                }
            }

            totalDealsFound += entries.length;
            page++;
            await new Promise(r => setTimeout(r, 1000)); // Be nice to Best Buy API

        } catch (error) {
            console.error("Error scraping page", page, error);
            break;
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Scan complete", dealsFound: totalDealsFound })
    };
};
