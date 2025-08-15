// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal

import React from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

L.Icon.Default.imagePath = 'https://unpkg.com/leaflet@1.9.4/dist/images/';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

interface RouteMapInputProps {
  points: GeoPoint[];
  onChange: (pts: GeoPoint[]) => void;
  readOnly?: boolean;
}

const MapEvents: React.FC<{ onAdd: (p: GeoPoint) => void }> = ({ onAdd }) => {
  useMapEvents({
    click(e) {
      onAdd({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    }
  });
  return null;
};

const RouteMapInput: React.FC<RouteMapInputProps> = ({ points, onChange, readOnly = false }) => {
  const coords = points.map(p => [p.latitude, p.longitude]) as [number, number][];
  const center: [number, number] = coords[0] || [0, 0];
  const handleAdd = (p: GeoPoint) => {
    if (!readOnly) onChange([...points, p]);
  };
  return (
    <MapContainer center={center} zoom={5} style={{ height: '300px', width: '100%', pointerEvents: readOnly ? 'none' : 'auto' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
      {!readOnly && <MapEvents onAdd={handleAdd} />}
      {coords.map((c, i) => (
        <Marker key={i} position={c} />
      ))}
      {coords.length > 1 && <Polyline positions={coords} />}
    </MapContainer>
  );
};

export default RouteMapInput;
