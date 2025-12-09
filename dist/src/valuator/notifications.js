"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDiscordAlert = sendDiscordAlert;
const axios_1 = __importDefault(require("axios"));
require("dotenv/config");
async function sendDiscordAlert(deal) {
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
    const fmt = (n) => `$${n.toFixed(2)}`;
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
        await axios_1.default.post(webhookUrl, {
            embeds: [embed]
        });
        console.log("  [Discord] Notification sent successfully.");
    }
    catch (error) {
        console.error("  [Discord] Failed to send notification:", error);
    }
}
