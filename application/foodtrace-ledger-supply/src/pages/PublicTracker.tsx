// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/services/api';
import { 
  Search,
  Package, 
  MapPin, 
  Calendar, 
  Truck,
  Building,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  Leaf,
  QrCode,
  Home,
  ArrowLeft
} from 'lucide-react';
import ShipmentMapView from '@/components/ShipmentMapView';

interface TimelineStep {
  key: string;
  label: string;
  icon: React.ComponentType<any>;
  description: string;
  completed: boolean;
  current: boolean;
}

const PublicTracker = () => {
  const { shipmentId: urlShipmentId } = useParams<{ shipmentId: string }>();
  const navigate = useNavigate();
  const [shipmentId, setShipmentId] = useState(urlShipmentId || '');
  const [shipment, setShipment] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (urlShipmentId) {
      handleSearch();
    }
  }, [urlShipmentId]);

  const handleSearch = async () => {
    if (!shipmentId.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const data = await apiClient.getShipmentDetails(shipmentId.trim());
      setShipment(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Shipment not found');
      setShipment(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CREATED': return <Package className="h-5 w-5" />;
      case 'PROCESSED': return <CheckCircle className="h-5 w-5" />;
      case 'DISTRIBUTED': return <Truck className="h-5 w-5" />;
      case 'DELIVERED': return <Building className="h-5 w-5" />;
      case 'RECALLED': return <AlertTriangle className="h-5 w-5" />;
      case 'CERTIFIED': return <ShieldCheck className="h-5 w-5" />;
      default: return <Package className="h-5 w-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CREATED': return 'bg-blue-100 text-blue-800';
      case 'PROCESSED': return 'bg-green-100 text-green-800';
      case 'DISTRIBUTED': return 'bg-yellow-100 text-yellow-800';
      case 'DELIVERED': return 'bg-emerald-100 text-emerald-800';
      case 'RECALLED': return 'bg-red-100 text-red-800';
      case 'CERTIFIED': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not specified';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      if (date.getUTCFullYear() <= 1) return 'Not specified';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Invalid Date';
    }
  };

  const getTimelineSteps = (): TimelineStep[] => {
    const baseSteps = [
      { key: 'CREATED', label: 'Farm', icon: Leaf, description: 'Harvested and recorded' },
      { key: 'CERTIFIED', label: 'Certified', icon: ShieldCheck, description: 'Quality certified' },
      { key: 'PROCESSED', label: 'Processed', icon: CheckCircle, description: 'Processed and packaged' },
      { key: 'DISTRIBUTED', label: 'Transit', icon: Truck, description: 'In distribution' },
      { key: 'DELIVERED', label: 'Store', icon: Building, description: 'Available in store' },
    ];

    if (!shipment) {
      return baseSteps.map(step => ({
        ...step,
        completed: false,
        current: false
      }));
    }

    const currentStatusIndex = baseSteps.findIndex(step => step.key === shipment.status);
    
    return baseSteps.map((step, index) => ({
      ...step,
      completed: index <= currentStatusIndex,
      current: step.key === shipment.status
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-green-100">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-green-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <QrCode className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  FoodTraceChain Tracker
                </h1>
                <p className="text-gray-600">Track your food's journey from farm to table</p>
              </div>
            </div>
            
            {/* Navigation buttons */}
            <div className="flex space-x-2">
              <Button variant="outline" onClick={() => navigate('/')}>
                <Home className="h-4 w-4 mr-2" />
                Home
              </Button>
              <Button variant="outline" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
            </div>
          </div>
          
          {/* Search */}
          <div className="flex space-x-4 max-w-md">
            <Input
              placeholder="Enter shipment ID (e.g., SHIP-123456-ABC)"
              value={shipmentId}
              onChange={(e) => setShipmentId(e.target.value)}
              onKeyPress={handleKeyPress}
              className="border-green-200 focus:border-green-500"
            />
            <Button 
              onClick={handleSearch}
              disabled={loading}
              className="bg-green-600 hover:bg-emerald-700"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2 text-red-800">
                <AlertTriangle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {!shipment && !error && !loading && (
          <Card className="text-center">
            <CardContent className="pt-12 pb-12">
              <QrCode className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Track Your Food's Journey
              </h2>
              <p className="text-gray-600 mb-6">
                Enter a shipment ID above to see the complete supply chain history
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
                <div className="text-center">
                    <Leaf className="h-8 w-8 mx-auto text-green-600 mb-2" />
                  <span className="text-sm font-medium text-gray-700">Farm Origins</span>
                </div>
                <div className="text-center">
                  <CheckCircle className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                  <span className="text-sm font-medium text-gray-700">Processing</span>
                </div>
                <div className="text-center">
                  <Truck className="h-8 w-8 mx-auto text-orange-600 mb-2" />
                  <span className="text-sm font-medium text-gray-700">Distribution</span>
                </div>
                <div className="text-center">
                  <Building className="h-8 w-8 mx-auto text-purple-600 mb-2" />
                  <span className="text-sm font-medium text-gray-700">Retail</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {shipment && (
          <div className="space-y-6">
            {/* Product Overview */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl">{shipment.productName}</CardTitle>
                    <CardDescription>Shipment ID: {shipment.shipmentID}</CardDescription>
                  </div>
                  <Badge className={`${getStatusColor(shipment.status)} flex items-center space-x-1 text-sm px-3 py-1`}>
                    {getStatusIcon(shipment.status)}
                    <span>{shipment.status.replace('_', ' ')}</span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Description</label>
                    <p className="text-gray-900 mt-1">{shipment.description || 'No description available'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Quantity</label>
                    <p className="text-gray-900 mt-1 font-medium">{shipment.quantity} {shipment.unitOfMeasure}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Created Date</label>
                    <p className="text-gray-900 mt-1">{formatDate(shipment.timestampCreated)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {(shipment.farmerData?.farmCoordinates || (shipment.distributorData && shipment.distributorData.transitGpsLog.length > 0)) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MapPin className="h-5 w-5" />
                    <span>Route Map</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ShipmentMapView
                    farmLocation={shipment.farmerData?.farmCoordinates}
                    route={shipment.distributorData?.transitGpsLog}
                  />
                </CardContent>
              </Card>
            )}

            {/* Supply Chain Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Supply Chain Journey</CardTitle>
                <CardDescription>Follow this product's path from farm to store</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="flex justify-between items-start space-x-4 overflow-x-auto pb-4">
                    {getTimelineSteps().map((step, index) => (
                      <div key={step.key} className="flex flex-col items-center min-w-0 flex-1">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${
                          step.completed 
                            ? step.current 
                              ? 'bg-emerald-600 text-white ring-4 ring-emerald-200' 
                              : 'bg-emerald-100 text-emerald-600'
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          <step.icon className="h-8 w-8" />
                        </div>
                        <h3 className={`font-medium text-sm ${step.completed ? 'text-gray-900' : 'text-gray-400'}`}>
                          {step.label}
                        </h3>
                        <p className={`text-xs text-center mt-1 ${step.completed ? 'text-gray-600' : 'text-gray-400'}`}>
                          {step.description}
                        </p>
                        {index < getTimelineSteps().length - 1 && (
                          <div 
                            className={`absolute top-8 h-0.5 ${step.completed ? 'bg-emerald-300' : 'bg-gray-200'}`}
                            style={{
                              left: `${(100 / getTimelineSteps().length) * (index + 0.5)}%`,
                              width: `${100 / getTimelineSteps().length}%`,
                              transform: 'translateX(-50%)'
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Farm Information */}
            {shipment.farmerData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Leaf className="h-5 w-5 text-green-600" />
                    <span>Farm Origins</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Farm Name</label>
                      <p className="text-gray-900 mt-1 font-medium">{shipment.farmerData.farmerName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Location</label>
                      <p className="text-gray-900 mt-1">{shipment.farmerData.farmLocation}</p>
                    </div>
                    {shipment.farmerData.farmCoordinates && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">GPS</label>
                        <p className="text-gray-900 mt-1">{shipment.farmerData.farmCoordinates.latitude}, {shipment.farmerData.farmCoordinates.longitude}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-gray-500">Farming Practice</label>
                      <Badge variant="secondary" className="mt-1">
                        {shipment.farmerData.farmingPractice}
                      </Badge>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Crop Type</label>
                      <p className="text-gray-900 mt-1">{shipment.farmerData.cropType}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Harvest Date</label>
                      <p className="text-gray-900 mt-1">{formatDate(shipment.farmerData.harvestDate)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Planting Date</label>
                      <p className="text-gray-900 mt-1">{formatDate(shipment.farmerData.plantingDate)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Processing Information */}
            {shipment.processorData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                    <span>Processing Details</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Processing Type</label>
                      <p className="text-gray-900 mt-1">{shipment.processorData.processingType}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Date Processed</label>
                      <p className="text-gray-900 mt-1">{formatDate(shipment.processorData.dateProcessed)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Quality Check</label>
                      <Badge className={shipment.processorData.contaminationCheck === 'PASSED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {shipment.processorData.contaminationCheck}
                      </Badge>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Batch ID</label>
                      <p className="text-gray-900 mt-1">{shipment.processorData.outputBatchId}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Expiry Date</label>
                      <p className="text-gray-900 mt-1">{formatDate(shipment.processorData.expiryDate)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Processing Location</label>
                      <p className="text-gray-900 mt-1">{shipment.processorData.processingLocation}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Distribution Information */}
            {shipment.distributorData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Truck className="h-5 w-5 text-orange-600" />
                    <span>Distribution & Transport</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Transport Conditions</label>
                      <p className="text-gray-900 mt-1">{shipment.distributorData.transportConditions}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Temperature Range</label>
                      <p className="text-gray-900 mt-1">{shipment.distributorData.temperatureRange}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Pickup Date</label>
                      <p className="text-gray-900 mt-1">{formatDate(shipment.distributorData.pickupDateTime)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Delivery Date</label>
                      <p className="text-gray-900 mt-1">{formatDate(shipment.distributorData.deliveryDateTime)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Distribution Center</label>
                      <p className="text-gray-900 mt-1">{shipment.distributorData.distributionCenter}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Vehicle ID</label>
                      <p className="text-gray-900 mt-1">{shipment.distributorData.distributionLineId}</p>
                    </div>
                    {shipment.distributorData.transitGpsLog && shipment.distributorData.transitGpsLog.length > 0 && (
                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-gray-500">GPS Log</label>
                        <p className="text-gray-900 mt-1 break-words">
                          {shipment.distributorData.transitGpsLog.map(g => `${g.latitude},${g.longitude}`).join(' | ')}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Retail Information */}
            {shipment.retailerData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Building className="h-5 w-5 text-purple-600" />
                    <span>Retail Information</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Store Location</label>
                      <p className="text-gray-900 mt-1 font-medium">{shipment.retailerData.storeLocation}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Date Received</label>
                      <p className="text-gray-900 mt-1">{formatDate(shipment.retailerData.dateReceived)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Retail Price</label>
                      <p className="text-gray-900 mt-1 font-medium">${shipment.retailerData.price}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Sell By Date</label>
                      <p className="text-gray-900 mt-1">{formatDate(shipment.retailerData.sellByDate)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Shelf Life</label>
                      <p className="text-gray-900 mt-1">{shipment.retailerData.shelfLife}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Store ID</label>
                      <p className="text-gray-900 mt-1">{shipment.retailerData.storeId}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Certification Information */}
            {shipment.certificationRecords && shipment.certificationRecords.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <ShieldCheck className="h-5 w-5 text-green-600" />
                    <span>Certifications</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {shipment.certificationRecords.map((cert: any, index: number) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <Badge className={cert.certificationStatus === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {cert.certificationStatus}
                          </Badge>
                          <span className="text-sm text-gray-500">
                            Inspected on {formatDate(cert.inspectionDate)}
                          </span>
                        </div>
                        {cert.comments && (
                          <p className="text-gray-700">{cert.comments}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Blockchain Security Notice */}
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-3">
                  <ShieldCheck className="h-6 w-6 text-green-600" />
                  <div>
                    <h3 className="font-medium text-green-900">Blockchain Verified</h3>
                    <p className="text-sm text-green-700">
                      This information is secured and verified on the blockchain, ensuring authenticity and preventing tampering.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicTracker;
