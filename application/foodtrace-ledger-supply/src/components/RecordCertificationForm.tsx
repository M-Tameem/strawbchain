import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck, X, TestTubeDiagonal } from 'lucide-react';

interface RecordCertificationFormProps {
  shipmentId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const RecordCertificationForm: React.FC<RecordCertificationFormProps> = ({
  shipmentId,
  onSuccess,
  onCancel
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    inspectionDate: '', // Will be YYYY-MM-DDTHH:mm from the input
    inspectionReportHash: '',
    certificationStatus: '', // This will be 'APPROVED', 'REJECTED', etc.
    comments: ''
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSelectChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const fillWithDemoData = () => {
    const now = new Date();
    setFormData({
      inspectionDate: now.toISOString().slice(0,16),
      inspectionReportHash: 'demo_hash_123',
      certificationStatus: 'APPROVED',
      comments: 'All standards met.'
    });
    toast({ title: 'Demo data loaded' });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    try {
      setUploading(true);
      const res = await apiClient.uploadFileToIpfs(file);
      setFormData(prev => ({ ...prev, inspectionReportHash: res.hash }));
      toast({ title: 'File uploaded', description: res.hash });
    } catch (err) {
      console.error('IPFS upload error', err);
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // --- FORM VALIDATION (Basic - add more as needed) ---
    if (!formData.inspectionDate) {
      toast({ title: "Validation Error", description: "Inspection Date is required.", variant: "destructive" });
      setLoading(false); return;
    }
    if (!formData.certificationStatus) {
      toast({ title: "Validation Error", description: "Certification Status is required.", variant: "destructive" });
      setLoading(false); return;
    }
    // --- END OF FORM VALIDATION ---

    try {
      // Prepare payload with data cleaning and date conversion
      let inspectionDateISO = "";
      if (formData.inspectionDate.trim()) {
        // The datetime-local input should provide a string that new Date() can parse
        inspectionDateISO = new Date(formData.inspectionDate).toISOString();
      } else {
        // This case should ideally be caught by validation if the field is truly required
        // Or, if it can be optional, the backend needs to handle an empty string or null.
        // For now, if validation passes, it won't be empty.
      }

      const payloadForApi = {
        inspectionDate: inspectionDateISO,
        inspectionReportHash: formData.inspectionReportHash.trim(),
        certificationStatus: formData.certificationStatus, // Value from Select is already a clean string
        comments: formData.comments.trim()
      };

      console.log("Frontend: Sending record certification payload:", JSON.stringify(payloadForApi, null, 2));

      await apiClient.recordCertification(shipmentId, payloadForApi);

      toast({
        title: "Certification recorded successfully",
        description: `The shipment has been ${payloadForApi.certificationStatus.toLowerCase()}.`,
      });
      onSuccess();
    } catch (error) {
      console.error("Frontend: Error recording certification:", error);
      toast({
        title: "Error recording certification",
        description: error instanceof Error ? error.message : "Failed to record certification",
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
          <ShieldCheck className="h-5 w-5" />
          <span>Record Certification</span>
        </CardTitle>
        <CardDescription>
          Record the certification inspection results for this shipment.
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
              <Label htmlFor="inspectionDate">Inspection Date *</Label>
              <Input
                id="inspectionDate"
                type="datetime-local" // Provides YYYY-MM-DDTHH:mm
                value={formData.inspectionDate}
                onChange={(e) => handleInputChange('inspectionDate', e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="certificationStatus">Certification Status *</Label>
              <Select
                value={formData.certificationStatus}
                onValueChange={(value) => handleSelectChange('certificationStatus', value)}
                // Consider adding a required prop or handling if Select can be unselected
              >
                <SelectTrigger id="certificationStatus">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="CONDITIONAL_APPROVAL">Conditional Approval</SelectItem>
                  {/* Add other relevant statuses as needed by your schema */}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="reportFile">Inspection Report PDF (Optional)</Label>
            <Input id="reportFile" type="file" accept="application/pdf" onChange={handleFileUpload} disabled={uploading} />
            {formData.inspectionReportHash && (
              <p className="text-sm text-gray-600 break-all">Hash: {formData.inspectionReportHash}</p>
            )}
          </div>

          <div>
            <Label htmlFor="comments">Comments (Optional)</Label>
            <Textarea
              id="comments"
              value={formData.comments}
              onChange={(e) => handleInputChange('comments', e.target.value)}
              placeholder="Enter inspection notes, conditions for approval, or reasons for rejection..."
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
              {loading ? 'Recording...' : 'Record Certification'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default RecordCertificationForm;