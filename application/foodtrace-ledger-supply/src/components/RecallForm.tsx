import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/services/api';
import { AlertTriangle, X, TestTubeDiagonal } from 'lucide-react';

interface RecallFormProps {
  shipmentId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const RecallForm: React.FC<RecallFormProps> = ({ shipmentId, onSuccess, onCancel }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [related, setRelated] = useState<any[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  const fillWithDemoData = () => {
    setReason('Demo recall due to quality issue');
    if (related.length > 0) {
      setSelected([related[0].shipmentId]);
    }
    toast({ title: 'Demo data loaded' });
  };

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiClient.getRelatedShipments(shipmentId);
        setRelated(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load related shipments', err);
      } finally {
        setRelatedLoading(false);
      }
    };
    load();
  }, [shipmentId]);

  const generateRecallId = () => {
    const prefix = 'RECALL';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const recallId = generateRecallId();
    if (!reason.trim()) {
      toast({ title: 'Reason required', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await apiClient.initiateRecall(shipmentId, recallId, reason.trim());
      if (selected.length > 0) {
        await apiClient.addLinkedShipmentsToRecall(recallId, shipmentId, selected);
      }
      toast({ title: 'Recall initiated', description: `Primary recall ${recallId} created.` });
      onSuccess();
    } catch (error) {
      toast({ title: 'Error initiating recall', description: error instanceof Error ? error.message : 'Failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <span>Initiate Recall</span>
        </CardTitle>
        <CardDescription>
          This creates a new recall event for the selected shipment. Any boxes you
          check below will be linked to that event after it is created.
        </CardDescription>
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
          {relatedLoading && (
            <div className="text-sm text-gray-500">Loading related shipments...</div>
          )}
          {!relatedLoading && related.length > 0 && (
            <div>
              <Label>Select Related Shipments</Label>
              <div className="max-h-40 overflow-y-auto space-y-1 border rounded p-2">
                {related.map((s) => (
                  <div key={s.shipmentId} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={s.shipmentId}
                      checked={selected.includes(s.shipmentId)}
                      onChange={() => setSelected((prev) => prev.includes(s.shipmentId) ? prev.filter(id => id !== s.shipmentId) : [...prev, s.shipmentId])}
                    />
                    <label htmlFor={s.shipmentId} className="text-sm">
                      {s.shipmentId} - {s.productName}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              <X className="h-4 w-4 mr-2" />Cancel
            </Button>
            <Button type="submit" className="bg-red-600 hover:bg-red-700" disabled={loading}>
              {loading ? 'Submitting...' : 'Initiate Recall'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default RecallForm;
