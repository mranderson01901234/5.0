// src/types/api.ts

export type ApiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
};

export type MessagesResponse = {
  items: ApiMessage[];
  nextCursor?: string | null;
};

export type SendMessageRequest = {
  conversationId: string;
  content: string;
};

export type SendMessageResponse = {
  id: string;
  queued: boolean;
};

