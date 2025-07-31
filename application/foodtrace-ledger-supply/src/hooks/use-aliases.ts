import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api';

export function useAliases(role: string) {
  const [aliases, setAliases] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchAliases = async () => {
      try {
        const data = await apiClient.getAliasesByRole(role);
        if (isMounted) {
          setAliases(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to fetch aliases', err);
        if (isMounted) setAliases([]);
      }
    };
    fetchAliases();
    return () => { isMounted = false; };
  }, [role]);

  return aliases;
}
