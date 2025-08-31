// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal


import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { apiClient } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { 
  Package, 
  TruckIcon, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Eye,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw
} from 'lucide-react';
import { Link } from 'react-router-dom';

const AllShipments = () => {
  const { toast } = useToast();
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalShipments, setTotalShipments] = useState(0);
  const [nextBookmark, setNextBookmark] = useState('');
  const [hasNextPage, setHasNextPage] = useState(false);

  useEffect(() => {
    loadShipments();
  }, [currentPage, statusFilter]);

  const loadShipments = async (bookmark = '') => {
    try {
      setLoading(true);
      let response;
      
      if (statusFilter === 'all') {
        response = await apiClient.getAllShipments(pageSize, bookmark);
      } else {
        response = await apiClient.getShipmentsByStatus(statusFilter, pageSize, bookmark);
      }
      
      const shipmentList = response.shipments || [];
      setShipments(shipmentList);
      setTotalShipments(response.fetchedCount || shipmentList.length);
      setNextBookmark(response.nextBookmark || '');
      setHasNextPage(!!(response.nextBookmark && response.nextBookmark !== ''));
      
    } catch (error) {
      toast({
        title: "Error loading shipments",
        description: error instanceof Error ? error.message : "Failed to load shipments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setCurrentPage(1);
    await loadShipments();
    setRefreshing(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CREATED': return <Package className="h-4 w-4" />;
      case 'PROCESSED': return <CheckCircle className="h-4 w-4" />;
      case 'DISTRIBUTED': return <TruckIcon className="h-4 w-4" />;
      case 'DELIVERED': return <CheckCircle className="h-4 w-4" />;
      case 'RECALLED': return <AlertTriangle className="h-4 w-4" />;
      case 'PENDING_CERTIFICATION': return <Clock className="h-4 w-4" />;
      case 'CERTIFIED': return <ShieldCheck className="h-4 w-4" />;
      default: return <Package className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CREATED': return 'bg-blue-100 text-blue-800';
      case 'PROCESSED': return 'bg-green-100 text-green-800';
      case 'DISTRIBUTED': return 'bg-yellow-100 text-yellow-800';
      case 'DELIVERED': return 'bg-emerald-100 text-emerald-800';
      case 'RECALLED': return 'bg-red-100 text-red-800';
      case 'PENDING_CERTIFICATION': return 'bg-orange-100 text-orange-800';
      case 'CERTIFIED': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredShipments = shipments.filter(shipment => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      (shipment.shipmentID || shipment.id)?.toLowerCase().includes(searchLower) ||
      shipment.productName?.toLowerCase().includes(searchLower) ||
      shipment.currentOwnerAlias?.toLowerCase().includes(searchLower)
    );
  });

  const handleNextPage = () => {
    if (hasNextPage) {
      setCurrentPage(prev => prev + 1);
      loadShipments(nextBookmark);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
      // For previous page, we'd need to implement bookmark-based pagination differently
      // For now, reload from beginning with page calculation
      loadShipments();
    }
  };

  if (loading && !refreshing) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">All Shipments</h1>
            <p className="text-gray-600 mt-1">
              View all shipments in the blockchain network
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            className="flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Filters</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by ID, product name, or owner..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Status Filter</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="CREATED">Created</SelectItem>
                    <SelectItem value="PENDING_CERTIFICATION">Pending Certification</SelectItem>
                    <SelectItem value="CERTIFIED">Certified</SelectItem>
                    <SelectItem value="PROCESSED">Processed</SelectItem>
                    <SelectItem value="DISTRIBUTED">Distributed</SelectItem>
                    <SelectItem value="DELIVERED">Delivered</SelectItem>
                    <SelectItem value="RECALLED">Recalled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Shipments List */}
        <Card>
          <CardHeader>
            <CardTitle>Shipments ({totalShipments} found)</CardTitle>
            <CardDescription>
              Complete list of all shipments in the supply chain
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredShipments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No shipments found</p>
                {searchTerm && (
                  <p className="text-sm mt-2">Try adjusting your search terms</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredShipments.map((shipment) => (
                  <div
                    key={shipment.shipmentID || shipment.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-4 flex-1">
                      <div className="flex-shrink-0">
                        {getStatusIcon(shipment.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {shipment.productName}
                        </h3>
                        <p className="text-sm text-gray-500 truncate">
                          ID: {shipment.shipmentID || shipment.id}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          Owner: {shipment.currentOwnerAlias}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {shipment.quantity} {shipment.unitOfMeasure}
                        </p>
                        {shipment.farmerData?.farmLocation && (
                          <p className="text-sm text-gray-500">
                            {shipment.farmerData.farmLocation}
                          </p>
                        )}
                      </div>
                      
                      <Badge className={getStatusColor(shipment.status)}>
                        {shipment.status.replace('_', ' ')}
                      </Badge>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <Link to={`/shipments/${shipment.shipmentID || shipment.id}`}> 
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
                
                {/* Pagination */}
                {(hasNextPage || currentPage > 1) && (
                  <div className="flex justify-center pt-6">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious 
                            onClick={handlePreviousPage}
                            className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                        
                        <PaginationItem>
                          <PaginationLink className="cursor-default">
                            Page {currentPage}
                          </PaginationLink>
                        </PaginationItem>
                        
                        <PaginationItem>
                          <PaginationNext 
                            onClick={handleNextPage}
                            className={!hasNextPage ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default AllShipments;
