"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
// Mock environment if needed, or rely on .env
require("dotenv/config");
(async () => {
    console.log("Running Scanner Locally...");
    // Mock event
    await (0, index_1.handler)({});
})();
