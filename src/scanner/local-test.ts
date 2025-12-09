import { handler } from './index';
// Mock environment if needed, or rely on .env
import 'dotenv/config';

(async () => {
    console.log("Running Scanner Locally...");
    // Mock event
    await handler({});
})();
