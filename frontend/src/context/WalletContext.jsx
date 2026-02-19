import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useToast } from './ToastContext';

const WalletContext = createContext();

export const WalletProvider = ({ children }) => {
    const [account, setAccount] = useState(null);
    const [provider, setProvider] = useState(null);
    const [signer, setSigner] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const { showToast } = useToast();

    const connectWallet = async () => {
        if (window.ethereum) {
            try {
                await window.ethereum.request({ method: 'eth_requestAccounts' });
                const _provider = new ethers.BrowserProvider(window.ethereum);
                const _signer = await _provider.getSigner();
                const _account = await _signer.getAddress();

                setProvider(_provider);
                setSigner(_signer);
                setAccount(_account);

                // Check Network (Sepolia)
                const network = await _provider.getNetwork();
                if (Number(network.chainId) !== 11155111) {
                    console.warn("Please switch to Sepolia");
                    try {
                        await window.ethereum.request({
                            method: 'wallet_switchEthereumChain',
                            params: [{ chainId: '0xaa36a7' }],
                        });
                    } catch (switchError) {
                        console.error(switchError);
                    }
                }
            } catch (error) {
                console.error("Connection error:", error);
            }
        } else {
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (isMobile) {
                // Deep link to open the app in MetaMask's internal browser
                const dappUrl = window.location.href.split('://')[1];
                window.location.href = `https://metamask.app.link/dapp/${dappUrl}`;
            } else {
                showToast("Please install MetaMask extension!", "error");
            }
        }
    };

    const login = async () => {
        if (!signer) return;
        setIsAuthenticating(true);
        try {
            const message = `Authorize SYNOX Protocol Session\n\nChallenge: ${Date.now()}\nDomain: synox.internal\n\nBy signing, you prove ownership of this wallet and gain access to secure protocol features.`;
            const signature = await signer.signMessage(message);

            if (signature) {
                setIsAuthenticated(true);
                localStorage.setItem('synox_auth_sig', signature);
                return true;
            }
        } catch (e) {
            console.error("Signature failed", e);
        } finally {
            setIsAuthenticating(false);
        }
        return false;
    };

    const logout = () => {
        setAccount(null);
        setSigner(null);
        setIsAuthenticated(false);
        localStorage.removeItem('synox_auth_sig');
    };

    useEffect(() => {
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length > 0) {
                    window.location.reload();
                } else {
                    setAccount(null);
                    setSigner(null);
                }
            });

            window.ethereum.on('chainChanged', () => {
                window.location.reload();
            });

            // Auto-connect if already authorized
            const checkConnection = async () => {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    connectWallet();
                }
            };
            checkConnection();
        }
    }, []);

    return (
        <WalletContext.Provider value={{
            account,
            provider,
            signer,
            isAuthenticated,
            isAuthenticating,
            connectWallet,
            login,
            logout
        }}>
            {children}
        </WalletContext.Provider>
    );
};

export const useWallet = () => useContext(WalletContext);
