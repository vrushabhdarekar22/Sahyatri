import { useState } from 'react'
import './App.css'
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ActiveTripProvider } from "./context/ActiveTripContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import TripPage from "./pages/TripPage";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import GuardianDashboard from "./pages/GuardianDashboard";


function App() {


  return (
    <AuthProvider>
      <ActiveTripProvider>
        <BrowserRouter>
          <Routes>

            {/* Home */}
            <Route path="/" element={<Home />} />

            {/* Auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route path="/trip" element={<TripPage />}/>
            <Route path="/guardian" element={<GuardianDashboard />}/>
            <Route path="/dashboard" element={<Dashboard />}/>

          </Routes>
        </BrowserRouter>
      </ActiveTripProvider>
    </AuthProvider>
  )
}

export default App
