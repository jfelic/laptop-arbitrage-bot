import axios from 'axios';
import 'dotenv/config';
// import { SavedDeal } from './bot'; // Removed legacy import

// Redefine locally to avoid circular dependencies if SavedDeal isn't exported cleanly yet
// Ideally we should export it from bot.ts, but for now this is safe
interface NotificationDeal {
    title: string;
    price: number;
    link: string;
    valuation?: {
        ebayMedianPrice: number;
        profit: number;
        ebaySoldItemsCount: number;
    } | null;
}

export async function sendDiscordAlert(deal: NotificationDeal) {
    const webhookUrl = process.env.DISCORD_WEBHOOK;

    if (!webhookUrl) {
        console.error("DISCORD_WEBHOOK is not set in .env. Skipping notification.");
        return;
    }

    if (!deal.valuation) {
        console.warn("Skipping notification: Missing valuation data.");
        return;
    }

    // Format money helper
    const fmt = (n: number) => `$${n.toFixed(2)}`;

    const embed = {
        title: "💰 PROFITABLE FLIP FOUND! 💰",
        url: deal.link, // Click title to go to Best Buy
        color: 5763719, // Green (0x57F287)
        fields: [
            {
                name: "Product",
                value: deal.title,
                inline: false
            },
            {
                name: "Est. Profit",
                value: `**${fmt(deal.valuation.profit)}**`,
                inline: true
            },
            {
                name: "Buy Price",
                value: fmt(deal.price),
                inline: true
            },
            {
                name: "eBay Median",
                value: fmt(deal.valuation.ebayMedianPrice),
                inline: true
            },
            {
                name: "eBay Sales Volume",
                value: `${deal.valuation.ebaySoldItemsCount} sold recently`,
                inline: false
            }
        ],
        footer: {
            text: "Best Buy Arbitrage Bot • Check local availability!"
        },
        timestamp: new Date().toISOString()
    };

    try {
        await axios.post(webhookUrl, {
            embeds: [embed]
        });
        console.log("  [Discord] Notification sent successfully.");
    } catch (error) {
        console.error("  [Discord] Failed to send notification:", error);
    }
}
