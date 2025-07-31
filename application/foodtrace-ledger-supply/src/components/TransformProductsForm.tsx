import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/services/api';
import { useAliases } from '@/hooks/use-aliases';
import { ArrowRight, X, TestTubeDiagonal } from 'lucide-react';

interface TransformProductsFormProps {
  shipmentId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const TransformProductsForm: React.FC<TransformProductsFormProps> = ({ shipmentId, onSuccess, onCancel }) => {
  const { toast } = useToast();
  const distributorAliases = useAliases('distributor');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    newShipmentId: '',
    productName: '',
    description: '',
    quantity: '',
    unitOfMeasure: 'kg',
    processingType: '',
    processingLineId: '',
    dateProcessed: '',
    contaminationCheck: 'PASSED',
    outputBatchId: '',
    expiryDate: '',
    destinationDistributorId: ''
  });

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const fillWithDemoData = () => {
    const now = new Date();
    const exp = new Date();
    exp.setDate(now.getDate() + 365);
    setFormData({
      newShipmentId: '',
      productName: 'Demo Derived Product',
      description: 'Sample transformed goods',
      quantity: '25',
      unitOfMeasure: 'kg',
      processingType: 'Demo Transformation',
      processingLineId: 'LINE_DEMO_2',
      dateProcessed: now.toISOString().slice(0,16),
      contaminationCheck: 'PASSED',
      outputBatchId: 'DEMO_OUT_001',
      expiryDate: exp.toISOString().slice(0,10),
      destinationDistributorId: distributorAliases[0] || ''
    });
    toast({ title: 'Demo data loaded' });
  };

  const generateShipmentId = () => {
    const prefix = 'SHIP';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2,5).toUpperCase();
    return `${prefix}-NEW-${timestamp}-${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.productName.trim() || !formData.quantity || !formData.processingType.trim()) {
      toast({ title: 'Missing required fields', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const newId = formData.newShipmentId.trim() || generateShipmentId();
      const inputConsumption = [{ shipmentId }];
      const newProducts = [{
        newShipmentId: newId,
        productName: formData.productName.trim(),
        description: formData.description.trim(),
        quantity: parseFloat(formData.quantity),
        unitOfMeasure: formData.unitOfMeasure
      }];
      const processorData = {
        processingType: formData.processingType.trim(),
        processingLineId: formData.processingLineId.trim(),
        dateProcessed: new Date(formData.dateProcessed).toISOString(),
        contaminationCheck: formData.contaminationCheck.trim() || 'PASSED',
        outputBatchId: formData.outputBatchId.trim(),
        expiryDate: new Date(formData.expiryDate + 'T00:00:00Z').toISOString(),
        processingLocation: 'Transformation Plant',
        qualityCertifications: [],
        destinationDistributorId: formData.destinationDistributorId.trim()
      };

      // Process shipment first so processor becomes the owner
      try {
        await apiClient.processShipment(shipmentId, processorData);
        console.log(`✅ Shipment ${shipmentId} processed.`);
      } catch (err) {
        console.warn(`⚠️ ProcessShipment failed for ${shipmentId}:`, err);
      }

      await apiClient.transformProducts(inputConsumption, newProducts, processorData);
      toast({ title: 'Products transformed', description: `New shipment ${newId} created.` });
      onSuccess();
    } catch (error) {
      toast({ title: 'Error transforming', description: error instanceof Error ? error.message : 'Failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <ArrowRight className="h-5 w-5 text-purple-600" />
          <span>Transform &amp; Create Product</span>
        </CardTitle>
        <CardDescription>Consume this shipment and create a new product</CardDescription>
        <Button type="button" variant="outline" onClick={fillWithDemoData} className="mt-2 text-sm">
          <TestTubeDiagonal className="h-4 w-4 mr-2" />
          Fill with Demo Data
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="newShipmentId">New Shipment ID</Label>
              <Input id="newShipmentId" value={formData.newShipmentId} onChange={e => handleChange('newShipmentId', e.target.value)} placeholder="Auto-generated if empty" />
            </div>
            <div>
              <Label htmlFor="productName">Product Name *</Label>
              <Input id="productName" value={formData.productName} onChange={e => handleChange('productName', e.target.value)} required />
            </div>
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={formData.description} onChange={e => handleChange('description', e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity *</Label>
              <Input id="quantity" type="number" step="0.01" value={formData.quantity} onChange={e => handleChange('quantity', e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="unitOfMeasure">Unit</Label>
              <Select value={formData.unitOfMeasure} onValueChange={value => handleChange('unitOfMeasure', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="liters">liters</SelectItem>
                  <SelectItem value="pieces">pieces</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="processingType">Processing Type *</Label>
              <Input id="processingType" value={formData.processingType} onChange={e => handleChange('processingType', e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="processingLineId">Processing Line ID</Label>
              <Input id="processingLineId" value={formData.processingLineId} onChange={e => handleChange('processingLineId', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dateProcessed">Date Processed</Label>
              <Input id="dateProcessed" type="datetime-local" value={formData.dateProcessed} onChange={e => handleChange('dateProcessed', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="contaminationCheck">Contamination Check</Label>
              <Select value={formData.contaminationCheck} onValueChange={val => handleChange('contaminationCheck', val)}>
                <SelectTrigger id="contaminationCheck"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PASSED">Passed</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="outputBatchId">Output Batch ID</Label>
              <Input id="outputBatchId" value={formData.outputBatchId} onChange={e => handleChange('outputBatchId', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="expiryDate">Expiry Date</Label>
              <Input id="expiryDate" type="date" value={formData.expiryDate} onChange={e => handleChange('expiryDate', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="destinationDistributorId">Destination Distributor</Label>
              <Select
                value={formData.destinationDistributorId}
                onValueChange={value => handleChange('destinationDistributorId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select distributor" />
                </SelectTrigger>
                <SelectContent>
                  {distributorAliases.map(alias => (
                    <SelectItem key={alias} value={alias}>{alias}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              <X className="h-4 w-4 mr-2" />Cancel
            </Button>
            <Button type="submit" className="bg-purple-600 hover:bg-purple-700" disabled={loading}>
              {loading ? 'Transforming...' : 'Transform'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default TransformProductsForm;
