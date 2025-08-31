// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal

import React, { useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

L.Icon.Default.imagePath = 'https://unpkg.com/leaflet@1.9.4/dist/images/';

interface MapPickerProps {
  latitude?: number;
  longitude?: number;
  onChange: (lat: number, lng: number) => void;
}

const MapEvents: React.FC<{ onClick: (lat: number, lng: number) => void }> = ({ onClick }) => {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
};

const MapPicker: React.FC<MapPickerProps> = ({ latitude, longitude, onChange }) => {
  const center: [number, number] = latitude && longitude ? [latitude, longitude] : [0, 0];
  const mapRef = useRef<any>(null);
  const [search, setSearch] = useState('');

  const handleSearch = async () => {
    if (!search.trim()) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        onChange(lat, lon);
        if (mapRef.current) {
          mapRef.current.setView([lat, lon], 13);
        }
      }
    } catch (err) {
      console.error('Address search failed', err);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex space-x-2">
        <input
          className="border p-1 flex-grow"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search address"
        />
        <button
          type="button"
          onClick={handleSearch}
          className="px-3 py-1 bg-green-600 text-white rounded"
        >
          Search
        </button>
      </div>
      <MapContainer center={center} zoom={5} style={{ height: '300px', width: '100%' }} whenCreated={map => (mapRef.current = map)}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEvents onClick={onChange} />
        {latitude !== undefined && longitude !== undefined && (
          <Marker position={[latitude, longitude]} />
        )}
      </MapContainer>
    </div>
  );
};

export default MapPicker;
