import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useAliases } from '@/hooks/use-aliases';
import { Truck, X, TestTubeDiagonal } from 'lucide-react';
import RouteMapInput, { GeoPoint } from './RouteMapInput';

interface DistributeShipmentFormProps {
  shipmentId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const DistributeShipmentForm: React.FC<DistributeShipmentFormProps> = ({
  shipmentId,
  onSuccess,
  onCancel
}) => {
  const { toast } = useToast();
  const retailerAliases = useAliases('retailer');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    pickupDateTime: '',
    deliveryDateTime: '',
    transportConditions: '',
    temperatureRange: '',
    storageTemperature: '',
    distributionCenter: '',
    distributionLineId: '',
    transitLocationLog: '',
    transitGpsLog: [] as GeoPoint[],
    destinationRetailerId: ''
  });

  const handleInputChange = (field: keyof typeof formData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const fillWithDemoData = () => {
    const now = new Date();
    const delivery = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    setFormData({
      pickupDateTime: now.toISOString().slice(0,16),
      deliveryDateTime: delivery.toISOString().slice(0,16),
      transportConditions: 'Refrigerated',
      temperatureRange: '2-8°C',
      storageTemperature: '5',
      distributionCenter: 'Demo DC',
      distributionLineId: 'TRUCK_DEMO_1',
      transitLocationLog: 'Warehouse A, Hub B',
      transitGpsLog: [
        { latitude: 37.1, longitude: -122.1 },
        { latitude: 37.2, longitude: -122.2 }
      ],
      destinationRetailerId: retailerAliases[0] || ''
    });
    toast({ title: 'Demo data loaded' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // --- FORM VALIDATION ---
    if (!formData.pickupDateTime) {
      toast({ title: "Validation Error", description: "Pickup Date & Time is required.", variant: "destructive" });
      setLoading(false); return;
    }
    if (!formData.deliveryDateTime) {
      toast({ title: "Validation Error", description: "Delivery Date & Time is required.", variant: "destructive" });
      setLoading(false); return;
    }
    if (!formData.transportConditions.trim()) {
      toast({ title: "Validation Error", description: "Transport Conditions is required.", variant: "destructive" });
      setLoading(false); return;
    }
    if (!formData.temperatureRange.trim()) {
      toast({ title: "Validation Error", description: "Temperature Range is required.", variant: "destructive" });
      setLoading(false); return;
    }
    if (!formData.distributionCenter.trim()) {
      toast({ title: "Validation Error", description: "Distribution Center is required.", variant: "destructive" });
      setLoading(false); return;
    }
    if (!formData.distributionLineId.trim()) {
      toast({ title: "Validation Error", description: "Vehicle/Line ID is required.", variant: "destructive" });
      setLoading(false); return;
    }
    // --- END OF FORM VALIDATION ---

    try {
      // Prepare the payload with proper datetime conversion
      const pickupDateTimeISO = new Date(formData.pickupDateTime).toISOString();
      const deliveryDateTimeISO = new Date(formData.deliveryDateTime).toISOString();

      // Handle storage temperature conversion
      const storageTemperatureValue = formData.storageTemperature.trim() 
        ? parseFloat(formData.storageTemperature.trim()) 
        : undefined;

      // Handle transit location log as array
      const transitLocationLogArray = formData.transitLocationLog.trim()
        ? formData.transitLocationLog.split(',').map(location => location.trim()).filter(location => location)
        : [];
      const transitGpsLogArray = formData.transitGpsLog;

      const payloadForApi = {
        pickupDateTime: pickupDateTimeISO,
        deliveryDateTime: deliveryDateTimeISO,
        transportConditions: formData.transportConditions.trim(),
        temperatureRange: formData.temperatureRange.trim(),
        storageTemperature: storageTemperatureValue,
        distributionCenter: formData.distributionCenter.trim(),
        distributionLineId: formData.distributionLineId.trim(),
        transitLocationLog: transitLocationLogArray,
        transitGpsLog: transitGpsLogArray,
        destinationRetailerId: formData.destinationRetailerId.trim()
      };

      console.log("Frontend: Sending distribute shipment payload:", JSON.stringify({ distributorData: payloadForApi }, null, 2));
      
      // apiClient.distributeShipment will wrap payloadForApi under a "distributorData" key
      await apiClient.distributeShipment(shipmentId, payloadForApi);

      toast({
        title: "Shipment distributed successfully",
        description: "The shipment is now in transit for delivery.",
      });
      onSuccess();
    } catch (error) {
      console.error("Frontend: Error distributing shipment:", error);
      toast({
        title: "Error distributing shipment",
        description: error instanceof Error ? error.message : "Failed to distribute shipment",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Truck className="h-5 w-5" />
          <span>Distribute Shipment</span>
        </CardTitle>
        <CardDescription>
          Enter distribution and transport details. All fields marked with * are required.
        </CardDescription>
        <Button type="button" variant="outline" onClick={fillWithDemoData} className="mt-2 text-sm">
          <TestTubeDiagonal className="h-4 w-4 mr-2" />
          Fill with Demo Data
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pickupDateTime">Pickup Date & Time *</Label>
              <Input
                id="pickupDateTime"
                type="datetime-local"
                value={formData.pickupDateTime}
                onChange={(e) => handleInputChange('pickupDateTime', e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="deliveryDateTime">Estimated Delivery Date & Time *</Label>
              <Input
                id="deliveryDateTime"
                type="datetime-local"
                value={formData.deliveryDateTime}
                onChange={(e) => handleInputChange('deliveryDateTime', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="transportConditions">Transport Conditions *</Label>
              <Input
                id="transportConditions"
                value={formData.transportConditions}
                onChange={(e) => handleInputChange('transportConditions', e.target.value)}
                required
                placeholder="e.g., Refrigerated, Dry, Frozen"
              />
            </div>
            <div>
              <Label htmlFor="temperatureRange">Temperature Range *</Label>
              <Input
                id="temperatureRange"
                value={formData.temperatureRange}
                onChange={(e) => handleInputChange('temperatureRange', e.target.value)}
                required
                placeholder="e.g., 2-8°C, Room Temperature"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="storageTemperature">Storage Temperature (°C)</Label>
              <Input
                id="storageTemperature"
                type="number"
                step="0.1"
                value={formData.storageTemperature}
                onChange={(e) => handleInputChange('storageTemperature', e.target.value)}
                placeholder="e.g., 4.5"
              />
            </div>
            <div>
              <Label htmlFor="distributionLineId">Vehicle/Line ID *</Label>
              <Input
                id="distributionLineId"
                value={formData.distributionLineId}
                onChange={(e) => handleInputChange('distributionLineId', e.target.value)}
                required
                placeholder="e.g., TRUCK-001, ROUTE-ABC"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="distributionCenter">Distribution Center *</Label>
            <Input
              id="distributionCenter"
              value={formData.distributionCenter}
              onChange={(e) => handleInputChange('distributionCenter', e.target.value)}
              required
              placeholder="e.g., Central Distribution Hub, Location"
            />
          </div>

          <div>
            <Label htmlFor="transitLocationLog">Transit Location Log (Optional, comma-separated)</Label>
            <Textarea
              id="transitLocationLog"
              value={formData.transitLocationLog}
              onChange={(e) => handleInputChange('transitLocationLog', e.target.value)}
              placeholder="e.g., Warehouse A, Transit Hub B, Distribution Center C"
              rows={2}
            />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label>Transit GPS Log (click map to add points)</Label>
            <RouteMapInput
              points={formData.transitGpsLog}
              onChange={(pts) => handleInputChange('transitGpsLog', pts)}
            />
          </div>

          <div>
            <Label htmlFor="destinationRetailerId">Destination Retailer</Label>
            <Select
              value={formData.destinationRetailerId}
              onValueChange={(value) => handleInputChange('destinationRetailerId', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select retailer" />
              </SelectTrigger>
              <SelectContent>
                {retailerAliases.map(alias => (
                  <SelectItem key={alias} value={alias}>{alias}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-yellow-600 hover:bg-yellow-700">
              {loading ? 'Distributing...' : 'Distribute Shipment'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default DistributeShipmentForm;