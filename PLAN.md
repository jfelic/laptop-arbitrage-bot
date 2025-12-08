# Project: Serverless Retail Arbitrage Platform
## From Local Script to Event-Driven Cloud Architecture

### Overview
This project is structured to bridge the gap between **Software Engineering** (writing code) and **Platform Engineering** (architecting infrastructure).
1.  **Phase 1 (The MVP):** Build a functional "Software Engineer" grade script to validate the business logic (Best Buy -> eBay).
2.  **Phase 2 (The Platform):** Refactor the working code into a "Platform Engineer" grade system using the **Fan-Out Pattern**, **IaC**, and **CI/CD**.

---

# Phase 1: The MVP (Software Engineer Mode)
**Goal:** A stable Node.js script running locally that detects profitable laptop flips using structured data.
**Timeline:** Weekend 1

### 1. Architecture (Monolithic)
* **Runtime:** Local Node.js Process.
* **Ingestion:** Best Buy Official API (Nationwide Open-Box endpoint).
* **Valuation:** Apify (`dtrungtin/ebay-items-scraper` - Sold Listings).
* **Notification:** Discord Webhook.
* **State:** None (Stateless run) or simple `seen_ids.json`.

### 2. Implementation Steps

#### Step 1: Environment Setup
* Initialize Node.js/TypeScript project.
* Install dependencies: `axios`, `apify-client`, `dotenv`, `ts-node`.
* **Credentials:**
    * Best Buy API Key (Developer Portal).
    * Apify API Token (Free Tier).
    * Discord Webhook URL.

#### Step 2: The Logic Pipeline (`bot.ts`)
* **Ingest:** Fetch `https://api.bestbuy.com/beta/products/openBox...`
    * Filter: `Category = Laptops`, `Condition = Excellent`, `Shipping = Available`.
* **Normalize:** Extract `Model Number` or `UPC` from the Best Buy JSON.
* **Valuate:**
    * Pass the *exact* Model Number to Apify (eBay Sold).
    * Calculate Median Sold Price.
* **Profit Math:** `Net = eBay Median - (Buy Price + Tax + Shipping + Fees)`.
* **Alert:** If `Net > $150` -> Post to Discord.

### 3. Exit Criteria
* [ ] Script runs successfully via `npx ts-node bot.ts`.
* [ ] Successfully matches a Best Buy SKU to an eBay Sold price.
* [ ] Discord receives a rich embed alert.
* [ ] **Validation:** You verify the math is accurate on at least one real item.

---

# Phase 2: The Platform (Platform Engineer Mode)
**Goal:** Transform the script into a portfolio-worthy, event-driven distributed system on AWS.
**Timeline:** Weekend 2-3

### 1. Architecture (Event-Driven Microservices)
We will use the **Fan-Out Pattern** to decouple ingestion from processing.
* **Scheduler:** Amazon EventBridge (Cron).
* **Ingestion Service:** AWS Lambda (Producer) -> Pushes jobs to Queue.
* **Buffering:** Amazon SQS (Simple Queue Service).
* **Valuation Service:** AWS Lambda (Consumer) -> Triggers on Queue Message.
* **State:** Amazon DynamoDB (Idempotency check).
* **Infrastructure:** Terraform (IaC).
* **CI/CD:** GitHub Actions.

### 2. Implementation Steps

#### Step 1: Containerization
* **Refactor:** Split `bot.ts` into `scanner.ts` (Producer) and `valuator.ts` (Consumer).
* **Docker:** Create a multi-stage `Dockerfile`.
    * Use `node:18-alpine` for minimal footprint.
    * Implement multi-stage build to strip TypeScript compiler from production image.

#### Step 2: Infrastructure as Code (Terraform)
* **State Management:** Define `dynamodb.tf` (Table: `arbitrage-state`, PK: `sku`).
* **Messaging:** Define `sqs.tf` (Queue: `arbitrage-jobs`, VisibilityTimeout: 60s).
* **Compute:** Define `lambda.tf` (Two functions, IAM Roles with least privilege).
* **Registry:** Define `ecr.tf` (Repo to store Docker images).
* **Goal:** `terraform apply` builds the entire cloud environment.

#### Step 3: CI/CD Pipeline (GitHub Actions)
* Create `.github/workflows/deploy.yml`.
* **Workflow:**
    1.  **Lint/Test:** Static analysis of TypeScript.
    2.  **Build:** Build Docker Image & Push to AWS ECR.
    3.  **Deploy:** Run `terraform apply` (or update Lambda image URI) automatically on push to `main`.

#### Step 4: Observability (CloudWatch)
* **Metrics:** Create a Custom Metric for "Profitable Finds."
* **Alarms:** Set a CloudWatch Alarm if `SQS Dead Letter Queue > 0` (Alerts you if the bot crashes).
* **Dashboards:** Create a simple view of "Scrapes vs. Alerts."

### 3. Final Portfolio Deliverables
* **GitHub Repo:** Clean structure (`/src`, `/terraform`, `/.github`).
* **Architecture Diagram:** Visualizing the SQS/Lambda flow.
* **Resume Bullet Points:**
    * *"Architected a serverless event-driven platform on AWS using **Lambda** and **SQS** to decouple high-volume retail data ingestion."*
    * *"Implemented **Infrastructure as Code** using **Terraform** to manage stateful resources (DynamoDB) and compute."*
    * *"Designed a **CI/CD pipeline** with **GitHub Actions** for automated container builds and zero-downtime deployments."*