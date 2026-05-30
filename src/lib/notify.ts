import { toast } from "sonner";

export const notify = {
  success: (msg: string, description?: string) =>
    toast.success(msg, { description }),
  error: (msg: string, description?: string) =>
    toast.error(msg, { description }),
  warning: (msg: string, description?: string) =>
    toast.warning(msg, { description }),
  info: (msg: string, description?: string) =>
    toast.info(msg, { description }),
};
