import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoPoint } from './RouteMapInput';

L.Icon.Default.imagePath = 'https://unpkg.com/leaflet@1.9.4/dist/images/';

interface ShipmentMapViewProps {
  farmLocation?: GeoPoint;
  processorLocation?: GeoPoint;
  retailerLocation?: GeoPoint;
  route?: GeoPoint[];
}

const ShipmentMapView: React.FC<ShipmentMapViewProps> = ({ farmLocation, processorLocation, retailerLocation, route }) => {
  const farmCoord = farmLocation ? [farmLocation.latitude, farmLocation.longitude] as [number, number] : undefined;
  const processorCoord = processorLocation ? [processorLocation.latitude, processorLocation.longitude] as [number, number] : undefined;
  const retailerCoord = retailerLocation ? [retailerLocation.latitude, retailerLocation.longitude] as [number, number] : undefined;
  const routeCoords = route ? route.map(p => [p.latitude, p.longitude]) as [number, number][] : [];
  const center: [number, number] = farmCoord || processorCoord || routeCoords[0] || retailerCoord || [0, 0];
  const allCoords = [farmCoord, processorCoord, ...routeCoords, retailerCoord].filter(Boolean) as [number, number][];

  return (
    <MapContainer center={center} zoom={5} style={{ height: '300px', width: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
      {farmCoord && <CircleMarker center={farmCoord} pathOptions={{ color: 'green' }} radius={8} />}
      {processorCoord && <CircleMarker center={processorCoord} pathOptions={{ color: 'blue' }} radius={8} />}
      {routeCoords.map((c, i) => (
        <CircleMarker key={i} center={c} pathOptions={{ color: 'orange' }} radius={5} />
      ))}
      {retailerCoord && <CircleMarker center={retailerCoord} pathOptions={{ color: 'red' }} radius={8} />}
      {allCoords.length > 1 && <Polyline positions={allCoords} />}
    </MapContainer>
  );
};

export default ShipmentMapView;
