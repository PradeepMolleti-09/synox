import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';

/**
 * AuthGate protects routes by ensuring the user has:
 * 1. Connected their wallet
 * 2. Signed the authentication message
 */
const AuthGate = ({ children }) => {
    const { account, isAuthenticated } = useWallet();
    const location = useLocation();

    if (!account || !isAuthenticated) {
        // Redirect to login but save the current location they were trying to access
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
};

export default AuthGate;
