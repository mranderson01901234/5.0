import { toast } from 'sonner';

export const notify = {
  success: (msg: string, desc?: string) =>
    toast.success(msg, desc ? { description: desc } : undefined),
  error: (msg: string, desc?: string) =>
    toast.error(msg, desc ? { description: desc } : undefined),
  info: (msg: string, desc?: string) =>
    toast.info(msg, desc ? { description: desc } : undefined),
  warn: (msg: string, desc?: string) =>
    toast.warning(msg, desc ? { description: desc } : undefined),
} as const;

