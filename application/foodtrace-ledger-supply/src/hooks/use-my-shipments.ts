import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

export interface Shipment {
  id: string
  shipmentID?: string
  productName?: string
  status?: string
  [key: string]: unknown
}

export function useMyShipments(pageSize = 50) {
  const { user } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchShipments = async () => {
      try {
        const resp = await apiClient.getMyShipments(pageSize);
        if (isMounted && Array.isArray(resp.shipments) && resp.shipments.length > 0) {
          setShipments(resp.shipments);
          return;
        }
      } catch (err) {
        console.warn('useMyShipments: getMyShipments failed, falling back', err);
      }

      if (!user) return;

      try {
        const all = await apiClient.getAllShipments(pageSize * 2);
        const filtered = (all.shipments || []).filter((s: any) =>
          (s.currentOwnerId === user.fullId || s.currentOwnerAlias === user.chaincode_alias) && !s.isArchived
        );
        if (isMounted) setShipments(filtered);
      } catch (err2) {
        console.error('useMyShipments: fallback failed', err2);
        if (isMounted) setShipments([]);
      }
    };
    fetchShipments();
    return () => { isMounted = false; };
  }, [user, pageSize]);

  return shipments;
}
