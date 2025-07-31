import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TestTubeDiagonal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAliases } from '@/hooks/use-aliases';
import { apiClient } from '@/services/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface InputRow {
  shipmentId: string;
}
interface ProductRow {
  newShipmentId: string;
  productName: string;
  description: string;
  quantity: string;
  unitOfMeasure: string;
}

const TransformProductsPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const distributorAliases = useAliases('distributor');

  const [myShipments, setMyShipments] = useState<any[]>([]);
  const [inputs, setInputs] = useState<InputRow[]>([{ shipmentId: '' }]);
  const [products, setProducts] = useState<ProductRow[]>([{
    newShipmentId: '',
    productName: '',
    description: '',
    quantity: '',
    unitOfMeasure: 'kg'
  }]);
  const [procData, setProcData] = useState({
    processingType: '',
    processingLineId: '',
    dateProcessed: '',
    contaminationCheck: 'PASSED',
    outputBatchId: '',
    expiryDate: '',
    destinationDistributorId: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user) return;

      console.log('🔄 TransformProductsPage load – current user role:', user.role);

      try {
        if (user.role === 'processor') {
          const uInfo = await apiClient.getCurrentUserInfo();
          console.log('📇 currentUserInfo', uInfo);

          const allResp = await apiClient.getAllShipments(200); // fetch more than default 50
          const all = allResp.shipments || [];
          console.log(`📦 getAllShipments returned ${all.length} records`, all);

          const filtered = all.filter(
            s => ['CREATED', 'CERTIFIED', 'PENDING_CERTIFICATION'].includes(String(s.status)) &&
                 (s.farmerData?.destinationProcessorId === uInfo.fullId ||
                  s.farmerData?.destinationProcessorId === user.chaincode_alias)
          );
          console.log(`✅ After processor filter: ${filtered.length} records`, filtered);
          setMyShipments(filtered);
        } else {
          const mineResp = await apiClient.getMyShipments(50);
          const mine = mineResp.shipments || [];
          console.log(`📦 getMyShipments returned ${mine.length} records`, mine);
          setMyShipments(mine);
        }
      } catch (err) {
        console.error('❌ Error loading shipments in TransformProductsPage:', err);
      }
    };

    load();
  }, [user]);

  const consumable = myShipments;
  console.log('🍏 consumable shipments (render):', consumable);

  const addInputRow = () => setInputs(prev => [...prev, { shipmentId: '' }]);
  const removeInputRow = (idx: number) => setInputs(prev => prev.filter((_,i)=>i!==idx));
  const updateInput = (idx: number, val: string) => setInputs(prev => prev.map((r,i)=>i===idx?{ shipmentId: val }:r));

  const addProductRow = () => setProducts(p => [...p,{ newShipmentId:'', productName:'', description:'', quantity:'', unitOfMeasure:'kg'}]);
  const removeProductRow = (idx:number) => setProducts(p => p.filter((_,i)=>i!==idx));
  const updateProduct = (idx:number, field:keyof ProductRow, val:string)=>setProducts(p=>p.map((r,i)=>i===idx?{...r,[field]:val}:r));

  const updateProc = (field: keyof typeof procData, val: string)=> setProcData(d=>({...d,[field]:val}));

  const fillWithDemoData = () => {
    console.log('🧪 Fill with demo data clicked');
    if (consumable.length > 0) {
      setInputs([{ shipmentId: String(consumable[0].shipmentID || consumable[0].id) }]);
    }
    setProducts([{ newShipmentId: '', productName: 'Demo Sauce', description: 'Tasty demo product', quantity: '10', unitOfMeasure: 'kg' }]);
    const now = new Date();
    const expiry = new Date();
    expiry.setDate(now.getDate()+90);
    setProcData({
      processingType: 'Blending',
      processingLineId: 'LINE_DEMO',
      dateProcessed: now.toISOString().slice(0,16),
      contaminationCheck: 'PASSED',
      outputBatchId: 'BATCH_DEMO',
      expiryDate: expiry.toISOString().slice(0,10),
      destinationDistributorId: distributorAliases[0] || ''
    });
    toast({ title: 'Demo data loaded' });
  };

  const handleSubmit = async (e:React.FormEvent)=>{
    e.preventDefault();
    console.log('🚀 Submit transform – selected inputs:', inputs, 'products:', products, 'procData:', procData);

    const selected = inputs.map(i=>i.shipmentId).filter(id=>id);
    if(selected.length===0){toast({title:'Select input shipments',variant:'destructive'});return;}
    const uniqueSelected = Array.from(new Set(selected));
    if(uniqueSelected.length!==selected.length){
      toast({title:'Duplicate shipments not allowed',variant:'destructive'});
      return;
    }
    const output = products.filter(p=>p.productName && p.quantity);
    if(output.length===0){toast({title:'Add at least one product',variant:'destructive'});return;}
    setLoading(true);
    try{
      const inputConsumption = uniqueSelected.map(id=>({ shipmentId:id }));
      const newProducts = output.map(p=>({
        newShipmentId: p.newShipmentId || `SHIP-${Date.now()}-${Math.random().toString(36).substring(2,5).toUpperCase()}`,
        productName: p.productName.trim(),
        description: p.description.trim(),
        quantity: parseFloat(p.quantity),
        unitOfMeasure: p.unitOfMeasure
      }));
      const payloadProc = {
        processingType: procData.processingType.trim(),
        processingLineId: procData.processingLineId.trim(),
        dateProcessed: procData.dateProcessed ? new Date(procData.dateProcessed).toISOString() : new Date().toISOString(),
        contaminationCheck: procData.contaminationCheck.trim() || 'PASSED',
        outputBatchId: procData.outputBatchId.trim(),
        expiryDate: procData.expiryDate ? new Date(procData.expiryDate+ 'T00:00:00Z').toISOString() : '',
        processingLocation: 'Transformation Plant',
        qualityCertifications: [],
        destinationDistributorId: procData.destinationDistributorId.trim()
      };

      // Ensure processor owns inputs by processing them first
      for (const id of uniqueSelected) {
        try {
          await apiClient.processShipment(id, payloadProc);
          console.log(`✅ Shipment ${id} processed for transformation.`);
        } catch (err) {
          console.warn(`⚠️ ProcessShipment failed for ${id}:`, err);
        }
      }

      console.log('📤 Calling transformProducts with:', {inputConsumption, newProducts, payloadProc});
      await apiClient.transformProducts(inputConsumption,newProducts,payloadProc);
      toast({title:'Transformation complete'});
      navigate('/dashboard');
    }catch(err:any){
      console.error('❌ transformProducts error', err);
      toast({title:'Error', description: err?.message || 'Failed', variant:'destructive'});
    }finally{
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 p-4">
        <Card>
          <CardHeader>
            <CardTitle>Transform Products</CardTitle>
            <Button type="button" variant="outline" onClick={fillWithDemoData} className="mt-2 text-sm">
              <TestTubeDiagonal className="h-4 w-4 mr-2" />
              Fill with Demo Data
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                {inputs.map((row,idx)=> (
                  <div key={idx} className="flex items-end space-x-2">
                    <div className="flex-1">
                      <Label>Input Shipment</Label>
                      <Select value={row.shipmentId} onValueChange={val=>updateInput(idx,val)}>
                        <SelectTrigger><SelectValue placeholder="Select shipment" /></SelectTrigger>
                        <SelectContent>
                          {consumable.length === 0 ? (
                            <div className="px-2 py-1 text-muted-foreground text-sm">
                              No available shipments
                            </div>
                          ) : (
                            consumable
                              .filter(opt => {
                                const others = inputs
                                  .filter((_, i) => i !== idx)
                                  .map(i => i.shipmentId)
                                  .filter(Boolean);
                                return !others.includes(String(opt.shipmentID || opt.id));
                              })
                              .map(s => (
                              <SelectItem
                                key={s.shipmentID || s.id}
                                value={String(s.shipmentID || s.id)}
                              >
                                {s.productName} ({s.shipmentID || s.id})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {inputs.length>1 && (<Button type="button" variant="outline" onClick={()=>removeInputRow(idx)}>Remove</Button>)}
                  </div>
                ))}
                <Button type="button" variant="secondary" onClick={addInputRow}>Add Shipment</Button>
              </div>

              <div className="space-y-4">
                {products.map((p,idx)=>(
                  <div key={idx} className="border p-3 rounded-md space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>New Shipment ID</Label>
                        <Input value={p.newShipmentId} onChange={e=>updateProduct(idx,'newShipmentId',e.target.value)} />
                      </div>
                      <div>
                        <Label>Product Name *</Label>
                        <Input value={p.productName} onChange={e=>updateProduct(idx,'productName',e.target.value)} required />
                      </div>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea value={p.description} onChange={e=>updateProduct(idx,'description',e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Quantity *</Label>
                        <Input type="number" value={p.quantity} onChange={e=>updateProduct(idx,'quantity',e.target.value)} required />
                      </div>
                      <div>
                        <Label>Unit</Label>
                        <Select value={p.unitOfMeasure} onValueChange={val=>updateProduct(idx,'unitOfMeasure',val)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="liters">liters</SelectItem>
                            <SelectItem value="pieces">pieces</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {products.length>1 && (<Button type="button" variant="outline" onClick={()=>removeProductRow(idx)}>Remove Product</Button>)}
                  </div>
                ))}
                <Button type="button" variant="secondary" onClick={addProductRow}>Add Product</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Processing Type *</Label>
                  <Input value={procData.processingType} onChange={e=>updateProc('processingType',e.target.value)} required />
                </div>
                <div>
                  <Label>Processing Line ID</Label>
                  <Input value={procData.processingLineId} onChange={e=>updateProc('processingLineId',e.target.value)} />
                </div>
                <div>
                  <Label>Date Processed</Label>
                  <Input type="datetime-local" value={procData.dateProcessed} onChange={e=>updateProc('dateProcessed',e.target.value)} />
                </div>
                <div>
                  <Label>Contamination Check</Label>
                  <Select value={procData.contaminationCheck} onValueChange={val=>updateProc('contaminationCheck', val)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PASSED">Passed</SelectItem>
                      <SelectItem value="FAILED">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Output Batch ID</Label>
                  <Input value={procData.outputBatchId} onChange={e=>updateProc('outputBatchId',e.target.value)} />
                </div>
                <div>
                  <Label>Expiry Date</Label>
                  <Input type="date" value={procData.expiryDate} onChange={e=>updateProc('expiryDate',e.target.value)} />
                </div>
                <div>
                  <Label>Destination Distributor</Label>
                  <Select value={procData.destinationDistributorId} onValueChange={val=>updateProc('destinationDistributorId',val)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {distributorAliases.length === 0 ? (
                        <div className="px-2 py-1 text-muted-foreground text-sm">No distributors</div>
                      ) : (
                        distributorAliases.map(a => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={()=>navigate(-1)}>Cancel</Button>
                <Button type="submit" disabled={loading}>{loading? 'Submitting...' : 'Transform'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default TransformProductsPage;
