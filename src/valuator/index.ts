import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { valuateDeal } from './valuation';
import { sendDiscordAlert } from './notifications';
import 'dotenv/config';

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'arbitrage-deals';

interface SqsMessageBody {
    id: string;
    sku: string;
    title: string;
    condition: string;
    price: number;
    regularPrice: number;
    link: string;
    foundAt: string;
}

/**
 * Lambda Handler: Valuator Service
 * 
 * Triggered by: SQS Messages (from Scanner)
 * Purpose:
 * 1. Checks DynamoDB to see if deal was already processed (Idempotency).
 * 2. Scrapes eBay for recent sales data to determine market value.
 * 3. Sends Discord alerts if profit > threshold.
 */
export const handler = async (event: any) => {
    console.log(`Received ${event.Records?.length || 0} records.`);

    for (const record of event.Records || []) {
        try {
            const body: SqsMessageBody = JSON.parse(record.body);
            const { id, title, price, sku } = body;

            // 1. Idempotency Check
            const getParams = {
                TableName: TABLE_NAME,
                Key: {
                    sku: { S: sku },
                    // In a real scenario, we might want a composite key or just SKU. 
                    // However, we track "deals" which are unique by SKU+Condition+Price.
                    // But if we want to avoid re-valuating the same SKU every hour, we should check by SKU.
                    // Let's stick to the ID we generated: product.sku-condition-price used in bot.ts
                    // But DynamoDB defines PK as 'sku'.
                    // If we use 'sku' as PK, we can only store one active deal per SKU. 
                    // This is acceptable for Phase 2 MVP.
                }
            };

            // But wait, the previous bot used `id` like `sku-condition-price`.
            // If the Terraform defines PK as `sku`, we should probably check if we've seen this deal recently.
            // Let's assume for now we use 'id' as the PK in DynamoDB to match the previous logic, 
            // OR we use 'sku' and maybe a Sort Key 'id'?
            // The plan said: `dynamodb.tf` (Table: `arbitrage-state`, PK: `sku`).
            // If PK is `sku`, then updating it overwrites the previous state.
            // For now, let's use `sku` as PK because `sku` is unique enough for "Recently Valuated".

            // Actually, let's check if we have valuated this SKU recently to save money?
            // bot.ts logic: "if seenIds.has(offerId) continue".
            // So it tracked exact offers.
            // If I change PK to `id`, I need to update the Terraform plan in my head or code.
            // Let's use `id` as the PK for better granularity, matching `bot.ts`.
            // I will update the Terraform plan to use `id` instead of `sku` or use `sku` as PK and `id` as SK.
            // Let's stick to using `id` as the PK for now in the code, and I'll ensure Terraform matches.

            const getResult = await ddb.send(new GetItemCommand({
                TableName: TABLE_NAME,
                Key: { id: { S: id } }
            }));

            if (getResult.Item) {
                console.log(`Skipping ${id}, already processed.`);
                continue;
            }

            // 2. Valuate
            console.log(`Valuating ${title} ($${price})...`);
            const valuation = await valuateDeal(title, price);

            if (valuation) {
                console.log(`  > Profit: $${valuation.profit}`);

                // 3. Notify
                if (valuation.profit >= 200) {
                    console.log(`  > Profit ($${valuation.profit}) meets threshold ($200). Sending alert...`);
                    await sendDiscordAlert({
                        title,
                        price,
                        link: body.link,
                        valuation
                    });
                } else {
                    console.log(`  > Profit ($${valuation.profit}) below threshold ($200). No alert.`);
                }
            }

            // 4. Save State (PutItem)
            const ttl = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7); // 7 days

            await ddb.send(new PutItemCommand({
                TableName: TABLE_NAME,
                Item: {
                    id: { S: id },
                    sku: { S: sku },
                    title: { S: title.substring(0, 500) }, // Limit title length just in case
                    price: { N: price.toString() },
                    profit: { N: (valuation?.profit || 0).toString() },
                    link: { S: body.link },
                    ttl: { N: ttl.toString() },
                    timestamp: { S: new Date().toISOString() }
                }
            }));

            // Sleep a bit to be nice to APIs if processing a batch sequentially
            await new Promise(r => setTimeout(r, 2000));

        } catch (error) {
            console.error("Error processing record", error);
        }
    }

    return { statusCode: 200 };
};
