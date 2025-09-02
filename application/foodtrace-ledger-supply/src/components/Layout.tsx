// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal


import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Package,
  User,
  Settings,
  Search,
  Plus,
  TruckIcon,
  ShieldCheck,
  Building,
  Leaf,
  List
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'farmer': return <Leaf className="h-4 w-4" />;
      case 'processor': return <Package className="h-4 w-4" />;
      case 'distributor': return <TruckIcon className="h-4 w-4" />;
      case 'retailer': return <Building className="h-4 w-4" />;
      case 'certifier': return <ShieldCheck className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  const getNavItems = () => {
    const baseItems = [
      { path: '/dashboard', label: 'Dashboard', icon: <Package className="h-4 w-4" /> },
      { path: '/shipments/all', label: 'All Shipments', icon: <List className="h-4 w-4" /> },
      { path: '/track', label: 'Track Shipment', icon: <Search className="h-4 w-4" /> },
    ];

    if (user?.role === 'farmer') {
      baseItems.push({ path: '/shipments/new', label: 'Create Shipment', icon: <Plus className="h-4 w-4" /> });
    }

    if (user?.is_admin) {
      baseItems.push({ path: '/admin', label: 'Admin Panel', icon: <Settings className="h-4 w-4" /> });
    }

    return baseItems;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-green-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-green-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <Link to="/dashboard" className="flex items-center space-x-2">
              <div className="h-8 w-8 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-lg" role="img" aria-label="leaf">🌱</span>
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  FoodTraceChain
                </span>
              </Link>

              <nav className="hidden md:flex space-x-6">
                {getNavItems().map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      location.pathname === item.path
                        ? 'bg-green-100 text-green-700'
                        : 'text-gray-600 hover:text-green-600 hover:bg-green-50'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
            </div>

            <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 px-3 py-1 bg-white rounded-full border border-green-200">
                {getRoleIcon(user?.role || '')}
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {user?.role}
                </span>
                {user?.is_admin && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                    Admin
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="border-green-200 text-green-700 hover:bg-green-50"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;
