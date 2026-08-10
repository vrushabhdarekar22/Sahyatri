import { createContext, useState, useEffect } from "react";
import api from "../utils/api";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("token");
    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
      setToken(storedToken);
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await api.post("/auth/login", {
      email,
      password,
    });

    const data = res.data;
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);

    // Distress PIN Login Trigger
    if (data.distressMode) {
      console.log("🚨 distress login triggered silently");
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await api.post(
              "/sos/trigger",
              {
                location: {
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                },
              },
              {
                headers: {
                  Authorization: `Bearer ${data.token}`,
                },
              }
            );
            console.log("🚨 Silent SOS Triggered Successfully");
          } catch (err) {
            console.error("SOS Trigger Error:", err);
          }
        },
        (err) => console.error("GPS Distress Error:", err),
        { enableHighAccuracy: true }
      );
    }

    return data;
  };

  const register = async (userData) => {
    const res = await api.post("/auth/register", userData);
    return res.data;
  };

  const updateProfile = async (updates) => {
    try {
      const res = await api.put(
        "/auth/profile",
        updates
      );
      const updatedUser = { ...user, ...updates };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      return res.data;
    } catch (err) {
      // Fallback update in client if route is not implemented
      const updatedUser = { ...user, ...updates };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      return { user: updatedUser };
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};