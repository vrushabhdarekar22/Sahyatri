import { useState } from 'react'
import './App.css'
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import TripPage from "./pages/TripPage";

function App() {


  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

           <Route path="/trip" element={<TripPage />}
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
