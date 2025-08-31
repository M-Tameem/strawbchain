// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { X, UserPlus, TestTubeDiagonal } from 'lucide-react';

interface AssignRoleFormProps {
  identities: any[];
  onSuccess: () => void;
  onCancel: () => void;
}

const AssignRoleForm: React.FC<AssignRoleFormProps> = ({ identities, onSuccess, onCancel }) => {
  const { toast } = useToast();
  const [alias, setAlias] = useState('');
  const [role, setRole] = useState('farmer');
  const [loading, setLoading] = useState(false);

  const fillWithDemoData = () => {
    if (identities.length > 0) {
      setAlias(identities[0].enrollmentID || identities[0].alias);
    }
    setRole('farmer');
    toast({ title: 'Demo data loaded' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alias) { toast({ title: 'Select user', variant: 'destructive' }); return; }
    setLoading(true);
    try {
      await apiClient.assignRole(alias, role);
      toast({ title: 'Role assigned' });
      onSuccess();
    } catch (error) {
      toast({ title: 'Error assigning role', description: error instanceof Error ? error.message : 'Failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <UserPlus className="h-5 w-5 text-green-600" />
          <span>Assign Role</span>
        </CardTitle>
        <CardDescription>Select an identity and role</CardDescription>
        <Button type="button" variant="outline" onClick={fillWithDemoData} className="mt-2 text-sm">
          <TestTubeDiagonal className="h-4 w-4 mr-2" />
          Fill with Demo Data
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>User</Label>
            <Select value={alias} onValueChange={setAlias}>
              <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
              <SelectContent>
                {identities.map(id => (
                  <SelectItem key={id.enrollmentID || id.alias} value={id.enrollmentID || id.alias}>{id.alias || id.enrollmentID}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="farmer">Farmer</SelectItem>
                <SelectItem value="processor">Processor</SelectItem>
                <SelectItem value="distributor">Distributor</SelectItem>
                <SelectItem value="retailer">Retailer</SelectItem>
                <SelectItem value="certifier">Certifier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              <X className="h-4 w-4 mr-2" />Cancel
            </Button>
            <Button type="submit" className="bg-green-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? 'Assigning...' : 'Assign Role'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default AssignRoleForm;
