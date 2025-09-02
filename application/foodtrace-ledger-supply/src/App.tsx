// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal


import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ShipmentDetails from "./pages/ShipmentDetails";
import CreateShipment from "./pages/CreateShipment";
import PublicTracker from "./pages/PublicTracker";
import AdminPanel from "./pages/AdminPanel";
import AllShipments from "./pages/AllShipments";
import TransformProductsPage from "./pages/TransformProductsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }
  
  return user ? <>{children}</> : <Navigate to="/login" />;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }
  
  return user?.is_admin ? <>{children}</> : <Navigate to="/dashboard" />;
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/track/:shipmentId" element={<PublicTracker />} />
      <Route path="/track" element={<PublicTracker />} />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/shipments/all" 
        element={
          <ProtectedRoute>
            <AllShipments />
          </ProtectedRoute>
        } 
      />
      <Route
        path="/shipments/new"
        element={
          <ProtectedRoute>
            <CreateShipment />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transform"
        element={
          <ProtectedRoute>
            <TransformProductsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shipments/:id"
        element={
          <ProtectedRoute>
            <ShipmentDetails />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin" 
        element={
          <AdminRoute>
            <AdminPanel />
          </AdminRoute>
        } 
      />
      <Route path="/" element={<Navigate to="/dashboard" />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
