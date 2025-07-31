import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/services/api';
import { Thermometer, X } from 'lucide-react';

interface TemperatureLoggerFormProps {
  shipmentId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const TemperatureLoggerForm: React.FC<TemperatureLoggerFormProps> = ({ shipmentId, onSuccess, onCancel }) => {
  const { toast } = useToast();
  const [temperature, setTemperature] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!temperature.trim()) {
      toast({ title: 'Temperature required', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const payload = { timestamp: new Date().toISOString(), temperature: parseFloat(temperature) };
      await apiClient.logTemperature(shipmentId, payload);
      toast({ title: 'Temperature logged' });
      onSuccess();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Thermometer className="h-5 w-5" />
          <span>Log Temperature</span>
        </CardTitle>
        <CardDescription>Record a temperature reading for this shipment.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input id="temp" type="number" step="0.1" value={temperature} onChange={e => setTemperature(e.target.value)} placeholder="°C" required />
          </div>
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-orange-600 hover:bg-orange-700">
              {loading ? 'Logging...' : 'Log'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default TemperatureLoggerForm;
