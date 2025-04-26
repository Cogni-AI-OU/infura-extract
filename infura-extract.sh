#!/bin/bash
set -e

# Check if the required argument is provided.
type node &>/dev/null || {
    echo "Node.js is not installed. Please install Node.js to run this script."
    exit 1
}

# Call the Node.js script with all passed arguments
node infura-extract.js "$@"
