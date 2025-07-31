
import { useAuth } from '@/contexts/AuthContext';

// Update this to point to your local backend server
const API_BASE_URL = 'http://localhost:3001';

interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

class ApiClient {
  private getHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    };
  }

  async uploadFileToIpfs(file: File) {
    const form = new FormData();
    form.append('file', file);
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/api/ipfs/upload`, {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Upload failed');
    return data as { hash: string; name: string; link: string };
  }

  async getShipmentQrCode(id: string) {
    return this.request<{ qrCodeDataUrl: string; link: string }>(`/api/shipments/${encodeURIComponent(id)}/qrcode`);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  // Auth
  async login(username: string, password: string) {
    return this.request<{ token: string; user: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  // Shipments
  async getAllShipments(pageSize = 10, bookmark = '') {
    return this.request<any>(`/api/shipments/all?pageSize=${pageSize}&bookmark=${bookmark}`);
  }

  async getMyShipments(pageSize = 10, bookmark = '') {
    return this.request<any>(`/api/shipments/my?pageSize=${pageSize}&bookmark=${bookmark}`);
  }

  async getShipmentsByStatus(status: string, pageSize = 10, bookmark = '') {
    return this.request<any>(`/api/shipments/status/${status}?pageSize=${pageSize}&bookmark=${bookmark}`);
  }

  async getShipmentDetails(id: string) {
    console.log('Getting shipment details for ID:', id);
    if (!id || id === 'undefined' || id === 'null') {
      throw new Error('Invalid shipment ID');
    }
    return this.request<any>(`/api/shipments/${encodeURIComponent(id)}`);
  }

  async createShipment(data: any) {
    return this.request<any>('/api/shipments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async submitForCertification(shipmentId: string) {
    return this.request<any>(`/api/shipments/${encodeURIComponent(shipmentId)}/certification/submit`, {
      method: 'POST',
    });
  }

  async recordCertification(shipmentId: string, data: any) {
    // Backend expects: inspectionDate, inspectionReportHash, certificationStatus, comments
    const payload = {
      inspectionDate: data.inspectionDate,
      inspectionReportHash: data.inspectionReportHash || '', // Optional field
      certificationStatus: data.certificationStatus,
      comments: data.comments || ''
    };
    
    return this.request<any>(`/api/shipments/${encodeURIComponent(shipmentId)}/certification/record`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async processShipment(shipmentId: string, processorData: any) {
    return this.request<any>(`/api/shipments/${encodeURIComponent(shipmentId)}/process`, {
      method: 'POST',
      body: JSON.stringify({ processorData }),
    });
  }

  async distributeShipment(shipmentId: string, distributorData: any) {
    return this.request<any>(`/api/shipments/${encodeURIComponent(shipmentId)}/distribute`, {
      method: 'POST',
      body: JSON.stringify({ distributorData }),
    });
  }

  async receiveShipment(shipmentId: string, retailerData: any) {
    return this.request<any>(`/api/shipments/${encodeURIComponent(shipmentId)}/receive`, {
      method: 'POST',
      body: JSON.stringify({ retailerData }),
    });
  }

  // Transform products (processor only)
  async transformProducts(inputConsumption: any, newProductsData: any, processorData: any) {
    return this.request<any>('/api/shipments/transform', {
      method: 'POST',
      body: JSON.stringify({ inputConsumption, newProductsData, processorData }),
    });
  }

  // Admin
  async getAllIdentities() {
    return this.request<any>('/api/identities');
  }

  async getIdentityDetails(alias: string) {
    return this.request<any>(`/api/identities/${encodeURIComponent(alias)}`);
  }

  async registerUser(userData: any) {
    return this.request<any>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async assignRole(alias: string, role: string) {
    return this.request<any>(`/api/identities/${encodeURIComponent(alias)}/roles`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  }

  async removeRole(alias: string, role: string) {
    return this.request<any>(`/api/identities/${encodeURIComponent(alias)}/roles/${encodeURIComponent(role)}`, {
      method: 'DELETE',
    });
  }

  async makeAdmin(alias: string) {
    return this.request<any>(`/api/identities/${encodeURIComponent(alias)}/admin`, {
      method: 'POST',
    });
  }

  async getAliasesByRole(role: string) {
    return this.request<string[]>(`/api/aliases/role/${encodeURIComponent(role)}`);
  }

  async removeAdmin(alias: string) {
    return this.request<any>(`/api/identities/${encodeURIComponent(alias)}/admin`, {
      method: 'DELETE',
    });
  }

  // Archive/Unarchive (Admin only)
  async archiveShipment(shipmentId: string, reason: string) {
    return this.request<any>(`/api/shipments/${encodeURIComponent(shipmentId)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async unarchiveShipment(shipmentId: string) {
    return this.request<any>(`/api/shipments/${encodeURIComponent(shipmentId)}/unarchive`, {
      method: 'POST',
    });
  }

  // Recalls
  async initiateRecall(shipmentId: string, recallId: string, reason: string) {
    return this.request<any>('/api/recalls/initiate', {
      method: 'POST',
      body: JSON.stringify({ shipmentId, recallId, reason }),
    });
  }

  async addLinkedShipmentsToRecall(recallId: string, primaryShipmentId: string, linkedShipmentIds: string[]) {
    return this.request<any>(`/api/recalls/${encodeURIComponent(recallId)}/linked-shipments`, {
      method: 'POST',
      body: JSON.stringify({ primaryShipmentId, linkedShipmentIds }),
    });
  }

  async getRelatedShipments(shipmentId: string, timeWindowHours = 24) {
    return this.request<any>(`/api/recalls/${encodeURIComponent(shipmentId)}/related?timeWindowHours=${timeWindowHours}`);
  }

  // Utility
  async getCurrentUserInfo() {
    return this.request<any>('/api/users/current/info');
  }

  async checkAdminStatus(alias: string) {
    return this.request<any>(`/api/users/${encodeURIComponent(alias)}/admin/status`);
  }

  async getFullIdForAlias(alias: string) {
    return this.request<any>(`/api/utils/fullid/${encodeURIComponent(alias)}`);
  }

  // System
  async getBootstrapStatus() {
    return this.request<any>('/api/system/bootstrap-status');
  }

  async getCallerIdentity() {
    return this.request<any>('/api/debug/caller-identity');
  }
}

export const apiClient = new ApiClient();
