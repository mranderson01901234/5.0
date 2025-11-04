import React from 'react';
import type { MobileMsg } from '../store/useMobileChatStore';

export const MobileMessage: React.FC<{ msg: MobileMsg }> = ({ msg }) => {
  const cls = msg.role === 'user' ? 'm-msg m-me' : 'm-msg m-ai';
  return <div className={cls}>{msg.content}</div>;
};




