# OneBalance Examples

This repository contains examples for working with the OneBalance API.

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Run the calldata example:
```bash
pnpm calldata
```

## Available Scripts

- `pnpm run calldata` - Run the calldata example script
- `pnpm run build` - Compile TypeScript to JavaScript
- `pnpm run clean` - Remove the compiled output directory

## Notes

The script will generate session and admin key files (`session-key.json` and `admin-key.json`) on first run. These are cached for subsequent runs.

The example demonstrates:
- Generating EOA keys
- Predicting smart account addresses
- Fetching balances
- Preparing and executing ERC20 transfers using OneBalance
