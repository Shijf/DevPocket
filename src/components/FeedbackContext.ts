import { createContext } from 'react';
export const FeedbackContext = createContext<{ text: string; error?: boolean } | undefined>(undefined);
