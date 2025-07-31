import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

interface Props {
  value: string;
  size?: number;
}

const QrCodeDisplay: React.FC<Props> = ({ value, size = 128 }) => (
  <div className="p-2 bg-white border inline-block">
    <QRCodeCanvas value={value} size={size} />
  </div>
);

export default QrCodeDisplay;
