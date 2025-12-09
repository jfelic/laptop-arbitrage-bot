# Best Buy Open Box Laptop Deals to eBay Arbitrage Bot

A Node.js bot that scans Best Buy for Open Box laptop deals, valuates them against real sold listings on eBay, and alerts you via Discord if a profitable flip is found.

## Features
- **Scanner**: Polls Best Buy API for Open Box laptops.
- **Valuation**: Scrapes eBay "Sold Listings" (via Apify) to find the true market value.
- **Profit Logic**: Calculates profit minus Tax (8%), eBay Fees (13%), and Shipping (~$20).
- **Notifications**: Sends a Discord alert if profit is above a specified margin
- **Safety**: Rate-limited and random sleeps to mimic human behavior.

## Setup

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Environment Variables**
    Create a `.env` file:
    ```env
    BEST_BUY_API_KEY=your_key_here
    APIFY_API_TOKEN=your_token_here
    DISCORD_WEBHOOK=your_webhook_url_here
    ```

3.  **Run the Bot**
    ```bash
    # Standard run
    npx ts-node bot.ts
    
    # Run and prevent Mac from sleeping (Recommended)
    caffeinate -i npx ts-node bot.ts
    ```

## Files
- `bot.ts`: Main loop and logic.
- `valuation.ts`: eBay scraping logic.
- `notifications.ts`: Discord webhook logic.
- `seen_deals.json`: Database of all scanned deals (prevents duplicates).
- `profitable_flips.json`: Log of all profitable finds.

## Cost Warning
This bot uses the [eBay Scraper Pay-per-result](https://apify.com/ivanvs/ebay-scraper-pay-per-result) actor on Apify. Each valuation costs a small amount of credit. The bot is optimized to only scrape when necessary, but monitor your Apify usage.
