# SYNOX - Decentralized Governance & Meeting Protocol

![Version](https://img.shields.io/badge/version-1.0.42-blue)
![Network](https://img.shields.io/badge/network-Sepolia-orange)
![License](https://img.shields.io/badge/license-MIT-green)

**SYNOX** is a cutting-edge decentralized application (dApp) that combines **secure video conferencing** with **blockchain-verified governance**. Built on Ethereum, it provides a tamper-proof record of meetings and automatically issues **Attendance NFTs** to participants, enabling a reputation-based DAO system.

---

## 🌟 Key Features

### 🔒 Secure & Private Meetings
- **Peer-to-Peer Video**: Direct browser-to-browser connection using WebRTC (no central server recording).
- **AES-256 Encryption**: Meeting metadata is encrypted before storage.
- **IPFS Integration**: Decentralized storage for meeting records.

### 🏛️ DAO Governance System
- **Proof of Attendance**: Participants earn ERC-721 NFTs for attending meetings.
- **Reputation Scoring**: User influence grows with participation.
- **On-Chain Voting**: Create and vote on governance proposals using reputation.

### 🔗 Blockchain Verification
- **Immutable Records**: Every meeting is permanently recorded on the Ethereum Sepolia testnet.
- **Cryptographic Proof**: Meeting data is hashed and stored on-chain for independent verification.
- **Wallet Authentication**: Secure login using MetaMask (no passwords).

---

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Framer Motion
- **Blockchain**: Solidity (Smart Contracts), Hardhat, Ethers.js
- **Video/Audio**: WebRTC (Simple-Peer), Socket.io (Signaling)
- **Storage**: IPFS (Pinata)
- **Network**: Ethereum Sepolia Testnet

---

## 📡 Deployed Smart Contracts (Sepolia)

| Contract | Address | Explorer |
|----------|---------|----------|
| **SyNox Core** | `0x29f4145fFfd81E8e72c813AFd133B4C38106E4d7` | [Etherscan](https://sepolia.etherscan.io/address/0x29f4145fFfd81E8e72c813AFd133B4C38106E4d7) |
| **SyNoxNFT** | `0xDF80d2c1bBb114a526aF5bE22E30db9Bbe31363B` | [Etherscan](https://sepolia.etherscan.io/address/0xDF80d2c1bBb114a526aF5bE22E30db9Bbe31363B) |

---

## 🚀 Installation & Setup

Follow these steps to run the complete project locally.

### Prerequisites
- Node.js (v18+)
- MetaMask Browser Extension
- Sepolia Testnet ETH (Get from [Sepolia Faucet](https://sepoliafaucet.com/))

### 1. Clone the Repository
```bash
git clone <repository-url>
cd SYNOX
```

### 2. Setup Signaling Server (Required for Video)
The signaling server helps peers find each other.
```bash
cd signaling
npm install
node server.js
```
*Keep this terminal running.*

### 3. Setup Frontend Application
Open a **new terminal** window/tab.
```bash
cd frontend
npm install
```

### 4. Configure Environment
Create a `.env` file in the `frontend` directory:
```bash
cp .env.example .env
```
Ensure it contains the correct contract addresses (already pre-filled in repo):
```env
VITE_SYNOX_ADDRESS=0x29f4145fFfd81E8e72c813AFd133B4C38106E4d7
VITE_NFT_ADDRESS=0xDF80d2c1bBb114a526aF5bE22E30db9Bbe31363B
# Optional: Add VITE_PINATA_JWT for real IPFS uploads
```

### 5. Start the Application
```bash
npm run dev
```
Visit `http://localhost:5173` in your browser.

---

## 📖 Usage Guide

1.  **Connect Wallet**: Click "Connect Wallet" on the landing page. Ensure you are on Sepolia network.
2.  **Create Meeting**: Go to Dashboard -> Enter Title -> Click "Create". Confirm the transaction in MetaMask.
3.  **Join Room**: Click "Join Room" on the meeting card. Allow camera/mic access.
4.  **Invite Others**: Share the Meeting ID with others (they must also be on localhost for this demo).
5.  **Finalize Meeting (Host Only)**:
    -   Click "Finalize & Mint NFTs" in the bottom bar.
    -   Wait for encryption, IPFS upload, and blockchain confirmation.
    -   Participants will receive their Attendance NFTs.
6.  **Verify**: Go to the "Verify" page to check meeting authenticity using the ID and Hash.
7.  **Governance**: Use your earned NFTs to vote on proposals in the "Governance" tab.

---

## 📂 Project Structure

```
SYNOX/
├── contracts/          # Solidity Smart Contracts
│   ├── SyNox.sol       # Main logic
│   └── SyNoxNFT.sol    # NFT logic
├── frontend/           # React Application
│   ├── src/
│   │   ├── components/ # UI Components
│   │   ├── pages/      # Application Pages
│   │   ├── utils/      # Web3 & IPFS Utilities
│   │   └── hooks/      # Custom React Hooks
├── signaling/          # WebRTC Signaling Server
│   └── server.js       # Socket.io implementation
├── scripts/            # Deployment Scripts
└── README.md           # Documentation
```

---

## 📄 License

This project is licensed under the MIT License.

---

**Built for the Future of Decentralized Organization.**
