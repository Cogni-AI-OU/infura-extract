#!/usr/bin/env node

const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');
const os = require('os');
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
    console.error('Usage: node mm-extract.js <network> <start-end> or <network> <single-block>');
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
const CACHE_DIR = path.join(os.homedir(), '.cache', 'mm-extract', network);
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

    cacheDir.ready = true;
    debug(`Cache directory ready: ${CACHE_DIR}`);
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
        console.error(`Error fetching latest block number: ${error.message}`);
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

if (start !== null && end !== null && start > end) {
    console.error('Start must be less than or equal to end');
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

    // Check disk cache
    const cacheFile = path.join(CACHE_DIR, `block-${blockNumber}.json`);
    if (cacheDir.ready) {
        if (fs.existsSync(cacheFile)) {
            try {
                debug(`Reading cached data from disk for block ${blockNumber}`);
                const data = fs.readFileSync(cacheFile, 'utf8');
                const block = JSON.parse(data, reviver);
                memCache.set(blockNumber, block);
                return block;
            } catch (error) {
                debug(`Error reading cache file: ${error.message}`);
                // Continue to fetch from network if cache read fails
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
                    try {
                        fs.writeFileSync(
                            cacheFile,
                            JSON.stringify(block, replacer, 2)
                        );
                        debug(`Saved block ${blockNumber} to disk cache`);
                    } catch (writeErr) {
                        debug(`Failed to write to cache: ${writeErr.message}`);
                    }
                }

                return block;
            } else {
                console.error(`Retrieved empty or invalid block ${blockNumber}`);
            }
        } catch (error) {
            console.error(`Error fetching block ${blockNumber} (attempt ${attempts + 1}): ${error.message}`);
            await new Promise(r => setTimeout(r, 1000 * (attempts + 1)));
            attempts++;
        }
    }
    console.error(`Failed to fetch block ${blockNumber} after 3 attempts.`);
    return null;
}

// **Step 6: Main function to process block range and extract addresses**
async function main() {
    // Resolve the "max" keyword if used
    if (start === null || end === null) {
        const latestBlock = await getLatestBlockNumber();
        
        if (start === null) {
            start = latestBlock;
        }
        
        if (end === null) {
            end = latestBlock;
        }
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