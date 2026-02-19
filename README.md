# SYNOX09 - Decentralized Governance & Secure Meeting Protocol

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Network](https://img.shields.io/badge/network-Sepolia-orange)
![License](https://img.shields.io/badge/license-MIT-green)

**SYNOX09** is a premium decentralized governance and communication protocol. It combines **cryptographically-secure video conferencing** with **on-chain reputation management**. Built on Ethereum, it provides a tamper-proof record of meetings, decentralized storage for recordings, and a DAO-ready reputation system powered by Attendance NFTs.

---

## 🌟 Key Features

### 🔒 Permission-Based Secure Meetings
- **Secure Lobby**: Integrated "Knock" system where the host must approve participants before they join the mesh.
- **Unique Alphanumeric IDs**: Short, memorable meeting IDs (e.g., `abc-defgh-ijk`) for easy sharing.
- **Peer-to-Peer Video**: Direct browser-to-browser connection using WebRTC via a custom Mesh network.
- **Live Ledger**: A persistent sidebar "Protocol Ledger" tracking every join/leave and security event in real-time.

### 🏛️ DAO & Reputation
- **Proof of Attendance**: Participants earn ERC-721 NFTs for attending verified sessions.
- **Dynamic Leaderboard**: Global reputation rankings based on meeting attendance and contribution.
- **On-Chain Governance**: Propose and vote on DAO initiatives using your accumulated reputation.

### 🔗 Blockchain Trust
- **Ethereum Verification**: All meeting metadata is anchored to the Sepolia testnet.
- **CID Verification**: Built-in tool to verify IPFS recording hashes against the on-chain record.
- **Wallet Auth**: Seamless authentication using ECDSA signatures (Metamask/Signer).

---

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Framer Motion, GSAP
- **Web3**: Ethers.js, Hardhat, Solidity
- **P2P Communication**: Simple-Peer (WebRTC), Socket.io (Signaling)
- **Decentralized Storage**: IPFS (via Pinata)
- **Network**: Ethereum Sepolia Testnet

---

## 🚀 Installation & Setup

### Prerequisites
- Node.js (v18+)
- MetaMask (Sepolia Network)
- A Pinata/IPFS API Key (optional for recording features)

### 1. Clone & Install
```bash
git clone <repository-url>
cd SYNOX
npm install
```

### 2. Start Signaling Server
The signaling server facilitates the P2P handshake.
```bash
cd signaling
npm install
node server.js
```

### 3. Launch Frontend
Open a new window:
```bash
cd frontend
npm install
npm run dev
```

### 4. Configure Environment
Create `frontend/.env`:
```env
VITE_SYNOX_ADDRESS=0x29f4145fFfd81E8e72c813AFd133B4C38106E4d7
VITE_NFT_ADDRESS=0xDF80d2c1bBb114a526aF5bE22E30db9Bbe31363B
VITE_SIGNALING_URL=http://localhost:5000
```

---

## 📖 Using the Protocol

1.  **Dashboard**: Create a "New Session" or join by entering a "Room ID" and your "Alias".
2.  **Lobby**: Users wait in a secure lobby. The Host receives a notification in the sidebar to "Approve" or "Deny" entry.
3.  **The Mesh**: Once admitted, use the controls to Mute, Toggle Camera, Share Screen, or Raise Hand.
4.  **Finalize**: Host clicks "Finalize Session" to upload the recording metadata to IPFS and mint reputation NFTs for all.
5.  **Verify**: Anyone can enter a CID/ID into the Verify page to see if the session record is valid and untampered.

---

## 📄 Documentation

For a simpler explanation of how this project works and what tools we used, check out [EXPLANATION.md](./EXPLANATION.md).

---

**Built for the Future of Decentralized Organization.**
