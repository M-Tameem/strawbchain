// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/services/api';
import {
  Package,
  TruckIcon,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  Eye,
  ShieldCheck,
  Factory, // For Processor
  Warehouse, // For Distributor
  Store, // For Retailer
  ScrollText, // For Certifier
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

const Dashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    created: 0,
    processed: 0,
    distributed: 0,
    delivered: 0,
    recalled: 0,
    pendingCertification: 0,
    certified: 0,
  });

  useEffect(() => {
    if (user) { // Only load data if user is available
      loadDashboardData();
    } else {
      setLoading(false); // If no user, stop loading
    }
  }, [user]); // Depend on user to re-load if user object changes

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      let relevantShipments: any[] = [];
      let currentUserFullId: string | null = null;

      // Fetch current user's fullId if user object is available
      if (user?.kid_name) { // kid_name is used by API to get TestGetCallerIdentity
        try {
          const userInfoResponse = await apiClient.getCurrentUserInfo(); // Calls /api/users/current/info
          // Assuming the response is an object like { fullId: "...", mspId: "...", ... }
          currentUserFullId = userInfoResponse?.fullId;
          if (!currentUserFullId) {
            console.warn("currentUserFullId not found in response from apiClient.getCurrentUserInfo()");
            toast({
              title: "User Info Incomplete",
              description: "Could not retrieve full user identifier. Some data may be filtered incorrectly.",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error("Error fetching current user info:", error);
          toast({
            title: "Error fetching user data",
            description: "Could not retrieve essential user identifiers.",
            variant: "destructive",
          });
          // Decide if you want to proceed with partial data or stop
        }
      } else if (user) {
          console.warn("User object present, but kid_name is missing. Cannot fetch fullId via getCurrentUserInfo.");
      }


      const pageSize = 50; // Common page size

      if (user?.role === 'farmer') {
        const response = await apiClient.getMyShipments(pageSize);
        relevantShipments = response.shipments || [];
      } else if (user?.role === 'processor') {
        if (currentUserFullId) {
          const allShipmentsResponse = await apiClient.getAllShipments(pageSize * 2); // Fetch more to filter
          const allShipments = allShipmentsResponse.shipments || [];
          relevantShipments = allShipments.filter((s: any) =>
            (s.status === 'CREATED' || s.status === 'CERTIFIED') &&
            s.farmerData?.destinationProcessorId === currentUserFullId
          );
        } else {
          relevantShipments = []; // Can't filter for processor without their fullId
          toast({ title: "Processor Data Unavailable", description: "Cannot filter shipments for processor without their Full ID.", variant: "warning" });
        }
      } else if (user?.role === 'certifier') {
        const pendingCertResponse = await apiClient.getShipmentsByStatus('PENDING_CERTIFICATION', pageSize);
        relevantShipments = pendingCertResponse.shipments || [];
      // In Dashboard.tsx, around line 85, change the distributor logic:

      } else if (user?.role === 'distributor') {
        const allShipmentsResponse = await apiClient.getAllShipments(pageSize);
        const allShipments = allShipmentsResponse.shipments || [];
        relevantShipments = allShipments.filter((s: any) => {
          const target = s.processorData?.destinationDistributorId;
          return (s.status === 'PROCESSED') &&
            (target === currentUserFullId || target === user?.chaincode_alias);
        });
      } else if (user?.role === 'retailer') {
        const allShipmentsResponse = await apiClient.getAllShipments(pageSize);
        const allShipments = allShipmentsResponse.shipments || [];
        relevantShipments = allShipments.filter((s: any) => {
          const target = s.distributorData?.destinationRetailerId;
          return (s.status === 'DISTRIBUTED') &&
            (target === currentUserFullId || target === user?.chaincode_alias);
        });
      } else if (user?.is_admin) { // For admin role
        const allShipmentsResponse = await apiClient.getAllShipments(pageSize);
        relevantShipments = allShipmentsResponse.shipments || [];
      } else {
        // Default for unknown roles or if no specific logic matches
        relevantShipments = [];
      }

      setShipments(relevantShipments);

      // Calculate stats based on relevantShipments
      setStats({
        total: relevantShipments.length,
        created: relevantShipments.filter((s: any) => s.status === 'CREATED').length,
        processed: relevantShipments.filter((s: any) => s.status === 'PROCESSED').length,
        distributed: relevantShipments.filter((s: any) => s.status === 'DISTRIBUTED').length,
        delivered: relevantShipments.filter((s: any) => s.status === 'DELIVERED').length,
        recalled: relevantShipments.filter((s: any) => s.status === 'RECALLED').length,
        pendingCertification: relevantShipments.filter((s: any) => s.status === 'PENDING_CERTIFICATION').length,
        certified: relevantShipments.filter((s: any) => s.status === 'CERTIFIED').length,
      });

    } catch (error) {
      console.error("Error loading dashboard data:", error);
      toast({
        title: "Error Loading Dashboard",
        description: error instanceof Error ? error.message : "Failed to load dashboard data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CREATED': return <Package className="h-4 w-4" />;
      case 'PROCESSED': return <Factory className="h-4 w-4" />;
      case 'DISTRIBUTED': return <TruckIcon className="h-4 w-4" />;
      case 'DELIVERED': return <Store className="h-4 w-4" />;
      case 'RECALLED': return <AlertTriangle className="h-4 w-4" />;
      case 'PENDING_CERTIFICATION': return <Clock className="h-4 w-4" />;
      case 'CERTIFIED': return <ShieldCheck className="h-4 w-4" />;
      default: return <Package className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CREATED': return 'bg-blue-100 text-blue-800';
      case 'PROCESSED': return 'bg-purple-100 text-purple-800';
      case 'DISTRIBUTED': return 'bg-yellow-100 text-yellow-800';
      case 'DELIVERED': return 'bg-emerald-100 text-emerald-800';
      case 'RECALLED': return 'bg-red-100 text-red-800';
      case 'PENDING_CERTIFICATION': return 'bg-orange-100 text-orange-800';
      case 'CERTIFIED': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleSpecificActions = () => {
    // Actions that create new top-level items
    if (user?.role === 'farmer') {
      return (
        <div className="flex space-x-4">
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
            <Link to="/shipments/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Shipment
            </Link>
          </Button>
        </div>
      );
    }
    if (user?.role === 'processor') {
      return (
        <div className="flex space-x-4">
          <Button asChild className="bg-purple-600 hover:bg-purple-700">
            <Link to="/transform">
              <Plus className="h-4 w-4 mr-2" />
              Transform Products
            </Link>
          </Button>
        </div>
      );
    }
    // Other roles might have actions within shipment details or other pages
    return null;
  };

  const getRoleSpecificGuidance = () => {
    // Guidance text for roles that primarily act on existing shipments
    switch (user?.role) {
        case 'processor':
            return (
              <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                <Factory className="h-4 w-4" />
                <span>View and process shipments assigned to you from the list below.</span>
              </div>
            );
        case 'certifier':
            return (
              <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                <ScrollText className="h-4 w-4" />
                <span>View and certify shipments pending certification.</span>
              </div>
            );
        case 'distributor':
            return (
              <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                <Warehouse className="h-4 w-4" />
                <span>View and distribute processed shipments.</span>
              </div>
            );
        case 'retailer':
            return (
              <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                <Store className="h-4 w-4" />
                <span>View and receive distributed shipments.</span>
              </div>
            );
        default:
            return null;
    }
  }


  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="text-center py-10">
          <p>Please log in to view the dashboard.</p>
          <Button asChild className="mt-4">
            <Link to="/login">Login</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome back, {user?.chaincode_alias || user?.username}
            </h1>
            <p className="text-gray-600 mt-1 capitalize">
              {user?.is_admin ? 'Admin' : user?.role} Dashboard
            </p>
            {getRoleSpecificGuidance()}
          </div>
          {getRoleSpecificActions()}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Relevant</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          {user?.role === 'farmer' && (
            <Card className="border-l-4 border-l-sky-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Created by You</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                <div className="text-2xl font-bold">{stats.created}</div>
                </CardContent>
            </Card>
          )}
          {user?.role === 'processor' && (
            <Card className="border-l-4 border-l-purple-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">To Process</CardTitle>
                <Factory className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div> {/* Assumes total is 'to process' */}
                </CardContent>
            </Card>
          )}
           {user?.role === 'certifier' && (
            <Card className="border-l-4 border-l-orange-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Certification</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                <div className="text-2xl font-bold">{stats.pendingCertification}</div>
                </CardContent>
            </Card>
          )}


          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivered/Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.delivered}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recalls</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.recalled}</div>
            </CardContent>
          </Card>
        </div>

        {/* Relevant Shipments List */}
        <Card>
          <CardHeader>
            <CardTitle>Relevant Shipments</CardTitle>
            <CardDescription>
              { user?.role === 'farmer' ? "Shipments you've created or are managing." :
                user?.role === 'processor' ? "Shipments assigned to you for processing." :
                user?.role === 'certifier' ? "Shipments pending your certification." :
                user?.role === 'distributor' ? "Shipments ready for distribution." :
                user?.role === 'retailer' ? "Shipments en route or ready for receiving." :
                "Overview of recent shipment activities."
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {shipments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No shipments found relevant to your current role or filters.</p>
                {user?.role === 'farmer' && (
                  <Button asChild className="mt-4">
                    <Link to="/shipments/new">Create your first shipment</Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {shipments.map((shipment) => ( // Removed slice to show all relevant ones, pagination would be better for many
                  <div
                    key={shipment.shipmentID || shipment.id} // Use shipment.id if shipmentID isn't available
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-4 mb-2 sm:mb-0">
                      <div className="flex-shrink-0 p-2 bg-gray-100 rounded-full">
                        {getStatusIcon(shipment.status)}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {shipment.productName}
                        </h3>
                        <p className="text-sm text-gray-500">
                          ID: {shipment.shipmentID || shipment.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4 w-full sm:w-auto justify-end">
                      <Badge className={`${getStatusColor(shipment.status)} shrink-0`}>
                        {shipment.status?.replace('_', ' ') || 'UNKNOWN'}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="shrink-0"
                      >
                        <Link to={`/shipments/${shipment.shipmentID || shipment.id}`}>
                          <Eye className="h-4 w-4 md:mr-2" />
                          <span className="hidden md:inline">View</span>
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
                 {/* Consider adding pagination if shipment list can be very long */}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;