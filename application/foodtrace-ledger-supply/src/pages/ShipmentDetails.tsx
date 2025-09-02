// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext'; // Using the updated AuthContext
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Package, MapPin, Calendar, Truck, Building, ShieldCheck,
  AlertTriangle, CheckCircle, Clock, Factory
} from 'lucide-react';
import ProcessShipmentForm from '@/components/ProcessShipmentForm';
import DistributeShipmentForm from '@/components/DistributeShipmentForm';
import ReceiveShipmentForm from '@/components/ReceiveShipmentForm';
import RecordCertificationForm from '@/components/RecordCertificationForm';
import RecallForm from '@/components/RecallForm';
import ArchiveShipmentForm from '@/components/ArchiveShipmentForm';
import ShipmentMapView from '@/components/ShipmentMapView';
import TransformProductsForm from '@/components/TransformProductsForm';
import QrCodeDisplay from '@/components/QrCodeDisplay';

const ShipmentDetails = () => {
  const { id: paramId } = useParams<{ id: string }>();
  const { user } = useAuth(); // user object should now contain fullId
  const navigate = useNavigate();
  const { toast } = useToast();
  const [shipment, setShipment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showProcessForm, setShowProcessForm] = useState(false);
  const [showDistributeForm, setShowDistributeForm] = useState(false);
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [showCertificationForm, setShowCertificationForm] = useState(false);
  const [showRecallForm, setShowRecallForm] = useState(false);
  const [showArchiveForm, setShowArchiveForm] = useState(false);
  const [showTransformForm, setShowTransformForm] = useState(false);

  useEffect(() => {
    console.log("ShipmentDetails useEffect: 'paramId' from useParams:", paramId);
    if (paramId && paramId !== 'undefined' && paramId !== 'null') {
      loadShipmentDetails(paramId);
    } else {
      setLoading(false);
      console.error("ShipmentDetails useEffect: Invalid 'paramId':", paramId);
      toast({ title: "Invalid shipment ID", variant: "destructive" });
    }
  }, [paramId, toast]);

  const loadShipmentDetails = async (currentShipmentId: string) => {
    setLoading(true);
    try {
      console.log('ShipmentDetails loadShipmentDetails: Fetching for ID:', currentShipmentId);
      const data = await apiClient.getShipmentDetails(currentShipmentId);
      console.log('ShipmentDetails loadShipmentDetails: Data received:', data);
      setShipment(data);
    } catch (error) {
      console.error("ShipmentDetails loadShipmentDetails: Error:", error);
      toast({ title: "Error loading shipment", variant: "destructive" });
      setShipment(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitForCertification = async () => {
    const currentShipmentId = shipment?.id || paramId;
    if (!currentShipmentId) { /* ... */ return; }
    // ... (rest of function is fine) ...
    setActionLoading(true);
    try {
      await apiClient.submitForCertification(currentShipmentId);
      toast({ title: "Submitted for certification" });
      if (paramId) loadShipmentDetails(paramId);
    } catch (error) {
      toast({ title: "Error submitting for certification", description: error instanceof Error ? error.message : "Failed to submit", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusIcon = (status: string) => { /* ... same ... */ 
    switch (status) {
      case 'CREATED': return <Package className="h-5 w-5" />;
      case 'PROCESSED': return <Factory className="h-5 w-5" />;
      case 'DISTRIBUTED': return <Truck className="h-5 w-5" />;
      case 'DELIVERED': return <Building className="h-5 w-5" />;
      case 'RECALLED': return <AlertTriangle className="h-5 w-5" />;
      case 'PENDING_CERTIFICATION': return <Clock className="h-5 w-5" />;
      case 'CERTIFIED': return <ShieldCheck className="h-5 w-5" />;
      default: return <Package className="h-5 w-5" />;
    }
  };
  const getStatusColor = (status: string) => { /* ... same ... */ 
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
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not specified';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      if (date.getUTCFullYear() <= 1) return 'Not specified'; // handle Go zero time
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
    } catch (e) {
      return 'Invalid Date';
    }
  };
  const getTimelineSteps = () => { /* ... same ... */ 
    const steps = [
      { key: 'CREATED', label: 'Created', icon: Package }, { key: 'PENDING_CERTIFICATION', label: 'Pending Cert.', icon: Clock },
      { key: 'CERTIFIED', label: 'Certified', icon: ShieldCheck }, { key: 'PROCESSED', label: 'Processed', icon: Factory },
      { key: 'DISTRIBUTED', label: 'Distributed', icon: Truck }, { key: 'DELIVERED', label: 'Delivered', icon: Building },
    ];
    const currentStatusIndex = steps.findIndex(step => step.key === shipment?.status);
    return steps.map((step, index) => ({ ...step, completed: index <= currentStatusIndex, current: step.key === shipment?.status }));
  };

  const canSubmitForCertification = () => user?.role === 'farmer' && shipment?.status === 'CREATED' && shipment?.currentOwnerAlias === user?.chaincode_alias;

  const canProcess = () => {
    if (shipment && user) {
        console.log(
            "ShipmentDetails canProcess Check (using Full ID): user.role:", user.role,
            "| shipment.status:", shipment.status,
            "| shipment.farmerData.destinationProcessorId (Full ID on shipment):", shipment.farmerData?.destinationProcessorId,
            "| user.fullId (Full ID from context):", user.fullId // This should now be populated
        );
    }
    return user?.role === 'processor' &&
           (shipment?.status === 'CERTIFIED' || shipment?.status === 'CREATED') &&
           user?.fullId && // Make sure fullId is available in user context
           shipment?.farmerData?.destinationProcessorId === user.fullId; // Compare Full ID with Full ID
  };

  const canDistribute = () => {
    // Assuming destinationDistributorId is also a Full ID if pattern is consistent
    if (shipment && user) {
        console.log("ShipmentDetails canDistribute Check: user.role:", user.role, "| shipment.status:", shipment.status, "| shipment.processorData.destinationDistributorId:", shipment?.processorData?.destinationDistributorId, "| user.fullId:", user?.fullId);
    }
    return user?.role === 'distributor' &&
           shipment?.status === 'PROCESSED' &&
           user?.fullId &&
           shipment?.processorData?.destinationDistributorId === user.fullId;
  };

  const canReceive = () => {
    // Assuming destinationRetailerId is also a Full ID
    if (shipment && user) {
        console.log("ShipmentDetails canReceive Check: user.role:", user.role, "| shipment.status:", shipment.status, "| shipment.distributorData.destinationRetailerId:", shipment?.distributorData?.destinationRetailerId, "| user.fullId:", user?.fullId);
    }
    return user?.role === 'retailer' &&
           shipment?.status === 'DISTRIBUTED' &&
           user?.fullId &&
           shipment?.distributorData?.destinationRetailerId === user.fullId;
  };

  const canUserCertify = () => { /* ... same ... */
    if (shipment && user) {
        console.log("ShipmentDetails canUserCertify Check: user.role:", user.role, "shipment.status:", shipment.status);
    }
    return user?.role === 'certifier' && shipment?.status === 'PENDING_CERTIFICATION';
  };

  const canRecall = () => {
    return (user?.is_admin || shipment?.currentOwnerAlias === user?.chaincode_alias) && shipment?.status !== 'RECALLED';
  };

  const canArchive = () => user?.is_admin && shipment?.status !== 'ARCHIVED';

  const canUnarchive = () => user?.is_admin && shipment?.status === 'ARCHIVED';

  const canTransform = () => {
    return user?.role === 'processor' && shipment?.status === 'PROCESSED' && shipment?.currentOwnerAlias === user?.chaincode_alias;
  };


  if (loading) { /* ... same loading JSX ... */ 
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </Layout>
    );
  }
  if (!paramId || !shipment) { /* ... same not found JSX ... */ 
    console.log("ShipmentDetails Render: Shipment not found or ID invalid. 'paramId':", paramId, "'shipment':", shipment);
    return (
      <Layout>
        <div className="text-center py-12">
          <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Shipment Not Found</h2>
          <p className="text-gray-600 mb-4">The shipment (ID: {paramId || 'Unknown'}) could not be loaded or found.</p>
          <Button onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </Layout>
    );
  }

  // --- PRE-RENDER LOGS ---
  console.log("ShipmentDetails (pre-render): 'paramId' from useParams:", paramId);
  console.log("ShipmentDetails (pre-render): 'shipment' state object:", shipment);
  if (shipment) {
    console.log("ShipmentDetails (pre-render): Value of 'shipment.id' (PRIMARY ID):", shipment.id);
    console.log("ShipmentDetails (pre-render): Value of 'shipment.status':", shipment.status);
    console.log("ShipmentDetails (pre-render): shipment.farmerData.destinationProcessorId:", shipment.farmerData?.destinationProcessorId);
  }
  if (user) {
    console.log("ShipmentDetails (pre-render): 'user' object from AuthContext:", user);
    console.log("ShipmentDetails (pre-render): Value of 'user.chaincode_alias':", user.chaincode_alias);
    console.log("ShipmentDetails (pre-render): Value of 'user.fullId':", user.fullId);
  }
  // --- END PRE-RENDER LOGS ---

  const effectiveShipmentId = shipment.id || paramId; // Use shipment.id primarily

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{shipment.productName || 'Shipment Details'}</h1>
              <p className="text-gray-600">Shipment ID: {effectiveShipmentId || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4 flex-wrap gap-2 sm:gap-0">
            <Badge className={`${getStatusColor(shipment.status || 'UNKNOWN')} flex items-center space-x-1 shrink-0`}>
              {getStatusIcon(shipment.status || 'UNKNOWN')}
              <span>{(shipment.status || 'UNKNOWN').replace(/_/g, ' ')}</span>
            </Badge>
            {canSubmitForCertification() && ( <Button onClick={handleSubmitForCertification} disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-700"> {actionLoading ? 'Submitting...' : 'Submit for Certification'} </Button> )}
            {canProcess() && ( <Button onClick={() => { console.log("Process btn clicked. ID:", effectiveShipmentId); setShowProcessForm(true); }} className="bg-blue-600 hover:bg-blue-700"> Process Shipment </Button> )}
            {canDistribute() && ( <Button onClick={() => { console.log("Distribute btn clicked. ID:", effectiveShipmentId); setShowDistributeForm(true); }} className="bg-yellow-500 hover:bg-yellow-600 text-black"> Distribute Shipment </Button> )}
            {canReceive() && ( <Button onClick={() => { console.log("Receive btn clicked. ID:", effectiveShipmentId); setShowReceiveForm(true); }} className="bg-purple-600 hover:bg-purple-700"> Receive Shipment </Button> )}
            {canUserCertify() && ( <Button onClick={() => { console.log("Record Cert btn clicked. ID:", effectiveShipmentId); setShowCertificationForm(true); }} className="bg-green-600 hover:bg-green-700"> Record Certification </Button> )}
            {canTransform() && ( <Button onClick={() => setShowTransformForm(true)} className="bg-purple-500 hover:bg-purple-600 text-white">Transform</Button> )}
            {canRecall() && ( <Button onClick={() => setShowRecallForm(true)} className="bg-red-600 hover:bg-red-700">Recall</Button> )}
            {canArchive() && ( <Button onClick={() => setShowArchiveForm(true)} className="bg-gray-700 text-white hover:bg-gray-800">Archive</Button> )}
            {canUnarchive() && ( <Button onClick={async () => { if(effectiveShipmentId){setActionLoading(true);try{await apiClient.unarchiveShipment(effectiveShipmentId);toast({title:'Shipment unarchived'});if(paramId)loadShipmentDetails(paramId);}catch(err){toast({title:'Error',description:err instanceof Error?err.message:'Failed',variant:'destructive'});}finally{setActionLoading(false);}} }} className="bg-gray-500 text-white hover:bg-gray-600">Unarchive</Button> )}
          </div>
        </div>

        {/* Forms are now passed effectiveShipmentId which prioritizes shipment.id */}
        {showProcessForm && effectiveShipmentId && ( <ProcessShipmentForm shipmentId={effectiveShipmentId} onSuccess={() => { setShowProcessForm(false); if (paramId) loadShipmentDetails(paramId); }} onCancel={() => setShowProcessForm(false)} /> )}
        {showDistributeForm && effectiveShipmentId && ( <DistributeShipmentForm shipmentId={effectiveShipmentId} onSuccess={() => { setShowDistributeForm(false); if (paramId) loadShipmentDetails(paramId); }} onCancel={() => setShowDistributeForm(false)} /> )}
        {showReceiveForm && effectiveShipmentId && ( <ReceiveShipmentForm shipmentId={effectiveShipmentId} onSuccess={() => { setShowReceiveForm(false); if (paramId) loadShipmentDetails(paramId); }} onCancel={() => setShowReceiveForm(false)} /> )}
        {showCertificationForm && effectiveShipmentId && ( <RecordCertificationForm shipmentId={effectiveShipmentId} onSuccess={() => { setShowCertificationForm(false); if (paramId) loadShipmentDetails(paramId); }} onCancel={() => setShowCertificationForm(false)} /> )}
        {showRecallForm && effectiveShipmentId && (<RecallForm shipmentId={effectiveShipmentId} onSuccess={() => { setShowRecallForm(false); if(paramId) loadShipmentDetails(paramId); }} onCancel={() => setShowRecallForm(false)} />)}
        {showArchiveForm && effectiveShipmentId && (<ArchiveShipmentForm shipmentId={effectiveShipmentId} onSuccess={() => { setShowArchiveForm(false); if(paramId) loadShipmentDetails(paramId); }} onCancel={() => setShowArchiveForm(false)} />)}
        {showTransformForm && effectiveShipmentId && (<TransformProductsForm shipmentId={effectiveShipmentId} onSuccess={() => { setShowTransformForm(false); if(paramId) loadShipmentDetails(paramId); }} onCancel={() => setShowTransformForm(false)} />)}

        {/* Timeline Card ... (no change) ... */}
        <Card>
          <CardHeader><CardTitle>Supply Chain Progress</CardTitle></CardHeader>
          <CardContent className="pt-2">
            <div className="relative flex items-start justify-between overflow-x-auto py-2">
              {getTimelineSteps().map((step, index, arr) => (
                <div key={step.key} className={`flex flex-col items-center text-center px-2 ${index === 0 ? 'flex-shrink-0' : 'flex-1 min-w-[80px]'}`}>
                  {index > 0 && (
                    <div className={`absolute top-5 h-0.5 ${step.completed ? 'bg-emerald-400' : 'bg-gray-300'}`}
                         style={{ left: `calc(${(index -1) * (100 / (arr.length -1))}% + 24px )`, right: `calc(100% - ${index * (100 / (arr.length -1))}% + 24px)` }} />
                  )}
                  <div className={`z-10 relative w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                    step.completed
                      ? step.current
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-emerald-100 text-emerald-600 border-emerald-300'
                      : 'bg-gray-100 text-gray-400 border-gray-300'
                  }`}>
                    <step.icon className="h-5 w-5" />
                  </div>
                  <span className={`mt-1.5 text-xs font-medium ${
                    step.completed ? 'text-gray-700' : 'text-gray-400'
                  }`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Display Sections - Basic Information, Farm, Processing etc. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center space-x-2"><Package className="h-5 w-5" /><span>Basic Information</span></CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <DetailItem label="Product Name" value={shipment.productName} />
              <DetailItem label="Description" value={shipment.description} placeholder="No description" />
              <DetailItem label="Quantity" value={shipment.quantity} />
              <DetailItem label="Unit" value={shipment.unitOfMeasure} />
              <DetailItem label="Current Owner Alias" value={shipment.currentOwnerAlias} />
              <DetailItem label="Created At" value={formatDate(shipment.createdAt)} />
            </CardContent>
          </Card>

          {(shipment.farmerData?.farmCoordinates || (shipment.distributorData && shipment.distributorData.transitGpsLog.length > 0)) && (
            <Card>
              <CardHeader><CardTitle className="flex items-center space-x-2"><MapPin className="h-5 w-5" /><span>Route Map</span></CardTitle></CardHeader>
              <CardContent>
                <ShipmentMapView
                  farmLocation={shipment.farmerData?.farmCoordinates}
                  processorLocation={shipment.processorData?.processingCoordinates}
                  retailerLocation={shipment.retailerData?.storeCoordinates}
                  route={shipment.distributorData?.transitGpsLog}
                />
              </CardContent>
            </Card>
          )}

          {shipment.farmerData && (
            <Card>
              <CardHeader><CardTitle className="flex items-center space-x-2"><MapPin className="h-5 w-5" /><span>Farm Information</span></CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <DetailItem label="Farm Name" value={shipment.farmerData.farmerName} />
                <DetailItem label="Location" value={shipment.farmerData.farmLocation} />
                {shipment.farmerData.farmCoordinates && (
                  <DetailItem label="GPS" value={`${shipment.farmerData.farmCoordinates.latitude}, ${shipment.farmerData.farmCoordinates.longitude}`} />
                )}
                <DetailItem label="Crop Type" value={shipment.farmerData.cropType} />
                <DetailItem label="Farming Practice" value={shipment.farmerData.farmingPractice} />
                <DetailItem label="Bed Type" value={shipment.farmerData.bedType} />
                <DetailItem label="Irrigation Method" value={shipment.farmerData.irrigationMethod} />
                <DetailItem label="Organic Since" value={formatDate(shipment.farmerData.organicSince)} />
                <DetailItem label="Buffer Zone (m)" value={shipment.farmerData.bufferZoneMeters?.toString()} />
                <DetailItem label="Planting Date" value={formatDate(shipment.farmerData.plantingDate)} />
                <DetailItem label="Harvest Date" value={formatDate(shipment.farmerData.harvestDate)} />
                <DetailItem label="Fertilizer Used" value={shipment.farmerData.fertilizerUsed} placeholder="Not specified" />
                <DetailItem label="Destination Processor ID (Stored as Full ID)" value={shipment.farmerData.destinationProcessorId} />
                <DetailItem label="Certification Doc Hash" value={shipment.farmerData.certificationDocumentHash} placeholder="N/A"/>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Other data cards (Processor, Distributor, Retailer, Certification Records) ... (no structural changes, ensure DetailItem is used consistently) */}
        {shipment.processorData && (
            <Card>
              <CardHeader><CardTitle className="flex items-center space-x-2"><Factory className="h-5 w-5" /><span>Processing Information</span></CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                <DetailItem label="Processing Type" value={shipment.processorData.processingType} />
                <DetailItem label="Processing Line ID" value={shipment.processorData.processingLineId} />
                <DetailItem label="Date Processed" value={formatDate(shipment.processorData.dateProcessed)} />
                <DetailItem label="Contamination Check" value={shipment.processorData.contaminationCheck} />
                <DetailItem label="Output Batch ID" value={shipment.processorData.outputBatchId} />
                <DetailItem label="Expiry Date" value={formatDate(shipment.processorData.expiryDate)} />
                <DetailItem label="Processing Location" value={shipment.processorData.processingLocation} />
                <DetailItem label="Destination Distributor ID" value={shipment.processorData.destinationDistributorId} />
              </CardContent>
            </Card>
        )}
         {shipment.distributorData && (
            <Card>
              <CardHeader><CardTitle className="flex items-center space-x-2"><Truck className="h-5 w-5" /><span>Distribution Information</span></CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                <DetailItem label="Pickup Date/Time" value={formatDate(shipment.distributorData.pickupDateTime)} />
                <DetailItem label="Est. Delivery Date/Time" value={formatDate(shipment.distributorData.deliveryDateTime)} />
                <DetailItem label="Vehicle/Line ID" value={shipment.distributorData.distributionLineId} />
                <DetailItem label="Temperature Range" value={shipment.distributorData.temperatureRange} />
                <DetailItem label="Recorded Temperatures" value={shipment.distributorData.storageTemperatures && shipment.distributorData.storageTemperatures.length > 0 ? shipment.distributorData.storageTemperatures.map(t => `${t}°C`).join(', ') : undefined} />
                <DetailItem label="Transport Conditions" value={shipment.distributorData.transportConditions} />
                <DetailItem label="Distribution Center" value={shipment.distributorData.distributionCenter} />
                <DetailItem label="Transit Log" value={Array.isArray(shipment.distributorData.transitLocationLog) ? shipment.distributorData.transitLocationLog.join(', ') : shipment.distributorData.transitLocationLog} />
                {shipment.distributorData.transitGpsLog && shipment.distributorData.transitGpsLog.length > 0 && (
                  <DetailItem label="GPS Log" value={shipment.distributorData.transitGpsLog.map(g => `${g.latitude},${g.longitude}`).join(' | ')} />
                )}
                <DetailItem label="Destination Retailer ID" value={shipment.distributorData.destinationRetailerId} />
              </CardContent>
            </Card>
        )}
        {shipment.retailerData && (
            <Card>
              <CardHeader><CardTitle className="flex items-center space-x-2"><Building className="h-5 w-5" /><span>Retail Information</span></CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                <DetailItem label="Date Received at Store" value={formatDate(shipment.retailerData.dateReceived)} />
                <DetailItem label="Retailer Product Name" value={shipment.retailerData.productNameRetail} />
                <DetailItem label="Shelf Life" value={shipment.retailerData.shelfLife} />
                <DetailItem label="Sell By Date" value={formatDate(shipment.retailerData.sellByDate)} />
                <DetailItem label="Retailer Expiry Date" value={formatDate(shipment.retailerData.retailerExpiryDate)} />
                <DetailItem label="Store ID" value={shipment.retailerData.storeId} />
                <DetailItem label="Store Location" value={shipment.retailerData.storeLocation} />
                <DetailItem label="Price" value={shipment.retailerData.price ? `$${Number(shipment.retailerData.price).toFixed(2)}` : undefined} />
                <DetailItem label="QR Code" value={shipment.retailerData.qrCodeLink ? <QrCodeDisplay value={shipment.retailerData.qrCodeLink} /> : undefined} />
              </CardContent>
            </Card>
        )}
        {shipment.certificationRecords && shipment.certificationRecords.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center space-x-2"><ShieldCheck className="h-5 w-5" /><span>Certification Records</span></CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {shipment.certificationRecords.map((cert: any, index: number) => (
                <div key={index} className="p-3 border rounded-md bg-gray-50/50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                    <DetailItem label="Inspection Date" value={formatDate(cert.inspectionDate)} />
                    <div>
                      <Label className="text-xs font-medium text-gray-500 block mb-0.5">Status</Label>
                      <Badge className={`${cert.certificationStatus === 'APPROVED' ? 'bg-green-100 text-green-800' : cert.certificationStatus === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {cert.certificationStatus}
                      </Badge>
                    </div>
                    <DetailItem label="Certifier Identity" value={cert.certifierIdentity} />
                  </div>
                  {cert.comments && <DetailItem label="Comments" value={cert.comments} className="mt-2" />}
                  {cert.inspectionReportHash && <DetailItem label="Report Hash" value={cert.inspectionReportHash} className="mt-2 font-mono text-xs" />}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode; placeholder?: string; className?: string }> = ({ label, value, placeholder = 'N/A', className }) => (
  <div className={className}>
    <Label className="text-xs font-medium text-gray-500 block mb-0.5">{label}</Label>
    <p className="text-sm text-gray-900 break-words">{value || value === 0 ? value : placeholder}</p>
  </div>
);

export default ShipmentDetails;