import SyNox from './SyNox.json';
import SyNoxNFT from './SyNoxNFT.json';

export const SYNOX_ADDRESS = import.meta.env.VITE_SYNOX_ADDRESS || "0x0000000000000000000000000000000000000000";
export const NFT_ADDRESS = import.meta.env.VITE_NFT_ADDRESS || "0x0000000000000000000000000000000000000000";

export const SYNOX_ABI = SyNox.abi;
export const NFT_ABI = SyNoxNFT.abi;
