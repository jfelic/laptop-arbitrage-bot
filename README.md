# Serverless Laptop Arbitrage Platform

An event-driven serverless platform that detects profitable laptop arbitrage opportunities by scanning retailer open-box laptop inventories (Best Buy) and valuating them against secondary market sales data (eBay).

## Architecture
The system uses a **Fan-Out** architecture on AWS to decouple high-volume ingestion from valuation processing.

- **Scanner Service (Producer)**: AWS Lambda
    - Triggered every 4 hours via EventBridge.
    - Scans Best Buy Open-Box API for laptops.
    - Filters for valid deals and pushes JSON payloads to SQS.
- **Valuator Service (Consumer)**: AWS Lambda
    - Triggered by SQS events.
    - Checks DynamoDB for idempotency (have we seen this deal?).
    - Valuates items using eBay Sold Listings (via Apify).
    - Sends Discord alerts for profitable finds.
- **Infrastructure**: Managed via Terraform (IaC).
- **Deployment**: Automated via GitHub Actions.

## Setup & Deployment

### 1. Prerequisites
- **AWS Account** (Access Key & Secret Key)
- **GitHub Repository**
- **Apify Account**
- **Best Buy Developer Key**

### 2. Secrets Configuration
Add the following secrets to your GitHub Repository (Settings -> Secrets -> Actions):

| Secret Name | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | AWS IAM User Access Key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM User Secret Key |
| `BEST_BUY_API_KEY` | Best Buy API Key |
| `APIFY_API_TOKEN` | Apify API Token |
| `DISCORD_WEBHOOK` | Discord Webhook URL for alerts |

### 3. Deploy
Simply push to the `main` branch. The GitHub Action will:
1. Build the Docker images.
2. Push them to Amazon ECR.
3. Run `terraform apply` to provision/update AWS resources.
4. Update the Lambda functions.

## Local Development

### Running Locally
You can test the logic locally without deploying to AWS.

```bash
# Install dependencies
npm install

# Test Scanner (Mocks SQS sending)
npx ts-node src/scanner/local-test.ts

# Test Valuator (Mocks receiving event)
npx ts-node src/valuator/local-test.ts
```

### Project Structure
- `/src/scanner`: Ingestion logic (Producer).
- `/src/valuator`: Valuation and Notification logic (Consumer).
- `/terraform`: Infrastructure as Code definitions.
- `/.github/workflows`: CI/CD Pipeline.



## ⚠️ Cost Disclaimer
This bot uses the **eBay Scraper Pay-per-result** actor on Apify for valuation.
*   **Cost:** Each unique item valuation incurs a small fee on your Apify account.
*   **Optimization:** The bot checks DynamoDB first to avoid re-valuating known items, but high volumes of new deals can still consume credits.
*   **Monitor Usage:** We recommend monitoring your Apify usage dashboard to avoid unexpected costs.
