#!/usr/bin/env node

const { Web3 } = require('web3')
const axios = require('axios')
require('dotenv').config()

// Debug function that writes to stderr
function debug(message) {
  console.error(`[DEBUG] ${message}`)
}

// Define supported networks and their Infura endpoints
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
  celo: 'https://celo-mainnet.infura.io/v3/',
  zksync: 'https://zksync-mainnet.infura.io/v3/',
  bsc: 'https://bsc-mainnet.infura.io/v3/',
  mantle: 'https://mantle-mainnet.infura.io/v3/',
  opbnb: 'https://opbnb-mainnet.infura.io/v3/',
  scroll: 'https://scroll-mainnet.infura.io/v3/',
}

// Unsupported or non-EVM networks
const UNSUPPORTED_NETWORKS = ['starknet', 'swellchain', 'unichain']

// Parse command-line arguments
const argv = process.argv

if (argv.includes('-h') || argv.includes('--help')) {
  console.log(`Usage: node infura-balance.js <address>`)
  process.exit(0)
}

if (argv.length < 3) {
  console.error('Usage: node infura-balance.js <address>')
  process.exit(1)
}

const address = argv[2]

// Load API keys from .env file
const MM_API_KEY = process.env.MM_API_KEY
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY // Optional for Ethereum token data

if (!MM_API_KEY) {
  console.error('MM_API_KEY not set in .env file')
  process.exit(1)
}

if (!ETHERSCAN_API_KEY) {
  console.warn(
    'ETHERSCAN_API_KEY not set. Token data for Ethereum will be skipped.'
  )
}

// Function to get native balance with retry logic and timeout
async function getNativeBalance(address, web3, network) {
  debug(`Fetching native balance for address ${address} on ${network}`)
  let attempts = 0
  const timeoutMs = 10000

  while (attempts < 3) {
    try {
      const balancePromise = web3.eth.getBalance(address, 'latest')
      const balance = await Promise.race([
        balancePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
        ),
      ])
      debug(
        `Successfully retrieved native balance for address ${address} on ${network}`
      )
      return balance
    } catch (error) {
      console.error(
        `[ERROR] Error fetching native balance for ${network} (attempt ${attempts + 1}): ${error.message}`
      )
      attempts++
      if (attempts < 3) {
        const delay = 2000 * Math.pow(2, attempts)
        debug(`Retrying in ${delay / 1000} seconds...`)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  console.error(
    `Failed to fetch native balance for ${network} after 3 attempts.`
  )
  return null
}

// Function to get ERC-20 token balances for Ethereum using Etherscan API
async function getEthereumTokenBalances(address) {
  if (!ETHERSCAN_API_KEY) {
    console.warn(
      'ETHERSCAN_API_KEY not set. Skipping token balances for Ethereum.'
    )
    return []
  }
  const url = `https://api.etherscan.io/api?module=account&action=tokenbalance&address=${address}&apikey=${ETHERSCAN_API_KEY}`
  try {
    const response = await axios.get(url)
    if (response.data.status === '1') {
      return response.data.result.map((token) => ({
        contract_address: token.contractAddress,
        name: token.tokenName,
        symbol: token.tokenSymbol,
        balance: formatBalance(token.balance, token.tokenDecimal),
        decimals: token.tokenDecimal,
        usd: null, // Etherscan doesn't provide USD value
      }))
    } else {
      console.error(`Etherscan API error: ${response.data.message}`)
      return []
    }
  } catch (error) {
    console.error(
      `Error fetching token balances from Etherscan: ${error.message}`
    )
    return []
  }
}

// Function to format balance based on decimals
function formatBalance(balanceWei, decimals = 18) {
  const balanceStr = balanceWei.toString()
  if (balanceStr === '0') return '0.0'
  let padded = balanceStr.padStart(decimals + 1, '0')
  const integerPart = padded.slice(0, padded.length - decimals)
  let fractionalPart = padded.slice(padded.length - decimals).replace(/0+$/, '')
  return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart
}

// Function to process a batch of networks
async function processNetworkBatch(networks) {
  const results = []
  for (const network of networks) {
    let output = {
      network,
      native_balance: null,
      erc20_tokens: [],
      nfts: [],
      total_usd: 0,
    }

    // Set up Web3 provider
    const endpoint = NETWORKS[network] + MM_API_KEY
    const web3 = new Web3(endpoint)
    debug(`Initialized Web3 provider for ${network}: ${NETWORKS[network]}`)

    // Get native balance
    try {
      const balance = await getNativeBalance(address, web3, network)
      if (balance !== null && balance !== BigInt(0)) {
        const formattedBalance = formatBalance(balance, 18)
        output.native_balance = {
          wei: balance.toString(),
          formatted: formattedBalance,
          usd: null,
        }
      }
    } catch (error) {
      console.error(
        `Error getting native balance for ${network}: ${error.message}`
      )
    }

    // Get ERC-20 token data for Ethereum using Etherscan
    if (network === 'ethereum' && ETHERSCAN_API_KEY) {
      try {
        const tokens = await getEthereumTokenBalances(address)
        output.erc20_tokens = tokens
      } catch (error) {
        console.error(`Error getting token data for Ethereum: ${error.message}`)
      }
    }

    results.push(output)
  }
  return results
}

// Main function to get and display balances across all networks
async function main() {
  try {
    if (!Web3.utils.isAddress(address)) {
      console.error(`Invalid address: ${address}`)
      process.exit(1)
    }

    const networkList = Object.keys(NETWORKS)
    const batchSize = 5
    const results = []

    for (let i = 0; i < networkList.length; i += batchSize) {
      const batch = networkList.slice(i, i + batchSize)
      debug(`Processing batch: ${batch.join(', ')}`)
      const batchResults = await processNetworkBatch(batch)
      results.push(...batchResults)

      if (i + batchSize < networkList.length) {
        debug('Waiting 2 seconds before next batch...')
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    const filteredResults = results.filter((result) => {
      const hasNative =
        result.native_balance && parseFloat(result.native_balance.formatted) > 0
      const hasErc20 = result.erc20_tokens.length > 0
      const hasNfts = result.nfts.length > 0
      return hasNative || hasErc20 || hasNfts
    })

    const grandTotalUsd = filteredResults.reduce(
      (sum, result) => sum + (result.total_usd || 0),
      0
    )

    console.log(
      JSON.stringify(
        {
          address,
          networks: filteredResults,
          estimated_total_usd: grandTotalUsd,
        },
        null,
        2
      )
    )
    console.log(
      'Note: The estimated total USD value is based on available data and may not include all assets.'
    )
  } catch (error) {
    console.error(`Unexpected error: ${error.message}`)
    process.exit(1)
  }
}

// Execute the main function
main()
