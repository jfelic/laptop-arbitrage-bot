"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
require("dotenv/config");
(async () => {
    console.log("Running Valuator Locally...");
    // Mock SQS Event
    const mockEvent = {
        Records: [
            {
                body: JSON.stringify({
                    id: "TEST-SKU-123",
                    sku: "SKU123",
                    title: "Test Laptop",
                    condition: "excellent",
                    price: 500,
                    regularPrice: 1000,
                    link: "http://example.com"
                })
            }
        ]
    };
    // Note: This will attempt to connect to real DynamoDB if creds are present.
    // If table doesn't exist, it will crash.
    // For this test, we expect it might fail on DDB or work if we mocking it.
    // We haven't created the table yet (Terraform step).
    // So this test is just to verify code logic/imports, it will likely fail on `ddb.send`.
    try {
        await (0, index_1.handler)(mockEvent);
    }
    catch (e) {
        console.log("Execution finished (expected error if infra missing):", e.message);
    }
})();
