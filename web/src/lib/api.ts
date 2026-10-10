export const API_BASE: string =
  /^(localhost|127\.0\.0\.1)/.test(window.location.hostname)
    ? ''
    : 'https://api.elsemail.indevs.in';

export async function api<T = any>(p: string, opt: RequestInit = {}): Promise<T> {
  const r = await fetch(API_BASE + p, { credentials: 'include', ...opt });
  return r.json() as Promise<T>;
}

export interface MailItem {
  id: string;
  messageId?: string;
  time: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  status?: string;
}

export interface AttachmentOut {
  filename: string;
  content: string;
  contentType: string;
}

export function readFiles(list: FileList | null): Promise<AttachmentOut[]> {
  const files = Array.from(list || []).slice(0, 5);
  return Promise.all(
    files.map(
      (f) =>
        new Promise<AttachmentOut>((res, rej) => {
          if (f.size > 5 * 1024 * 1024) return rej(new Error(f.name + ': over 5MB'));
          const r = new FileReader();
          r.onload = () =>
            res({
              filename: f.name,
              content: String(r.result).split(',')[1],
              contentType: f.type || 'application/octet-stream',
            });
          r.onerror = () => rej(new Error(f.name + ': read failed'));
          r.readAsDataURL(f);
        })
    )
  );
}
