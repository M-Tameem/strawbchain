import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { Package, X, TestTubeDiagonal } from 'lucide-react';

interface ArchiveShipmentFormProps {
  shipmentId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const ArchiveShipmentForm: React.FC<ArchiveShipmentFormProps> = ({ shipmentId, onSuccess, onCancel }) => {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const fillWithDemoData = () => {
    setReason('Demo archive - obsolete data');
    toast({ title: 'Demo data loaded' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast({ title: 'Reason required', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await apiClient.archiveShipment(shipmentId, reason.trim());
      toast({ title: 'Shipment archived' });
      onSuccess();
    } catch (error) {
      toast({ title: 'Error archiving shipment', description: error instanceof Error ? error.message : 'Failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Package className="h-5 w-5 text-gray-600" />
          <span>Archive Shipment</span>
        </CardTitle>
        <CardDescription>Provide a reason for archiving.</CardDescription>
        <Button type="button" variant="outline" onClick={fillWithDemoData} className="mt-2 text-sm">
          <TestTubeDiagonal className="h-4 w-4 mr-2" />
          Fill with Demo Data
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="reason">Reason *</Label>
            <Textarea id="reason" value={reason} onChange={e => setReason(e.target.value)} required rows={3} />
          </div>
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              <X className="h-4 w-4 mr-2" />Cancel
            </Button>
            <Button type="submit" className="bg-gray-800 text-white hover:bg-gray-900" disabled={loading}>
              {loading ? 'Archiving...' : 'Archive'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default ArchiveShipmentForm;
