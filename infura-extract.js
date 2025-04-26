#!/usr/bin/env node

const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
require('dotenv').config(); // Load environment variables from .env file

// Debug function that writes to stderr
function debug(message) {
    console.error(`[DEBUG] ${message}`);
}

// Define supported networks and their endpoints
const NETWORKS = {
    ethereum: 'https://mainnet.infura.io/v3/',
    linea: 'https://linea-mainnet.infura.io/v3/',
    polygon: 'https://polygon-mainnet.infura.io/v3/',
    base: 'https://base-mainnet.infura.io/v3/',
    blast: 'https://blast-mainnet.infura.io/v3/',
    optimism: 'https://optimism-mainnet.infura.io/v3/',
    arbitrum: 'https://arbitrum-mainnet.infura.io/v3/',
    palm: 'https://palm-mainnet.infura.io/v3/',
    avalanche: 'https://avalanche-mainnet.infura.io/v3/',
    starknet: 'https://starknet-mainnet.infura.io/v3/',
    celo: 'https://celo-mainnet.infura.io/v3/',
    zksync: 'https://zksync-mainnet.infura.io/v3/',
    bsc: 'https://bsc-mainnet.infura.io/v3/',
    mantle: 'https://mantle-mainnet.infura.io/v3/',
    opbnb: 'https://opbnb-mainnet.infura.io/v3/',
    scroll: 'https://scroll-mainnet.infura.io/v3/',
    swellchain: 'https://swellchain-mainnet.infura.io/v3/',
    unichain: 'https://unichain-mainnet.infura.io/v3/',
};

// Handle BigInt serialization
const cacheDir = {
    ready: false
};

// **Step 1: Parse command-line arguments for network and block range**
const argv = process.argv;
if (argv.length != 4) {
    console.error('Usage: node infura-extract.js <network> <start-end> or <network> <single-block>');
    console.error('Supported networks: ' + Object.keys(NETWORKS).join(', '));
    process.exit(1);
}

const network = argv[2].toLowerCase();
const range = argv[3];

// Validate network
if (!NETWORKS[network]) {
    console.error(`Unsupported network: ${network}`);
    console.error('Supported networks: ' + Object.keys(NETWORKS).join(', '));
    process.exit(1);
}

// Set up chain-specific cache directory
const baseCacheDir = process.env.MM_CACHE_DIR || path.join(os.homedir(), '.cache', 'infura-extract');
const CACHE_DIR = path.join(baseCacheDir, network);

// Display cache location info
debug(`Using cache directory base: ${baseCacheDir}${process.env.MM_CACHE_DIR ? ' (from MM_CACHE_DIR)' : ' (default)'}`);

try {
    if (!fs.existsSync(CACHE_DIR)) {
        debug(`Creating cache directory: ${CACHE_DIR}`);
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    // Validate the directory was created and is writable
    if (!fs.existsSync(CACHE_DIR)) {
        throw new Error(`Failed to create cache directory: ${CACHE_DIR}`);
    }

    // Test write permissions
    const testFile = path.join(CACHE_DIR, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);

    // Test if zstd is available
    try {
        execSync('zstd --version', { stdio: 'ignore' });
        cacheDir.ready = true;
        cacheDir.zstdAvailable = true;
        debug(`Cache directory ready: ${CACHE_DIR} (with zstd compression)`);
    } catch (error) {
        cacheDir.ready = true;
        cacheDir.zstdAvailable = false;
        debug(`Cache directory ready: ${CACHE_DIR} (without zstd compression)`);
    }
} catch (error) {
    console.error(`Cache directory setup failed: ${error.message}`);
    console.error(`Will continue without disk caching`);
}

// Custom serializer to handle BigInt values
function replacer(key, value) {
    // Convert BigInt to string with a marker
    if (typeof value === 'bigint') {
        return {
            type: 'BigInt',
            value: value.toString()
        };
    }
    return value;
}

// Custom parser to restore BigInt values
function reviver(key, value) {
    // Check if value is an object with our BigInt marker
    if (value && typeof value === 'object' && value.type === 'BigInt') {
        return BigInt(value.value);
    }
    return value;
}

// **Step 2: Load API key from .env file**
const MM_API_KEY = process.env.MM_API_KEY;
if (!MM_API_KEY) {
    console.error('MM_API_KEY not set in .env file');
    process.exit(1);
}

// **Step 3: Set up Web3 provider with network-specific Infura endpoint**
const endpoint = NETWORKS[network] + MM_API_KEY;
const web3 = new Web3(endpoint);
debug(`Connected to ${network} endpoint: ${NETWORKS[network]}${MM_API_KEY.substring(0, 3)}...`);

// Helper function to get the latest block number
async function getLatestBlockNumber() {
    try {
        const blockNumber = await web3.eth.getBlockNumber();
        debug(`Latest block number for ${network}: ${blockNumber}`);
        return blockNumber;
    } catch (error) {
        console.error(`Error fetching latest block number: ${error.message || 'Unknown error'}`);
        console.error('Full error details:', error);
        process.exit(1);
    }
}

// Parse block range, handling "max" keyword for the end block
let start = null, end = null;

if (range.includes('-')) {
    // Range format
    const [startStr, endStr] = range.split('-');
    if (!startStr || !endStr) {
        console.error('Invalid range format');
        process.exit(1);
    }

    start = parseInt(startStr);

    if (endStr.toLowerCase() === 'max') {
        debug('Using maximum block number for end of range');
        // We'll set this in the async main function
        end = null;
    } else {
        end = parseInt(endStr);

        // Validate that start is not greater than end
        if (!isNaN(start) && !isNaN(end) && start > end) {
            console.error(`Invalid range: start (${start}) must be less than or equal to end (${end})`);
            process.exit(1);
        }
    }
} else {
    // Single block format
    if (range.toLowerCase() === 'max') {
        debug('Using maximum block number');
        // We'll set this in the async main function
        start = null;
        end = null;
    } else {
        start = parseInt(range);
        end = start;
    }
}

if ((start !== null && Number.isNaN(start)) || (end !== null && Number.isNaN(end))) {
    console.error('Block numbers must be integers or "max"');
    process.exit(1);
}

// **Step 4: Implement caching for block data**
const memCache = new Map();

// **Step 5: Function to fetch block data with retry logic**
async function getBlock(blockNumber) {
    // Check in-memory cache first
    if (memCache.has(blockNumber)) {
        debug(`Using in-memory cached data for block ${blockNumber}`);
        return memCache.get(blockNumber);
    }

    // Get sharded directory path based on block number (by millions)
    const getShardedPath = (blockNum) => {
        // Determine shard number - blocks <1M go to shard 0, 1M-2M to shard 1, etc.
        const shardNumber = Math.floor(blockNum / 1000000);
        const shardDir = path.join(CACHE_DIR, shardNumber.toString());

        // Ensure the directory exists
        if (!fs.existsSync(shardDir)) {
            try {
                fs.mkdirSync(shardDir, { recursive: true });
            } catch (err) {
                debug(`Error creating shard directory ${shardDir}: ${err.message}`);
                // Continue anyway, the write will fail later if necessary
            }
        }

        return {
            compressed: path.join(shardDir, `block-${blockNum}.json.zst`),
            legacy: path.join(shardDir, `block-${blockNum}.json`)
        };
    };

    // Get file paths for this block
    const { compressed: compressedCacheFile, legacy: legacyCacheFile } = getShardedPath(blockNumber);

    if (cacheDir.ready) {
        // Try compressed cache first (if zstd is available)
        if (cacheDir.zstdAvailable && fs.existsSync(compressedCacheFile)) {
            try {
                debug(`Reading compressed cached data from disk for block ${blockNumber}`);
                const compressedData = fs.readFileSync(compressedCacheFile);

                // Use execSync to decompress the data
                const decompressed = execSync('zstd -d --stdout', {
                    input: compressedData
                }).toString('utf8');

                const block = JSON.parse(decompressed, reviver);
                memCache.set(blockNumber, block);
                return block;
            } catch (error) {
                debug(`Error reading compressed cache file: ${error.message}`);
                // Try legacy cache or continue to network request
            }
        }

        // Try legacy uncompressed cache
        if (fs.existsSync(legacyCacheFile)) {
            try {
                debug(`Reading legacy cached data from disk for block ${blockNumber}`);
                const data = fs.readFileSync(legacyCacheFile, 'utf8');
                const block = JSON.parse(data, reviver);
                memCache.set(blockNumber, block);
                return block;
            } catch (error) {
                debug(`Error reading legacy cache file: ${error.message}`);
                // Continue to network request
            }
        }
    }

    debug(`Fetching block ${blockNumber} from ${network}`);
    let attempts = 0;
    while (attempts < 3) {
        try {
            debug(`Sending query: eth_getBlockByNumber(${blockNumber}, true)`);
            const block = await web3.eth.getBlock(blockNumber, true);

            if (block && block.transactions) {
                debug(`Successfully retrieved block ${blockNumber} with ${block.transactions.length} transactions`);

                // Save to memory cache
                memCache.set(blockNumber, block);

                // Save to disk cache
                if (cacheDir.ready) {
                    const jsonData = JSON.stringify(block, replacer);
                    // Get sharded paths again to ensure we're using the correct paths
                    const { compressed: compressedCacheFile, legacy: legacyCacheFile } = getShardedPath(blockNumber);

                    if (cacheDir.zstdAvailable) {
                        try {
                            // Compress with zstd using execSync
                            const compressed = execSync('zstd -3 --stdout', {
                                input: jsonData
                            });

                            fs.writeFileSync(compressedCacheFile, compressed);
                            debug(`Saved and compressed block ${blockNumber} to disk cache`);
                        } catch (writeErr) {
                            debug(`Failed to write compressed cache: ${writeErr.message}`);
                            // Fallback to uncompressed
                            try {
                                fs.writeFileSync(legacyCacheFile, jsonData);
                                debug(`Saved block ${blockNumber} to uncompressed disk cache`);
                            } catch (fallbackErr) {
                                debug(`Failed to write cache: ${fallbackErr.message}`);
                            }
                        }
                    } else {
                        // No zstd available, just save uncompressed
                        try {
                            fs.writeFileSync(legacyCacheFile, jsonData);
                            debug(`Saved block ${blockNumber} to uncompressed disk cache`);
                        } catch (err) {
                            debug(`Failed to write cache: ${err.message}`);
                        }
                    }
                }

                return block;
            } else {
                console.error(`[ERROR] Retrieved empty or invalid block ${blockNumber} (attempt ${attempts + 1})`);

                // If block doesn't exist (null or empty response), increment attempts and apply backoff
                attempts++;
                const delay = Math.min(30000, 1000 * Math.pow(2, attempts));
                debug(`Retrying in ${delay / 1000} seconds...`);
                await new Promise(r => setTimeout(r, delay));
            }
        } catch (error) {
            // Print full error information for better debugging
            console.error(`[ERROR] Error fetching block ${blockNumber} (attempt ${attempts + 1}):`);
            console.error(`[ERROR] Error: ${JSON.stringify(error.toJSON ? error.toJSON() : error, null, 2)}`);

            // Check for rate limiting errors (429 or 529 status codes)
            if (error.statusCode === 429 || error.statusCode === 529) {
                console.error(`[ERROR] Error message: Too Many Requests - Rate limit exceeded for ${network}`);

                // Implement a longer backoff for rate limit errors
                const rateLimitDelay = Math.min(60000, 5000 * Math.pow(2, attempts));
                debug(`Rate limited. Waiting ${rateLimitDelay / 1000} seconds before retrying...`);
                await new Promise(r => setTimeout(r, rateLimitDelay));
            }
            // Log full error stack trace for debugging
            console.error(`[ERROR] Stack trace: ${error.stack}`);

            // Handle Non-JSON responses more specifically
            if (error.message.includes('Unexpected token') ||
                error.message.includes('invalid json response')) {
                console.error(`Warning: The RPC endpoint for ${network} returned a non-JSON response.`);
                console.error('This often happens when the block doesn\'t exist or the network is experiencing issues.');

                // Try to extract the raw HTML response
                if (error.message.includes('at position 0')) {
                    try {
                        const rawResponse = error.message.split('reason: ')[1];
                        console.error('Raw non-JSON response:');
                        console.error(rawResponse);
                    } catch (e) {
                        // Unable to extract raw response
                    }
                }
            }

            // Implement exponential backoff with longer delays
            const delay = Math.min(30000, 1000 * Math.pow(2, attempts));
            debug(`Retrying in ${delay / 1000} seconds...`);
            await new Promise(r => setTimeout(r, delay));
            attempts++;
        }
    }

    // After 3 attempts of retrieving an empty block, give up and return null
    console.error(`Failed to fetch valid block ${blockNumber} after 3 attempts.`);
    return null;
}

// **Step 6: Main function to process block range and extract addresses**
async function main() {
    // Resolve the "max" keyword if used
    const latestBlock = await getLatestBlockNumber();
    if (start === null || end === null) {
        if (start === null) {
            start = latestBlock;
        }

        if (end === null) {
            end = latestBlock;
        }
    }

    // Ensure start range does not exceed the latest block
    if (start > latestBlock) {
        console.warn(`[WARNING] Start block (${end}) exceeds the latest block (${latestBlock}). Adjusting start block to ${latestBlock}.`);
        start = latestBlock;
    }

    // Ensure end range does not exceed the latest block
    if (end > latestBlock) {
        console.warn(`[WARNING] End block (${end}) exceeds the latest block (${latestBlock}). Adjusting end block to ${latestBlock}.`);
        end = latestBlock;
    }

    // Ensure start and end are the same type (convert to regular numbers)
    start = Number(start);
    end = Number(end);

    debug(`Processing ${network} blocks from ${start} to ${end}`);
    let addressCount = 0;

    for (let i = start; i <= end; i++) {
        debug(`Processing block ${i} (${i - start + 1}/${end - start + 1})`);
        const block = await getBlock(i);
        if (!block) continue;

        if (block.transactions) {
            for (const tx of block.transactions) {
                console.log(tx.from);
                addressCount++;
                if (tx.to) {
                    console.log(tx.to);
                    addressCount++;
                }
            }
        }
    }

    debug(`Completed processing. Extracted ${addressCount} addresses from ${network}.`);
}

// **Step 7: Execute the main function**
main();
