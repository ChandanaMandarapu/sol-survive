# SOLSURVIVE: A Fully On-Chain Survival Strategy Game on Solana

## 1. Project Introduction

**SOLSURVIVE** is a proof-of-concept for a fully on-chain, strategic survival game. Unlike traditional games that use blockchain only for assets (NFTs), this project implements the **entire game state and core logic** within the Solana smart contract. This provides a truly decentralized, serverless, and verifiably fair gaming experience.

### Live Application

The deployed application is available on the Solana Devnet.

| Component | Status | URL |
| :--- | :--- | :--- |
| **Deployed dApp Frontend** | Live | **https://solsurvie-dapp.vercel.app/** |
| **Source Repository** | Public | [**https://github.com/ChandanaMandarapu/sol-survive**] |

## 2. Technical Architecture and Innovation

The core technical achievement of SOLSURVIVE lies in its efficient use of Solana's high-throughput capacity to process complex game cycles in a single transaction.

### Atomic On-Chain Turn Execution

All player actions—including movement, resource consumption, and concurrent enemy AI simulation—are processed as a single, atomic Anchor instruction.

* **Trustless Logic:** The entire game logic, including chance calculations and state transitions, is immutable and resides in the smart contract, ensuring provable fairness and eliminating server-side cheating.
* **Performance:** By consolidating complex operations into a single, efficient instruction, transaction overhead is significantly reduced, demonstrating the viability of complex simulation games on the Solana blockchain.
* **Game State:** The map, player health, inventory, and location are stored permanently within Program Derived Address (PDA) accounts.

## 3. Technology Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Blockchain** | Solana Devnet | High-speed, low-cost transaction processing. |
| **Smart Contracts** | Rust / Anchor Framework | Used for all core game logic and state management. |
| **Frontend Interface** | React / Next.js / TypeScript | User interface and Solana Wallet Adapter integration. |
| **Web3 Connectivity** | Anchor Client / Web3.js | Facilitates serialization and communication with the on-chain program. |

