// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/services/api'; // Ensure this path is correct

// Define a more complete User interface
interface User {
  username: string;
  chaincode_alias: string;
  role: string;
  is_admin: boolean;
  kid_name?: string;
  fullId?: string;
  id?: number; // Optional: if you store the DB user ID from JWT
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<User>; // Signature changed back
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const storeUserAndToken = (userData: User | null, tokenData: string | null) => {
    if (userData && tokenData) {
      localStorage.setItem('token', tokenData);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(tokenData);
      setUser(userData);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
    }
  };

  const augmentUserWithFullDetails = useCallback(async (basicUser: User, currentToken: string): Promise<User> => {
    try {
      console.log("AuthContext: Augmenting user, current token set for apiClient:", currentToken ? "Yes" : "No - this might be an issue if token not in localstorage yet");
      const detailedUserInfo = await apiClient.getCurrentUserInfo(); // apiClient should use token from localStorage

      const completeUser: User = {
        ...basicUser,
        fullId: detailedUserInfo.fullId,
        username: detailedUserInfo.username || basicUser.username,
        chaincode_alias: detailedUserInfo.chaincode_alias || basicUser.chaincode_alias,
        role: detailedUserInfo.role || basicUser.role,
        is_admin: detailedUserInfo.isAdmin !== undefined ? !!detailedUserInfo.isAdmin : basicUser.is_admin,
        kid_name: detailedUserInfo.kid_name || basicUser.kid_name,
        id: basicUser.id // Preserve id if it came from JWT via initial login response.user
      };
      console.log("AuthContext: User details augmented:", completeUser);
      return completeUser;
    } catch (error) {
      console.error("AuthContext: Failed to fetch detailed user info (fullId etc.), using basic info:", error);
      return basicUser;
    }
  }, []);

  useEffect(() => {
    const attemptAutoLogin = async () => {
      setIsLoading(true);
      const storedToken = localStorage.getItem('token');
      const storedUserString = localStorage.getItem('user');

      if (storedToken) {
        setToken(storedToken); // Set token first for subsequent apiClient calls if needed
        if (storedUserString) {
          try {
            const parsedUser = JSON.parse(storedUserString) as User;
            if (parsedUser.fullId && parsedUser.kid_name) {
              console.log("AuthContext: Restoring user from localStorage (already has fullId):", parsedUser);
              setUser(parsedUser); // Already complete
            } else {
              console.log("AuthContext: Stored user incomplete or refreshing. Fetching full details.");
              const augmentedUser = await augmentUserWithFullDetails(parsedUser, storedToken);
              // Re-store the now augmented user (important for next load)
              storeUserAndToken(augmentedUser, storedToken); // This calls setUser and setToken
            }
          } catch (e) {
            console.error("AuthContext: Failed to parse stored user. Clearing session.", e);
            storeUserAndToken(null, null);
          }
        } else {
          try {
            console.log("AuthContext: Token found, but no stored user. Fetching user info...");
            const detailedUserInfo = await apiClient.getCurrentUserInfo(); // Uses token from localStorage
            if (detailedUserInfo && detailedUserInfo.fullId && detailedUserInfo.chaincode_alias) {
              const reconstructedUser: User = {
                username: detailedUserInfo.username || detailedUserInfo.chaincode_alias,
                chaincode_alias: detailedUserInfo.chaincode_alias,
                role: detailedUserInfo.role || 'unknown',
                is_admin: !!detailedUserInfo.isAdmin,
                kid_name: detailedUserInfo.kid_name,
                fullId: detailedUserInfo.fullId,
                // 'id' (numeric db id) would not typically come from getCurrentUserInfo
              };
              storeUserAndToken(reconstructedUser, storedToken);
              console.log("AuthContext: Auto-login successful with fetched details:", reconstructedUser);
            } else {
              console.warn("AuthContext: Auto-login with token failed, getCurrentUserInfo insufficient.");
              storeUserAndToken(null, null);
            }
          } catch (error) {
            console.error("AuthContext: Error during auto-login token validation:", error);
            storeUserAndToken(null, null);
          }
        }
      }
      setIsLoading(false);
    };
    attemptAutoLogin();
  }, [augmentUserWithFullDetails]);

  const login = async (usernameInput: string, passwordInput: string): Promise<User> => {
    setIsLoading(true);
    console.log("AuthContext: Login attempt for username:", usernameInput);
    try {
      // Step 1: Basic login to get token and initial user data (which includes kid_name)
      // apiClient.login expects username and password as separate args.
      const response = await apiClient.login(usernameInput, passwordInput);

      if (!response.token || !response.user) {
        throw new Error(response.error || "Login failed: No token or user object in response from apiClient.login");
      }

      // Crucial: Set token in localStorage *before* calling augmentUserWithFullDetails,
      // as apiClient.getCurrentUserInfo() relies on the token being available globally (e.g. from localStorage)
      localStorage.setItem('token', response.token);
      setToken(response.token); // Also update token state immediately

      // Step 2: Augment basic user info with fullId and other details from getCurrentUserInfo
      // The user object from login response should include: username, chaincode_alias, role, is_admin, kid_name
      const basicUser: User = {
        username: response.user.username,
        chaincode_alias: response.user.chaincode_alias,
        role: response.user.role,
        is_admin: !!response.user.is_admin,
        kid_name: response.user.kid_name,
        // 'id' (numeric db id from JWT) could be added here if your apiClient.login decodes token or backend sends it
      };

      if (!basicUser.kid_name) {
          console.warn("AuthContext: kid_name missing from login response's user object. Cannot reliably fetch fullId.");
          // Store what we have, but fullId-dependent features may fail
          storeUserAndToken(basicUser, response.token); // Calls setUser
          setIsLoading(false);
          return basicUser;
      }
      
      const completeUser = await augmentUserWithFullDetails(basicUser, response.token);
      storeUserAndToken(completeUser, response.token); // Updates localStorage & calls setUser
      setIsLoading(false);
      return completeUser;

    } catch (error) {
      console.error("AuthContext: Login process failed", error);
      storeUserAndToken(null, null); // Clear any partial login artifacts
      setIsLoading(false);
      if (error instanceof Error) {
        throw error; // Re-throw original error object
      } else {
        throw new Error("An unknown login error occurred");
      }
    }
  };

  const logout = () => {
    console.log("AuthContext: User logging out.");
    storeUserAndToken(null, null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {/* Render children only after initial loading attempt is complete to avoid UI flashes */}
      {/* You might have a more sophisticated global loading indicator */}
      {!isLoading ? children : (<div>Loading application...</div>) /* Basic loading state display */}
    </AuthContext.Provider>
  );
};