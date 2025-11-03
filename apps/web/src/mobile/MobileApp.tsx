import React from 'react';
import { MobileChatScreen } from './screens/MobileChatScreen';
import './styles.css'; // isolated mobile styles

const MobileApp: React.FC = () => {
  return (
    <div className="m-app">
      <MobileChatScreen />
    </div>
  );
};

export default MobileApp;

