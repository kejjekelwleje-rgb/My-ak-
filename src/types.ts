export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  imageUrl?: string;
  timestamp: number;
}

export type AppMode = 'chat' | 'voice' | 'video';
