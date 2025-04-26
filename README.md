# Infura blocks extract

A command-line utility to extract Ethereum and other blockchain addresses from transaction data across multiple blocks.

## Features

- Extract wallet addresses from transactions across multiple blockchain networks
- Support for single block or range extraction
- Persistent caching system to reduce API calls
- Automatic handling of BigInt values in JSON responses
- Support for the latest block using the "max" keyword
- Error handling and retry logic for API calls

## Supported Networks

- Ethereum
- Base
- Polygon
- Arbitrum
- Optimism
- Linea
- and many more...

## Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd infura-extract
npm install
npm link
```

## Configuration

Create a `.env` file in the project root with your Infura API key:

```console
MM_API_KEY=your_infura_api_key_here
```

## Usage

```console
node infura-extract.js <network> <block-range>
```

Or:

```console
npx infura-extract
```

On Linux, you can also use the following shell wrapper script:

```console
./infura-extract.sh
```

or call the file directly by:

```console
./infura-extract.js
```

If you've linked the package locally via `npm link`, you can run:

```console
infura-extract
```

### Parameters

- `<network>`: The blockchain network to query (ethereum, base, polygon, etc.)
- `<block-range>`: A single block number, a range of blocks (e.g., "1000-2000"), or use "max" for the latest block

### Examples

Extract addresses from a single block on Ethereum:

```bash
./infura-extract.js ethereum 17000000
```

Extract addresses from a range of blocks on Base:

```bash
./infura-extract.js base 1000-2000
```

Extract addresses from the latest block on Polygon:

```bash
./infura-extract.js polygon max
```

Extract addresses from a range ending at the latest block on Arbitrum:

```bash
./infura-extract.js arbitrum 10000-max
```

## Output

The script outputs Ethereum addresses from block transactions to stdout, one
address per line. Debug and error messages go to stderr.

## Caching

The tool maintains a cache at `~/.cache/infura-extract/<network>/` to avoid
redundant API calls. Each block is stored as a separate JSON file.

## Development

### Pre-commit

This project uses [pre-commit](https://pre-commit.com/) to run checks and manage Git hooks.
Configuration is available in [`.pre-commit-config.yaml`](./.pre-commit-config.yaml).

### Prettier

This project uses [Prettier](https://prettier.io/) for code formatting. To reformat all files, run:

```bash
npm run prettier
```

Configuration can be found in [`.prettierrc`](./.prettierrc).

## Dependencies

- web3.js - For blockchain interaction
- dotenv - For environment variable management
