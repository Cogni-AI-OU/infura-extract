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

// Define chain IDs for networks supported by Covalent
const CHAIN_IDS = {
  ethereum: 1,
  polygon: 137,
  base: 8453,
  blast: 81457,
  optimism: 10,
  arbitrum: 42161,
  palm: 11297108109,
  avalanche: 43114,
  celo: 42220,
  zksync: 324,
  bsc: 56,
  mantle: 5000,
  opbnb: 204,
  scroll: 534352,
  linea: null,
  starknet: null,
  swellchain: null,
  unichain: null,
}

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
const COVALENT_API_KEY = process.env.COVALENT_API_KEY

if (!MM_API_KEY) {
  console.error('MM_API_KEY not set in .env file')
  process.exit(1)
}

if (!COVALENT_API_KEY) {
  console.warn(
    'COVALENT_API_KEY not set. Only native balances will be shown for supported EVM networks.'
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
      // Enhanced error logging
      const errorMessage = error.message || 'Unknown error'
      const errorCode = error.code || 'No code'
      const statusCode = error.statusCode || error.status || 'No status'

      console.error(
        `[ERROR] Error fetching native balance for ${network} (attempt ${attempts + 1}):`
      )
      console.error(`[ERROR] Message: ${errorMessage}`)
      console.error(`[ERROR] Code: ${errorCode}`)
      console.error(`[ERROR] Status: ${statusCode}`)

      // Check for specific error conditions
      if (statusCode === 429 || statusCode === 529) {
        console.error(`[ERROR] Rate limit exceeded for ${network}`)
      }

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

// Function to get balances from Covalent with retry logic
async function getCovalentBalances(chainId, address) {
  debug(
    `Fetching balances from Covalent for address ${address} on chain ${chainId}`
  )
  let attempts = 0
  const url = `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/?key=${COVALENT_API_KEY}`

  while (attempts < 3) {
    try {
      debug(`Sending GET request to Covalent API`)
      const response = await axios.get(url, { timeout: 10000 })
      if (response.status === 200) {
        debug(`Successfully retrieved balances from Covalent`)
        return response.data.data
      } else {
        throw new Error(
          `Covalent API returned status ${response.status}: ${response.statusText}`
        )
      }
    } catch (error) {
      // Enhanced error logging for Covalent
      const errorMessage = error.message || 'Unknown error'
      const statusCode = error.response?.status || 'No status'
      const statusText = error.response?.statusText || ''

      console.error(
        `[ERROR] Error fetching balances from Covalent (attempt ${attempts + 1}):`
      )
      console.error(`[ERROR] Message: ${errorMessage}`)
      console.error(`[ERROR] Status: ${statusCode} ${statusText}`)

      // Check for specific Covalent errors
      if (statusCode === 401) {
        console.error(`[ERROR] Authentication failed - check COVALENT_API_KEY`)
      } else if (statusCode === 429) {
        console.error(`[ERROR] Rate limit exceeded for Covalent API`)
      }

      attempts++
      if (attempts < 3) {
        const delay = 2000 * Math.pow(2, attempts)
        debug(`Retrying in ${delay / 1000} seconds...`)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  console.error(`Failed to fetch balances from Covalent after 3 attempts.`)
  return null
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

    // Get ERC-20 and NFT data if Covalent API key is available
    if (COVALENT_API_KEY && CHAIN_IDS[network]) {
      try {
        const covalentData = await getCovalentBalances(
          CHAIN_IDS[network],
          address
        )
        if (covalentData) {
          let totalUsd = 0
          for (const item of covalentData.items) {
            const balance = item.balance
            const quote = item.quote || 0
            totalUsd += quote
            if (
              item.contract_address ===
              '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
            ) {
              // Native token
              const formattedBalance = formatBalance(
                balance,
                item.contract_decimals
              )
              output.native_balance = {
                wei: balance,
                formatted: formattedBalance,
                usd: quote,
              }
            } else if (
              item.supports_erc &&
              item.supports_erc.includes('erc20')
            ) {
              // ERC-20 token
              const formattedBalance = formatBalance(
                balance,
                item.contract_decimals
              )
              output.erc20_tokens.push({
                contract_address: item.contract_address,
                name: item.contract_name || 'Unknown',
                symbol: item.contract_ticker_symbol || 'Unknown',
                balance: formattedBalance,
                decimals: item.contract_decimals,
                usd: quote,
              })
            } else if (
              item.supports_erc &&
              (item.supports_erc.includes('erc721') ||
                item.supports_erc.includes('erc1155'))
            ) {
              // NFTs
              if (item.nft_data) {
                for (const nft of item.nft_data) {
                  output.nfts.push({
                    contract_address: item.contract_address,
                    name: item.contract_name || 'Unknown',
                    symbol: item.contract_ticker_symbol || 'Unknown',
                    token_id: nft.token_id,
                    balance: nft.token_balance,
                    usd: null,
                  })
                }
              }
            }
          }
          output.total_usd = totalUsd
        }
      } catch (error) {
        console.error(
          `Error getting Covalent data for ${network}: ${error.message}`
        )
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
    // Enhanced main error handling
    const errorMessage = error.message || 'Unknown error'
    const errorStack = error.stack || 'No stack trace'

    console.error(`[ERROR] Unexpected error: ${errorMessage}`)
    console.error(`[ERROR] Stack: ${errorStack}`)
    process.exit(1)
  }
}

// Execute the main function
main()
