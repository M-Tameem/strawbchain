// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/services/api";
import { useAliases } from "@/hooks/use-aliases";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Package, TestTubeDiagonal } from "lucide-react"; // Added TestTubeDiagonal for demo button
import MapPicker from "@/components/MapPicker";

const CreateShipment = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const processorAliases = useAliases("processor");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    shipmentId: "",
    productName: "",
    description: "",
    quantity: "", // Keep as string for form input
    unitOfMeasure: "kg",
    farmerName: "",
    farmLocation: "",
    farmLatitude: "",
    farmLongitude: "",
    cropType: "",
    plantingDate: "", // Store as YYYY-MM-DD string from date picker
    harvestDate: "", // Store as YYYY-MM-DD string from date picker
    fertilizerUsed: "",
    farmingPractice: "Conventional",
    bedType: "plastic mulch beds",
    irrigationMethod: "drip",
    organicSince: "",
    bufferZoneMeters: "",
    destinationProcessorId: "",
    certificationDocumentHash: "",
  });
  const [uploading, setUploading] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const generateShipmentId = () => {
    const prefix = "SHIP";
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  };

  const fillWithDemoData = () => {
    // Get current date for sensible default planting/harvest dates
    const today = new Date();
    const planting = new Date(today);
    planting.setDate(today.getDate() - 90); // Approx 3 months ago
    const harvest = new Date(today);
    harvest.setDate(today.getDate() - 7); // Approx 1 week ago

    const formatDateForInput = (date: Date) => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    setFormData({
      shipmentId: "", // auto-generate for demo
      productName: "Premium Organic Produce",
      description:
        "Freshly harvested, organically grown produce from mixed fields. Cooled quickly for quality.",
      quantity: "120.0", // as string from input
      unitOfMeasure: "kg",
      farmerName: "Demo Organic Farms Ltd.",
      farmLocation: "Norfolk County, ON, Canada",
      farmLatitude: "42.8339",
      farmLongitude: "-80.3830",
      cropType: "Mixed Vegetables",
      plantingDate: formatDateForInput(planting),
      harvestDate: formatDateForInput(harvest),
      fertilizerUsed: "Organic compost blend, kelp meal",
      farmingPractice: "Organic",
      bedType: "plastic mulch beds",
      irrigationMethod: "drip",
      organicSince: formatDateForInput(
        new Date(today.getFullYear() - 3, today.getMonth(), today.getDate())
      ),
      bufferZoneMeters: "25",
      destinationProcessorId: "DemoProcessor1",
      certificationDocumentHash: "demoDocHash_organicProduce_abc123",
    });
    toast({
      title: "Demo Data Loaded",
      description: "The form has been filled with sample shipment information.",
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    try {
      setUploading(true);
      const res = await apiClient.uploadFileToIpfs(file);
      setFormData((prev) => ({ ...prev, certificationDocumentHash: res.hash }));
      toast({ title: "File uploaded", description: res.hash });
    } catch (err) {
      console.error("IPFS upload error", err);
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // --- FORM VALIDATION ---
    if (!formData.productName.trim()) {
      toast({
        title: "Validation Error",
        description: "Product Name is required.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    if (!formData.farmerName.trim()) {
      toast({
        title: "Validation Error",
        description: "Farmer/Farm Name is required.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    if (!formData.farmLocation.trim()) {
      toast({
        title: "Validation Error",
        description: "Farm Location is required.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    if (!formData.farmLatitude.trim() || !formData.farmLongitude.trim()) {
      toast({
        title: "Validation Error",
        description: "Farm GPS coordinates are required.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const quantityValue = parseFloat(formData.quantity);
    if (isNaN(quantityValue) || quantityValue <= 0) {
      toast({
        title: "Invalid Quantity",
        description: "Quantity must be a valid positive number.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    // --- END OF FORM VALIDATION ---

    try {
      const shipmentId = formData.shipmentId.trim() || generateShipmentId();

      // Robust date handling:
      // If formData.plantingDate is an empty string or only whitespace, plantingDateISO will be an empty string.
      // Otherwise, it will be an ISO string.
      const plantingDateISO = formData.plantingDate.trim()
        ? new Date(formData.plantingDate).toISOString()
        : "";
      const harvestDateISO = formData.harvestDate.trim()
        ? new Date(formData.harvestDate).toISOString()
        : "";
      const organicSinceISO = formData.organicSince.trim()
        ? new Date(formData.organicSince).toISOString()
        : "";

      const farmerData = {
        farmerName: formData.farmerName.trim(),
        farmLocation: formData.farmLocation.trim(),
        farmCoordinates: {
          latitude: parseFloat(formData.farmLatitude),
          longitude: parseFloat(formData.farmLongitude),
        },
        cropType: formData.cropType.trim(),
        plantingDate: plantingDateISO,
        harvestDate: harvestDateISO,
        fertilizerUsed: formData.fertilizerUsed.trim(),
        farmingPractice: formData.farmingPractice,
        bedType: formData.bedType,
        irrigationMethod: formData.irrigationMethod,
        organicSince: organicSinceISO,
        bufferZoneMeters: parseFloat(formData.bufferZoneMeters),
        destinationProcessorId: formData.destinationProcessorId.trim(),
        certificationDocumentHash: formData.certificationDocumentHash.trim(),
      };

      const shipmentPayload = {
        shipmentId,
        productName: formData.productName.trim(),
        description: formData.description.trim(),
        quantity: quantityValue,
        unitOfMeasure: formData.unitOfMeasure,
        farmerData,
      };

      console.log(
        "Frontend: Sending shipment creation payload:",
        JSON.stringify(shipmentPayload, null, 2),
      );

      await apiClient.createShipment(shipmentPayload);

      toast({
        title: "Shipment created successfully",
        description: `Shipment ${shipmentId} has been created and recorded on the blockchain.`,
      });

      navigate("/dashboard");
    } catch (error) {
      console.error("Frontend: Error creating shipment:", error);
      toast({
        title: "Error creating shipment",
        description:
          error instanceof Error ? error.message : "Failed to create shipment",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <div className="flex items-center space-x-2">
              <Package className="h-6 w-6 text-emerald-600" />
              <h1 className="text-2xl font-bold text-gray-900">
                Create New Shipment
              </h1>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={fillWithDemoData}
            className="text-sm"
          >
            <TestTubeDiagonal className="h-4 w-4 mr-2" />
            Fill with Demo Data
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Core details about your shipment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="shipmentId">Shipment ID (Optional)</Label>
                  <Input
                    id="shipmentId"
                    value={formData.shipmentId}
                    onChange={(e) =>
                      handleInputChange("shipmentId", e.target.value)
                    }
                    placeholder="Auto-generated if empty"
                  />
                </div>
                <div>
                  <Label htmlFor="productName">Product Name *</Label>
                  <Input
                    id="productName"
                    value={formData.productName}
                    onChange={(e) =>
                      handleInputChange("productName", e.target.value)
                    }
                    placeholder="e.g., Organic Tomatoes"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  placeholder="Detailed description of the product"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    value={formData.quantity}
                    onChange={(e) =>
                      handleInputChange("quantity", e.target.value)
                    }
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="unitOfMeasure">Unit of Measure</Label>
                  <Select
                    value={formData.unitOfMeasure}
                    onValueChange={(value) =>
                      handleInputChange("unitOfMeasure", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">Kilograms (kg)</SelectItem>
                      <SelectItem value="tons">Tons</SelectItem>
                      <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                      <SelectItem value="pieces">Pieces</SelectItem>
                      <SelectItem value="boxes">Boxes</SelectItem>
                      <SelectItem value="liters">Liters</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Farm Details */}
          <Card>
            <CardHeader>
              <CardTitle>Farm Details</CardTitle>
              <CardDescription>
                Information about the farm and farming practices
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="farmerName">Farmer/Farm Name *</Label>
                  <Input
                    id="farmerName"
                    value={formData.farmerName}
                    onChange={(e) =>
                      handleInputChange("farmerName", e.target.value)
                    }
                    placeholder="Farm name or farmer name"
                  />
                </div>
                <div>
                  <Label htmlFor="farmLocation">Farm Location *</Label>
                  <Input
                    id="farmLocation"
                    value={formData.farmLocation}
                    onChange={(e) =>
                      handleInputChange("farmLocation", e.target.value)
                    }
                    placeholder="City, State/Province, Country"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label>Farm Coordinates (click to place marker)</Label>
                  <MapPicker
                    latitude={
                      formData.farmLatitude
                        ? parseFloat(formData.farmLatitude)
                        : undefined
                    }
                    longitude={
                      formData.farmLongitude
                        ? parseFloat(formData.farmLongitude)
                        : undefined
                    }
                    onChange={(lat, lng) => {
                      handleInputChange("farmLatitude", lat.toFixed(5));
                      handleInputChange("farmLongitude", lng.toFixed(5));
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cropType">Crop Type</Label>
                  <Input
                    id="cropType"
                    value={formData.cropType}
                    onChange={(e) =>
                      handleInputChange("cropType", e.target.value)
                    }
                    placeholder="e.g., Tomatoes, Wheat, Apples"
                  />
                </div>
                <div>
                  <Label htmlFor="farmingPractice">Farming Practice</Label>
                  <Select
                    value={formData.farmingPractice}
                    onValueChange={(value) =>
                      handleInputChange("farmingPractice", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Organic">Organic</SelectItem>
                      <SelectItem value="Conventional">Conventional</SelectItem>
                      <SelectItem value="Sustainable">Sustainable</SelectItem>
                      <SelectItem value="Hydroponic">Hydroponic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bedType">Bed Type</Label>
                  <Select
                    value={formData.bedType}
                    onValueChange={(v) => handleInputChange("bedType", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plastic mulch beds">
                        Plastic Mulch Beds
                      </SelectItem>
                      <SelectItem value="matted rows">Matted Rows</SelectItem>
                      <SelectItem value="ribbon rows">Ribbon Rows</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="irrigationMethod">Irrigation Method</Label>
                  <Select
                    value={formData.irrigationMethod}
                    onValueChange={(v) =>
                      handleInputChange("irrigationMethod", v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="drip">Drip/Trickle</SelectItem>
                      <SelectItem value="sub-surface drip">
                        Sub-surface Drip
                      </SelectItem>
                      <SelectItem value="micro-sprinkler">
                        Micro-sprinkler/Mister
                      </SelectItem>
                      <SelectItem value="overhead sprinkler">
                        Overhead Sprinkler
                      </SelectItem>
                      <SelectItem value="furrow">
                        Furrow/Surface Flooding
                      </SelectItem>
                      <SelectItem value="ebb-and-flow">
                        Ebb-and-Flow (greenhouse)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="plantingDate">Planting Date</Label>
                  <Input
                    id="plantingDate"
                    type="date"
                    value={formData.plantingDate} // Expects YYYY-MM-DD
                    onChange={(e) =>
                      handleInputChange("plantingDate", e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="harvestDate">Harvest Date</Label>
                  <Input
                    id="harvestDate"
                    type="date"
                    value={formData.harvestDate} // Expects YYYY-MM-DD
                    onChange={(e) =>
                      handleInputChange("harvestDate", e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="organicSince">Organic Since</Label>
                  <Input
                    id="organicSince"
                    type="date"
                    value={formData.organicSince}
                    onChange={(e) =>
                      handleInputChange("organicSince", e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="bufferZoneMeters">Buffer Zone (m)</Label>
                  <Input
                    id="bufferZoneMeters"
                    type="number"
                    step="0.1"
                    value={formData.bufferZoneMeters}
                    onChange={(e) =>
                      handleInputChange("bufferZoneMeters", e.target.value)
                    }
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="fertilizerUsed">
                  Fertilizer/Nutrients Used
                </Label>
                <Textarea
                  id="fertilizerUsed"
                  value={formData.fertilizerUsed}
                  onChange={(e) =>
                    handleInputChange("fertilizerUsed", e.target.value)
                  }
                  placeholder="List fertilizers, nutrients, or treatments used"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Destination & Certification */}
          <Card>
            <CardHeader>
              <CardTitle>Destination & Certification</CardTitle>
              <CardDescription>
                Processing destination and certification details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="destinationProcessorId">
                  Destination Processor
                </Label>
                <Select
                  value={formData.destinationProcessorId}
                  onValueChange={(value) =>
                    handleInputChange("destinationProcessorId", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select processor" />
                  </SelectTrigger>
                  <SelectContent>
                    {processorAliases.map((alias) => (
                      <SelectItem key={alias} value={alias}>
                        {alias}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="certDocFile">Certification PDF</Label>
                <Input
                  id="certDocFile"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                {formData.certificationDocumentHash && (
                  <p className="text-sm text-gray-600 break-all">
                    Hash: {formData.certificationDocumentHash}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/dashboard")}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create Shipment"}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default CreateShipment;
