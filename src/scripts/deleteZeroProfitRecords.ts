// src/scripts/deleteZeroProfitRecords.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  ScanCommandInput,
  ScanCommandOutput,
  BatchWriteCommand,
  BatchWriteCommandInput
} from '@aws-sdk/lib-dynamodb';

// Configuration
const TABLE_NAME = process.env.TABLE_NAME || 'arbitrage-deals';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Interface for arbitrage-deals table items
 */
interface ArbitrageDeal {
  id: string;              // Primary key
  condition: string;
  foundAt: string;
  link: string;
  price: number;
  profit: number;          // The field we're filtering on
  regularPrice: number;
  sku: string;
  [key: string]: any;      // For any additional fields
}

/**
 * Deletes all records from arbitrage-deals table where profit equals 0
 * @returns {Promise<number>} - Number of items deleted
 */
async function deleteRecordsWithZeroProfit(): Promise<number> {
  console.log('Starting scan for records with profit=0 in arbitrage-deals table...');
  
  let items: ArbitrageDeal[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;
  let scanCount = 0;
  
  // Scan the table to find all items with profit=0
  do {
    scanCount++;
    const scanParams: ScanCommandInput = {
      TableName: TABLE_NAME,
      FilterExpression: 'profit = :val',
      ExpressionAttributeValues: {
        ':val': 0
      }
    };
    
    // Add pagination key if it exists
    if (lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = lastEvaluatedKey;
    }
    
    try {
      console.log(`Executing scan ${scanCount}...`);
      const response: ScanCommandOutput = await docClient.send(new ScanCommand(scanParams));
      const scannedItems = (response.Items || []) as ArbitrageDeal[];
      items = items.concat(scannedItems);
      lastEvaluatedKey = response.LastEvaluatedKey;
      
      console.log(`Found ${scannedItems.length} items in scan ${scanCount}. Total so far: ${items.length}`);
      console.log(`Items scanned: ${response.ScannedCount}, RCUs consumed: ~${Math.ceil((response.ScannedCount || 0) / 2)}`);
    } catch (error) {
      console.error('Error scanning table:', error);
      throw error;
    }
    
  } while (lastEvaluatedKey);
  
  console.log(`\n✓ Scan complete!`);
  console.log(`Total items found with profit=0: ${items.length}`);
  
  if (items.length === 0) {
    console.log('No records found with profit=0');
    return 0;
  }
  
  // Show sample of items to be deleted
  console.log('\nSample of items to be deleted:');
  items.slice(0, 5).forEach(item => {
    console.log(`  - ID: ${item.id}, SKU: ${item.sku}, Price: ${item.price}, Profit: ${item.profit}`);
  });
  if (items.length > 5) {
    console.log(`  ... and ${items.length - 5} more items`);
  }
  
  // Delete items in batches
  console.log('\nStarting deletion process...');
  const deletedCount = await batchDeleteItems(items);
  console.log(`\n✓ Deletion complete! Deleted ${deletedCount} items.`);
  
  return deletedCount;
}

/**
 * Deletes items in batches of 25 (DynamoDB limit)
 * @param {ArbitrageDeal[]} items - Array of items to delete
 * @returns {Promise<number>} - Count of deleted items
 */
async function batchDeleteItems(items: ArbitrageDeal[]): Promise<number> {
  const BATCH_SIZE = 25; // DynamoDB BatchWriteItem limit
  let deletedCount = 0;
  const totalBatches = Math.ceil(items.length / BATCH_SIZE);
  
  // Process items in batches
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
    
    // Create delete requests for this batch
    // Using 'id' as the partition key (primary key)
    const deleteRequests = batch.map(item => ({
      DeleteRequest: {
        Key: {
          id: item.id  // Primary key for arbitrage-deals table
        }
      }
    }));
    
    const batchParams: BatchWriteCommandInput = {
      RequestItems: {
        [TABLE_NAME]: deleteRequests
      }
    };
    
    try {
      console.log(`Deleting batch ${currentBatch}/${totalBatches} (${batch.length} items)...`);
      await docClient.send(new BatchWriteCommand(batchParams));
      deletedCount += batch.length;
      
      // Show detailed progress
      const percentComplete = Math.round((deletedCount / items.length) * 100);
      console.log(`  ✓ Progress: ${deletedCount}/${items.length} items deleted (${percentComplete}%)`);
      
      // Add a small delay to avoid throttling (optional but recommended)
      if (i + BATCH_SIZE < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`  ✗ Error deleting batch ${currentBatch}:`, error);
      // Continue with next batch instead of failing completely
    }
  }
  
  return deletedCount;
}

/**
 * Dry run mode - shows what would be deleted without actually deleting
 * @returns {Promise<void>}
 */
async function dryRun(): Promise<void> {
  console.log('=== DRY RUN MODE ===');
  console.log('This will show what would be deleted WITHOUT actually deleting anything\n');
  
  let items: ArbitrageDeal[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;
  
  // Scan the table
  do {
    const scanParams: ScanCommandInput = {
      TableName: TABLE_NAME,
      FilterExpression: 'profit = :val',
      ExpressionAttributeValues: {
        ':val': 0
      }
    };
    
    if (lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = lastEvaluatedKey;
    }
    
    const response: ScanCommandOutput = await docClient.send(new ScanCommand(scanParams));
    const scannedItems = (response.Items || []) as ArbitrageDeal[];
    items = items.concat(scannedItems);
    lastEvaluatedKey = response.LastEvaluatedKey;
    
  } while (lastEvaluatedKey);
  
  console.log(`\nFound ${items.length} items with profit=0`);
  
  if (items.length > 0) {
    console.log('\nItems that would be deleted:');
    items.forEach((item, index) => {
      console.log(`${index + 1}. ID: ${item.id}, SKU: ${item.sku}, Price: $${item.price}, Condition: ${item.condition}`);
    });
  }
  
  console.log('\n=== DRY RUN COMPLETE ===');
  console.log('No items were actually deleted. Remove DRY_RUN=true to perform actual deletion.');
}

// Main execution
const isDryRun = process.env.DRY_RUN === 'true';

if (isDryRun) {
  console.log('Running in DRY RUN mode...\n');
  dryRun()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Dry run failed:', error);
      process.exit(1);
    });
} else {
  console.log('Running in ACTUAL DELETION mode...\n');
  console.log('⚠️  WARNING: This will permanently delete records with profit=0');
  console.log('⚠️  Press Ctrl+C within 5 seconds to cancel...\n');
  
  // Give user 5 seconds to cancel
  setTimeout(() => {
    deleteRecordsWithZeroProfit()
      .then(count => {
        console.log(`\n✓ Successfully deleted ${count} records from arbitrage-deals table`);
        process.exit(0);
      })
      .catch(error => {
        console.error('Failed to delete records:', error);
        process.exit(1);
      });
  }, 5000);
}