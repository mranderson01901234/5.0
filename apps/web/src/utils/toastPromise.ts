import { toast } from 'sonner';

type Msgs<T = unknown> = {
  loading?: string;
  success?: string | ((val: T) => string);
  error?: string | ((err: unknown) => string);
};

export async function toastPromise<T>(fn: () => Promise<T>, msgs: Msgs<T>) {
  return toast.promise(
    fn(),
    {
      loading: msgs.loading ?? 'Working…',
      success: (val) =>
        typeof msgs.success === 'function' ? msgs.success(val) : msgs.success ?? 'Success',
      error: (err) =>
        typeof msgs.error === 'function'
          ? msgs.error(err)
          : msgs.error ?? (err instanceof Error ? err.message : 'Something failed'),
      duration: 2500,
    }
  );
}

